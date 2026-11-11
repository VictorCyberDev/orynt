/**
 * BTCPay Server adapter — CONTRACT TESTS.
 *
 * What these are: tests of this repository's adapter against a FAKE BTCPay Server (test/btcpay-fake-server.ts) that was
 * written from BTCPay's published Greenfield API description (swagger, excerpt in btcpay-swagger-excerpt.json) and from
 * reading its controller source. Request bodies and fake responses are checked against that swagger excerpt.
 *
 * What they are NOT: they were never run against a real BTCPay Server, a real Lightning node or any real network.
 * A green run here says "the adapter behaves as designed against the documented contract", nothing more.
 */
import { inspect } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decodeInvoice, hexToBytes, sha256Hex } from "@orynt/core";
import { InsufficientPermissionsError, NotSentError, OutcomeUnknownError, type SendRequest } from "../src/types";
import { assessApiKeyPermissions, BtcpayConfigurationError, BtcpayProvider, redactSecrets, validateBaseUrl, type BtcpayConfig } from "../src/btcpay";
import { FakeBtcpay, GOOD_KEY, NODE_PUBKEY, STORE_ID, makeInvoice, type PayBehavior } from "./btcpay-fake-server";

const PREIMAGE = "ab".repeat(32);
const PREIMAGE_2 = "ef".repeat(32);
const SUITE = "CONTRACT (fake BTCPay built from the docs; NOT verified against a real BTCPay Server)";

let fake: FakeBtcpay;
beforeAll(async () => { fake = new FakeBtcpay(); await fake.start(); });
afterAll(async () => { await fake.stop(); });
beforeEach(() => {
  fake.keys = new Map([[GOOD_KEY, [`btcpay.store.canuselightningnode:${STORE_ID}`]]]);
  fake.network = "regtest";
  fake.lightningConfigured = true;
  fake.nodeUnavailable = false;
  fake.lookupErrors = false;
  fake.lookupStatusOverride = null;
  fake.numericAmounts = true;
  fake.permitEverything = false;
  fake.payments.clear();
  fake.behaviors.clear();
  fake.preimages.clear();
  fake.seen = [];
  fake.realPayCalls = 0;
  fake.echoInErrors = "";
});
afterEach(() => {
  // every request/response the fake saw must conform to the official schemas
  expect(fake.schemaViolations).toEqual([]);
});

function provider(over: Partial<BtcpayConfig> = {}): BtcpayProvider {
  return new BtcpayProvider({
    baseUrl: fake.baseUrl, apiKey: GOOD_KEY, storeId: STORE_ID, network: "regtest", allowInsecureLoopback: true,
    requestTimeoutMs: 2000, sendMarginMs: 100, trustAbsenceOfPayment: true, ...over,
  });
}
function invoiceFor(behavior: PayBehavior, o: { amountMsat?: bigint | null; preimage?: string; network?: "regtest" | "mainnet" } = {}) {
  const inv = makeInvoice({ network: o.network ?? "regtest", amountMsat: o.amountMsat === undefined ? 250_000n : o.amountMsat, preimage: o.preimage ?? PREIMAGE });
  fake.register(inv, behavior);
  return inv;
}
function sendReq(inv: { invoice: string; paymentHash: string }, o: Partial<SendRequest> = {}): SendRequest {
  return { invoice: inv.invoice, paymentHash: inv.paymentHash, amountMsat: 250_000n, zeroAmountInvoice: false, feeLimitMsat: 5_000n, timeoutSeconds: 30, ...o };
}

describe(`${SUITE}: configuration`, () => {
  it("requires https; plain http only for loopback and only when explicitly allowed", () => {
    expect(validateBaseUrl("https://btcpay.example.com/", false)).toBe("https://btcpay.example.com");
    expect(validateBaseUrl("https://host.example/btcpay/", false)).toBe("https://host.example/btcpay");
    expect(() => validateBaseUrl("http://btcpay.example.com", false)).toThrow(BtcpayConfigurationError);
    expect(() => validateBaseUrl("http://btcpay.example.com", true)).toThrow(BtcpayConfigurationError);
    expect(() => validateBaseUrl("http://127.0.0.1:8080", false)).toThrow(BtcpayConfigurationError);
    expect(validateBaseUrl("http://127.0.0.1:8080", true)).toBe("http://127.0.0.1:8080");
    expect(() => validateBaseUrl("ftp://x", true)).toThrow(BtcpayConfigurationError);
  });
  it("rejects credentials, query and fragment in the URL and malformed key / store id / network", () => {
    expect(() => validateBaseUrl("https://user:pw@btcpay.example.com", false)).toThrow(/credentials/);
    expect(() => validateBaseUrl("https://btcpay.example.com/?x=1", false)).toThrow(/query/);
    expect(() => validateBaseUrl("https://btcpay.example.com/#f", false)).toThrow(/query/);
    expect(() => validateBaseUrl("not a url", false)).toThrow(BtcpayConfigurationError);
    expect(() => provider({ apiKey: "short" })).toThrow(/API key/);
    expect(() => provider({ apiKey: "has space in it 123456" })).toThrow(/API key/);
    expect(() => provider({ storeId: "../etc" })).toThrow(/Store id/);
    expect(() => provider({ network: "moon" as never })).toThrow(/Network/);
    expect(() => provider({ cryptoCode: "LTC" as never })).toThrow(/Only BTC/);
  });
  it("never serialises or prints the API key", () => {
    const p = provider();
    expect(JSON.stringify(p)).not.toContain(GOOD_KEY);
    expect(inspect(p, { depth: 6, showHidden: true })).not.toContain(GOOD_KEY);
  });
});

describe(`${SUITE}: API key permission interpretation`, () => {
  const S = STORE_ID;
  it("accepts the least-privilege store-scoped key with no excess", () => {
    const a = assessApiKeyPermissions([`btcpay.store.canuselightningnode:${S}`], S);
    expect(a.grantsLightningUse).toBe(true);
    expect(a.grantIsStoreScoped).toBe(true);
    expect(a.excess).toEqual([]);
  });
  it("flags unrestricted, unscoped and other-store permissions as excess; canmodifystoresettings grants use", () => {
    const a = assessApiKeyPermissions(["unrestricted"], S);
    expect(a.grantsLightningUse).toBe(true);
    expect(a.grantIsStoreScoped).toBe(false);
    expect(a.excess.join(" ")).toMatch(/full account access/);
    const b = assessApiKeyPermissions(["btcpay.store.canuselightningnode", "btcpay.server.canmanageusers", "btcpay.store.canviewinvoices:OTHERSTORE"], S);
    expect(b.grantsLightningUse).toBe(true);
    expect(b.excess.length).toBe(3);
    expect(assessApiKeyPermissions([`btcpay.store.canmodifystoresettings:${S}`], S).grantsLightningUse).toBe(true);
  });
  it("does NOT treat invoice-only or other-store permissions as the right to pay or look up (source: Store controller policy is canuselightningnode)", () => {
    expect(assessApiKeyPermissions([`btcpay.store.cancreatelightninginvoice:${S}`, `btcpay.store.canviewlightninginvoice:${S}`], S).grantsLightningUse).toBe(false);
    expect(assessApiKeyPermissions(["btcpay.store.canuselightningnode:SOMEOTHERSTORE"], S).grantsLightningUse).toBe(false);
    expect(assessApiKeyPermissions(["btcpay.server.canuseinternallightningnode"], S).grantsLightningUse).toBe(false);
    expect(assessApiKeyPermissions(["garbage permission", ""], S).grantsLightningUse).toBe(false);
  });
});

describe(`${SUITE}: getInfo and capability discovery`, () => {
  it("getInfo reports the declared network, the node pubkey from nodeURIs, and syncedToChain=unknown", async () => {
    const info = await provider().getInfo();
    expect(info).toMatchObject({ kind: "btcpay", network: "regtest", nodePubkey: NODE_PUBKEY, alias: "fake-btcpay-lightning", version: "0.20.1-beta", syncedToChain: null });
    expect(fake.seen[0]).toMatchObject({ method: "GET", path: `/api/v1/stores/${STORE_ID}/lightning/BTC/info`, auth: `token ${GOOD_KEY}` });
  });

  it("full key + attested backend: send, lookup and info are true; probes create no payment and no real pay call", async () => {
    const caps = await provider().discoverCapabilities();
    expect(caps).toMatchObject({ canSendPayments: true, canLookupPayments: true, canReadInfo: true });
    expect(caps.notes.join("\n")).toMatch(/no payment-only permission/);
    expect(caps.notes.join("\n")).toMatch(/operator-declared/);
    expect(fake.realPayCalls).toBe(0);
    expect(fake.payments.size).toBe(0);
    const probe = fake.payCalls()[0]!.body as { BOLT11: string };
    // the permission probe must not be a parseable invoice: the adapter relies on that to guarantee it cannot pay
    expect(() => decodeInvoice(probe.BOLT11)).toThrow();
    expect(JSON.stringify(caps)).not.toContain(GOOD_KEY);
  });

  it("without the operator's attestation, lookup is 'unknown' (absence is not proof), with an explanation", async () => {
    const caps = await provider({ trustAbsenceOfPayment: false }).discoverCapabilities();
    expect(caps.canSendPayments).toBe(true);
    expect(caps.canLookupPayments).toBe("unknown");
    expect(caps.notes.join("\n")).toMatch(/trustAbsenceOfPayment/);
  });

  it("insufficient permission: a key with only lightning-invoice permissions cannot send or look up (and the notes say why)", async () => {
    fake.keys.set(GOOD_KEY, [`btcpay.store.cancreatelightninginvoice:${STORE_ID}`]);
    const p = provider();
    const { capabilities: caps, assessment } = await p.discoverCapabilitiesDetailed();
    expect(caps).toMatchObject({ canSendPayments: false, canLookupPayments: false, canReadInfo: false });
    expect(assessment?.grantsLightningUse).toBe(false);
    expect(caps.notes.join("\n")).toMatch(/canuselightningnode/);
    await expect(p.getInfo()).rejects.toBeInstanceOf(InsufficientPermissionsError);
    await expect(p.lookupPayment("11".repeat(32))).rejects.toBeInstanceOf(InsufficientPermissionsError);
  });

  it("unknown / revoked key (401): everything false, getInfo is an InsufficientPermissionsError", async () => {
    const p = provider({ apiKey: "k_unknown_0123456789abcdef" });
    expect(await p.discoverCapabilities()).toMatchObject({ canSendPayments: false, canLookupPayments: false, canReadInfo: false });
    await expect(p.getInfo()).rejects.toBeInstanceOf(InsufficientPermissionsError);
  });

  it("store without a Lightning node (404 lightning-not-configured): nothing is possible; getInfo is a configuration error; a send is NotSent", async () => {
    fake.lightningConfigured = false;
    const p = provider();
    expect(await p.discoverCapabilities()).toMatchObject({ canSendPayments: false, canLookupPayments: false, canReadInfo: false });
    await expect(p.getInfo()).rejects.toBeInstanceOf(BtcpayConfigurationError);
    const inv = invoiceFor("ok");
    await expect(p.sendPayment(sendReq(inv))).rejects.toBeInstanceOf(NotSentError);
    expect(fake.realPayCalls).toBe(0);
  });

  it("node unreachable behind BTCPay (503): capabilities are 'unknown', never assumed", async () => {
    fake.nodeUnavailable = true;
    const caps = await provider().discoverCapabilities();
    expect(caps).toMatchObject({ canSendPayments: "unknown", canLookupPayments: "unknown", canReadInfo: "unknown" });
  });

  it("a key whose list understates what the server allows is a contradiction => 'unknown' (fail closed)", async () => {
    fake.keys.set(GOOD_KEY, [`btcpay.store.canviewinvoices:${STORE_ID}`]);
    fake.permitEverything = true;
    const caps = await provider().discoverCapabilities();
    expect(caps.canSendPayments).toBe("unknown");
    expect(caps.notes.join("\n")).toMatch(/Contradiction/);
  });

  it("an over-privileged key still works but is flagged; requireLeastPrivilege turns the flag into a refusal", async () => {
    fake.keys.set(GOOD_KEY, ["unrestricted"]);
    const loose = await provider().discoverCapabilities();
    expect(loose.canSendPayments).toBe(true);
    expect(loose.notes.join("\n")).toMatch(/full account access/);
    const strict = await provider({ requireLeastPrivilege: true }).discoverCapabilities();
    expect(strict.canSendPayments).toBe(false);
  });

  it("the API-key endpoint echoes the key; the adapter must not copy it into notes or errors", async () => {
    const { capabilities } = await provider().discoverCapabilitiesDetailed();
    expect(JSON.stringify(capabilities)).not.toContain(GOOD_KEY);
  });
});

describe(`${SUITE}: network`, () => {
  it("opt-in invoice probe: matching network passes, a mismatch is refused with a clear error", async () => {
    expect((await provider({ verifyNetworkWithInvoiceProbe: true }).getInfo()).network).toBe("regtest");
    await expect(provider({ verifyNetworkWithInvoiceProbe: true, network: "mainnet" }).getInfo()).rejects.toThrow(/Network mismatch.*declared mainnet.*regtest/);
  });
  it("an invoice for another network than declared is refused locally: no request reaches BTCPay at all", async () => {
    const inv = invoiceFor("ok", { network: "mainnet" });
    await expect(provider().sendPayment(sendReq(inv))).rejects.toThrow(NotSentError);
    expect(fake.seen).toEqual([]);
  });
  it("if the operator declared the wrong network, BTCPay's own network-aware BOLT11 check (422) still stops the payment: NotSent, nothing paid", async () => {
    const inv = invoiceFor("ok", { network: "mainnet" });
    const wrong = provider({ network: "mainnet" }); // fake is regtest
    const err = await wrong.sendPayment(sendReq(inv)).catch((e) => e);
    expect(err).toBeInstanceOf(NotSentError);
    expect(String(err.message)).toMatch(/BOLT11/);
    expect(fake.realPayCalls).toBe(0);
    expect(fake.payments.size).toBe(0);
  });
});

describe(`${SUITE}: pay — success and documented responses`, () => {
  it("200 Complete: SUCCEEDED with preimage, fee and delivered amount (total minus fee); wire request has exactly the documented fields", async () => {
    const inv = invoiceFor("ok");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", paymentHash: inv.paymentHash, preimage: PREIMAGE, amountMsat: 250_000n, feeMsat: 1000n });
    expect(sha256Hex(hexToBytes(rec.preimage!))).toBe(inv.paymentHash); // the check core performs
    const pay = fake.realPays()[0]!;
    expect(pay.auth).toBe(`token ${GOOD_KEY}`);
    expect(pay.body).toEqual({ BOLT11: inv.invoice, maxFeeFlat: "5", sendTimeout: 30 }); // 5000 msat => 5 sat; no `amount` for a fixed-amount invoice
  });
  it("fee limit is floored to whole satoshi (never loosened)", async () => {
    const inv = invoiceFor("ok");
    await provider().sendPayment(sendReq(inv, { feeLimitMsat: 5_999n }));
    expect((fake.realPays()[0]!.body as { maxFeeFlat: string }).maxFeeFlat).toBe("5");
  });
  it("zero-amount invoice: the explicit amount is sent in msat; fixed-amount invoice: it is NOT sent (BTCPay says it overrides the invoice)", async () => {
    const inv = invoiceFor("ok", { amountMsat: null });
    const rec = await provider().sendPayment(sendReq(inv, { zeroAmountInvoice: true, amountMsat: 777_000n }));
    expect(rec.status).toBe("SUCCEEDED");
    expect((fake.realPays()[0]!.body as Record<string, unknown>)["amount"]).toBe("777000");
  });
  it("amounts given as strings (the swagger types them as strings) parse the same as numbers", async () => {
    fake.numericAmounts = false;
    const inv = invoiceFor("ok");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", amountMsat: 250_000n, feeMsat: 1000n });
  });
  it("200 Complete whose pay response lacks the preimage: fetched from the payment record", async () => {
    const inv = invoiceFor("ok_response_without_preimage");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
    expect(fake.seen.filter((s) => s.method === "GET" && s.path.includes("/payments/")).length).toBeGreaterThanOrEqual(2); // pre-check + enrichment
  });
  it("202 Pending: IN_FLIGHT (never a success, never a failure)", async () => {
    const inv = invoiceFor("pending");
    expect((await provider().sendPayment(sendReq(inv))).status).toBe("IN_FLIGHT");
  });
  it("202 with status Unknown: resolved by a lookup (Pending here) rather than guessed", async () => {
    const inv = invoiceFor("unknown_202");
    expect((await provider().sendPayment(sendReq(inv))).status).toBe("IN_FLIGHT");
  });
});

describe(`${SUITE}: pay — documented errors`, () => {
  it("400 could-not-find-route confirmed Failed by lookup => FAILED (definitive), with BTCPay's code as the reason", async () => {
    const inv = invoiceFor("no_route");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec.status).toBe("FAILED");
    expect(rec.failureReason).toMatch(/could-not-find-route/);
  });
  it("400 generic-error confirmed Failed by lookup => FAILED", async () => {
    const inv = invoiceFor("generic_error_failed");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec.status).toBe("FAILED");
    expect(rec.failureReason).toMatch(/generic-error/);
  });
  it("400 generic-error with NO record to confirm it is UNKNOWN, not failed (a double payment would follow a wrong 'failed')", async () => {
    const inv = invoiceFor("generic_error_no_record");
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("400 generic-error although the node actually paid: the record wins => SUCCEEDED", async () => {
    const inv = invoiceFor("generic_error_but_paid");
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
  });
  it("400 generic-error and the confirming lookup itself fails => UNKNOWN", async () => {
    const inv = invoiceFor("generic_error_failed");
    fake.lookupStatusOverride = null;
    fake.payments.delete(inv.paymentHash);
    fake.lookupErrors = true; // pre-send duplicate check would also fail => nothing is sent
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(NotSentError);
    // with the duplicate check disabled the pay call goes out, the lookup then errors => UNKNOWN
    fake.seen = [];
    await expect(provider({ preSendDuplicateCheck: false }).sendPayment(sendReq(inv))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("422 validation (BOLT11 invalid for BTCPay) => NotSent, with the validation path in the message", async () => {
    const inv = invoiceFor("ok");
    fake.network = "testnet"; // BTCPay now parses BOLT11 against testnet and rejects ours
    const err = await provider({ preSendDuplicateCheck: false }).sendPayment(sendReq(inv)).catch((e) => e);
    expect(err).toBeInstanceOf(NotSentError);
    expect(String(err.message)).toMatch(/BOLT11/);
  });
  it("403 missing-permission and 401 on the pay call => NotSent (rejected before processing) and the message names the missing permission", async () => {
    fake.keys.set(GOOD_KEY, [`btcpay.store.cancreatelightninginvoice:${STORE_ID}`]);
    const inv = invoiceFor("ok");
    const err = await provider({ preSendDuplicateCheck: false }).sendPayment(sendReq(inv)).catch((e) => e);
    expect(err).toBeInstanceOf(NotSentError);
    expect(String(err.message)).toMatch(/btcpay\.store\.canuselightningnode/);
    const err401 = await provider({ preSendDuplicateCheck: false, apiKey: "k_unknown_0123456789abcdef" }).sendPayment(sendReq(inv)).catch((e) => e);
    expect(err401).toBeInstanceOf(NotSentError);
    expect(fake.realPayCalls).toBe(0);
  });
  it("503 lightning-node-unavailable is UNKNOWN: BTCPay's exception filter also wraps exceptions thrown after the payment was started", async () => {
    const inv = invoiceFor("node_unavailable_after_start");
    const err = await provider().sendPayment(sendReq(inv)).catch((e) => e);
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    // and the payment did happen, which is exactly why this must not be 'failed'
    expect(fake.payments.get(inv.paymentHash)?.status).toBe("Complete");
    expect(await provider().lookupPayment(inv.paymentHash)).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
  });
  it.each(["http_500", "http_502"] as const)("%s after the call was made is UNKNOWN", async (b) => {
    const inv = invoiceFor(b);
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("200 with a body that is not a payment record is UNKNOWN (the payment may exist)", async () => {
    const inv = invoiceFor("garbage_200");
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("a redirect is never followed (it would replay the Authorization header elsewhere) and is NotSent", async () => {
    const inv = invoiceFor("redirect");
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(NotSentError);
    expect(fake.seen.some((s) => s.path === "/elsewhere")).toBe(false);
  });
});

describe(`${SUITE}: pay — timeout, transport and local refusals`, () => {
  it("TIMEOUT: no answer within sendTimeout+margin => OutcomeUnknown (never failed); the lost payment is then found by hash", async () => {
    const inv = invoiceFor("lost_response_hang");
    const started = Date.now();
    const err = await provider().sendPayment(sendReq(inv, { timeoutSeconds: 1 })).catch((e) => e);
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(String(err.message)).toMatch(/no answer from BTCPay within/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    const found = await provider().lookupPayment(inv.paymentHash);
    expect(found).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
  }, 10_000);
  it("connection reset after the request was delivered => OutcomeUnknown", async () => {
    const inv = invoiceFor("lost_response_reset");
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(fake.payments.get(inv.paymentHash)?.status).toBe("Complete");
  });
  it("connection refused => NotSent (provably never delivered), with or without the duplicate pre-check", async () => {
    const dead = new FakeBtcpay();
    await dead.start();
    const url = dead.baseUrl;
    await dead.stop();
    const inv = invoiceFor("ok");
    for (const pre of [true, false]) {
      const p = provider({ baseUrl: url, preSendDuplicateCheck: pre });
      await expect(p.sendPayment(sendReq(inv))).rejects.toBeInstanceOf(NotSentError);
    }
  });
  it("refuses locally, sending nothing: hash mismatch, amount mismatch, zero-amount flag mismatch, fee limit below 1 sat, bad timeout", async () => {
    const inv = invoiceFor("ok");
    const other = invoiceFor("ok", { preimage: PREIMAGE_2 });
    const p = provider();
    await expect(p.sendPayment(sendReq(inv, { paymentHash: other.paymentHash }))).rejects.toThrow(/payment hash/);
    await expect(p.sendPayment(sendReq(inv, { amountMsat: 250_001n }))).rejects.toThrow(/amount/);
    await expect(p.sendPayment(sendReq(inv, { zeroAmountInvoice: true }))).rejects.toThrow(/zero-amount/);
    await expect(p.sendPayment(sendReq(inv, { feeLimitMsat: 999n }))).rejects.toThrow(/below 1 sat/);
    await expect(p.sendPayment(sendReq(inv, { feeLimitMsat: 0n }))).rejects.toThrow(/below 1 sat/);
    await expect(p.sendPayment(sendReq(inv, { timeoutSeconds: 0 }))).rejects.toThrow(/timeout/);
    await expect(p.sendPayment(sendReq({ invoice: "lnbcrt1garbage", paymentHash: inv.paymentHash }))).rejects.toBeInstanceOf(NotSentError);
    const zero = invoiceFor("ok", { amountMsat: null, preimage: "12".repeat(32) });
    await expect(p.sendPayment(sendReq(zero, { zeroAmountInvoice: true, amountMsat: 0n }))).rejects.toThrow(/positive/);
    expect(fake.seen).toEqual([]);
  });
});

describe(`${SUITE}: duplicate prevention (BTCPay has no 'already exists' error)`, () => {
  it("an existing Complete payment for the hash is returned and NOT paid again", async () => {
    const inv = invoiceFor("ok");
    fake.payments.set(inv.paymentHash, { status: "Complete", preimage: PREIMAGE, totalMsat: 251_000, feeMsat: 1000 });
    const rec = await provider().sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
    expect(fake.payCalls()).toHaveLength(0);
  });
  it("an existing Pending payment is returned as IN_FLIGHT and NOT paid again", async () => {
    const inv = invoiceFor("ok");
    fake.payments.set(inv.paymentHash, { status: "Pending" });
    expect((await provider().sendPayment(sendReq(inv))).status).toBe("IN_FLIGHT");
    expect(fake.payCalls()).toHaveLength(0);
  });
  it("an existing Failed payment does not block a new attempt", async () => {
    const inv = invoiceFor("ok");
    fake.payments.set(inv.paymentHash, { status: "Failed" });
    expect((await provider().sendPayment(sendReq(inv))).status).toBe("SUCCEEDED");
    expect(fake.realPayCalls).toBe(1);
  });
  it("if the duplicate check cannot be answered, nothing is sent (NotSent)", async () => {
    const inv = invoiceFor("ok");
    fake.lookupErrors = true;
    await expect(provider().sendPayment(sendReq(inv))).rejects.toBeInstanceOf(NotSentError);
    expect(fake.payCalls()).toHaveLength(0);
  });
  it("without the pre-check, BTCPay answering 'already paid' as 200 is accepted as success (same hash, same preimage)", async () => {
    const inv = invoiceFor("ok_already_paid");
    fake.payments.set(inv.paymentHash, { status: "Complete", preimage: PREIMAGE, totalMsat: 251_000, feeMsat: 1000 });
    const rec = await provider({ preSendDuplicateCheck: false }).sendPayment(sendReq(inv));
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE });
  });
});

describe(`${SUITE}: lookup by payment hash`, () => {
  it("found Complete / Failed / Pending map to SUCCEEDED / FAILED / IN_FLIGHT", async () => {
    const a = makeInvoice({ network: "regtest", amountMsat: 1000n, preimage: PREIMAGE });
    const b = makeInvoice({ network: "regtest", amountMsat: 1000n, preimage: PREIMAGE_2 });
    const c = makeInvoice({ network: "regtest", amountMsat: 1000n, preimage: "01".repeat(32) });
    fake.payments.set(a.paymentHash, { status: "Complete", preimage: PREIMAGE, totalMsat: 1100, feeMsat: 100 });
    fake.payments.set(b.paymentHash, { status: "Failed" });
    fake.payments.set(c.paymentHash, { status: "Pending" });
    const p = provider();
    expect(await p.lookupPayment(a.paymentHash)).toMatchObject({ status: "SUCCEEDED", preimage: PREIMAGE, amountMsat: 1000n, feeMsat: 100n });
    expect((await p.lookupPayment(b.paymentHash)).status).toBe("FAILED");
    expect((await p.lookupPayment(c.paymentHash)).status).toBe("IN_FLIGHT");
  });
  it("not found with an attested backend => NOT_FOUND", async () => {
    expect(await provider().lookupPayment("22".repeat(32))).toMatchObject({ status: "NOT_FOUND", paymentHash: "22".repeat(32) });
  });
  it("not found WITHOUT the attestation => OutcomeUnknown, so 'confirm not sent' cannot be built on an unprovable absence", async () => {
    await expect(provider({ trustAbsenceOfPayment: false }).lookupPayment("22".repeat(32))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("a backend that errors instead of answering is never mistaken for 'not found'", async () => {
    fake.lookupErrors = true;
    await expect(provider().lookupPayment("22".repeat(32))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
  it("a malformed hash is rejected locally; a 503 for an existing payment is UNKNOWN, not an answer", async () => {
    const p = provider();
    await expect(p.lookupPayment("zz")).rejects.toThrow(/32 bytes/);
    const inv = makeInvoice({ network: "regtest", amountMsat: 1000n, preimage: PREIMAGE });
    fake.payments.set(inv.paymentHash, { status: "Complete", preimage: PREIMAGE });
    fake.lookupStatusOverride = 503;
    await expect(p.lookupPayment(inv.paymentHash)).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});

describe(`${SUITE}: secrets`, () => {
  it("credentials echoed by BTCPay in an error body never reach thrown messages", async () => {
    fake.echoInErrors = `key=${GOOD_KEY} token abcdefgh12345678 macaroon=${"0a".repeat(120)} Authorization: token ${GOOD_KEY}`;
    const inv = invoiceFor("node_unavailable_after_start");
    const err = await provider().sendPayment(sendReq(inv)).catch((e) => e);
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    const text = `${err.message} ${JSON.stringify(err)} ${String(err.stack)}`;
    expect(text).not.toContain(GOOD_KEY);
    expect(text).not.toContain("abcdefgh12345678");
    expect(text).not.toMatch(/(0a){40}/);
  });
  it("redactSecrets strips the key, auth headers, credential assignments and long hex, keeps 64-hex hashes, and truncates", () => {
    const h = "ab".repeat(32);
    const out = redactSecrets(`hash ${h} Bearer abcdefghijklmnop api_key=s3cr3tvalue macaroon:${"cd".repeat(100)} mykey123456`, ["mykey123456"]);
    expect(out).toContain(h);
    expect(out).not.toMatch(/abcdefghijklmnop|s3cr3tvalue|mykey123456|(cd){40}/);
    expect(redactSecrets("x".repeat(1000)).length).toBeLessThan(310);
  });
});


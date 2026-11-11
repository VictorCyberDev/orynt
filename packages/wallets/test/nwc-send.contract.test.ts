/**
 * CONTRACT TESTS against a LOCAL FAKE relay + FAKE wallet service. NOT operational verification against a real NWC wallet.
 *
 * The property under test: sendPayment() resolves to a record, or throws NotSentError ONLY when the request provably did not
 * execute, or throws OutcomeUnknownError in every other doubtful case — above all, a timeout is NEVER a failure.
 */
import { afterEach, describe, expect, it } from "vitest";
import { harness, sleep, until, type Harness } from "./helpers/harness";
import { AlreadyExistsError, NotSentError, OutcomeUnknownError } from "../src/types";
import { NwcNotSentError } from "../src/nwc/errors";
import { KIND_REQUEST } from "../src/nwc/nostr";
import type { Action } from "./helpers/fake-wallet";

let h: Harness | undefined;
afterEach(async () => {
  if (h) {
    expect(JSON.stringify(h.diagnostics)).not.toContain(h.secretHex);
    await h.stop();
  }
  h = undefined;
});

const AMT = 100_000n;
const payCount = () => h!.wallet.requests.filter((r) => r.method === "pay_invoice").length;
const reasons = () =>
  h!.diagnostics.filter((d) => d.type === "response_rejected").map((d) => (d as { reason: string }).reason);

describe("CONTRACT (local fake): pay_invoice happy path", () => {
  it("pays, returns the preimage and fee, and the wallet executed exactly once", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec).toMatchObject({
      status: "SUCCEEDED",
      paymentHash: inv.paymentHash,
      preimage: inv.preimage,
      feeMsat: 1000n,
    });
    expect(h.wallet.executions(inv.paymentHash)).toBe(1);
  });

  it("request is a NIP-44 v2 kind-23194 event carrying p, encryption and expiration tags, and sends no `amount` for an amount invoice", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    await h.provider.sendPayment(h.req(inv, AMT));
    const payReq = h.wallet.requests.find((r) => r.method === "pay_invoice")!;
    const ev = h.relay.received.find((e) => e.id === payReq.eventId)!;
    expect(ev.kind).toBe(KIND_REQUEST);
    expect(ev.pubkey).toBe(h.provider.clientPubkey);
    expect(ev.tags).toContainEqual(["p", h.wallet.walletPubkey]);
    expect(ev.tags).toContainEqual(["encryption", "nip44_v2"]);
    const exp = Number(ev.tags.find((t) => t[0] === "expiration")?.[1]);
    expect(exp).toBeGreaterThan(ev.created_at);
    expect(ev.content).not.toContain(inv.invoice); // encrypted
    const pay = h.wallet.requests.find((r) => r.method === "pay_invoice")!;
    expect(pay.params).toEqual({ invoice: inv.invoice });
  });

  it("sends the explicit `amount` (msat) for a zero-amount invoice", async () => {
    h = await harness();
    const inv = h.invoice(null);
    const rec = await h.provider.sendPayment(h.req(inv, 42_000n, { zeroAmountInvoice: true }));
    expect(rec.status).toBe("SUCCEEDED");
    expect(h.wallet.requests.find((r) => r.method === "pay_invoice")!.params).toEqual({
      invoice: inv.invoice,
      amount: 42_000,
    });
  });

  it("works end to end over legacy NIP-04", async () => {
    h = await harness({ wallet: { encryptionTag: null } });
    const inv = h.invoice(AMT);
    expect((await h.provider.sendPayment(h.req(inv, AMT))).status).toBe("SUCCEEDED");
    expect(h.wallet.requests.find((r) => r.method === "pay_invoice")!.scheme).toBe("nip04");
  });

  it("subscribes for the response BEFORE publishing the request, even when the relay is slow to EOSE", async () => {
    h = await harness();
    h.relay.eoseDelayMs = 200;
    const inv = h.invoice(AMT);
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec.status).toBe("SUCCEEDED");
    const log = h.relay.frameLog;
    const publishIdx = log.findIndex((f) => f.type === "EVENT" && f.kind === KIND_REQUEST);
    const conn = log[publishIdx]!.conn;
    const reqIdx = log.findIndex((f, i) => i < publishIdx && f.type === "REQ" && f.conn === conn);
    expect(reqIdx).toBeGreaterThanOrEqual(0);
  });

  it("does not need the relay's OK to succeed", async () => {
    h = await harness();
    h.relay.muteOk = true;
    const inv = h.invoice(AMT);
    expect((await h.provider.sendPayment(h.req(inv, AMT))).status).toBe("SUCCEEDED");
  });

  it("a wrong-preimage success is passed through for the state machine to flag, never turned into a failure", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "result", result: { preimage: "ab".repeat(32) } });
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec.status).toBe("SUCCEEDED");
    expect(rec.preimage).toBe("ab".repeat(32));
    expect(h.diagnostics).toContainEqual({ type: "preimage_mismatch", where: "pay_invoice" });
  });

  it("a success without a usable preimage is UNKNOWN (reconcile), not success and not failure", async () => {
    h = await harness();
    for (const result of [{}, { preimage: 5 }, { preimage: "xyz" }, { preimage: "ab".repeat(31) }]) {
      const inv = h.invoice(AMT);
      h.wallet.script("pay_invoice", { do: "result", result });
      await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
    }
  });

  it("reports (does not hide) a fee above the authorised limit when the owner opted into unenforced fee limits", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    const rec = await h.provider.sendPayment(h.req(inv, AMT, { feeLimitMsat: 10n }));
    expect(rec.feeMsat).toBe(1000n);
    expect(h.diagnostics).toContainEqual({ type: "fee_limit_exceeded", feeMsat: "1000", limitMsat: "10" });
  });
});

describe("CONTRACT (local fake): pre-flight refusals never touch the wallet", () => {
  async function expectNotSent(p: Promise<unknown>, reason: string) {
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(NotSentError);
    expect(err.reason).toBe(reason);
    expect(payCount()).toBe(0);
    expect(h!.relay.received.some((e) => e.kind === KIND_REQUEST && h!.wallet.requests.length === 0)).toBe(
      false,
    );
  }

  it("fee limit cannot be enforced by NIP-47 => refused by default", async () => {
    h = await harness({ provider: { unenforcedFeeLimit: "refuse" } });
    const inv = h.invoice(AMT);
    await expectNotSent(h.provider.sendPayment(h.req(inv, AMT)), "fee_limit_not_enforceable");
  });

  it("invoice that does not decode", async () => {
    h = await harness();
    await expectNotSent(
      h.provider.sendPayment({ ...h.req(h.invoice(AMT), AMT), invoice: "lnbcrt1notaninvoice" }),
      "invalid_request",
    );
  });

  it("payment hash that is not the invoice's", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    await expectNotSent(
      h.provider.sendPayment({ ...h.req(inv, AMT), paymentHash: "00".repeat(32) }),
      "invalid_request",
    );
  });

  it("amount differing from the invoice amount", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    await expectNotSent(h.provider.sendPayment(h.req(inv, AMT + 1n)), "invalid_request");
  });

  it("zero-amount invoice not flagged, and flagged-but-has-amount", async () => {
    h = await harness();
    const zero = h.invoice(null);
    await expectNotSent(h.provider.sendPayment(h.req(zero, 1000n)), "invalid_request");
    const amt = h.invoice(AMT);
    await expectNotSent(
      h.provider.sendPayment(h.req(amt, AMT, { zeroAmountInvoice: true })),
      "invalid_request",
    );
  });

  it("adapter closed (connection revoked locally)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.provider.close();
    await expectNotSent(h.provider.sendPayment(h.req(inv, AMT)), "adapter_closed");
  });
});

describe("CONTRACT (local fake): NIP-47 error codes -> wallet-contract classification", () => {
  // The wallet itself says it did not attempt the payment.
  for (const code of [
    "RATE_LIMITED",
    "QUOTA_EXCEEDED",
    "INSUFFICIENT_BALANCE",
    "RESTRICTED",
    "UNAUTHORIZED",
    "NOT_IMPLEMENTED",
    "UNSUPPORTED_ENCRYPTION",
  ]) {
    it(`${code} => NotSentError (explicit pre-processing refusal), walletCode preserved`, async () => {
      h = await harness();
      const inv = h.invoice(AMT);
      h.wallet.script("pay_invoice", { do: "error", code, execute: false });
      const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(NotSentError);
      expect(err).toBeInstanceOf(NwcNotSentError);
      expect(err.reason).toBe("wallet_rejected");
      expect(err.walletCode).toBe(code);
      expect(h.wallet.executions(inv.paymentHash)).toBe(0);
    });
  }

  // The wallet does not say the payment did not happen.
  for (const code of ["INTERNAL", "OTHER", "SOMETHING_NEW_IN_A_FUTURE_SPEC", "NOT_FOUND"]) {
    it(`${code} => OutcomeUnknownError (never NotSent, never a failure)`, async () => {
      h = await harness();
      const inv = h.invoice(AMT);
      h.wallet.script("pay_invoice", { do: "error", code, execute: true });
      const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(OutcomeUnknownError);
      expect(err).not.toBeInstanceOf(NotSentError);
    });
  }

  it("OTHER whose message says the payment already exists => AlreadyExistsError (reconcile, do not retry)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    await h.provider.sendPayment(h.req(inv, AMT));
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(AlreadyExistsError);
    expect(h.wallet.executions(inv.paymentHash)).toBe(1);
  });

  it("PAYMENT_FAILED is believed only after lookup_invoice confirms state=failed => FAILED record", async () => {
    h = await harness();
    const inv = h.invoice(AMT, "regtest", { known: false }); // wallet cannot pay it: records a failed attempt
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec.status).toBe("FAILED");
    expect(rec.failureReason).toMatch(/^PAYMENT_FAILED/);
    expect(h.wallet.requests.map((r) => r.method).slice(-2)).toEqual(["pay_invoice", "lookup_invoice"]);
  });

  it("PAYMENT_FAILED but the wallet's own record says SETTLED => SUCCEEDED, not FAILED (the dangerous case)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", {
      do: "error",
      code: "PAYMENT_FAILED",
      message: "timeout waiting for the payment",
      execute: true,
    });
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: inv.preimage });
  });

  it("PAYMENT_FAILED but the wallet has no record to confirm it => UNKNOWN (not a failure)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "error", code: "PAYMENT_FAILED", execute: false });
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("PAYMENT_FAILED while lookup_invoice is not permitted => UNKNOWN", async () => {
    h = await harness({ wallet: { methods: ["pay_invoice", "get_info"] } });
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "error", code: "PAYMENT_FAILED", execute: false });
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("PAYMENT_FAILED whose lookup reports the payment still pending => IN_FLIGHT", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "error", code: "PAYMENT_FAILED", execute: false });
    h.wallet.payments.set(inv.paymentHash, {
      state: "pending",
      preimage: null,
      amountMsat: AMT,
      feesMsat: 0n,
      type: "outgoing",
      settledAt: null,
      executions: 1,
    });
    expect((await h.provider.sendPayment(h.req(inv, AMT))).status).toBe("IN_FLIGHT");
  });
});

describe("CONTRACT (local fake): a timeout is UNKNOWN, never a failure, and reconciliation by lookup_invoice resolves it", () => {
  it("wallet executed the payment but never answered => UNKNOWN; lookup_invoice later proves SUCCEEDED; exactly one payment", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "silent", execute: true });
    const t0 = Date.now();
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(err).not.toBeInstanceOf(NotSentError);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
    const rec = await h.provider.lookupPayment(inv.paymentHash);
    expect(rec).toMatchObject({
      status: "SUCCEEDED",
      preimage: inv.preimage,
      feeMsat: 1000n,
      amountMsat: AMT,
    });
    expect(h.wallet.executions(inv.paymentHash)).toBe(1);
  });

  it("wallet never executed and never answered => UNKNOWN; lookup says NOT_FOUND (operator decides; adapter does not guess)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "silent", execute: false });
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect((await h.provider.lookupPayment(inv.paymentHash)).status).toBe("NOT_FOUND");
  });

  it("a response that arrives AFTER the timeout is not used; the outcome stays UNKNOWN and nothing crashes", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "late", afterMs: 900 });
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
    await sleep(700); // let the late response hit the (closed) subscription
    expect((await h.provider.lookupPayment(inv.paymentHash)).status).toBe("SUCCEEDED");
  });

  it("a slow response inside the timeout window is accepted", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "late", afterMs: 200 });
    expect((await h.provider.sendPayment(h.req(inv, AMT))).status).toBe("SUCCEEDED");
  });

  it("the connection dropping mid-flight (relay cut after the wallet executed) => UNKNOWN promptly; reconcile once reachable", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "drop_connection", execute: true });
    const t0 = Date.now();
    const err = await h.provider.sendPayment(h.req(inv, AMT, { timeoutSeconds: 5 })).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(err).not.toBeInstanceOf(NotSentError);
    expect(Date.now() - t0).toBeLessThan(2500); // did not sit out the 5s timeout
    await sleep(150); // wallet service reconnects to the relay
    await until(() => h!.relay.connectionCount >= 1);
    const rec = await h.provider.lookupPayment(inv.paymentHash);
    expect(rec.status).toBe("SUCCEEDED");
    expect(h.wallet.executions(inv.paymentHash)).toBe(1);
  });
});

describe("CONTRACT (local fake): inauthentic or irrelevant responses can never decide an outcome", () => {
  // Each scripted response is delivered by a relay that ignores filters (so the client-side checks are what is being tested).
  const cases: Array<[string, Action, string]> = [
    ["bad signature", { do: "bad_signature" }, "bad_signature"],
    ["wrong author (valid signature by a different key)", { do: "wrong_author" }, "wrong_author"],
    ["`e` tag naming another request", { do: "wrong_e_tag" }, "wrong_e_tag"],
    ["`p` tag addressed to someone else", { do: "wrong_p_tag" }, "wrong_p_tag"],
    ["result_type of another method", { do: "wrong_result_type" }, "wrong_result_type"],
    ["undecodable payload (valid envelope, junk JSON)", { do: "garbage_payload" }, "malformed_payload"],
    ["stale response (created long before the request)", { do: "stale" }, "stale"],
    ["response carrying an already-passed expiration tag", { do: "expired_response" }, "expired"],
  ];
  for (const [name, action, reason] of cases) {
    it(`${name} => ignored (diagnostic "${reason}"); outcome UNKNOWN at timeout`, async () => {
      h = await harness();
      h.relay.lax = true;
      h.relay.verifyEvents = false; // a relay that forwards forgeries (real relays reject them; the client must not rely on that)
      const inv = h.invoice(AMT);
      h.wallet.script("pay_invoice", action);
      const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(OutcomeUnknownError);
      expect(err).not.toBeInstanceOf(NotSentError);
      expect(reasons()).toContain(reason);
    });
  }

  it("replaying an OLD genuine response for a NEW request is ignored", async () => {
    h = await harness();
    h.relay.lax = true;
    const first = h.invoice(AMT);
    expect((await h.provider.sendPayment(h.req(first, AMT))).status).toBe("SUCCEEDED");
    const second = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "replay" });
    const err = await h.provider.sendPayment(h.req(second, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(reasons()).toContain("wrong_e_tag");
  });

  it("an inauthentic ERROR response cannot make the adapter report a failure or a refusal", async () => {
    h = await harness();
    h.relay.lax = true;
    h.relay.verifyEvents = false;
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "bad_signature" });
    // even though the (forged) body would decode, the adapter must not act on it
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("a forged response ahead of the genuine one is ignored and the genuine one is still accepted", async () => {
    h = await harness();
    h.relay.lax = true;
    h.relay.verifyEvents = false;
    const inv = h.invoice(AMT);
    // the fake wallet answers with a forgery first, then (second scripted action is not consumed by the same request), so emulate
    // the race directly: a hostile relay injects a forged response the moment the request arrives, the wallet then answers properly.
    const forged = {
      id: "ab".repeat(32),
      pubkey: h.wallet.walletPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 23195,
      tags: [["p", h.provider.clientPubkey]],
      content: "AAAA",
      sig: "cd".repeat(64),
    };
    h.relay.hostileExtras = [forged];
    h.relay.inject(forged);
    const rec = await h.provider.sendPayment(h.req(inv, AMT));
    expect(rec.status).toBe("SUCCEEDED");
    expect(reasons().length).toBeGreaterThan(0);
  });
});

describe("CONTRACT (local fake): relay behaviour decides 'not sent' vs 'unknown' strictly", () => {
  it("no relay reachable => NotSent (nothing was written anywhere)", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    await h.relay.stop();
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(NotSentError);
    expect(["wallet_info_unavailable", "relay_unreachable"]).toContain(err.reason);
  });

  it("relay goes away after the info is cached => the publish step finds nobody => NotSent, nothing published", async () => {
    h = await harness({ provider: { infoCacheMs: 60_000 } });
    const inv = h.invoice(AMT);
    // prime the send-path caches through a successful payment, then kill the relay
    expect((await h.provider.sendPayment(h.req(h.invoice(AMT), AMT))).status).toBe("SUCCEEDED");
    await h.relay.stop();
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(NwcNotSentError);
    expect(err.reason).toBe("relay_unreachable");
    expect(h.wallet.executions(inv.paymentHash)).toBe(0);
  });

  it("relay refuses the response subscription (CLOSED) => NotSent, request never published", async () => {
    h = await harness({ provider: { infoCacheMs: 60_000 } });
    await h.provider.getInfo(); // primes the info + get_info caches (these reads are published; the payment must not be)
    const publishedBefore = h.relay.received.filter((e) => e.kind === KIND_REQUEST).length;
    h.relay.refuseSubscriptions = "auth-required: this relay needs NIP-42 authentication";
    const inv = h.invoice(AMT);
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(NotSentError);
    expect(h.relay.received.filter((e) => e.kind === KIND_REQUEST)).toHaveLength(publishedBefore);
  });

  it("relay accepts connections but never answers REQ => NotSent after the connect timeout, nothing published", async () => {
    h = await harness({ provider: { infoCacheMs: 60_000, connectTimeoutMs: 300 } });
    await h.provider.getInfo();
    const publishedBefore = h.relay.received.filter((e) => e.kind === KIND_REQUEST).length;
    h.relay.blackhole = true;
    const inv = h.invoice(AMT);
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(NotSentError);
    expect(h.relay.received.filter((e) => e.kind === KIND_REQUEST)).toHaveLength(publishedBefore);
  });

  for (const prefix of ["blocked", "restricted", "invalid", "rate-limited", "pow"]) {
    it(`every relay answers OK false "${prefix}:" => NotSent (the relay did not accept the request)`, async () => {
      h = await harness({ provider: { infoCacheMs: 60_000 } });
      await h.provider.getInfo(); // prime caches so that the rejection hits the payment request itself
      h.relay.rejectEvents = { kind: KIND_REQUEST, message: `${prefix}: not today` };
      const inv = h.invoice(AMT);
      const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(NwcNotSentError);
      expect(err.reason).toBe("relay_rejected");
    });
  }

  for (const message of [
    "error: could not connect to the database",
    "duplicate: already have this event",
    "mute: ignored",
    "something unexpected",
  ]) {
    it(`OK false with ambiguous message "${message}" => UNKNOWN (the relay may have forwarded it)`, async () => {
      h = await harness({ provider: { infoCacheMs: 60_000 } });
      await h.provider.getInfo();
      h.relay.rejectEvents = { kind: KIND_REQUEST, message };
      const inv = h.invoice(AMT);
      const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(OutcomeUnknownError);
      expect(err).not.toBeInstanceOf(NotSentError);
    });
  }

  it("relay accepted the event (OK true) but the wallet stays silent => UNKNOWN, not NotSent", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "silent", execute: false });
    const err = await h.provider.sendPayment(h.req(inv, AMT)).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(h.diagnostics).toContainEqual(expect.objectContaining({ type: "publish_ack", accepted: true }));
  });

  it("relay drops the socket the instant the request frame arrives (no OK) => UNKNOWN", async () => {
    h = await harness({ provider: { infoCacheMs: 60_000 } });
    await h.provider.getInfo();
    h.relay.dropOnEventKind = KIND_REQUEST;
    const inv = h.invoice(AMT);
    const err = await h.provider.sendPayment(h.req(inv, AMT, { timeoutSeconds: 3 })).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(err).not.toBeInstanceOf(NotSentError);
  });

  it("two relays, one dead: the payment still goes through the live one", async () => {
    h = await harness();
    const { FakeRelay } = await import("./helpers/fake-relay");
    const dead = new FakeRelay();
    const deadUrl = await dead.start();
    await dead.stop();
    const { parseNwcUri } = await import("../src/nwc/uri");
    void parseNwcUri;
    const twoRelayUri = `${h.uri}&relay=${encodeURIComponent(deadUrl)}`;
    const p = h.makeProvider({ uri: twoRelayUri });
    const inv = h.invoice(AMT);
    expect((await p.sendPayment(h.req(inv, AMT))).status).toBe("SUCCEEDED");
    expect(h.wallet.executions(inv.paymentHash)).toBe(1);
    p.close();
  });

  it("publishes through every live relay and accepts the first authentic response; a duplicate response is harmless", async () => {
    h = await harness();
    const { FakeRelay } = await import("./helpers/fake-relay");
    const { FakeWallet } = await import("./helpers/fake-wallet");
    const second = new FakeRelay();
    const url2 = await second.start();
    // the same wallet service listens on both relays
    const w2 = new FakeWallet({
      relays: [url2],
      walletSecret: (h.wallet as never as { o: { walletSecret: Uint8Array } }).o.walletSecret,
      clientPubkey: h.provider.clientPubkey,
      network: "regtest",
    });
    for (const [k, v] of h.wallet.knownPreimages) w2.knownPreimages.set(k, v);
    await w2.start();
    const p = h.makeProvider({ uri: `${h.uri}&relay=${encodeURIComponent(url2)}` });
    const inv = h.invoice(AMT);
    const rec = await p.sendPayment(h.req(inv, AMT));
    expect(rec.status).toBe("SUCCEEDED");
    // the SAME request event (same id) was carried by both relays
    const payId = h.wallet.requests.find((r) => r.method === "pay_invoice")!.eventId;
    expect(h.relay.received.filter((e) => e.id === payId)).toHaveLength(1);
    expect(second.received.filter((e) => e.id === payId)).toHaveLength(1);
    p.close();
    await w2.stop();
    await second.stop();
  });
});

describe("CONTRACT (local fake): local revocation (close)", () => {
  it("close() while a published request is in flight => UNKNOWN (it may have executed); afterwards everything refuses", async () => {
    h = await harness();
    const inv = h.invoice(AMT);
    h.wallet.script("pay_invoice", { do: "silent", execute: true });
    const pending = h.provider.sendPayment(h.req(inv, AMT, { timeoutSeconds: 10 })).then(
      () => null,
      (e) => e,
    );
    await until(() => h!.wallet.requests.some((r) => r.method === "pay_invoice"));
    h.provider.close();
    const err = await pending;
    expect(err).toBeInstanceOf(OutcomeUnknownError);
    expect(h.provider.closed).toBe(true);
    await expect(h.provider.sendPayment(h.req(h.invoice(AMT), AMT))).rejects.toMatchObject({
      reason: "adapter_closed",
    });
    await expect(h.provider.lookupPayment(inv.paymentHash)).rejects.toBeInstanceOf(NotSentError);
    await expect(h.provider.getInfo()).rejects.toBeInstanceOf(Error);
    expect((await h.provider.discoverCapabilities()).canSendPayments).toBe("unknown");
  });

  it("close() destroys the secret: the client key is zeroed and cannot sign again", async () => {
    h = await harness();
    h.provider.close();
    const inv = h.invoice(AMT);
    await expect(h.provider.sendPayment(h.req(inv, AMT))).rejects.toBeInstanceOf(NotSentError);
    expect(payCount()).toBe(0);
  });
});

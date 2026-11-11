/**
 * CONTRACT TESTS against a LOCAL FAKE relay + FAKE wallet service. They show that this adapter follows the NIP-47 message flow as
 * written and classifies outcomes safely. They are NOT operational verification against any real NWC wallet service.
 *
 * Covers: info event, encryption negotiation, get_info / network assertion, capability discovery, get_budget.
 */
import { afterEach, describe, expect, it } from "vitest";
import { harness, type Harness } from "./helpers/harness";
import { NwcNetworkError } from "../src/nwc/errors";
import { InsufficientPermissionsError, NotSentError, OutcomeUnknownError } from "../src/types";
import { NwcNotSentError } from "../src/nwc/errors";

let h: Harness | undefined;
afterEach(async () => {
  if (h) {
    // no diagnostic, error or log line may ever contain the client secret
    expect(JSON.stringify(h.diagnostics)).not.toContain(h.secretHex);
    await h.stop();
  }
  h = undefined;
});

describe("CONTRACT (local fake): info event + encryption negotiation", () => {
  it("reads the wallet's kind-13194 info event and talks NIP-44 v2 by default", async () => {
    h = await harness();
    const info = await h.provider.getInfo();
    expect(info.kind).toBe("nwc");
    expect(h.wallet.requests.map((r) => [r.method, r.scheme])).toEqual([["get_info", "nip44_v2"]]);
  });

  it("falls back to NIP-04 when the info event has no `encryption` tag (legacy wallet service), per NIP-47", async () => {
    h = await harness({ wallet: { encryptionTag: null } });
    await h.provider.getInfo();
    expect(h.wallet.requests[0]?.scheme).toBe("nip04");
  });

  it("falls back to NIP-04 when only nip04 is listed; uses NIP-44 when both are listed", async () => {
    h = await harness({ wallet: { encryptionTag: "nip04" } });
    await h.provider.getInfo();
    expect(h.wallet.requests[0]?.scheme).toBe("nip04");
    await h.stop();
    h = await harness({ wallet: { encryptionTag: "nip04 nip44_v2" } });
    await h.provider.getInfo();
    expect(h.wallet.requests[0]?.scheme).toBe("nip44_v2");
  });

  it("refuses NIP-04 when configured with allowNip04:false, without sending anything", async () => {
    h = await harness({ wallet: { encryptionTag: null }, provider: { allowNip04: false } });
    await expect(h.provider.getInfo()).rejects.toMatchObject({ reason: "encryption_unsupported" });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe(false);
    expect(h.wallet.requests).toHaveLength(0);
  });

  it("fails when no scheme is in common", async () => {
    h = await harness({ wallet: { encryptionTag: "nip99_v9" } });
    await expect(h.provider.getInfo()).rejects.toBeInstanceOf(NwcNotSentError);
  });

  it("uses the newest valid info event and ignores forged ones (bad signature / other author) from a hostile relay", async () => {
    h = await harness();
    const { signEvent, KIND_INFO, getPublicKeyHex } = await import("../src/nwc/nostr");
    const { randomBytes } = await import("@noble/hashes/utils.js");
    const attacker = randomBytes(32);
    const genuine = h.relay
      .storedEvents()
      .find((e) => e.kind === KIND_INFO && e.pubkey === h!.wallet.walletPubkey)!;
    h.relay.hostileExtras = [
      // newer, advertises everything and downgrades to nip04 — but signed by somebody else
      signEvent(
        {
          pubkey: getPublicKeyHex(attacker),
          created_at: 4_000_000_000,
          kind: KIND_INFO,
          tags: [["encryption", "nip04"]],
          content: "pay_invoice",
        },
        attacker,
      ),
      // right author and newer, but content altered after signing (id/sig no longer match)
      { ...genuine, created_at: genuine.created_at + 10, content: "pay_invoice list_transactions" },
    ];
    const caps = await h.provider.discoverCapabilities();
    expect(caps.notes.join(" ")).toContain("Encryption: nip44_v2");
    expect(caps.notes.join(" ")).not.toContain("list_transactions");
    const reasons = h.diagnostics
      .filter((d) => d.type === "info_rejected")
      .map((d) => (d as { reason: string }).reason);
    expect(reasons).toEqual(expect.arrayContaining(["bad_signature", "wrong_author"]));
  });
});

describe("CONTRACT (local fake): network determination (NWC has no mandatory network field)", () => {
  it("uses the network the wallet reports in get_info", async () => {
    h = await harness({ wallet: { network: "signet" } });
    expect((await h.provider.getInfo()).network).toBe("signet");
  });

  it("REFUSES when the wallet reports no network and the owner asserted none", async () => {
    h = await harness({ wallet: { network: undefined } });
    const err = await h.provider.getInfo().catch((e) => e);
    expect(err).toBeInstanceOf(NwcNetworkError);
    expect(err.kind).toBe("unverified");
  });

  it("treats a non-standard network string as 'not reported'", async () => {
    h = await harness({ wallet: { network: "bitcoin" } });
    await expect(h.provider.getInfo()).rejects.toMatchObject({ kind: "unverified" });
  });

  it("accepts the owner's assertion when the wallet is silent, and says so in the capability notes", async () => {
    h = await harness({ wallet: { network: undefined }, provider: { network: "regtest" } });
    expect((await h.provider.getInfo()).network).toBe("regtest");
    const caps = await h.provider.discoverCapabilities();
    expect(caps.notes.join("\n")).toMatch(/OWNER'S ASSERTION.*unverified/);
  });

  it("REFUSES when the wallet's reported network contradicts the owner's assertion", async () => {
    h = await harness({ wallet: { network: "mainnet" }, provider: { network: "regtest" } });
    await expect(h.provider.getInfo()).rejects.toMatchObject({ kind: "mismatch" });
    const inv = h.invoice();
    await expect(h.provider.sendPayment(h.req(inv, 100_000n))).rejects.toMatchObject({
      reason: "network_refused",
    });
    expect(h.wallet.requests.some((r) => r.method === "pay_invoice")).toBe(false);
  });

  it("reports a mainnet wallet but never sends on it unless allowMainnet is explicitly set", async () => {
    h = await harness({ wallet: { network: "mainnet" } });
    expect((await h.provider.getInfo()).network).toBe("mainnet");
    const inv = h.invoice(100_000n, "mainnet");
    const err = await h.provider.sendPayment(h.req(inv, 100_000n)).catch((e) => e);
    expect(err).toBeInstanceOf(NotSentError);
    expect(err.reason).toBe("network_refused");
    expect(h.wallet.requests.some((r) => r.method === "pay_invoice")).toBe(false);
  });

  it("an invoice for another network than the wallet's is refused before sending", async () => {
    h = await harness({ wallet: { network: "regtest" } });
    const inv = h.invoice(100_000n, "testnet");
    await expect(h.provider.sendPayment(h.req(inv, 100_000n))).rejects.toMatchObject({
      reason: "network_refused",
    });
    expect(h.wallet.requests.some((r) => r.method === "pay_invoice")).toBe(false);
  });

  it("without a get_info permission the owner's assertion is the only source; with none, sending is refused", async () => {
    h = await harness({ wallet: { methods: ["pay_invoice", "lookup_invoice"] } });
    await expect(h.provider.getInfo()).rejects.toBeInstanceOf(NwcNetworkError);
    const inv = h.invoice();
    await expect(h.provider.sendPayment(h.req(inv, 100_000n))).rejects.toMatchObject({
      reason: "network_refused",
    });
    await h.stop();
    h = await harness({
      wallet: { methods: ["pay_invoice", "lookup_invoice"] },
      provider: { network: "regtest" },
    });
    expect((await h.provider.getInfo()).network).toBe("regtest");
    const inv2 = h.invoice();
    const rec = await h.provider.sendPayment(h.req(inv2, 100_000n));
    expect(rec.status).toBe("SUCCEEDED");
  });
});

describe("CONTRACT (local fake): capability discovery never over-claims", () => {
  it("full-permission connection: can send, look up, read info", async () => {
    h = await harness();
    const caps = await h.provider.discoverCapabilities();
    expect(caps).toMatchObject({ canSendPayments: true, canLookupPayments: true, canReadInfo: true });
  });

  it("pay_invoice not advertised in the info event => canSendPayments:false (read-only connection)", async () => {
    h = await harness({ wallet: { methods: ["get_info", "get_balance", "lookup_invoice"] } });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe(false);
    expect(caps.canLookupPayments).toBe(true);
    expect(caps.notes.join(" ")).toMatch(/pay_invoice is not advertised/);
    const inv = h.invoice();
    await expect(h.provider.sendPayment(h.req(inv, 100_000n))).rejects.toMatchObject({
      reason: "method_not_advertised",
    });
    expect(h.wallet.requests.some((r) => r.method === "pay_invoice")).toBe(false);
  });

  it("info event lists pay_invoice but THIS connection's get_info does not => false", async () => {
    h = await harness({ wallet: { connectionMethods: ["get_info", "lookup_invoice"] } });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe(false);
    expect(caps.notes.join(" ")).toMatch(/not authorised for pay_invoice/);
    const inv = h.invoice();
    await expect(h.provider.sendPayment(h.req(inv, 100_000n))).rejects.toMatchObject({
      reason: "method_not_advertised",
    });
  });

  it("advertised but unconfirmable (get_info not offered) => 'unknown', never true", async () => {
    h = await harness({ wallet: { methods: ["pay_invoice", "lookup_invoice"] } });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe("unknown");
    expect(caps.canLookupPayments).toBe("unknown");
    expect(caps.canReadInfo).toBe(false);
  });

  it("get_info refused for this connection (RESTRICTED) => 'unknown'", async () => {
    h = await harness();
    h.wallet.script("get_info", { do: "error", code: "RESTRICTED" });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe("unknown");
    expect(caps.canReadInfo).toBe(false);
  });

  it("wallet service never published an info event => nothing is advertised => false", async () => {
    h = await harness({ noWallet: true });
    const caps = await h.provider.discoverCapabilities();
    expect(caps).toMatchObject({ canSendPayments: false, canLookupPayments: false, canReadInfo: false });
  });

  it("relays unreachable => everything 'unknown' (not false, not true)", async () => {
    h = await harness();
    await h.relay.stop();
    const caps = await h.provider.discoverCapabilities();
    expect(caps).toMatchObject({
      canSendPayments: "unknown",
      canLookupPayments: "unknown",
      canReadInfo: "unknown",
    });
  });

  it("states that the fee limit cannot be enforced by NIP-47", async () => {
    h = await harness({ provider: { unenforcedFeeLimit: "refuse" } });
    expect((await h.provider.discoverCapabilities()).notes.join(" ")).toMatch(
      /no fee-limit parameter.*sends are refused/,
    );
  });
});

describe("CONTRACT (local fake): get_budget (NWC-13) interpretation", () => {
  it("reports remaining budget in notes and via getBudget()", async () => {
    h = await harness({
      wallet: {
        methods: ["pay_invoice", "get_info", "lookup_invoice", "get_budget"],
        budget: { used: 10_000, total: 100_000, renewsAt: 4_000_000_000, period: "monthly" },
      },
    });
    expect(await h.provider.getBudget()).toMatchObject({
      usedMsat: 10_000n,
      totalMsat: 100_000n,
      remainingMsat: 90_000n,
      renewalPeriod: "monthly",
    });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe(true);
    expect(caps.notes.join(" ")).toMatch(/90000 msat remaining of 100000/);
  });

  it("an exhausted budget is flagged but is not a permission change", async () => {
    h = await harness({
      wallet: {
        methods: ["pay_invoice", "get_info", "lookup_invoice", "get_budget"],
        budget: { used: 100_000, total: 100_000, period: "never" },
      },
    });
    const caps = await h.provider.discoverCapabilities();
    expect(caps.canSendPayments).toBe(true);
    expect(caps.notes.join(" ")).toMatch(/budget is exhausted/);
  });

  it("an empty result means 'no budget configured' (distinct from a zero budget)", async () => {
    h = await harness({
      wallet: { methods: ["pay_invoice", "get_info", "lookup_invoice", "get_budget"], budget: "none" },
    });
    expect(await h.provider.getBudget()).toBeNull();
    h.wallet.script("get_budget", {
      do: "result",
      result: { used_budget: 0, total_budget: 0, renewal_period: "never" },
    });
    expect(await h.provider.getBudget()).toMatchObject({ totalMsat: 0n, remainingMsat: 0n });
  });

  it("is not called when the wallet does not advertise get_budget", async () => {
    h = await harness();
    await expect(h.provider.getBudget()).rejects.toBeInstanceOf(InsufficientPermissionsError);
    await h.provider.discoverCapabilities();
    expect(h.wallet.requests.some((r) => r.method === "get_budget")).toBe(false);
  });

  it("a malformed budget answer is an unknown, not a number", async () => {
    h = await harness({ wallet: { methods: ["pay_invoice", "get_info", "lookup_invoice", "get_budget"] } });
    h.wallet.script("get_budget", { do: "result", result: { used_budget: "lots", total_budget: 5 } });
    await expect(h.provider.getBudget()).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});

describe("CONTRACT (local fake): relay access tokens and secrets stay out of diagnostics and serialisations", () => {
  it("a token embedded in a relay URL never appears in diagnostics or JSON.stringify(provider)", async () => {
    h = await harness();
    const dead = `${h.relay.url}`.replace(/:\d+$/, ":1"); // refused port => relay_failed diagnostic
    const withToken = (base: string) => `&relay=${encodeURIComponent(`${base}/?token=TOPSECRETTOKEN`)}`;
    const p = h.makeProvider({ uri: `${h.uri}${withToken(h.relay.url)}${withToken(dead)}` });
    await p.getInfo();
    await p.discoverCapabilities();
    const rendered = JSON.stringify(h.diagnostics) + JSON.stringify(p);
    expect(h.diagnostics.some((d) => d.type === "relay_failed")).toBe(true);
    expect(rendered).not.toContain("TOPSECRETTOKEN");
    expect(rendered).not.toContain(h.secretHex);
    p.close();
  });
});

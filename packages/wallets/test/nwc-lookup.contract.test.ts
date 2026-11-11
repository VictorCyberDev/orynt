/**
 * CONTRACT TESTS against a LOCAL FAKE relay + FAKE wallet service. NOT operational verification against a real NWC wallet.
 * lookup_invoice (by payment_hash) is the reconciliation path for any uncertain payment, so its mapping must be conservative:
 * only an authenticated, unambiguous record may produce SUCCEEDED / FAILED / NOT_FOUND; anything else is UNKNOWN.
 */
import { afterEach, describe, expect, it } from "vitest";
import { harness, type Harness } from "./helpers/harness";
import { InsufficientPermissionsError, OutcomeUnknownError } from "../src/types";

let h: Harness | undefined;
afterEach(async () => {
  if (h) {
    expect(JSON.stringify(h.diagnostics)).not.toContain(h.secretHex);
    await h.stop();
  }
  h = undefined;
});

const HASH = "11".repeat(32);
const base = (over: Record<string, unknown>) => ({ type: "outgoing", payment_hash: HASH, amount: 5000, created_at: 1_700_000_000, ...over });

async function lookupWith(result: Record<string, unknown>, hash = HASH) {
  h!.wallet.script("lookup_invoice", { do: "result", result });
  return h!.provider.lookupPayment(hash);
}

describe("CONTRACT (local fake): lookup_invoice -> PaymentRecord", () => {
  it("rejects a payment hash that is not 32 bytes of lowercase hex (programmer error, like the LND adapter)", async () => {
    h = await harness();
    await expect(h.provider.lookupPayment("abc")).rejects.toThrow(/32 bytes hex/);
    await expect(h.provider.lookupPayment("AA".repeat(32))).rejects.toThrow(/32 bytes hex/);
  });

  it("NOT_FOUND error => NOT_FOUND record", async () => {
    h = await harness();
    expect(await h.provider.lookupPayment(HASH)).toMatchObject({ status: "NOT_FOUND", paymentHash: HASH });
  });

  it("settled + matching preimage => SUCCEEDED with amount, fee and settlement time", async () => {
    h = await harness();
    const inv = h.invoice(100_000n);
    h.wallet.payments.set(inv.paymentHash, { state: "settled", preimage: inv.preimage, amountMsat: 100_000n, feesMsat: 250n, type: "outgoing", settledAt: 1_700_000_123, executions: 1 });
    const rec = await h.provider.lookupPayment(inv.paymentHash);
    expect(rec).toMatchObject({ status: "SUCCEEDED", preimage: inv.preimage, amountMsat: 100_000n, feeMsat: 250n, settledAt: "2023-11-14T22:15:23.000Z" });
  });

  it("settled with a WRONG preimage is passed through (the state machine flags it), with a diagnostic", async () => {
    h = await harness();
    const rec = await lookupWith(base({ state: "settled", preimage: "ab".repeat(32), settled_at: 1_700_000_100 }));
    expect(rec.status).toBe("SUCCEEDED");
    expect(rec.preimage).toBe("ab".repeat(32));
    expect(h.diagnostics).toContainEqual({ type: "preimage_mismatch", where: "lookup_invoice" });
  });

  it("settled without a preimage => SUCCEEDED with no preimage (the state machine will refuse to settle it)", async () => {
    h = await harness();
    const rec = await lookupWith(base({ state: "settled" }));
    expect(rec.status).toBe("SUCCEEDED");
    expect(rec.preimage).toBeUndefined();
  });

  it("failed => FAILED with the wallet's (sanitised) reason", async () => {
    h = await harness();
    const rec = await lookupWith(base({ state: "failed", failure_reason: "no route\u0007 found" }));
    expect(rec).toMatchObject({ status: "FAILED", failureReason: "no route  found" });
  });

  it("failed without a reason => FAILED with a generic reason", async () => {
    h = await harness();
    expect(await lookupWith(base({ state: "failed" }))).toMatchObject({ status: "FAILED", failureReason: "NWC_STATE_FAILED" });
  });

  it("pending and accepted => IN_FLIGHT", async () => {
    h = await harness();
    expect((await lookupWith(base({ state: "pending" }))).status).toBe("IN_FLIGHT");
    expect((await lookupWith(base({ state: "accepted" }))).status).toBe("IN_FLIGHT");
  });

  it("`state` is optional in NIP-47: a preimage that hashes to the payment hash is proof of payment => SUCCEEDED", async () => {
    h = await harness();
    const inv = h.invoice(1000n);
    expect((await lookupWith(base({ payment_hash: inv.paymentHash, preimage: inv.preimage }), inv.paymentHash)).status).toBe("SUCCEEDED");
  });

  it("no state and no provable preimage => UNKNOWN", async () => {
    h = await harness();
    await expect(lookupWith(base({}))).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(lookupWith(base({ preimage: "ab".repeat(32) }))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("unrecognised / not-for-outgoing states (expired, canceled, future values) => UNKNOWN, never guessed", async () => {
    h = await harness();
    for (const state of ["expired", "canceled", "refunded", 5, null]) {
      await expect(lookupWith(base({ state }))).rejects.toBeInstanceOf(OutcomeUnknownError);
    }
  });

  it("a record for a DIFFERENT payment hash is not trusted", async () => {
    h = await harness();
    await expect(lookupWith(base({ payment_hash: "22".repeat(32), state: "failed" }))).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(lookupWith({ type: "outgoing", state: "failed" })).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("an INCOMING record with the same hash says nothing about our outgoing payment => UNKNOWN", async () => {
    h = await harness();
    await expect(lookupWith(base({ type: "incoming", state: "settled", preimage: "ab".repeat(32) }))).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(lookupWith(base({ type: undefined, state: "failed" }))).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("garbage numbers are dropped, not trusted", async () => {
    h = await harness();
    const rec = await lookupWith(base({ state: "pending", amount: -5, fees_paid: "NaN" }));
    expect(rec.amountMsat).toBeUndefined();
    expect(rec.feeMsat).toBeUndefined();
  });
});

describe("CONTRACT (local fake): lookup_invoice errors and permissions", () => {
  for (const code of ["RESTRICTED", "UNAUTHORIZED", "NOT_IMPLEMENTED"]) {
    it(`${code} => InsufficientPermissionsError (this connection cannot reconcile)`, async () => {
      h = await harness();
      h.wallet.script("lookup_invoice", { do: "error", code });
      await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(InsufficientPermissionsError);
    });
  }
  for (const code of ["RATE_LIMITED", "INTERNAL", "OTHER", "WHAT_IS_THIS"]) {
    it(`${code} => OutcomeUnknownError (retry later)`, async () => {
      h = await harness();
      h.wallet.script("lookup_invoice", { do: "error", code });
      await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(OutcomeUnknownError);
    });
  }

  it("lookup_invoice not advertised => InsufficientPermissionsError without sending anything", async () => {
    h = await harness({ wallet: { methods: ["pay_invoice", "get_info"] } });
    await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(InsufficientPermissionsError);
    expect(h.wallet.requests.some((r) => r.method === "lookup_invoice")).toBe(false);
  });

  it("wallet silent => OutcomeUnknownError (a timeout never becomes NOT_FOUND)", async () => {
    h = await harness();
    h.wallet.script("lookup_invoice", { do: "silent" });
    await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("a forged NOT_FOUND (bad signature) is ignored => OutcomeUnknownError", async () => {
    h = await harness();
    h.relay.lax = true;
    h.relay.verifyEvents = false;
    h.wallet.script("lookup_invoice", { do: "bad_signature" });
    await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(h.diagnostics).toContainEqual(expect.objectContaining({ type: "response_rejected", reason: "bad_signature" }));
  });

  it("relays unreachable => OutcomeUnknownError", async () => {
    h = await harness();
    await h.relay.stop();
    await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it("wallet service that never published an info event => OutcomeUnknownError", async () => {
    h = await harness({ noWallet: true });
    await expect(h.provider.lookupPayment(HASH)).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});

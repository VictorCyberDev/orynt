import { describe, expect, it } from "vitest";
import {
  attestReceipt,
  generateKeyPair,
  signCheckpoint,
  makeEntry,
  GENESIS_HASH,
  type Receipt,
  type ReceiptBody,
} from "@orynt/core";
import { verifyReceipt } from "../src";
import { buildFixture, trustOf } from "./fixture";

const clone = <T>(x: T): T => structuredClone(x);
const reissue = (f: ReturnType<typeof buildFixture>, mut: (b: ReceiptBody) => void): Receipt => {
  const { attestation: _a, ...body } = clone(f.receipt);
  mut(body as ReceiptBody);
  return attestReceipt(f.issuer.privateKey, "orynt-test-1", body as ReceiptBody); // a *validly re-signed* but dishonest receipt
};
const failing = (r: ReturnType<typeof verifyReceipt>) =>
  r.checks.filter((c) => c.status === "FAIL").map((c) => c.id);

describe("verifyReceipt — happy paths", () => {
  it("VERIFIED for a faithful receipt with a trusted issuer", () => {
    const f = buildFixture({ approvals: 2 });
    const r = verifyReceipt(f.receipt, { trustedKeys: trustOf(f), requireReal: true });
    expect(failing(r)).toEqual([]);
    expect(r.verdict).toBe("VERIFIED");
    expect(r.checks.find((c) => c.id === "settlement.preimage")?.status).toBe("PASS");
  });
  it("INTEGRITY_ONLY without a trust root (self-asserted issuer is never silently trusted)", () => {
    const f = buildFixture();
    expect(verifyReceipt(f.receipt).verdict).toBe("INTEGRITY_ONLY");
  });
  it("simulator receipts are VERIFIED_SIMULATED and fail --require-real", () => {
    const f = buildFixture({ simulator: true });
    expect(verifyReceipt(f.receipt, { trustedKeys: trustOf(f) }).verdict).toBe("VERIFIED_SIMULATED");
    const strict = verifyReceipt(f.receipt, { trustedKeys: trustOf(f), requireReal: true });
    expect(strict.verdict).toBe("REJECTED");
    expect(failing(strict)).toContain("require.real");
  });
});

describe("verifyReceipt — adversarial", () => {
  it("rejects a receipt signed by an issuer key that is not the trusted one (forged receipt)", () => {
    const f = buildFixture();
    const evil = generateKeyPair();
    const forged = attestReceipt(
      evil.privateKey,
      "orynt-test-1",
      (({ attestation: _a, ...b }) => ({
        ...b,
        issuer: { key_id: "orynt-test-1", public_key: evil.publicKey },
      }))(clone(f.receipt)) as ReceiptBody,
    );
    const r = verifyReceipt(forged, { trustedKeys: trustOf(f) });
    expect(r.verdict).toBe("REJECTED");
    expect(failing(r)).toContain("issuer.trusted");
  });
  it("rejects when ANY single character of the serialized receipt is changed (sampled across the whole document)", () => {
    const f = buildFixture({ approvals: 2 });
    const text = JSON.stringify(f.receipt);
    let accepted = 0;
    const step = Math.max(1, Math.floor(text.length / 400));
    for (let i = 0; i < text.length; i += step) {
      const ch = text[i] as string;
      const repl = ch === "a" ? "b" : "a";
      const mutated = text.slice(0, i) + repl + text.slice(i + 1);
      let data: unknown;
      try {
        data = JSON.parse(mutated);
      } catch {
        continue;
      } // not even JSON
      const v = verifyReceipt(data, { trustedKeys: trustOf(f) }).verdict;
      if (v === "VERIFIED") accepted++;
    }
    expect(accepted).toBe(0);
  }, 60_000); // CPU-bound by design (re-verifies a signed receipt once per sampled character); the 5 s default was within 15% of its normal run time
  it("rejects a swapped preimage even when the issuer re-signs it", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.settlement.preimage = "43".repeat(32);
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(r.verdict).toBe("REJECTED");
    expect(failing(r)).toContain("settlement.preimage");
  });
  it("rejects amount substitution (settled amount differs from approved)", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.settlement.amount_msat = "1";
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(failing(r)).toContain("settlement.amount");
  });
  it("rejects destination substitution: agreement payee changed but invoice unchanged", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.agreement.payee_pubkey = "03" + "9".repeat(64);
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(r.verdict).toBe("REJECTED");
    expect(failing(r)).toEqual(expect.arrayContaining(["invoice.payee"]));
  });
  it("rejects a changed obligation after approval (revision hash / intent no longer match approvals)", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.agreement.memo = "Something else entirely";
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(failing(r)).toContain("agreement.hash");
  });
  it("rejects approvals that do not bind the intent (reused approval from another payment)", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.approvals[0]!.payload.intent_digest = "f".repeat(64);
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(r.verdict).toBe("REJECTED");
  });
  it("rejects insufficient approvals and duplicate approver", () => {
    const f = buildFixture({ approvals: 2 });
    const dup = verifyReceipt(
      reissue(f, (b) => {
        b.approvals[1] = clone(b.approvals[0]!);
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(dup.verdict).toBe("REJECTED");
    const few = verifyReceipt(
      reissue(f, (b) => {
        b.approvals = [b.approvals[0]!];
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(failing(few)).toContain("approval.threshold");
  });
  it("rejects a maker who approved their own payment", () => {
    const f = buildFixture({ makerIsApprover: true });
    const r = verifyReceipt(f.receipt, { trustedKeys: trustOf(f) });
    expect(r.verdict).toBe("REJECTED");
  });
  it("rejects a tampered audit chain even if the receipt is re-signed", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        (b.audit.segment[1] as { data: Record<string, unknown> }).data = { forged: true };
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(failing(r)).toContain("audit.chain");
  });
  it("rejects a segment whose checkpoint is not signed by the issuer", () => {
    const f = buildFixture();
    const r = verifyReceipt(
      reissue(f, (b) => {
        b.audit.checkpoint_signature = signCheckpoint(generateKeyPair().privateKey, b.audit.checkpoint);
      }),
      { trustedKeys: trustOf(f) },
    );
    expect(failing(r)).toContain("audit.checkpoint_signature");
  });
  it("rejects replay: wrong payment hash expected, previously seen id, stale age, future date", () => {
    const f = buildFixture();
    expect(
      failing(verifyReceipt(f.receipt, { trustedKeys: trustOf(f), expect: { paymentHash: "0".repeat(64) } })),
    ).toContain("expect.payment_hash");
    expect(
      failing(
        verifyReceipt(f.receipt, {
          trustedKeys: trustOf(f),
          seenReceiptIds: new Set([f.receipt.receipt_id]),
        }),
      ),
    ).toContain("replay");
    expect(
      failing(
        verifyReceipt(f.receipt, {
          trustedKeys: trustOf(f),
          maxAgeSeconds: 60,
          now: new Date(Date.now() + 3600_000),
        }),
      ),
    ).toContain("time.fresh");
    const fut = verifyReceipt(f.receipt, {
      trustedKeys: trustOf(f),
      now: new Date(Date.now() - 3 * 3600_000),
    });
    expect(failing(fut)).toContain("time.not_future");
  });
  it("honours key validity windows (rotation): receipt issued before key became valid is rejected", () => {
    const f = buildFixture();
    const r = verifyReceipt(f.receipt, {
      trustedKeys: [{ ...trustOf(f)[0]!, valid_from: new Date(Date.now() + 86400_000).toISOString() }],
    });
    expect(r.verdict).toBe("REJECTED");
  });
  it("rejects structurally invalid input without throwing", () => {
    for (const bad of [null, 1, "x", {}, { schema: "orynt.receipt/2" }, []])
      expect(verifyReceipt(bad).verdict).toBe("REJECTED");
  });
  it("tolerates clock skew within the window but not beyond", () => {
    const f = buildFixture();
    const skewOk = verifyReceipt(f.receipt, {
      trustedKeys: trustOf(f),
      now: new Date(Date.parse(f.receipt.issued_at) - 200_000),
    });
    expect(failing(skewOk)).not.toContain("time.not_future");
    const skewBad = verifyReceipt(f.receipt, {
      trustedKeys: trustOf(f),
      now: new Date(Date.parse(f.receipt.issued_at) - 900_000),
    });
    expect(failing(skewBad)).toContain("time.not_future");
  });
});
void makeEntry;
void GENESIS_HASH;

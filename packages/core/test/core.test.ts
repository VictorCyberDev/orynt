import { describe, expect, it } from "vitest";
import {
  AmountError, assertTransition, canonicalize, CanonicalError, canTransition, evaluatePolicy, DEFAULT_POLICY_RULES,
  formatMsat, generateKeyPair, hasPermission, intentDigest, makeEntry, parseSatsInput, revisionHash, signApproval,
  verifyApproval, verifyChainSegment, GENESIS_HASH, STATES, stateActions, toMsat, TransitionError, timingSafeEqualStr,
  type AuditEntry, type IntentBinding,
} from "../src";

describe("amounts", () => {
  it("never accepts floats or negatives", () => {
    expect(() => toMsat(1.5)).toThrow(AmountError);
    expect(() => toMsat("1.5")).toThrow(AmountError);
    expect(() => toMsat(-1)).toThrow(AmountError);
    expect(() => toMsat("01")).toThrow(AmountError);
    expect(() => toMsat(21_000_000n * 100_000_000_000n + 1n)).toThrow(AmountError);
  });
  it("parses sats input exactly", () => {
    expect(parseSatsInput("25,000")).toBe(25_000_000n);
    expect(parseSatsInput("0.001")).toBe(1n);
    expect(() => parseSatsInput("0.0001")).toThrow(AmountError);
    expect(formatMsat(1_250_500n)).toBe("1,250.5 sats");
    expect(formatMsat(1000n)).toBe("1 sat");
  });
});

describe("canonical json", () => {
  it("sorts keys and is stable", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
  });
  it("rejects floats, bigint, undefined, class instances", () => {
    expect(() => canonicalize({ a: 1.5 })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: 1n })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: new Date() })).toThrow(CanonicalError);
  });
});

describe("state machine", () => {
  it("has no path from UNKNOWN back to a send state (no blind retry)", () => {
    expect(canTransition("UNKNOWN", "EXECUTION_RESERVED")).toBe(false);
    expect(canTransition("UNKNOWN", "DISPATCHING")).toBe(false);
    expect(canTransition("UNKNOWN", "DEFINITIVELY_FAILED")).toBe(false);
    expect(canTransition("UNKNOWN", "RECONCILING")).toBe(true);
  });
  it("terminal states are final and money-moved states cannot be cancelled/rejected", () => {
    for (const to of STATES) {
      expect(canTransition("SETTLED", to)).toBe(false);
      expect(canTransition("SIMULATED_SETTLED", to)).toBe(false);
    }
    for (const s of ["DISPATCHING", "PENDING", "UNKNOWN", "RECONCILING"] as const) {
      expect(canTransition(s, "CANCELLED")).toBe(false);
      expect(canTransition(s, "REJECTED")).toBe(false);
      expect(canTransition(s, "APPROVED")).toBe(false);
    }
  });
  it("SETTLED needs a verified preimage and a real provider; simulator can never settle", () => {
    expect(() => assertTransition("RECONCILING", "SETTLED", {})).toThrow(TransitionError);
    expect(() => assertTransition("RECONCILING", "SETTLED", { providerKind: "simulator", preimageVerified: true })).toThrow(TransitionError);
    expect(() => assertTransition("RECONCILING", "SETTLED", { providerKind: "lnd", preimageVerified: true })).not.toThrow();
    expect(() => assertTransition("RECONCILING", "SIMULATED_SETTLED", { providerKind: "lnd", preimageVerified: true })).toThrow(TransitionError);
  });
  it("DEFINITIVELY_FAILED requires provider-reported failure or proof of non-dispatch (not expiry/timeout)", () => {
    expect(() => assertTransition("RECONCILING", "DEFINITIVELY_FAILED", {})).toThrow(TransitionError);
    expect(() => assertTransition("RECONCILING", "DEFINITIVELY_FAILED", { providerReportedTerminalFailure: true })).not.toThrow();
  });
  it("explains why execute is disabled in unresolved states", () => {
    const exec = stateActions("UNKNOWN").find((a) => a.action === "execute")!;
    expect(exec.allowed).toBe(false);
    expect(exec.reason).toMatch(/may already have paid/);
  });
});

describe("roles", () => {
  it("fails closed", () => {
    expect(hasPermission(undefined, "obligation:read")).toBe(false);
    expect(hasPermission("nonsense", "obligation:read")).toBe(false);
    expect(hasPermission("operator", "obligation:approve")).toBe(false);
    expect(hasPermission("approver", "payment:execute")).toBe(false);
    expect(hasPermission("viewer", "obligation:create")).toBe(false);
    expect(hasPermission("approver", "obligation:approve")).toBe(true);
  });
});

describe("policy", () => {
  it("applies tiers and limits", () => {
    const small = evaluatePolicy(DEFAULT_POLICY_RULES, { amountMsat: 1_000_000n, network: "regtest", dispatchedLast24hMsat: 0n });
    expect(small.requiredApprovals).toBe(1);
    expect(small.violations).toEqual([]);
    const big = evaluatePolicy(DEFAULT_POLICY_RULES, { amountMsat: 500_000_000n, network: "regtest", dispatchedLast24hMsat: 0n });
    expect(big.requiredApprovals).toBe(2);
    const over = evaluatePolicy(DEFAULT_POLICY_RULES, { amountMsat: 2_000_000_000n, network: "regtest", dispatchedLast24hMsat: 0n });
    expect(over.violations.map((v) => v.code)).toContain("over_payment_limit");
    const day = evaluatePolicy(DEFAULT_POLICY_RULES, { amountMsat: 900_000_000n, network: "regtest", dispatchedLast24hMsat: 4_500_000_000n });
    expect(day.violations.map((v) => v.code)).toContain("over_daily_limit");
    const main = evaluatePolicy(DEFAULT_POLICY_RULES, { amountMsat: 1n, network: "mainnet", dispatchedLast24hMsat: 0n });
    expect(main.violations.map((v) => v.code)).toContain("network_not_allowed");
  });
});

describe("intent digest and approvals", () => {
  const binding: IntentBinding = {
    workspaceId: "w1", obligationId: "o1", revision: 1, revisionHash: "a".repeat(64), amountMsat: 1000n, network: "regtest",
    paymentHash: "b".repeat(64), payeePubkey: "02" + "c".repeat(64), invoiceExpiresAt: 2000000000, policyId: "p1", policyRevision: 1,
    policyDigest: "d".repeat(64), walletConnectionId: "c1",
  };
  it("changes when ANY bound field changes", () => {
    const base = intentDigest(binding);
    const variants: Partial<IntentBinding>[] = [
      { amountMsat: 1001n }, { revision: 2 }, { paymentHash: "e".repeat(64) }, { payeePubkey: "03" + "c".repeat(64) },
      { network: "mainnet" }, { invoiceExpiresAt: 2000000001 }, { policyRevision: 2 }, { walletConnectionId: "c2" }, { workspaceId: "w2" },
    ];
    for (const v of variants) expect(intentDigest({ ...binding, ...v })).not.toBe(base);
  });
  it("approval signatures verify only for the exact payload and key", () => {
    const kp = generateKeyPair();
    const other = generateKeyPair();
    const payload = { v: 1 as const, type: "approval" as const, intent_digest: intentDigest(binding), approver_user_id: "u1", workspace_id: "w1", signed_at: "2026-11-09T12:00:00Z" };
    const sig = signApproval(kp.privateKey, payload);
    expect(verifyApproval(kp.publicKey, payload, sig)).toBe(true);
    expect(verifyApproval(other.publicKey, payload, sig)).toBe(false);
    expect(verifyApproval(kp.publicKey, { ...payload, approver_user_id: "u2" }, sig)).toBe(false);
    expect(verifyApproval(kp.publicKey, { ...payload, intent_digest: "f".repeat(64) }, sig)).toBe(false);
    expect(verifyApproval(kp.publicKey, payload, sig.replace(/^./, sig[0] === "0" ? "1" : "0"))).toBe(false);
  });
  it("revision hash depends on destination and amount", () => {
    const c = { obligationId: "o", revision: 1, counterpartyId: "c", boundPayeePubkey: "", amountMsat: 5n, memo: "m", externalRef: "", invoice: "lnbcrt1", paymentHash: "a".repeat(64), payeePubkey: "02" + "a".repeat(64), network: "regtest" as const };
    expect(revisionHash(c)).not.toBe(revisionHash({ ...c, amountMsat: 6n }));
    expect(revisionHash(c)).not.toBe(revisionHash({ ...c, payeePubkey: "03" + "a".repeat(64) }));
  });
});

describe("audit chain", () => {
  function build(n: number): AuditEntry[] {
    const out: AuditEntry[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= n; i++) {
      const e = makeEntry(prev, { seq: i, workspace_id: "w", stream: "org", at: "2026-11-09T00:00:00Z", actor: "system:test", type: "t", subject: "s", data: { i } });
      out.push(e);
      prev = e.hash;
    }
    return out;
  }
  it("verifies an intact chain and detects edits, deletions and reordering", () => {
    const chain = build(5);
    expect(verifyChainSegment(chain, GENESIS_HASH).ok).toBe(true);
    const edited = structuredClone(chain);
    (edited[2] as AuditEntry).data = { i: 999 };
    expect(verifyChainSegment(edited, GENESIS_HASH)).toMatchObject({ ok: false, brokenAtSeq: 3 });
    expect(verifyChainSegment([chain[0]!, chain[2]!], GENESIS_HASH).ok).toBe(false);
    expect(verifyChainSegment([chain[1]!, chain[0]!], undefined).ok).toBe(false);
  });
});

describe("misc crypto", () => {
  it("constant-time compare behaves", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});

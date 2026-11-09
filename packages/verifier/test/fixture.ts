import {
  attestReceipt, encodeInvoice, generateKeyPair, hexToBytes, intentDigest, makeEntry, revisionHash, sha256Hex, signApproval,
  signCheckpoint, nodePubkeyFromPrivate, GENESIS_HASH, RECEIPT_LIMITATIONS, policyDigestInput, hashCanonical, DEFAULT_POLICY_RULES,
  type Receipt, type ReceiptBody, type AuditEntry, type KeyPair,
} from "@orynt/core";

export interface Fixture { receipt: Receipt; issuer: KeyPair; payeePriv: string; approvers: KeyPair[]; preimage: string }

/** Builds a fully valid receipt the way a faithful issuer would. Tests then mutate it. */
export function buildFixture(o: { simulator?: boolean; approvals?: number; amountMsat?: bigint; makerIsApprover?: boolean } = {}): Fixture {
  const issuer = generateKeyPair();
  const payeePriv = "e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734";
  const payee = nodePubkeyFromPrivate(payeePriv);
  const preimage = "42".repeat(32);
  const paymentHash = sha256Hex(hexToBytes(preimage));
  const amount = o.amountMsat ?? 25_000_000n;
  const ts0 = Math.floor(Date.now() / 1000) - 3600;
  const invoice = encodeInvoice({ network: "regtest", amountMsat: amount, paymentHashHex: paymentHash, paymentSecretHex: "11".repeat(32), description: "Invoice 42", timestamp: ts0, expirySeconds: 86400, privateKeyHex: payeePriv });
  const wsId = "ws-1", oblId = "obl-1", maker = "user-maker";
  const policyDigest = hashCanonical(policyDigestInput(DEFAULT_POLICY_RULES));
  const rh = revisionHash({ obligationId: oblId, revision: 1, counterpartyId: "cp-1", boundPayeePubkey: payee, amountMsat: amount, memo: "Design work, October", externalRef: "INV-42", invoice, paymentHash, payeePubkey: payee, network: "regtest" });
  const binding = { workspaceId: wsId, obligationId: oblId, revision: 1, revisionHash: rh, amountMsat: amount, network: "regtest" as const, paymentHash, payeePubkey: payee, invoiceExpiresAt: ts0 + 86400, policyId: "pol-1", policyRevision: 1, policyDigest, walletConnectionId: "wc-1" };
  const digest = intentDigest(binding);
  const n = o.approvals ?? 1;
  const approvers = Array.from({ length: n }, () => generateKeyPair());
  const t = (secs: number) => new Date((ts0 + secs) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const approvals = approvers.map((kp, i) => {
    const uid = o.makerIsApprover && i === 0 ? maker : `user-approver-${i}`;
    const payload = { v: 1 as const, type: "approval" as const, intent_digest: digest, approver_user_id: uid, workspace_id: wsId, signed_at: t(100 + i) };
    return { approver: { user_id: uid, name: `Approver ${i}`, role: "approver" }, public_key: kp.publicKey, payload, signature: signApproval(kp.privateKey, payload) };
  });
  const simulator = !!o.simulator;
  const entries: AuditEntry[] = [];
  let prev = GENESIS_HASH;
  const push = (type: string, data: Record<string, unknown>, secs: number) => {
    const e = makeEntry(prev, { seq: entries.length + 1, workspace_id: wsId, stream: `obligation:${oblId}`, at: t(secs), actor: "system:test", type, subject: `obligation:${oblId}`, data });
    entries.push(e); prev = e.hash;
  };
  push("obligation.created", {}, 10);
  push("obligation.approved", { intent_digest: digest }, 110);
  push("payment.dispatching", { payment_hash: paymentHash }, 200);
  push("payment.settled", { payment_hash: paymentHash }, 210);
  const cp = { workspace_id: wsId, stream: `obligation:${oblId}`, seq: entries.length, head_hash: prev, at: t(300) };
  const body: ReceiptBody = {
    schema: "orynt.receipt/1", receipt_id: crypto.randomUUID(), issued_at: t(300),
    issuer: { key_id: "orynt-test-1", public_key: issuer.publicKey }, network: "regtest",
    environment: simulator ? "SIMULATOR" : "REAL_PROVIDER",
    provider: { kind: simulator ? "simulator" : "lnd", node_pubkey: simulator ? null : "02" + "ab".repeat(32), label: simulator ? "SIMULATOR" : "regtest alice" },
    workspace: { id: wsId, name: "Test Workspace" },
    agreement: { obligation_id: oblId, revision: 1, revision_hash: rh, counterparty: { id: "cp-1", name: "Bob Studio", bound_payee_pubkey: payee }, amount_msat: amount.toString(), memo: "Design work, October", external_ref: "INV-42", invoice, payment_hash: paymentHash, payee_pubkey: payee, invoice_expires_at: ts0 + 86400, created_by: { user_id: maker, name: "Maker" } },
    policy: { id: "pol-1", revision: 1, digest: policyDigest, required_approvals: n, require_distinct_maker: true },
    intent: { id: "int-1", digest, wallet_connection_id: "wc-1", binding: { v: 1, workspace_id: wsId, obligation_id: oblId, revision: 1, revision_hash: rh, amount_msat: amount.toString(), network: "regtest", payment_hash: paymentHash, payee_pubkey: payee, invoice_expires_at: ts0 + 86400, policy_id: "pol-1", policy_revision: 1, policy_digest: policyDigest, wallet_connection_id: "wc-1" } },
    approvals,
    attempts: [{ attempt_no: 1, started_at: t(200), outcome: "SUCCEEDED", note: "" }],
    settlement: { state: simulator ? "SIMULATED_SETTLED" : "SETTLED", preimage, amount_msat: amount.toString(), fee_msat: "0", settled_at: t(210), provider_payment_ref: "1", source: "provider_lookup", reconciled_after_uncertainty: false },
    audit: { segment: entries, checkpoint: cp, checkpoint_signature: signCheckpoint(issuer.privateKey, cp) },
    limitations: RECEIPT_LIMITATIONS,
  };
  return { receipt: attestReceipt(issuer.privateKey, "orynt-test-1", body), issuer, payeePriv, approvers, preimage };
}
export const trustOf = (f: Fixture) => [{ key_id: "orynt-test-1", public_key: f.issuer.publicKey }];

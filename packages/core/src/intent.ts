import { hashCanonical, SIG_CONTEXT, signMessage, verifyMessage } from "./crypto";
import { canonicalize } from "./canonical";
import type { Network } from "./bolt11";

/** The immutable content of one obligation revision. No timestamps: the hash must be reproducible. */
export interface RevisionContent {
  obligationId: string;
  revision: number;
  counterpartyId: string;
  /** node key the counterparty is bound to ("" when not bound) */
  boundPayeePubkey: string;
  amountMsat: bigint;
  memo: string;
  externalRef: string;
  invoice: string;
  paymentHash: string;
  payeePubkey: string;
  network: Network;
}

export function revisionHash(c: RevisionContent): string {
  return hashCanonical({
    v: 1,
    obligation_id: c.obligationId,
    revision: c.revision,
    counterparty_id: c.counterpartyId,
    bound_payee_pubkey: c.boundPayeePubkey,
    amount_msat: c.amountMsat.toString(),
    memo: c.memo,
    external_ref: c.externalRef,
    invoice: c.invoice,
    payment_hash: c.paymentHash,
    payee_pubkey: c.payeePubkey,
    network: c.network,
  });
}

export interface IntentBinding {
  workspaceId: string;
  obligationId: string;
  revision: number;
  revisionHash: string;
  amountMsat: bigint;
  network: Network;
  paymentHash: string;
  payeePubkey: string;
  invoiceExpiresAt: number; // unix seconds
  policyId: string;
  policyRevision: number;
  policyDigest: string;
  walletConnectionId: string;
}

/** The digest approvers sign. Binds exact amount, payee, invoice, network, expiry, policy and wallet. */
export function intentDigest(b: IntentBinding): string {
  return hashCanonical({
    v: 1,
    workspace_id: b.workspaceId,
    obligation_id: b.obligationId,
    revision: b.revision,
    revision_hash: b.revisionHash,
    amount_msat: b.amountMsat.toString(),
    network: b.network,
    payment_hash: b.paymentHash,
    payee_pubkey: b.payeePubkey,
    invoice_expires_at: b.invoiceExpiresAt,
    policy_id: b.policyId,
    policy_revision: b.policyRevision,
    policy_digest: b.policyDigest,
    wallet_connection_id: b.walletConnectionId,
  });
}

export interface ApprovalPayload {
  v: 1;
  type: "approval";
  intent_digest: string;
  approver_user_id: string;
  workspace_id: string;
  signed_at: string; // ISO-8601 UTC
}

export function approvalMessage(p: ApprovalPayload): string {
  return canonicalize(p);
}
export function signApproval(privateKeyHex: string, p: ApprovalPayload): string {
  return signMessage(privateKeyHex, SIG_CONTEXT.approval, approvalMessage(p));
}
export function verifyApproval(publicKeyHex: string, p: ApprovalPayload, signatureHex: string): boolean {
  return verifyMessage(publicKeyHex, SIG_CONTEXT.approval, approvalMessage(p), signatureHex);
}

import { z } from "zod";
import { hashCanonical, SIG_CONTEXT, signMessage, verifyMessage } from "./crypto";

const hex = (bytes: number) => z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`));
const msat = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const network = z.enum(["mainnet", "testnet", "signet", "regtest"]);

export const RECEIPT_SCHEMA_ID = "orynt.receipt/1" as const;

export const AuditEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  workspace_id: z.string(),
  stream: z.string(),
  at: iso,
  actor: z.string(),
  type: z.string(),
  subject: z.string(),
  data: z.record(z.string(), z.unknown()),
  prev_hash: hex(32),
  hash: hex(32),
});

export const ReceiptSchema = z.object({
  schema: z.literal(RECEIPT_SCHEMA_ID),
  receipt_id: z.string().uuid(),
  issued_at: iso,
  issuer: z.object({ key_id: z.string(), public_key: hex(32) }),
  network,
  environment: z.enum(["REAL_PROVIDER", "SIMULATOR"]),
  provider: z.object({ kind: z.enum(["lnd", "nwc", "simulator"]), node_pubkey: hex(33).nullable(), label: z.string() }),
  workspace: z.object({ id: z.string(), name: z.string() }),
  agreement: z.object({
    obligation_id: z.string(),
    revision: z.number().int().positive(),
    revision_hash: hex(32),
    counterparty: z.object({ id: z.string(), name: z.string(), bound_payee_pubkey: z.string() }),
    amount_msat: msat,
    memo: z.string(),
    external_ref: z.string(),
    invoice: z.string(),
    payment_hash: hex(32),
    payee_pubkey: hex(33),
    invoice_expires_at: z.number().int(),
    created_by: z.object({ user_id: z.string(), name: z.string() }),
  }),
  policy: z.object({
    id: z.string(),
    revision: z.number().int(),
    digest: hex(32),
    required_approvals: z.number().int().min(1),
    require_distinct_maker: z.boolean(),
  }),
  intent: z.object({
    id: z.string(),
    digest: hex(32),
    wallet_connection_id: z.string(),
    binding: z.object({
      v: z.literal(1),
      workspace_id: z.string(),
      obligation_id: z.string(),
      revision: z.number().int().positive(),
      revision_hash: hex(32),
      amount_msat: msat,
      network,
      payment_hash: hex(32),
      payee_pubkey: hex(33),
      invoice_expires_at: z.number().int(),
      policy_id: z.string(),
      policy_revision: z.number().int(),
      policy_digest: hex(32),
      wallet_connection_id: z.string(),
    }),
  }),
  approvals: z.array(
    z.object({
      approver: z.object({ user_id: z.string(), name: z.string(), role: z.string() }),
      public_key: hex(32),
      payload: z.object({
        v: z.literal(1),
        type: z.literal("approval"),
        intent_digest: hex(32),
        approver_user_id: z.string(),
        workspace_id: z.string(),
        signed_at: iso,
      }),
      signature: hex(64),
    }),
  ),
  attempts: z.array(
    z.object({
      attempt_no: z.number().int().positive(),
      started_at: iso,
      outcome: z.enum(["SUCCEEDED", "FAILED", "UNKNOWN", "PENDING"]),
      note: z.string(),
    }),
  ),
  settlement: z.object({
    state: z.enum(["SETTLED", "SIMULATED_SETTLED"]),
    preimage: hex(32),
    amount_msat: msat,
    fee_msat: msat,
    settled_at: iso,
    provider_payment_ref: z.string(),
    source: z.enum(["provider_response", "provider_lookup"]),
    reconciled_after_uncertainty: z.boolean(),
  }),
  audit: z.object({
    segment: z.array(AuditEntrySchema),
    checkpoint: z.object({ workspace_id: z.string(), stream: z.string(), seq: z.number().int(), head_hash: hex(32), at: iso }),
    checkpoint_signature: hex(64),
  }),
  limitations: z.array(z.string()),
  attestation: z.object({ alg: z.literal("ed25519"), key_id: z.string(), signature: hex(64) }),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
export type ReceiptBody = Omit<Receipt, "attestation">;

/** What a receipt can never prove. Embedded in every receipt so it travels with the evidence. */
export const RECEIPT_LIMITATIONS: string[] = [
  "Proves that a payment with this hash was settled with the stated preimage; it does not prove the work, goods or services were delivered or of any quality.",
  "Does not prove the payee is the person or organisation named; payee binding is a claim by the issuing workspace.",
  "Does not prove the absence of other, conflicting payments for the same obligation outside Orynt.",
  "Is not legal evidence of a contract and is not an escrow: no funds were held back or conditionally released.",
  "The issuer attestation proves only that the holder of the issuer key signed this record; trust in that key is the verifier's decision.",
  "A preimage proves the node that issued the invoice released it. If the payer also controls that node (self-payment, or a fake wallet endpoint), the receipt proves nothing to a third party about who was really paid; payee binding and wallet trust are the workspace's claims.",
  "The audit segment is tamper-evident, not immutable: whoever controls the issuer database and key could have produced an alternative history.",
];

export function receiptAttestationDigest(body: ReceiptBody): string {
  return hashCanonical(body);
}
export function attestReceipt(privateKeyHex: string, keyId: string, body: ReceiptBody): Receipt {
  const signature = signMessage(privateKeyHex, SIG_CONTEXT.receipt, receiptAttestationDigest(body));
  return { ...body, attestation: { alg: "ed25519", key_id: keyId, signature } };
}
export function verifyReceiptAttestation(r: Receipt): boolean {
  const { attestation, ...body } = r;
  return verifyMessage(r.issuer.public_key, SIG_CONTEXT.receipt, receiptAttestationDigest(body), attestation.signature);
}

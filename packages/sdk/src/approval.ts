import { generateKeyPair, signApproval, signMessage, type ApprovalPayload, type KeyPair } from "@orynt/core";

export { generateKeyPair };
export type { KeyPair };

/** Proof-of-possession string for registering an approval key: sign it with the new private key. */
export function keyRegistrationProof(kp: KeyPair, workspaceId: string): string {
  return signMessage(kp.privateKey, "orynt.key-registration.v1", `orynt.register-key:${workspaceId}:${kp.publicKey}`);
}
/** Builds the signed body for POST /v1/obligations/:id/approve. Call only after a human has reviewed `obligation.amount_msat` and the payee. */
export function signApprovalBody(kp: KeyPair, o: { intent_digest: string | null }, userId: string, workspaceId: string, now = new Date()) {
  if (!o.intent_digest) throw new Error("obligation has no intent digest yet — submit it first");
  const payload: ApprovalPayload = { v: 1, type: "approval", intent_digest: o.intent_digest, approver_user_id: userId, workspace_id: workspaceId, signed_at: now.toISOString().replace(/\.\d{3}Z$/, "Z") };
  return { intent_digest: payload.intent_digest, signed_at: payload.signed_at, signature: signApproval(kp.privateKey, payload) };
}

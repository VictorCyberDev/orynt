import { generateKeyPair, publicKeyFromPrivate, type KeyPair } from "@orynt/core";
import { keyRegistrationProof, signApprovalBody } from "@orynt/sdk";

/**
 * Approval signing key. Stored in this browser's localStorage — a stolen browser profile could sign.
 * This is a deliberate hackathon-grade trade-off (documented in docs/security/threat-model.md); production should use WebAuthn/passkeys or a hardware key.
 */
const slot = (userId: string, orgId: string) => `orynt.approvalKey.${orgId}.${userId}`;
export function loadKey(userId: string, orgId: string): KeyPair | null {
  try { const v = localStorage.getItem(slot(userId, orgId)); if (!v) return null; const k = JSON.parse(v) as KeyPair; return publicKeyFromPrivate(k.privateKey) === k.publicKey ? k : null; } catch { return null; }
}
export function createKey(userId: string, orgId: string): KeyPair {
  const k = generateKeyPair();
  localStorage.setItem(slot(userId, orgId), JSON.stringify(k));
  return k;
}
export const proofFor = (k: KeyPair, orgId: string) => keyRegistrationProof(k, orgId);
export { signApprovalBody };

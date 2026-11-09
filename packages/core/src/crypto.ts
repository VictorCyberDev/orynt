import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { canonicalize } from "./canonical";

export { bytesToHex, hexToBytes, randomBytes, utf8ToBytes };

export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  return sha256(typeof data === "string" ? utf8ToBytes(data) : data);
}
export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(data));
}
/** SHA-256 over the canonical JSON encoding of a value. */
export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
export function hmacSha256Hex(key: Uint8Array | string, data: Uint8Array | string): string {
  return bytesToHex(
    hmac(sha256, typeof key === "string" ? utf8ToBytes(key) : key, typeof data === "string" ? utf8ToBytes(data) : data),
  );
}

/** Constant-time comparison of two equal-purpose strings (hex digests, tokens). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = utf8ToBytes(a);
  const bb = utf8ToBytes(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function isHex(s: string, bytes?: number): boolean {
  return /^[0-9a-f]*$/.test(s) && s.length % 2 === 0 && (bytes === undefined || s.length === bytes * 2);
}

// ---- Ed25519 (approvals, receipt attestations) -------------------------------------------------
export interface KeyPair {
  privateKey: string; // hex, 32 bytes
  publicKey: string; // hex, 32 bytes
}
export function generateKeyPair(): KeyPair {
  const priv = ed25519.utils.randomSecretKey();
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(ed25519.getPublicKey(priv)) };
}
export function publicKeyFromPrivate(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}
/** Domain-separated signing: signatures are over `context || 0x00 || message` so one key cannot be tricked across uses. */
function domainMessage(context: string, message: string): Uint8Array {
  return utf8ToBytes(`${context}\u0000${message}`);
}
export function signMessage(privateKeyHex: string, context: string, message: string): string {
  return bytesToHex(ed25519.sign(domainMessage(context, message), hexToBytes(privateKeyHex)));
}
export function verifyMessage(publicKeyHex: string, context: string, message: string, signatureHex: string): boolean {
  try {
    if (!isHex(publicKeyHex, 32) || !isHex(signatureHex, 64)) return false;
    return ed25519.verify(hexToBytes(signatureHex), domainMessage(context, message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}
export const SIG_CONTEXT = {
  approval: "orynt.approval.v1",
  receipt: "orynt.receipt.v1",
  checkpoint: "orynt.audit-checkpoint.v1",
} as const;

/**
 * Minimal NIP-01 event handling: canonical serialization, id, BIP-340 Schnorr signing and strict verification.
 * Only what the NWC adapter needs. All signature work is done by @noble/curves.
 */
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export interface UnsignedEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}
export interface NostrEvent extends UnsignedEvent {
  id: string;
  sig: string;
}

export const KIND_INFO = 13194;
export const KIND_REQUEST = 23194;
export const KIND_RESPONSE = 23195;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

export function isHex64(s: unknown): s is string {
  return typeof s === "string" && HEX64.test(s);
}

/** True iff `hex` is a valid x-only secp256k1 public key (on the curve). */
export function isValidXOnlyPubkey(hex: string): boolean {
  if (!isHex64(hex)) return false;
  try {
    secp256k1.Point.fromBytes(hexToBytes(`02${hex}`));
    return true;
  } catch {
    return false;
  }
}

export function isValidSecretKey(bytes: Uint8Array): boolean {
  return bytes.length === 32 && secp256k1.utils.isValidSecretKey(bytes);
}

export function getPublicKeyHex(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

/** NIP-01 serialization: [0, pubkey, created_at, kind, tags, content] as compact JSON. */
export function serializeEvent(e: UnsignedEvent): string {
  return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
}
export function computeEventId(e: UnsignedEvent): string {
  return bytesToHex(sha256(utf8ToBytes(serializeEvent(e))));
}

/** BIP-340 Schnorr over a 32-byte message. `aux` is the optional 32-byte auxiliary randomness (random when omitted). */
export function schnorrSign(message: Uint8Array, secretKey: Uint8Array, aux?: Uint8Array): Uint8Array {
  return schnorr.sign(message, secretKey, aux);
}
/** BIP-340 verification; false (never throws) for any malformed input. */
export function schnorrVerify(signature: Uint8Array, message: Uint8Array, xOnlyPubkey: Uint8Array): boolean {
  try {
    return schnorr.verify(signature, message, xOnlyPubkey);
  } catch {
    return false;
  }
}

export function signEvent(e: UnsignedEvent, secretKey: Uint8Array): NostrEvent {
  const id = computeEventId(e);
  const sig = bytesToHex(schnorrSign(hexToBytes(id), secretKey));
  return { ...e, id, sig };
}

/** Structural validation of an untrusted JSON value. Returns null unless every field has exactly the NIP-01 shape. */
export function parseEventShape(v: unknown): NostrEvent | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isHex64(o["id"]) || !isHex64(o["pubkey"])) return null;
  if (typeof o["sig"] !== "string" || !HEX128.test(o["sig"])) return null;
  const createdAt = o["created_at"];
  if (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || createdAt < 0) return null;
  const kind = o["kind"];
  if (typeof kind !== "number" || !Number.isInteger(kind) || kind < 0 || kind > 65535) return null;
  if (typeof o["content"] !== "string") return null;
  const tags = o["tags"];
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (!Array.isArray(t) || t.length === 0 || t.length > 32) return null;
    for (const x of t) if (typeof x !== "string") return null;
  }
  return {
    id: o["id"],
    pubkey: o["pubkey"],
    created_at: createdAt,
    kind,
    tags: tags as string[][],
    content: o["content"],
    sig: o["sig"],
  };
}

/** Recomputes the id from the content AND verifies the BIP-340 signature over it. Never throws. */
export function verifyEventSignature(e: NostrEvent): boolean {
  try {
    if (computeEventId(e) !== e.id) return false;
    return schnorrVerify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey));
  } catch {
    return false;
  }
}

export function tagValues(e: { tags: string[][] }, name: string): string[] {
  const out: string[] = [];
  for (const t of e.tags) if (t[0] === name && typeof t[1] === "string") out.push(t[1]);
  return out;
}

/** NIP-40 `expiration` tag: true when the event carries a valid expiration timestamp that is <= now (seconds). */
export function isExpired(e: { tags: string[][] }, nowSeconds: number): boolean {
  const vals = tagValues(e, "expiration");
  for (const v of vals) {
    if (/^[0-9]{1,15}$/.test(v) && Number(v) <= nowSeconds) return true;
  }
  return false;
}

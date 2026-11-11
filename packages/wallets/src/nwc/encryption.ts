/**
 * NIP-44 v2 (ChaCha20 + HMAC-SHA256, HKDF) and legacy NIP-04 (AES-256-CBC) payload encryption.
 * Implemented from https://github.com/nostr-protocol/nips/blob/master/44.md and checked against the official
 * paulmillr/nip44 test vectors (see test/nip44.test.ts). Primitives come from @noble/*.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { chacha20 } from "@noble/ciphers/chacha.js";
import { cbc } from "@noble/ciphers/aes.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { Buffer } from "node:buffer";

export type EncryptionScheme = "nip44_v2" | "nip04";

const MIN_PLAINTEXT = 1;
const MAX_PLAINTEXT = 4_294_967_295;
const EXTENDED_PREFIX_THRESHOLD = 65536;

// ---- helpers ----------------------------------------------------------------------------------------------------
function strictBase64Decode(s: string): Uint8Array {
  // Buffer.from(.., "base64") silently ignores junk; the spec requires real base64 with padding.
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("invalid base64");
  const b = Buffer.from(s, "base64");
  if (b.toString("base64") !== s) throw new Error("invalid base64");
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}
function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
/** secp256k1 ECDH returning the unhashed 32-byte x coordinate of the shared point (what NIP-04 and NIP-44 both use). */
function sharedX(secretKey: Uint8Array, xOnlyPubkey: Uint8Array): Uint8Array {
  if (xOnlyPubkey.length !== 32) throw new Error("invalid public key length");
  return secp256k1.getSharedSecret(secretKey, concatBytes(Uint8Array.of(2), xOnlyPubkey)).slice(1, 33);
}

// ---- NIP-44 v2 ---------------------------------------------------------------------------------------------------
export function nip44ConversationKey(secretKey: Uint8Array, xOnlyPubkey: Uint8Array): Uint8Array {
  return extract(sha256, sharedX(secretKey, xOnlyPubkey), utf8ToBytes("nip44-v2"));
}

export function nip44MessageKeys(conversationKey: Uint8Array, nonce: Uint8Array): { chachaKey: Uint8Array; chachaNonce: Uint8Array; hmacKey: Uint8Array } {
  if (conversationKey.length !== 32) throw new Error("invalid conversation_key length");
  if (nonce.length !== 32) throw new Error("invalid nonce length");
  const keys = expand(sha256, conversationKey, nonce, 76);
  return { chachaKey: keys.slice(0, 32), chachaNonce: keys.slice(32, 44), hmacKey: keys.slice(44, 76) };
}

export function nip44CalcPaddedLen(unpaddedLen: number): number {
  if (!Number.isInteger(unpaddedLen) || unpaddedLen < 1) throw new Error("expected positive integer");
  if (unpaddedLen <= 32) return 32;
  // Smallest power of two >= unpaddedLen (== 1 << (floor(log2(len - 1)) + 1)). JS numbers are exact far beyond 2^32.
  let nextPower = 1;
  while (nextPower < unpaddedLen) nextPower *= 2;
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((unpaddedLen - 1) / chunk) + 1);
}

function pad(plaintext: string): Uint8Array {
  const unpadded = utf8ToBytes(plaintext);
  const len = unpadded.length;
  if (len < MIN_PLAINTEXT || len > MAX_PLAINTEXT) throw new Error("invalid plaintext length");
  let prefix: Uint8Array;
  if (len >= EXTENDED_PREFIX_THRESHOLD) {
    prefix = new Uint8Array(6);
    new DataView(prefix.buffer).setUint32(2, len, false);
  } else {
    prefix = new Uint8Array(2);
    new DataView(prefix.buffer).setUint16(0, len, false);
  }
  const suffix = new Uint8Array(nip44CalcPaddedLen(len) - len);
  return concatBytes(prefix, unpadded, suffix);
}

function unpad(padded: Uint8Array): string {
  if (padded.length < 2) throw new Error("invalid padding");
  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const first = dv.getUint16(0, false);
  let len: number;
  let prefixLen: number;
  if (first === 0) {
    if (padded.length < 6) throw new Error("invalid padding");
    len = dv.getUint32(2, false);
    if (len < EXTENDED_PREFIX_THRESHOLD) throw new Error("invalid padding");
    prefixLen = 6;
  } else {
    len = first;
    prefixLen = 2;
  }
  const unpadded = padded.subarray(prefixLen, prefixLen + len);
  if (len === 0 || unpadded.length !== len || padded.length !== prefixLen + nip44CalcPaddedLen(len)) throw new Error("invalid padding");
  return new TextDecoder("utf-8", { fatal: true }).decode(unpadded);
}

function hmacAad(key: Uint8Array, message: Uint8Array, aad: Uint8Array): Uint8Array {
  if (aad.length !== 32) throw new Error("AAD associated data must be 32 bytes");
  return hmac(sha256, key, concatBytes(aad, message));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] as number) ^ (b[i] as number);
  return d === 0;
}

export function nip44Encrypt(plaintext: string, conversationKey: Uint8Array, nonce: Uint8Array = randomBytes(32)): string {
  const { chachaKey, chachaNonce, hmacKey } = nip44MessageKeys(conversationKey, nonce);
  const padded = pad(plaintext);
  const ciphertext = chacha20(chachaKey, chachaNonce, padded);
  const mac = hmacAad(hmacKey, ciphertext, nonce);
  return b64(concatBytes(Uint8Array.of(2), nonce, ciphertext, mac));
}

export function nip44Decrypt(payload: string, conversationKey: Uint8Array): string {
  const plen = payload.length;
  if (plen === 0 || payload[0] === "#") throw new Error("unknown encryption version");
  if (plen < 132) throw new Error("invalid payload size");
  const data = strictBase64Decode(payload);
  if (data.length < 99) throw new Error("invalid data size");
  if (data[0] !== 2) throw new Error(`unknown encryption version ${data[0]}`);
  const nonce = data.subarray(1, 33);
  const ciphertext = data.subarray(33, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const { chachaKey, chachaNonce, hmacKey } = nip44MessageKeys(conversationKey, nonce);
  if (!constantTimeEqual(hmacAad(hmacKey, ciphertext, nonce), mac)) throw new Error("invalid MAC");
  return unpad(chacha20(chachaKey, chachaNonce, ciphertext));
}

// ---- NIP-04 (deprecated; backward compatibility only) ----------------------------------------------------------
export function nip04Encrypt(plaintext: string, secretKey: Uint8Array, xOnlyPubkey: Uint8Array, iv: Uint8Array = randomBytes(16)): string {
  const key = sharedX(secretKey, xOnlyPubkey);
  const ct = cbc(key, iv).encrypt(utf8ToBytes(plaintext));
  return `${b64(ct)}?iv=${b64(iv)}`;
}
export function nip04Decrypt(payload: string, secretKey: Uint8Array, xOnlyPubkey: Uint8Array): string {
  const m = /^([A-Za-z0-9+/]+={0,2})\?iv=([A-Za-z0-9+/]+={0,2})$/.exec(payload);
  if (!m) throw new Error("invalid nip04 payload");
  const ct = strictBase64Decode(m[1] as string);
  const iv = strictBase64Decode(m[2] as string);
  if (iv.length !== 16 || ct.length === 0 || ct.length % 16 !== 0) throw new Error("invalid nip04 payload");
  const key = sharedX(secretKey, xOnlyPubkey);
  return new TextDecoder("utf-8", { fatal: true }).decode(cbc(key, iv).decrypt(ct));
}

// ---- scheme dispatch --------------------------------------------------------------------------------------------
export function encryptPayload(scheme: EncryptionScheme, plaintext: string, secretKey: Uint8Array, peerXOnlyHex: string): string {
  const peer = hexToBytes(peerXOnlyHex);
  return scheme === "nip44_v2" ? nip44Encrypt(plaintext, nip44ConversationKey(secretKey, peer)) : nip04Encrypt(plaintext, secretKey, peer);
}
export function decryptPayload(scheme: EncryptionScheme, payload: string, secretKey: Uint8Array, peerXOnlyHex: string): string {
  const peer = hexToBytes(peerXOnlyHex);
  return scheme === "nip44_v2" ? nip44Decrypt(payload, nip44ConversationKey(secretKey, peer)) : nip04Decrypt(payload, secretKey, peer);
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
/** AES-256-GCM sealed box for secrets at rest. Layout: nonce(12) | ciphertext | tag(16). `aad` binds the blob to its row. */
export function seal(key: Buffer, plaintext: string, aad: string): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([nonce, ct, c.getAuthTag()]);
}
export function open(key: Buffer, blob: Buffer, aad: string): string {
  const nonce = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]).toString("utf8");
}

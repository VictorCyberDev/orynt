import { inspect } from "node:util";

const REDACTED = "[REDACTED]";
const bytesOf = new WeakMap<RedactedSecret, Uint8Array>();

/**
 * Holds a secret key so that it cannot leak by accident: JSON.stringify, String(), template literals,
 * console.log / util.inspect and structured error messages all show "[REDACTED]". The raw bytes are only reachable
 * through {@link unsafeRevealSecret}, which is deliberately NOT re-exported from the package entry point.
 *
 * Limitation (JavaScript): `destroy()` zero-fills the bytes this object holds, but it cannot scrub copies the caller
 * made earlier (the connection-URI string, the hex string) — those live until the garbage collector reclaims them.
 */
export class RedactedSecret {
  constructor(bytes: Uint8Array) {
    bytesOf.set(this, bytes);
  }
  get destroyed(): boolean {
    return !bytesOf.has(this);
  }
  /** Zero-fill and forget the key. Idempotent. */
  destroy(): void {
    const b = bytesOf.get(this);
    if (b) b.fill(0);
    bytesOf.delete(this);
  }
  toJSON(): string {
    return REDACTED;
  }
  toString(): string {
    return REDACTED;
  }
  [inspect.custom](): string {
    return `RedactedSecret(${REDACTED})`;
  }
}

/** Internal use only (signing / decrypting). Throws once the secret has been destroyed. */
export function unsafeRevealSecret(s: RedactedSecret): Uint8Array {
  const b = bytesOf.get(s);
  if (!b) throw new Error("secret has been destroyed (connection closed)");
  return b;
}

/** Replaces the value of any `secret=` query parameter, even inside a malformed or truncated URI or an error message. */
export function redactNwcUri(text: string): string {
  return text.replace(/(secret=)[^&#\s"'<>]*/gi, `$1${REDACTED}`);
}

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) over node:crypto HMAC — the standard authenticator-app format. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const newTotpSecret = () => { const b = randomBytes(20); let bits = "", out = ""; for (const x of b) bits += x.toString(2).padStart(8, "0"); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)]; return out; };
const unb32 = (s: string) => { let bits = ""; for (const c of s.replace(/=+$/, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
export function totpAt(secret: string, timeMs: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30000)));
  const h = createHmac("sha1", unb32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String(((h[o]! & 0x7f) << 24 | h[o + 1]! << 16 | h[o + 2]! << 8 | h[o + 3]!) % 1_000_000).padStart(6, "0");
}
/** ±1 step tolerance for clock drift. Returns the matching absolute 30-second step, or null. */
export function matchTotpStep(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const d of [-1, 0, 1]) {
    const a = Buffer.from(totpAt(secret, nowMs + d * 30000)), b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return Math.floor(nowMs / 30000) + d;
  }
  return null;
}
export const verifyTotp = (secret: string, code: string, nowMs = Date.now()): boolean => matchTotpStep(secret, code, nowMs) !== null;
export const otpauthUri = (secret: string, account: string) => `otpauth://totp/Orynt:${encodeURIComponent(account)}?secret=${secret}&issuer=Orynt&digits=6&period=30`;

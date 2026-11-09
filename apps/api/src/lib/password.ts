import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
const N = 32768, R = 8, P = 1, KEYLEN = 32;
const opts: ScryptOptions = { N, r: R, p: P, maxmem: 128 * 1024 * 1024 };
const derive = (pw: string, salt: Buffer, o: ScryptOptions = opts) => new Promise<Buffer>((res, rej) => scrypt(pw.normalize("NFKC"), salt, KEYLEN, o, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await derive(pw, salt)).toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await derive(pw, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

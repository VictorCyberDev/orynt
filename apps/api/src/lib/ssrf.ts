import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateV4(ip: string): boolean {
  const p = ip.split(".").map(Number) as [number, number, number, number];
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const l = ip.toLowerCase();
  if (l === "::1" || l === "::" || l.startsWith("fe80:") || l.startsWith("fc") || l.startsWith("fd")) return true;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
  return m ? privateV4(m[1]!) : false;
}
/** Resolves the host and refuses private/link-local/loopback targets (SSRF + DNS-rebinding guard). Returns the vetted address to connect to. */
export async function vetWebhookTarget(url: string, allowPrivate: boolean): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) throw new Error("webhook URLs must use https");
  if (u.username || u.password) throw new Error("credentials in URL are not allowed");
  const addrs = isIP(u.hostname) ? [{ address: u.hostname, family: isIP(u.hostname) }] : await lookup(u.hostname, { all: true });
  if (!addrs.length) throw new Error("host did not resolve");
  for (const a of addrs) if (!allowPrivate && isPrivateAddress(a.address)) throw new Error("webhook target resolves to a private address");
  return { url: u, address: addrs[0]!.address, family: addrs[0]!.family as 4 | 6 };
}

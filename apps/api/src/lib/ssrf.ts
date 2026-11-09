import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function v4Private(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
}
/** Expand any textual IPv6 address (including a trailing dotted quad) into 16 bytes. */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) { const q = dotted[1]!.split(".").map(Number); s = s.slice(0, -dotted[1]!.length) + ((q[0]! << 8) | q[1]!).toString(16) + ":" + ((q[2]! << 8) | q[3]!).toString(16); }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], t = tail !== undefined && tail ? tail.split(":") : [];
  if (tail === undefined && h.length !== 8) return null;
  const fill = tail === undefined ? [] : Array(8 - h.length - t.length).fill("0");
  const groups = [...h, ...fill, ...t].map((g) => parseInt(g || "0", 16));
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g > 0xffff)) return null;
  return groups.flatMap((g) => [g >> 8, g & 255]);
}
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip.split(".").map(Number));
  const b = v6Bytes(ip);
  if (!b) return true; // unparseable => refuse
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zeros(0, 15) && (b[15] === 0 || b[15] === 1)) return true;                       // :: and ::1
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4Private(b.slice(12));   // ::ffff:a.b.c.d (any textual form)
  if (zeros(0, 12)) return v4Private(b.slice(12));                                       // deprecated IPv4-compatible
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) return v4Private(b.slice(12)); // 64:ff9b::/96 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return v4Private(b.slice(2, 6));                    // 6to4
  if ((b[0]! & 0xfe) === 0xfc) return true;                                              // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true;                             // fe80::/10 link-local
  if (b[0] === 0xff) return true;                                                        // multicast
  return false;
}
/** Resolves the host and refuses private/link-local/loopback targets (SSRF + DNS-rebinding guard). Returns the vetted address to connect to. */
export async function vetWebhookTarget(url: string, allowPrivate: boolean): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) throw new Error("URLs must use https");
  if (u.username || u.password) throw new Error("credentials in URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addrs.length) throw new Error("host did not resolve");
  for (const a of addrs) if (!allowPrivate && isPrivateAddress(a.address)) throw new Error("target resolves to a private address");
  return { url: u, address: addrs[0]!.address, family: addrs[0]!.family as 4 | 6 };
}

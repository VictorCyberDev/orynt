import { formatMsat } from "@orynt/core";
export const sats = (msat: string | bigint) => formatMsat(BigInt(msat));
export const msatLabel = (msat: string) => `${BigInt(msat).toLocaleString("en-US")} msat`;
export const short = (s: string, n = 8) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export function until(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return "expired";
  if (s < 3600) return `in ${Math.ceil(s / 60)} min`;
  if (s < 86400) return `in ${Math.floor(s / 3600)} h`;
  return `in ${Math.floor(s / 86400)} d`;
}

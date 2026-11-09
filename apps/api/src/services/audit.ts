import { GENESIS_HASH, makeEntry, signCheckpoint, verifyChainSegment, type AuditEntry } from "@orynt/core";
import type { Tx } from "../db/pool";
import type { Deps } from "./context";
import { iso } from "./context";

/** Appends to a per-stream hash chain INSIDE the caller's transaction: audit and state commit (or roll back) together. */
export async function appendAudit(tx: Tx, orgId: string, stream: string, actor: string, type: string, subject: string, data: Record<string, unknown>): Promise<AuditEntry> {
  await tx.query("INSERT INTO audit_heads(org_id,stream,seq,head_hash) VALUES ($1,$2,0,$3) ON CONFLICT DO NOTHING", [orgId, stream, GENESIS_HASH]);
  const head = (await tx.query("SELECT seq, head_hash FROM audit_heads WHERE org_id=$1 AND stream=$2 FOR UPDATE", [orgId, stream])).rows[0];
  const seq = Number(head.seq) + 1;
  const at = iso(new Date());
  const entry = makeEntry(head.head_hash, { seq, workspace_id: orgId, stream, at, actor, type, subject, data: JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
  await tx.query(
    "INSERT INTO audit_events(org_id,stream,seq,at,actor,type,subject,data,prev_hash,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [orgId, stream, seq, entry.at, actor, type, subject, JSON.stringify(entry.data), entry.prev_hash, entry.hash],
  );
  await tx.query("UPDATE audit_heads SET seq=$3, head_hash=$4 WHERE org_id=$1 AND stream=$2", [orgId, stream, seq, entry.hash]);
  return entry;
}

export function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return { seq: Number(r["seq"]), workspace_id: String(r["org_id"]), stream: String(r["stream"]), at: iso(r["at"] as Date), actor: String(r["actor"]), type: String(r["type"]), subject: String(r["subject"]), data: r["data"] as Record<string, unknown>, prev_hash: String(r["prev_hash"]), hash: String(r["hash"]) };
}

export async function verifyAllStreams(d: Deps, orgId: string) {
  const streams = (await d.pool.query("SELECT stream, seq, head_hash FROM audit_heads WHERE org_id=$1", [orgId])).rows;
  let entries = 0;
  const broken: Array<{ stream: string; seq: number; error: string }> = [];
  for (const s of streams) {
    const rows = (await d.pool.query("SELECT * FROM audit_events WHERE org_id=$1 AND stream=$2 ORDER BY seq", [orgId, s.stream])).rows.map(rowToEntry);
    entries += rows.length;
    const c = verifyChainSegment(rows, GENESIS_HASH);
    if (!c.ok) broken.push({ stream: s.stream, seq: c.brokenAtSeq ?? 0, error: c.error ?? "unknown" });
    else if (rows.length && (rows[rows.length - 1]!.hash !== s.head_hash || rows.length !== Number(s.seq))) broken.push({ stream: s.stream, seq: Number(s.seq), error: "head does not match the last entry (rows removed or appended out-of-band)" });
  }
  return { ok: broken.length === 0, streams: streams.length, entries, broken, note: "Hash chains detect edits and deletions. They do not stop someone with database administrator rights AND the ability to recompute every hash; only signed checkpoints stored elsewhere (receipts) can expose that." };
}

export async function signedCheckpoint(d: Deps, tx: Tx, orgId: string, stream: string) {
  const h = (await tx.query("SELECT seq, head_hash FROM audit_heads WHERE org_id=$1 AND stream=$2", [orgId, stream])).rows[0];
  const cp = { workspace_id: orgId, stream, seq: Number(h.seq), head_hash: String(h.head_hash), at: iso(new Date()) };
  return { checkpoint: cp, signature: signCheckpoint(d.config.issuerPrivateKey, cp) };
}

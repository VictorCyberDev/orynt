import { hashCanonical, SIG_CONTEXT, signMessage, verifyMessage } from "./crypto";

/**
 * Tamper-EVIDENT (not immutable) audit chain. Every entry commits to its predecessor, so rewriting history
 * breaks every later hash. A database administrator CAN rewrite rows and recompute the chain; protection
 * against that comes only from signed checkpoints held outside the database (receipts, exported checkpoints).
 */
export const GENESIS_HASH = "0".repeat(64);

export interface AuditEntryBody {
  seq: number;
  workspace_id: string;
  /** independent hash chain: `org` for workspace events or `obligation:<id>` */
  stream: string;
  at: string;
  actor: string; // "user:<id>" | "apikey:<id>" | "system:<component>"
  type: string;
  subject: string; // e.g. "obligation:<id>"
  data: Record<string, unknown>;
}
export interface AuditEntry extends AuditEntryBody {
  prev_hash: string;
  hash: string;
}

export function entryHash(prevHash: string, body: AuditEntryBody): string {
  return hashCanonical({ prev: prevHash, body });
}
export function makeEntry(prevHash: string, body: AuditEntryBody): AuditEntry {
  return { ...body, prev_hash: prevHash, hash: entryHash(prevHash, body) };
}

export interface ChainCheck {
  ok: boolean;
  error?: string;
  brokenAtSeq?: number;
}
/** Verifies linkage and hashes of a contiguous segment. If `expectedPrev` is given the first prev_hash must match. */
export function verifyChainSegment(entries: AuditEntry[], expectedPrev?: string): ChainCheck {
  let prev = expectedPrev;
  let lastSeq: number | undefined;
  for (const e of entries) {
    if (prev !== undefined && e.prev_hash !== prev)
      return { ok: false, error: "prev_hash mismatch", brokenAtSeq: e.seq };
    if (lastSeq !== undefined && e.seq !== lastSeq + 1)
      return { ok: false, error: "sequence gap", brokenAtSeq: e.seq };
    const { prev_hash, hash, ...body } = e;
    if (entryHash(prev_hash, body) !== hash)
      return { ok: false, error: "entry hash mismatch", brokenAtSeq: e.seq };
    prev = hash;
    lastSeq = e.seq;
  }
  return { ok: true };
}

export interface Checkpoint {
  workspace_id: string;
  stream: string;
  seq: number;
  head_hash: string;
  at: string;
}
export function signCheckpoint(privateKeyHex: string, c: Checkpoint): string {
  return signMessage(privateKeyHex, SIG_CONTEXT.checkpoint, hashCanonical(c));
}
export function verifyCheckpoint(publicKeyHex: string, c: Checkpoint, sig: string): boolean {
  return verifyMessage(publicKeyHex, SIG_CONTEXT.checkpoint, hashCanonical(c), sig);
}

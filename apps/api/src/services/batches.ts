import { OryntError, decodeInvoice, parseSatsInput } from "@orynt/core";
import { withTx } from "../db/pool";
import { appendAudit } from "./audit";
import { actorTag, type Ctx, type Deps } from "./context";
import { checkEntitlement } from "./entitlements";
import { parseCsv } from "./csv";
import { createObligation, submitObligation } from "./obligations";
import { executeObligation } from "./execution";

const MAX_ROWS = 200;
export interface RowResult { row: number; counterparty: string; amount_msat: string | null; ok: boolean; error: string | null; obligation_id?: string }

/** Header: counterparty,amount_sats,invoice[,memo,external_ref]. The amount must equal the invoice amount; per-row problems never abort other rows. */
export function validateRows(csv: string): { rows: Array<{ n: number; counterparty: string; amountMsat: string; invoice: string; memo: string; ref: string }>; errors: RowResult[] } {
  const table = parseCsv(csv); const head = (table.shift() ?? []).map((h) => h.trim().toLowerCase());
  const idx = (k: string) => head.indexOf(k);
  if (idx("counterparty") < 0 || idx("amount_sats") < 0 || idx("invoice") < 0) throw new OryntError("validation_failed", 422, "CSV must have a header row with columns: counterparty, amount_sats, invoice (optional: memo, external_ref).");
  if (table.length > MAX_ROWS) throw new OryntError("validation_failed", 422, `A batch may contain at most ${MAX_ROWS} rows.`);
  if (table.length === 0) throw new OryntError("validation_failed", 422, "The CSV has no data rows.");
  const rows: ReturnType<typeof validateRows>["rows"] = [], errors: RowResult[] = []; const seenInvoice = new Set<string>();
  table.forEach((r, i) => {
    const n = i + 2; const cp = (r[idx("counterparty")] ?? "").trim(); const inv = (r[idx("invoice")] ?? "").trim();
    const fail = (e: string, amt: string | null = null) => errors.push({ row: n, counterparty: cp, amount_msat: amt, ok: false, error: e });
    if (!cp) return fail("Recipient name is missing.");
    let amt: bigint; try { amt = parseSatsInput(r[idx("amount_sats")] ?? ""); } catch { return fail("Amount must be a number of sats, e.g. 25000."); }
    if (amt <= 0n) return fail("Amount must be greater than zero.");
    try { const d = decodeInvoice(inv); if (d.amountMsat !== null && d.amountMsat !== amt) return fail(`Amount differs from the invoice (${d.amountMsat} msat).`, amt.toString()); } catch (e) { return fail(`Invalid invoice: ${(e as Error).message}.`, amt.toString()); }
    if (seenInvoice.has(inv)) return fail("This invoice appears twice in the file.", amt.toString()); seenInvoice.add(inv);
    rows.push({ n, counterparty: cp, amountMsat: amt.toString(), invoice: inv, memo: (idx("memo") >= 0 ? r[idx("memo")] ?? "" : "").trim(), ref: (idx("external_ref") >= 0 ? r[idx("external_ref")] ?? "" : "").trim() });
  });
  return { rows, errors };
}
export async function previewBatch(csv: string) { const v = validateRows(csv); return { valid: v.rows.length, invalid: v.errors.length, total_msat: v.rows.reduce((a, r) => a + BigInt(r.amountMsat), 0n).toString(), errors: v.errors }; }

export async function createBatch(d: Deps, ctx: Ctx, label: string, csv: string, walletConnectionId?: string) {
  await checkEntitlement(d, ctx.orgId, "batch");
  const v = validateRows(csv); await checkEntitlement(d, ctx.orgId, "payouts", v.rows.length);
  const userId = ctx.actor.userId ?? (await d.pool.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0]?.created_by;
  const batchId = await withTx(d.pool, async (tx) => { const b = (await tx.query("INSERT INTO payout_batches(org_id,label,created_by) VALUES ($1,$2,$3) RETURNING id", [ctx.orgId, label, userId])).rows[0]; await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "batch.created", `batch:${b.id}`, { rows: v.rows.length, label }); return b.id as string; });
  const results: RowResult[] = [...v.errors];
  for (const r of v.rows) {
    try { const id = await createObligation(d, ctx, { counterparty_name: r.counterparty, amount_msat: r.amountMsat, memo: r.memo, external_ref: r.ref, invoice: r.invoice, wallet_connection_id: walletConnectionId, batch_id: batchId } as never); results.push({ row: r.n, counterparty: r.counterparty, amount_msat: r.amountMsat, ok: true, error: null, obligation_id: id }); }
    catch (e) { results.push({ row: r.n, counterparty: r.counterparty, amount_msat: r.amountMsat, ok: false, error: e instanceof OryntError ? e.message : "Unexpected error." }); }
  }
  return { batch_id: batchId, created: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results: results.sort((a, b) => a.row - b.row) };
}
export async function batchStatus(d: Deps, orgId: string, id: string) {
  const b = (await d.pool.query("SELECT * FROM payout_batches WHERE id=$1 AND org_id=$2", [id, orgId])).rows[0];
  if (!b) throw new OryntError("not_found", 404, "Batch not found.");
  const items = (await d.pool.query("SELECT o.id, o.seq, o.state, r.amount_msat, cp.name FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id AND r.revision=o.current_revision JOIN counterparties cp ON cp.id=r.counterparty_id WHERE o.batch_id=$1 AND o.org_id=$2 ORDER BY o.seq", [id, orgId])).rows;
  const by: Record<string, number> = {}; for (const i of items) by[i.state] = (by[i.state] ?? 0) + 1;
  const terminal = ["SETTLED", "SIMULATED_SETTLED", "REJECTED", "CANCELLED", "DEFINITIVELY_FAILED"]; const open = items.filter((i) => !terminal.includes(i.state)).length;
  const settled = items.filter((i) => ["SETTLED", "SIMULATED_SETTLED"].includes(i.state)).length;
  // A batch is only "completed" when EVERY item is terminal; "partial" when some settled and some did not.
  const status = items.length === 0 ? "empty" : open > 0 ? "in_progress" : settled === items.length ? "completed" : settled > 0 ? "partial" : "closed_unsettled";
  return { id: b.id, label: b.label, status, counts: by, settled_msat: items.filter((i) => i.state === "SETTLED" || i.state === "SIMULATED_SETTLED").reduce((a, i) => a + BigInt(i.amount_msat), 0n).toString(), items: items.map((i) => ({ id: i.id, ref: `PO-${String(i.seq).padStart(4, "0")}`, state: i.state, counterparty: i.name, amount_msat: i.amount_msat.toString() })) };
}
export async function submitBatch(d: Deps, ctx: Ctx, id: string) {
  const items = (await d.pool.query("SELECT id FROM payout_obligations WHERE batch_id=$1 AND org_id=$2 AND state='DRAFT' ORDER BY seq", [id, ctx.orgId])).rows;
  const out: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const i of items) { try { await submitObligation(d, ctx, i.id); out.push({ id: i.id, ok: true }); } catch (e) { out.push({ id: i.id, ok: false, error: e instanceof OryntError ? e.message : "error" }); } }
  return out;
}
/** Executes every APPROVED item one by one. Each goes through the normal single-use execution path; one failure or uncertainty never stops or hides the others. */
export async function executeBatch(d: Deps, ctx: Ctx, id: string) {
  const items = (await d.pool.query("SELECT id FROM payout_obligations WHERE batch_id=$1 AND org_id=$2 AND state='APPROVED' ORDER BY seq", [id, ctx.orgId])).rows;
  const out: Array<{ id: string; http: number; state?: string; error?: string }> = [];
  for (const i of items) { try { const r = await executeObligation(d, ctx, i.id, "execute"); out.push({ id: i.id, http: r.httpStatus }); } catch (e) { out.push({ id: i.id, http: e instanceof OryntError ? e.status : 500, error: e instanceof OryntError ? e.message : "error" }); } }
  return out;
}

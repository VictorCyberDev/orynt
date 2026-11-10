import { OryntError, parseSatsInput } from "@orynt/core";
import { withTx } from "../db/pool";
import { appendAudit } from "./audit";
import { actorTag, type Ctx, type Deps } from "./context";
import { checkEntitlement } from "./entitlements";
import { queueMail } from "./mail";
import { createObligation } from "./obligations";

const isoWeek = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((+t - +y0) / 86400000 + 1) / 7)).padStart(2, "0")}`; };
const cycleKey = (cadence: string, due: Date) => (cadence === "weekly" ? isoWeek(due) : `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, "0")}`);
const addCadence = (due: Date, cadence: string) => { const n = new Date(due); if (cadence === "weekly") n.setUTCDate(n.getUTCDate() + 7); else n.setUTCMonth(n.getUTCMonth() + 1); return n; };
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export async function createSchedule(d: Deps, ctx: Ctx, i: { counterparty_id: string; amount_sats: string; memo: string; cadence: "weekly" | "monthly"; first_due: string; wallet_connection_id?: string }) {
  await checkEntitlement(d, ctx.orgId, "recurring");
  let amt: bigint; try { amt = parseSatsInput(i.amount_sats); } catch { throw new OryntError("validation_failed", 422, "Amount must be a number of sats."); }
  const userId = ctx.actor.userId ?? (await d.pool.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0]?.created_by;
  return withTx(d.pool, async (tx) => {
    const cp = (await tx.query("SELECT id, suspended_at FROM counterparties WHERE id=$1 AND org_id=$2", [i.counterparty_id, ctx.orgId])).rows[0];
    if (!cp) throw new OryntError("not_found", 404, "Recipient not found."); if (cp.suspended_at) throw new OryntError("invalid_state", 409, "This recipient is suspended.");
    const s = (await tx.query("INSERT INTO recurring_schedules(org_id,counterparty_id,amount_msat,memo,cadence,next_due_on,wallet_connection_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [ctx.orgId, i.counterparty_id, amt, i.memo, i.cadence, i.first_due, i.wallet_connection_id ?? null, userId])).rows[0];
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "schedule.created", `schedule:${s.id}`, { cadence: i.cadence, amount_msat: amt.toString() });
    return { id: s.id as string };
  });
}
export const listSchedules = async (d: Deps, orgId: string) => (await d.pool.query("SELECT s.id, s.cadence, s.amount_msat::text AS amount_msat, s.memo, s.next_due_on::text AS next_due_on, s.status, cp.name AS counterparty, (SELECT count(*)::int FROM schedule_cycles c WHERE c.schedule_id=s.id AND c.status='awaiting_invoice') AS awaiting_invoice FROM recurring_schedules s JOIN counterparties cp ON cp.id=s.counterparty_id WHERE s.org_id=$1 ORDER BY s.created_at DESC", [orgId])).rows;
export async function setScheduleStatus(d: Deps, ctx: Ctx, id: string, status: "active" | "paused" | "cancelled") {
  const r = await d.pool.query("UPDATE recurring_schedules SET status=$3 WHERE id=$1 AND org_id=$2 AND status<>'cancelled' RETURNING id", [id, ctx.orgId, status]);
  if (!r.rowCount) throw new OryntError("not_found", 404, "Schedule not found or already cancelled.");
  await withTx(d.pool, (tx) => appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), `schedule.${status}`, `schedule:${id}`, {}));
}
export const listCycles = async (d: Deps, orgId: string) => (await d.pool.query("SELECT c.id, c.cycle, c.due_on::text AS due_on, c.status, c.obligation_id, cp.name AS counterparty, s.amount_msat::text AS amount_msat FROM schedule_cycles c JOIN recurring_schedules s ON s.id=c.schedule_id JOIN counterparties cp ON cp.id=s.counterparty_id WHERE c.org_id=$1 ORDER BY c.due_on DESC, c.created_at DESC LIMIT 100", [orgId])).rows;

/** Opens an "invoice needed" task for every due cycle (at most one per schedule per cycle — DB-enforced) and advances the schedule. Never creates a payment. */
export async function runDueSchedules(d: Deps, today = new Date()): Promise<number> {
  const due = (await d.pool.query("SELECT * FROM recurring_schedules WHERE status='active' AND next_due_on <= $1::date", [dateOnly(today)])).rows; let n = 0;
  for (const s of due) {
    await withTx(d.pool, async (tx) => {
      let next = new Date(s.next_due_on); let guard = 0;
      while (dateOnly(next) <= dateOnly(today) && guard++ < 12) {
        const ins = await tx.query("INSERT INTO schedule_cycles(schedule_id,org_id,cycle,due_on) VALUES ($1,$2,$3,$4) ON CONFLICT (schedule_id,cycle) DO NOTHING RETURNING id", [s.id, s.org_id, cycleKey(s.cadence, next), dateOnly(next)]);
        if (ins.rowCount) { n++; const ops = (await tx.query("SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.status='active' AND m.role IN ('owner','admin','operator')", [s.org_id])).rows; for (const o of ops) await queueMail(tx, o.email, "invoice_needed", "Orynt: an invoice is needed for a scheduled payout", `A scheduled payout is due (${cycleKey(s.cadence, next)}). Ask the recipient for a fresh Lightning invoice and add it under Schedules. Nothing will be paid until it is approved.`, s.org_id); }
        next = addCadence(next, s.cadence);
      }
      await tx.query("UPDATE recurring_schedules SET next_due_on=$2 WHERE id=$1", [s.id, dateOnly(next)]);
    });
  }
  return n;
}
export async function fulfilCycle(d: Deps, ctx: Ctx, cycleId: string, invoice: string) {
  const c = (await d.pool.query("SELECT c.*, s.counterparty_id, s.amount_msat, s.memo, s.wallet_connection_id, s.status AS sstatus FROM schedule_cycles c JOIN recurring_schedules s ON s.id=c.schedule_id WHERE c.id=$1 AND c.org_id=$2", [cycleId, ctx.orgId])).rows[0];
  if (!c) throw new OryntError("not_found", 404, "Cycle not found."); if (c.status !== "awaiting_invoice") throw new OryntError("conflict", 409, "This cycle already has a payout (or was skipped).");
  if (c.sstatus !== "active") throw new OryntError("invalid_state", 409, "The schedule is not active.");
  const id = await createObligation(d, ctx, { counterparty_id: c.counterparty_id, amount_msat: c.amount_msat.toString(), memo: `${c.memo} (${c.cycle})`.trim(), external_ref: `schedule:${c.cycle}`, invoice, wallet_connection_id: c.wallet_connection_id ?? undefined });
  const u = await d.pool.query("UPDATE schedule_cycles SET status='drafted', obligation_id=$2 WHERE id=$1 AND status='awaiting_invoice'", [cycleId, id]);
  if (!u.rowCount) throw new OryntError("conflict", 409, "This cycle was fulfilled concurrently.");
  return id;
}

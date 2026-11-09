import { OryntError, type State } from "@orynt/core";
import { InsufficientPermissionsError, type PaymentRecord } from "@orynt/wallets";
import { withTx } from "../db/pool";
import { inc } from "../lib/metrics";
import { appendAudit } from "./audit";
import { actorTag, type Actor, type Ctx, type Deps } from "./context";
import { applyRecord } from "./execution";
import { openIncident, resolveIncidents } from "./incidents";
import { providerFor, type ConnectionRow } from "./providers";
import { cas, lockObligation } from "./state";
import { emitEvent } from "./webhooks";

const backoffSeconds = (n: number) => Math.min(60, 2 ** Math.min(n, 6));
export const systemCtx = (orgId: string, component: string): Ctx => ({ orgId, reqId: `sys-${component}`, actor: { kind: "system", id: component, name: component, role: "system" } });

export type ReconcileOutcome = "SETTLED" | "FAILED" | "PENDING" | "NOT_FOUND" | "ERROR" | "BUSY" | "NOTHING_TO_DO";

/**
 * Asks the wallet for its authoritative record by payment hash and applies it. Never re-sends. At most one reconciler per
 * obligation at a time (lease); a crashed reconciler's lease simply expires.
 */
export async function reconcileObligation(d: Deps, ctx: Ctx, obligationId: string, trigger: "worker" | "operator" | "callback" | "startup"): Promise<ReconcileOutcome> {
  const claimed = (await d.pool.query(
    `UPDATE payout_obligations SET reconcile_lease_until = now() + interval '30 seconds' WHERE id=$1 AND org_id=$2 AND state IN ('PENDING','UNKNOWN','RECONCILING')
     AND (reconcile_lease_until IS NULL OR reconcile_lease_until < now()) RETURNING *`, [obligationId, ctx.orgId])).rows[0];
  if (!claimed) {
    const cur = (await d.pool.query("SELECT state, reconcile_lease_until FROM payout_obligations WHERE id=$1 AND org_id=$2", [obligationId, ctx.orgId])).rows[0];
    if (!cur) throw new OryntError("not_found", 404, "Payout not found.");
    return ["PENDING", "UNKNOWN", "RECONCILING"].includes(cur.state) ? "BUSY" : "NOTHING_TO_DO";
  }
  const intent = (await d.pool.query("SELECT * FROM payment_intents WHERE obligation_id=$1 AND revision=$2", [obligationId, claimed.current_revision])).rows[0];
  const conn = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [intent.wallet_connection_id])).rows[0];
  const attempt = (await d.pool.query("SELECT * FROM execution_attempts WHERE intent_id=$1 ORDER BY attempt_no DESC LIMIT 1", [intent.id])).rows[0];
  const run = (await d.pool.query("INSERT INTO reconciliation_runs(org_id,obligation_id,trigger) VALUES ($1,$2,$3) RETURNING id", [ctx.orgId, obligationId, trigger])).rows[0];

  // UNKNOWN -> RECONCILING is the only way out of UNKNOWN
  if (claimed.state === "UNKNOWN") {
    await withTx(d.pool, async (tx) => {
      await lockObligation(tx, ctx.orgId, obligationId);
      await cas(tx, ctx.orgId, obligationId, "UNKNOWN", "RECONCILING");
      await appendAudit(tx, ctx.orgId, `obligation:${obligationId}`, actorTag(ctx.actor), "payment.reconciling", `obligation:${obligationId}`, { trigger, payment_hash: intent.payment_hash });
    });
  }
  let rec: PaymentRecord | null = null, err: string | null = null;
  try { rec = await providerFor(d, conn as ConnectionRow).lookupPayment(intent.payment_hash); } catch (e) { err = e instanceof InsufficientPermissionsError ? `wallet credential cannot look up payments: ${e.message}` : (e as Error).message; }

  const result = await withTx(d.pool, async (tx): Promise<ReconcileOutcome> => {
    const o = await lockObligation(tx, ctx.orgId, obligationId);
    const from = o.state as State;
    if (from !== "RECONCILING" && from !== "PENDING") { await tx.query("UPDATE reconciliation_runs SET finished_at=now(), result='SUPERSEDED' WHERE id=$1", [run.id]); return "NOTHING_TO_DO"; }
    const finish = (res: string, status: string | null, detail: object = {}) => tx.query("UPDATE reconciliation_runs SET finished_at=now(), result=$2, provider_status=$3, detail=$4 WHERE id=$1", [run.id, res, status, JSON.stringify(detail)]);
    if (!rec) {
      const attempts = o.reconcile_attempts + 1;
      await tx.query("UPDATE payout_obligations SET reconcile_attempts=$2, reconcile_lease_until=NULL, next_reconcile_at = now() + ($3 || ' seconds')::interval WHERE id=$1", [obligationId, attempts, String(backoffSeconds(attempts))]);
      await finish("ERROR", null, { error: err });
      if (attempts >= 8) await openIncident(tx, ctx.orgId, obligationId, "reconciliation_stalled", "critical", "Orynt cannot get an answer from the wallet. The payment stays blocked until it can.", { last_error: err });
      return "ERROR";
    }
    if (rec.status === "NOT_FOUND") {
      const attempts = o.reconcile_attempts + 1;
      await tx.query("UPDATE payout_obligations SET reconcile_attempts=$2, reconcile_lease_until=NULL, next_reconcile_at = now() + ($3 || ' seconds')::interval WHERE id=$1", [obligationId, attempts, String(backoffSeconds(attempts))]);
      await finish("NOT_FOUND", "NOT_FOUND");
      await appendAudit(tx, ctx.orgId, `obligation:${obligationId}`, actorTag(ctx.actor), "payment.lookup_not_found", `obligation:${obligationId}`, { payment_hash: intent.payment_hash, trigger });
      return "NOT_FOUND";
    }
    const toUnknown = async (why: string, kind: "unknown_outcome" | "provider_inconsistent" = "unknown_outcome") => {
      await tx.query("UPDATE payout_obligations SET reconcile_lease_until=NULL, next_reconcile_at = now() + interval '30 seconds' WHERE id=$1", [obligationId]);
      await openIncident(tx, ctx.orgId, obligationId, kind, "critical", "The wallet's record is inconsistent with what was approved. The payment stays blocked.", { reason: why });
      await finish("INCONSISTENT", rec!.status, { why });
      return "UNKNOWN" as const;
    };
    const r = await applyRecord(d, ctx, tx, o, attempt.id, intent, conn.provider_kind === "simulator", rec, from, toUnknown, true);
    if (r !== "UNKNOWN") await finish(rec.status, rec.status);
    return r === "UNKNOWN" ? "ERROR" : r;
  });
  inc("orynt_reconcile_runs_total", { trigger, result });
  return result;
}

/** The "unsafe to retry, safe to close" operator act. Requires FRESH evidence — it is not a database edit. */
export async function confirmNotSent(d: Deps, ctx: Ctx, paymentId: string, note: string) {
  const intent = (await d.pool.query("SELECT * FROM payment_intents WHERE id=$1 AND org_id=$2", [paymentId, ctx.orgId])).rows[0];
  if (!intent) throw new OryntError("not_found", 404, "Payment not found.");
  const conn = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [intent.wallet_connection_id])).rows[0];
  const o0 = (await d.pool.query("SELECT state FROM payout_obligations WHERE id=$1", [intent.obligation_id])).rows[0];
  if (!["UNKNOWN", "RECONCILING"].includes(o0.state)) throw new OryntError("invalid_state", 409, "This payment is not unresolved.");
  const rev = (await d.pool.query("SELECT invoice_expires_at FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [intent.obligation_id, intent.revision])).rows[0];
  const attempt = (await d.pool.query("SELECT * FROM execution_attempts WHERE intent_id=$1 ORDER BY attempt_no DESC LIMIT 1", [intent.id])).rows[0];
  const graceMs = (2 * d.config.sendTimeoutSeconds + 60) * 1000;
  if (rev.invoice_expires_at.getTime() > Date.now()) throw new OryntError("send_blocked_unresolved", 409, "The invoice has not expired yet, so the payment could still be completed by the wallet. Keep reconciling.");
  if (attempt.dispatched_at && Date.now() - attempt.dispatched_at.getTime() < graceMs) throw new OryntError("send_blocked_unresolved", 409, "Too soon after the send started to rule out an in-flight request. Wait and reconcile again.");
  let fresh: PaymentRecord;
  try { fresh = await providerFor(d, conn as ConnectionRow).lookupPayment(intent.payment_hash); } catch (e) { throw new OryntError("wallet_unavailable", 503, `Could not verify with the wallet right now: ${(e as Error).message}`); }
  if (fresh.status !== "NOT_FOUND") throw new OryntError("send_blocked_unresolved", 409, `The wallet DOES have a record of this payment (${fresh.status}). Run reconciliation instead.`);
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, intent.obligation_id);
    if (o.state === "UNKNOWN") { await cas(tx, ctx.orgId, o.id, "UNKNOWN", "RECONCILING"); }
    await cas(tx, ctx.orgId, o.id, "RECONCILING", "DEFINITIVELY_FAILED", { operatorConfirmedNotSent: true }, "next_reconcile_at = NULL, reconcile_lease_until = NULL");
    await tx.query("UPDATE execution_attempts SET outcome='FAILED', failure_reason='OPERATOR_CONFIRMED_NOT_SENT', finished_at=now(), note=$2 WHERE id=$1", [attempt.id, `Operator confirmed not sent: ${note}`.slice(0, 500)]);
    await appendAudit(tx, ctx.orgId, `obligation:${o.id}`, actorTag(ctx.actor), "payment.confirmed_not_sent", `obligation:${o.id}`, { payment_hash: intent.payment_hash, note, evidence: { wallet_lookup: "NOT_FOUND", looked_up_at: fresh.observedAt, invoice_expired_at: rev.invoice_expires_at.toISOString() } });
    await resolveIncidents(tx, ctx.orgId, o.id, `Operator confirmed the payment was never sent: ${note}`, actorTag(ctx.actor));
    await emitEvent(tx, ctx.orgId, "payment.failed", { obligation_id: o.id, reason: "operator_confirmed_not_sent", proven: true });
  });
  return intent.obligation_id as string;
}

// ---- recovery sweeps (run at startup and by the worker) --------------------------------------------------------------------
/** A reservation that never reached DISPATCHING provably never called the wallet: release it. */
export async function releaseStaleReservations(d: Deps): Promise<number> {
  const rows = (await d.pool.query("SELECT id, org_id FROM payout_obligations WHERE state='EXECUTION_RESERVED' AND state_changed_at < now() - interval '60 seconds'")).rows;
  let n = 0;
  for (const r of rows) {
    const ctx = systemCtx(r.org_id, "recovery");
    try {
      await withTx(d.pool, async (tx) => {
        const o = await lockObligation(tx, r.org_id, r.id);
        if (o.state !== "EXECUTION_RESERVED") return;
        await cas(tx, r.org_id, r.id, "EXECUTION_RESERVED", "APPROVED", {}, "next_reconcile_at = NULL");
        await tx.query("UPDATE execution_attempts SET outcome='RELEASED', finished_at=now(), note='Released: dispatch never started.' WHERE intent_id IN (SELECT id FROM payment_intents WHERE obligation_id=$1) AND outcome='RESERVED'", [r.id]);
        await appendAudit(tx, r.org_id, `obligation:${r.id}`, actorTag(ctx.actor), "payment.reservation_released", `obligation:${r.id}`, { reason: "process stopped before dispatch" });
        n++;
      });
    } catch (e) { d.log.warn({ err: (e as Error).message }, "release reservation failed"); }
  }
  return n;
}

/** DISPATCHING with no recorded outcome after a restart means the wallet may have been called. Treat as UNKNOWN — never as failed, never as retryable. */
export async function recoverStaleDispatch(d: Deps, olderThanSeconds: number): Promise<number> {
  const rows = (await d.pool.query("SELECT id, org_id FROM payout_obligations WHERE state='DISPATCHING' AND state_changed_at < now() - ($1 || ' seconds')::interval", [String(olderThanSeconds)])).rows;
  let n = 0;
  for (const r of rows) {
    const ctx = systemCtx(r.org_id, "recovery");
    try {
      await withTx(d.pool, async (tx) => {
        const o = await lockObligation(tx, r.org_id, r.id);
        if (o.state !== "DISPATCHING") return;
        const it = (await tx.query("SELECT * FROM payment_intents WHERE obligation_id=$1 AND revision=$2", [r.id, o.current_revision])).rows[0];
        await cas(tx, r.org_id, r.id, "DISPATCHING", "UNKNOWN", {}, "next_reconcile_at = now(), reconcile_attempts = 0");
        await tx.query("UPDATE execution_attempts SET outcome='UNKNOWN', note='Outcome uncertain: process interrupted while the wallet may have been called.' WHERE intent_id=$1 AND outcome='DISPATCHING'", [it.id]);
        await appendAudit(tx, r.org_id, `obligation:${r.id}`, actorTag(ctx.actor), "payment.unknown", `obligation:${r.id}`, { reason: "process_interrupted", payment_hash: it.payment_hash, second_send_blocked: true });
        await openIncident(tx, r.org_id, r.id, "unknown_outcome", "warning", "Orynt restarted while a payment was being sent. A second send is blocked while the wallet's record is checked.", { reason: "process_interrupted" });
        await emitEvent(tx, r.org_id, "payment.unknown", { obligation_id: r.id, payment_hash: it.payment_hash });
        n++;
      });
    } catch (e) { d.log.warn({ err: (e as Error).message }, "recover dispatch failed"); }
  }
  return n;
}

export async function reconcileDue(d: Deps, limit = 20): Promise<number> {
  const rows = (await d.pool.query("SELECT id, org_id FROM payout_obligations WHERE state IN ('PENDING','UNKNOWN','RECONCILING') AND next_reconcile_at <= now() ORDER BY next_reconcile_at LIMIT $1", [limit])).rows;
  let n = 0;
  for (const r of rows) { try { await reconcileObligation(d, systemCtx(r.org_id, "reconciler"), r.id, "worker"); n++; } catch (e) { d.log.warn({ err: (e as Error).message }, "reconcile failed"); } }
  return n;
}
export type { Actor };

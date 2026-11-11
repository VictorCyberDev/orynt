import {
  APPROVER_ROLES, MONEY_MAY_HAVE_MOVED, OryntError, PolicyRulesSchema, evaluatePolicy, revisionHash, sha256Hex, hexToBytes, stateActions,
  type Network, type PolicyRules, type State, type TransitionEvidence,
} from "@orynt/core";
import { AlreadyExistsError, NotSentError, type PaymentRecord } from "@orynt/wallets";
import { withTx, type Tx } from "../db/pool";
import { fp } from "../lib/failpoints";
import { inc } from "../lib/metrics";
import { appendAudit } from "./audit";
import { actorTag, type Ctx, type Deps } from "./context";
import { bindingFor, validApprovals } from "./dto";
import { openIncident, resolveIncidents } from "./incidents";
import { dispatchedLast24h } from "./obligations";
import { providerFor, type ConnectionRow } from "./providers";
import { cas, lockObligation } from "./state";
import { emitEvent } from "./webhooks";
import { requireVerifiedEmail } from "./gates";

const FEE_LIMIT_PPM = 10_000n; // 1% of amount, min 1000 msat — bounds routing fees the wallet may spend

export async function recordBlocked(d: Deps, ctx: Ctx, obligationId: string, reason: string) {
  await d.pool.query("INSERT INTO blocked_attempts(org_id,obligation_id,reason,actor) VALUES ($1,$2,$3,$4)", [ctx.orgId, obligationId, reason, actorTag(ctx.actor)]).catch(() => {});
  inc("orynt_duplicate_sends_blocked_total");
}

/** Every precondition is re-derived from stored, immutable data at the moment of execution — nothing from the approval step is trusted blindly. */
async function gate(tx: Tx, d: Deps, ctx: Ctx, o: Record<string, any>, rev: Record<string, any>) {
  const conn = (await tx.query("SELECT * FROM wallet_connections WHERE id=$1 AND org_id=$2", [o.wallet_connection_id, ctx.orgId])).rows[0];
  if (!conn || conn.status !== "active") throw new OryntError("wallet_unavailable", 409, "The wallet connection for this payout is not active.");
  if (conn.network !== rev.network) throw new OryntError("network_mismatch", 409, "Wallet and invoice are on different networks.");
  if (rev.network === "mainnet" && !d.config.allowMainnet) throw new OryntError("mainnet_disabled", 409, "Mainnet execution is disabled on this server.");
  if (conn.provider_kind === "simulator" && d.config.env === "production") throw new OryntError("wallet_unavailable", 409, "The simulator cannot be used in production.");
  const caps = (await tx.query("SELECT * FROM provider_capabilities WHERE wallet_connection_id=$1 ORDER BY discovered_at DESC LIMIT 1", [conn.id])).rows[0];
  if (!caps || caps.can_send === "false") throw new OryntError("wallet_insufficient_permissions", 409, "This wallet connection is not allowed to send payments.");
  // Reconciliation needs payment lookup: without it an uncertain payment could never be resolved from the wallet's own record. An explicit "no" always refuses;
  // providers other than LND and the labelled simulator must have lookup CONFIRMED (their absence semantics differ from LND's — see docs/product/btcpay-adapter.md).
  if (caps.can_lookup === "false" || (!["lnd", "simulator"].includes(conn.provider_kind) && caps.can_lookup !== "true"))
    throw new OryntError("wallet_insufficient_permissions", 409, "This wallet connection cannot look payments up, so Orynt could not prove what happened after an interruption. Connect a credential that can look up payments.");
  if (Date.now() - new Date(caps.discovered_at).getTime() > 24 * 3600 * 1000) throw new OryntError("wallet_unavailable", 409, "This wallet's permissions were last checked more than 24 hours ago. Re-check the connection before sending.");
  const b = await bindingFor(tx, o, rev);
  if (!b) throw new OryntError("approval_invalid", 409, "Payout has no bound policy.");
  const active = (await tx.query("SELECT id FROM approval_policies WHERE org_id=$1 AND active", [ctx.orgId])).rows[0];
  if (!active || active.id !== o.policy_id) throw new OryntError("approval_stale", 409, "The approval policy changed after this payout was approved. Re-submit it for approval.");
  const rules = PolicyRulesSchema.parse(b.pol.rules) as PolicyRules;
  // tamper checks on frozen data
  const rhash = revisionHash({ obligationId: o.id, revision: rev.revision, counterpartyId: rev.counterparty_id, boundPayeePubkey: rev.bound_payee_pubkey, amountMsat: rev.amount_msat, memo: rev.memo, externalRef: rev.external_ref, invoice: rev.invoice, paymentHash: rev.payment_hash, payeePubkey: rev.payee_pubkey, network: rev.network });
  if (rhash !== rev.revision_hash || b.digest !== o.intent_digest) throw new OryntError("approval_invalid", 409, "Stored terms no longer match what was approved. Execution refused.");
  const cp = (await tx.query("SELECT bound_payee_pubkey FROM counterparties WHERE id=$1", [rev.counterparty_id])).rows[0];
  if (cp.bound_payee_pubkey && cp.bound_payee_pubkey !== rev.payee_pubkey) throw new OryntError("destination_mismatch", 409, "The recipient's bound node key no longer matches the invoice.");
  const remaining = rev.invoice_expires_at.getTime() - Date.now();
  if (remaining < rules.minInvoiceRemainingSeconds * 1000) throw new OryntError("invoice_expired", 409, remaining <= 0 ? "The invoice has expired." : "The invoice expires too soon to send safely.");
  const pol = evaluatePolicy(rules, { amountMsat: rev.amount_msat, network: rev.network as Network, dispatchedLast24hMsat: await dispatchedLast24h(tx, ctx.orgId, o.id) });
  if (pol.violations.length) throw new OryntError("policy_violation", 422, pol.violations.map((v) => v.message).join(" "));
  const apps = (await validApprovals(tx, o, rev, b.digest)).filter((a) => a.valid && Date.now() - new Date(a.row.signed_at).getTime() <= rules.approvalMaxAgeSeconds * 1000 && (!rules.requireDistinctMaker || a.row.approver_user_id !== rev.created_by));
  if (apps.length < pol.requiredApprovals) throw new OryntError("approval_insufficient", 409, "Not enough current, valid approvals (an approval may have been revoked, expired, or the approver lost their role).", { valid: apps.length, required: pol.requiredApprovals });
  return { conn, b, rules };
}

export interface ExecResult { obligationId: string; httpStatus: 200 | 202 }

export async function executeObligation(d: Deps, ctx: Ctx, obligationId: string, mode: "execute" | "retry" = "execute"): Promise<ExecResult> {
  const fromState: State = mode === "retry" ? "DEFINITIVELY_FAILED" : "APPROVED";
  await requireVerifiedEmail(d, ctx);
  // ---- Phase 0: cheap wallet preflight OUTSIDE any lock ---------------------------------------------------------
  const pre = (await d.pool.query("SELECT o.wallet_connection_id, o.state FROM payout_obligations o WHERE o.id=$1 AND o.org_id=$2", [obligationId, ctx.orgId])).rows[0];
  if (!pre) throw new OryntError("not_found", 404, "Payout not found.");
  if (pre.state === fromState) {
    const c0 = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [pre.wallet_connection_id])).rows[0];
    if (c0) {
      try { const info = await providerFor(d, c0 as ConnectionRow).getInfo(); if (info.network !== c0.network) throw new OryntError("network_mismatch", 409, `The wallet reports ${info.network} but the connection says ${c0.network}.`); }
      catch (e) { if (e instanceof OryntError) throw e; throw new OryntError("wallet_unavailable", 503, "Orynt could not reach your wallet. Nothing was sent."); }
    }
  }

  // ---- Phase 1: reserve (single transaction, row-locked) ---------------------------------------------------------
  let attemptId = "", intent: Record<string, any> = {}, conn: Record<string, any> = {}, rev: Record<string, any> = {};
  try {
    await withTx(d.pool, async (tx) => {
      const o = await lockObligation(tx, ctx.orgId, obligationId);
      // serialise reservations per workspace so rolling-window limits cannot be raced by concurrent executes on different obligations
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ctx.orgId]);
      if (o.state !== fromState) {
        const blocked = (MONEY_MAY_HAVE_MOVED as readonly string[]).includes(o.state) || o.state === "EXECUTION_RESERVED";
        // NB: never touch the pool from inside a transaction callback (pool starvation under concurrency); the caller records the block afterwards.
        if (blocked) throw new OryntError("send_blocked_unresolved", 409, stateActions(o.state).find((a) => a.action === (mode === "retry" ? "retry" : "execute"))?.reason ?? "A payment for this payout already exists.", { state: o.state });
        throw new OryntError("invalid_state", 409, stateActions(o.state).find((a) => a.action === (mode === "retry" ? "retry" : "execute"))?.reason ?? `Payout is ${o.state}.`);
      }
      rev = (await tx.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [obligationId, o.current_revision])).rows[0];
      const g = await gate(tx, d, ctx, o, rev);
      conn = g.conn;
      const feeLimit = rev.amount_msat * FEE_LIMIT_PPM / 1_000_000n < 1000n ? 1000n : rev.amount_msat * FEE_LIMIT_PPM / 1_000_000n;
      let it = (await tx.query("SELECT * FROM payment_intents WHERE obligation_id=$1 AND revision=$2", [obligationId, rev.revision])).rows[0];
      if (!it) {
        const binding = { v: 1, workspace_id: ctx.orgId, obligation_id: obligationId, revision: rev.revision, revision_hash: rev.revision_hash, amount_msat: rev.amount_msat.toString(), network: rev.network, payment_hash: rev.payment_hash, payee_pubkey: rev.payee_pubkey, invoice_expires_at: Math.floor(rev.invoice_expires_at.getTime() / 1000), policy_id: g.b.pol.id, policy_revision: g.b.pol.revision, policy_digest: g.b.pol.digest, wallet_connection_id: conn.id };
        it = (await tx.query(
          "INSERT INTO payment_intents(org_id,obligation_id,revision,intent_digest,binding,policy_id,wallet_connection_id,payment_hash,amount_msat,network,fee_limit_msat,reserved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
          [ctx.orgId, obligationId, rev.revision, g.b.digest, JSON.stringify(binding), g.b.pol.id, conn.id, rev.payment_hash, rev.amount_msat, rev.network, feeLimit, actorTag(ctx.actor)])).rows[0];
      } else if (it.intent_digest !== g.b.digest) throw new OryntError("approval_invalid", 409, "Existing payment intent does not match approved terms.");
      intent = it;
      const n = (await tx.query("SELECT COALESCE(max(attempt_no),0)+1 AS n FROM execution_attempts WHERE intent_id=$1", [it.id])).rows[0].n;
      // The partial unique index one_open_attempt makes a second concurrent attempt impossible even if everything above were bypassed.
      attemptId = (await tx.query("INSERT INTO execution_attempts(intent_id,attempt_no,outcome) VALUES ($1,$2,'RESERVED') RETURNING id", [it.id, n])).rows[0].id;
      await cas(tx, ctx.orgId, obligationId, fromState, "EXECUTION_RESERVED", {}, "next_reconcile_at = now() + interval '90 seconds'");
      await fp("execute.in_reserve_tx"); // exercises rollback: nothing above may survive a failure here
      await appendAudit(tx, ctx.orgId, `obligation:${obligationId}`, actorTag(ctx.actor), "payment.reserved", `obligation:${obligationId}`, { intent_id: it.id, attempt_no: n, intent_digest: it.intent_digest, payment_hash: it.payment_hash, amount_msat: it.amount_msat.toString(), wallet_connection_id: conn.id, provider: conn.provider_kind, mode });
    });
  } catch (e) {
    if (e instanceof OryntError) {
      if (e.code === "send_blocked_unresolved") await recordBlocked(d, ctx, obligationId, `second ${mode} refused in state ${String(e.extra?.["state"] ?? "unknown")}`);
      throw e;
    }
    const pgErr = e as { code?: string; constraint?: string };
    if (pgErr.code === "23505" && pgErr.constraint === "one_open_attempt") { await recordBlocked(d, ctx, obligationId, "concurrent execute blocked by one_open_attempt"); throw new OryntError("send_blocked_unresolved", 409, "A send for this payout is already in progress."); }
    throw e;
  }
  await fp("execute.after_reserve");

  // ---- Phase 2: durable DISPATCHING marker, committed BEFORE the provider is called -----------------------------------
  await withTx(d.pool, async (tx) => {
    await lockObligation(tx, ctx.orgId, obligationId);
    await cas(tx, ctx.orgId, obligationId, "EXECUTION_RESERVED", "DISPATCHING");
    await tx.query("UPDATE execution_attempts SET outcome='DISPATCHING', dispatched_at=now() WHERE id=$1 AND outcome='RESERVED'", [attemptId]);
    await appendAudit(tx, ctx.orgId, `obligation:${obligationId}`, actorTag(ctx.actor), "payment.dispatching", `obligation:${obligationId}`, { intent_id: intent.id, payment_hash: intent.payment_hash });
    await emitEvent(tx, ctx.orgId, "payment.dispatching", { obligation_id: obligationId, payment_hash: intent.payment_hash });
  });

  // ---- Phase 3: the only place a wallet is asked to move money ----------------------------------------------------------
  let outcome: { kind: "record"; rec: PaymentRecord } | { kind: "not_sent"; msg: string } | { kind: "unknown"; msg: string };
  try {
    await fp("execute.before_provider_call");
    const provider = providerFor(d, conn as ConnectionRow);
    const rec = await provider.sendPayment({ invoice: rev.invoice, paymentHash: rev.payment_hash, amountMsat: rev.amount_msat, zeroAmountInvoice: !(await invoiceHasAmount(rev.invoice)), feeLimitMsat: intent.fee_limit_msat, timeoutSeconds: d.config.sendTimeoutSeconds });
    await fp("execute.after_provider_response"); // simulates the response being lost AFTER the wallet accepted the payment
    outcome = { kind: "record", rec };
  } catch (e) {
    if (e instanceof NotSentError) outcome = { kind: "not_sent", msg: e.message };
    else outcome = { kind: "unknown", msg: e instanceof AlreadyExistsError ? `wallet already has a payment for this hash: ${e.message}` : (e as Error).message };
  }
  const settled = await persistOutcome(d, ctx, obligationId, attemptId, intent, conn, outcome);
  inc("orynt_executions_total", { result: settled });
  return { obligationId, httpStatus: settled === "SETTLED" || settled === "FAILED" ? 200 : 202 };
}

async function invoiceHasAmount(invoice: string): Promise<boolean> { const { decodeInvoice } = await import("@orynt/core"); return decodeInvoice(invoice).amountMsat !== null; }

type Outcome = { kind: "record"; rec: PaymentRecord } | { kind: "not_sent"; msg: string } | { kind: "unknown"; msg: string };
/** Persists whatever we learned. A late result for an obligation that recovery already moved to UNKNOWN is ignored — reconciliation owns it. */
export async function persistOutcome(d: Deps, ctx: Ctx, obligationId: string, attemptId: string, intent: Record<string, any>, conn: Record<string, any>, out: Outcome, expectFrom: State = "DISPATCHING"): Promise<"SETTLED" | "FAILED" | "PENDING" | "UNKNOWN" | "IGNORED"> {
  return withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, obligationId);
    if (o.state !== expectFrom) return "IGNORED";
    const isSim = conn.provider_kind === "simulator";
    const stream = `obligation:${obligationId}`;
    const actor = actorTag(ctx.actor);
    const toUnknown = async (why: string, kind: "unknown_outcome" | "provider_inconsistent" = "unknown_outcome") => {
      const delay = d.config.reconcileInitialDelaySeconds;
      await cas(tx, ctx.orgId, obligationId, expectFrom, "UNKNOWN", {}, `next_reconcile_at = now() + interval '${Math.max(0, delay)} seconds', reconcile_attempts = 0`);
      await tx.query("UPDATE execution_attempts SET outcome='UNKNOWN', note=$2 WHERE id=$1", [attemptId, `Outcome uncertain: ${why}`.slice(0, 500)]);
      await appendAudit(tx, ctx.orgId, stream, actor, "payment.unknown", stream, { reason: why, payment_hash: intent.payment_hash, second_send_blocked: true });
      await openIncident(tx, ctx.orgId, obligationId, kind, kind === "provider_inconsistent" ? "critical" : "warning", kind === "provider_inconsistent" ? "The wallet's answer was inconsistent with what was approved. Orynt is verifying it." : "The wallet's answer was lost. Orynt blocked a second send and is checking the wallet's own record.", { reason: why });
      await emitEvent(tx, ctx.orgId, "payment.unknown", { obligation_id: obligationId, payment_hash: intent.payment_hash });
      return "UNKNOWN" as const;
    };
    if (out.kind === "unknown") return toUnknown(out.msg);
    if (out.kind === "not_sent") {
      await cas(tx, ctx.orgId, obligationId, expectFrom, "DEFINITIVELY_FAILED", { notSentProven: true }, "next_reconcile_at = NULL");
      await tx.query("UPDATE execution_attempts SET outcome='NOT_SENT', failure_reason=$2, finished_at=now(), note='Request never reached the wallet.' WHERE id=$1", [attemptId, out.msg]);
      await appendAudit(tx, ctx.orgId, stream, actor, "payment.failed", stream, { reason: out.msg, evidence: "transport_not_sent", payment_hash: intent.payment_hash });
      await emitEvent(tx, ctx.orgId, "payment.failed", { obligation_id: obligationId, reason: out.msg, proven: true });
      return "FAILED";
    }
    const rec = out.rec;
    return applyRecord(d, ctx, tx, o, attemptId, intent, isSim, rec, expectFrom, toUnknown);
  });
}

/** Maps a provider's authoritative record onto state. Shared by execution and reconciliation so the evidence rules cannot diverge. */
export async function applyRecord(d: Deps, ctx: Ctx, tx: Tx, o: Record<string, any>, attemptId: string, intent: Record<string, any>, isSim: boolean, rec: PaymentRecord, from: State, toUnknown: (why: string, kind?: "unknown_outcome" | "provider_inconsistent") => Promise<"UNKNOWN">, reconciled = false): Promise<"SETTLED" | "FAILED" | "PENDING" | "UNKNOWN"> {
  const stream = `obligation:${o.id}`;
  const actor = actorTag(ctx.actor);
  if (rec.status === "SUCCEEDED") {
    const preimageOk = !!rec.preimage && /^[0-9a-f]{64}$/.test(rec.preimage) && sha256Hex(hexToBytes(rec.preimage)) === intent.payment_hash;
    const amountOk = rec.amountMsat === undefined || rec.amountMsat === 0n && isSim || rec.amountMsat === intent.amount_msat;
    if (!preimageOk) return toUnknown("wallet reported success but the preimage does not hash to the invoice payment hash", "provider_inconsistent");
    if (!amountOk) return toUnknown(`wallet reported ${rec.amountMsat} msat delivered but ${intent.amount_msat} msat were approved`, "provider_inconsistent");
    const ev: TransitionEvidence = { providerKind: isSim ? "simulator" : "lnd", preimageVerified: true };
    const to: State = isSim ? "SIMULATED_SETTLED" : "SETTLED";
    await cas(tx, ctx.orgId, o.id, from, to, ev, "next_reconcile_at = NULL, reconcile_lease_until = NULL");
    await tx.query("UPDATE execution_attempts SET outcome='SUCCEEDED', provider_status='SUCCEEDED', preimage=$2, amount_msat=$3, fee_msat=$4, provider_ref=$5, settled_at=$6, finished_at=now(), note=$7 WHERE id=$1",
      [attemptId, rec.preimage, intent.amount_msat, rec.feeMsat ?? 0n, rec.providerRef ?? null, rec.settledAt ?? new Date().toISOString(), reconciled ? "Settled after reconciliation of an uncertain outcome." : "Settled on first response."]);
    await appendAudit(tx, ctx.orgId, stream, actor, "payment.settled", stream, { payment_hash: intent.payment_hash, preimage: rec.preimage, amount_msat: intent.amount_msat.toString(), fee_msat: (rec.feeMsat ?? 0n).toString(), simulated: isSim, reconciled_after_uncertainty: reconciled });
    await resolveIncidents(tx, ctx.orgId, o.id, "Wallet record found; payment settled with verified preimage.");
    await emitEvent(tx, ctx.orgId, "payment.settled", { obligation_id: o.id, payment_hash: intent.payment_hash, simulated: isSim, amount_msat: intent.amount_msat.toString() });
    return "SETTLED";
  }
  if (rec.status === "FAILED") {
    await cas(tx, ctx.orgId, o.id, from, "DEFINITIVELY_FAILED", { providerReportedTerminalFailure: true }, "next_reconcile_at = NULL, reconcile_lease_until = NULL");
    await tx.query("UPDATE execution_attempts SET outcome='FAILED', provider_status='FAILED', failure_reason=$2, finished_at=now() WHERE id=$1", [attemptId, rec.failureReason ?? "unknown"]);
    await appendAudit(tx, ctx.orgId, stream, actor, "payment.failed", stream, { payment_hash: intent.payment_hash, failure_reason: rec.failureReason, evidence: "provider_reported_terminal_failure" });
    await resolveIncidents(tx, ctx.orgId, o.id, "Wallet reported a terminal failure; the payment is proven not paid.");
    await emitEvent(tx, ctx.orgId, "payment.failed", { obligation_id: o.id, reason: rec.failureReason, proven: true });
    return "FAILED";
  }
  // IN_FLIGHT
  if (from === "DISPATCHING" || from === "RECONCILING") {
    await cas(tx, ctx.orgId, o.id, from, "PENDING", {}, "next_reconcile_at = now() + interval '3 seconds', reconcile_lease_until = NULL");
    await tx.query("UPDATE execution_attempts SET outcome='PENDING', provider_status='IN_FLIGHT' WHERE id=$1", [attemptId]);
    await appendAudit(tx, ctx.orgId, stream, actor, "payment.pending", stream, { payment_hash: intent.payment_hash });
    await emitEvent(tx, ctx.orgId, "payment.pending", { obligation_id: o.id });
  } else await tx.query("UPDATE payout_obligations SET next_reconcile_at = now() + interval '3 seconds', reconcile_lease_until = NULL WHERE id=$1", [o.id]);
  return "PENDING";
}

void APPROVER_ROLES;

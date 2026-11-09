import { APPROVER_ROLES, MONEY_MAY_HAVE_MOVED, formatMsat, hasPermission, intentDigest, stateActions, verifyApproval, type State } from "@orynt/core";
import type { Role } from "@orynt/core";
import type { Db, Tx } from "../db/pool";
import { isoMs } from "./context";
import { cas as _cas } from "./state";
void _cas;

type Q = Db | Tx;
const permFor: Record<string, Parameters<typeof hasPermission>[1]> = {
  edit: "obligation:create", submit: "obligation:submit", approve: "obligation:approve", reject: "obligation:reject", execute: "payment:execute",
  reconcile: "payment:reconcile", retry: "payment:execute", cancel: "obligation:cancel", confirm_not_sent: "incident:resolve", receipt: "receipt:read",
};

export async function bindingFor(q: Q, o: Record<string, any>, rev: Record<string, any>) {
  const pol = (await q.query("SELECT * FROM approval_policies WHERE id=$1", [o.policy_id])).rows[0];
  if (!pol || !o.wallet_connection_id) return null;
  return { pol, digest: intentDigest({ workspaceId: o.org_id, obligationId: o.id, revision: rev.revision, revisionHash: rev.revision_hash, amountMsat: rev.amount_msat, network: rev.network, paymentHash: rev.payment_hash, payeePubkey: rev.payee_pubkey, invoiceExpiresAt: Math.floor(new Date(rev.invoice_expires_at).getTime() / 1000), policyId: pol.id, policyRevision: pol.revision, policyDigest: pol.digest, walletConnectionId: o.wallet_connection_id }) };
}

/** Approval is only counted if the signature verifies AND the approver is, right now, an active member in an approver role. */
export async function validApprovals(q: Q, o: Record<string, any>, rev: Record<string, any>, digest: string | null) {
  const rows = (await q.query(
    `SELECT a.*, u.name AS uname, m.status AS mstatus, m.role AS mrole FROM approvals a JOIN users u ON u.id=a.approver_user_id
     LEFT JOIN memberships m ON m.user_id=a.approver_user_id AND m.org_id=a.org_id WHERE a.obligation_id=$1 AND a.revision=$2 ORDER BY a.created_at`, [o.id, rev.revision])).rows;
  return rows.map((a) => {
    let valid = false, why: string | null = a.revoked_reason ?? null;
    if (a.decision === "approved") {
      const sigOk = !!a.payload && !!a.signature && !!a.public_key && verifyApproval(a.public_key, a.payload, a.signature);
      const bound = !!digest && a.intent_digest === digest && a.payload?.intent_digest === digest;
      const memberOk = a.mstatus === "active" && (APPROVER_ROLES as readonly string[]).includes(a.mrole);
      valid = !a.revoked_at && sigOk && bound && memberOk;
      if (!valid && !why) why = !memberOk ? "Approver no longer holds an approving role" : !sigOk ? "Signature does not verify" : "Approval does not match the current terms";
    }
    return { row: a, valid, why };
  });
}

function explain(state: State, o: { unresolvedSince?: string; invoiceExpired: boolean; lastRecon?: string | null; incidentSummary?: string }): { headline: string; known: string[]; unknown: string[]; next: string } {
  switch (state) {
    case "DRAFT": return { headline: "Draft — nothing has been sent", known: ["No approval has been requested.", "No money has moved."], unknown: [], next: "Check the details, then submit for approval." };
    case "AWAITING_APPROVAL": return { headline: "Waiting for approval", known: ["The terms are frozen for this revision.", "No money has moved."], unknown: [], next: "An approver reviews the exact amount and recipient, then signs." };
    case "APPROVED": return { headline: "Approved and ready to send", known: ["Required approvals are signed for these exact terms.", "No money has moved yet."], unknown: [], next: "Send the payment. It can only be sent once." };
    case "EXECUTION_RESERVED": return { headline: "Starting the payment", known: ["The send has been reserved. A second send is blocked."], unknown: [], next: "This takes a moment." };
    case "DISPATCHING": return { headline: "Sending to your wallet…", known: ["The send is reserved. A second send is blocked."], unknown: ["Whether the wallet has accepted it yet."], next: "Orynt is waiting for the wallet's answer." };
    case "PENDING": return { headline: "Payment is in flight", known: ["Your wallet accepted the payment and is routing it."], unknown: ["Whether it will complete."], next: "Orynt keeps checking the wallet's own record." };
    case "UNKNOWN": case "RECONCILING": return {
      headline: "We lost the wallet's answer — checking its record",
      known: ["A send was started for this payment, so another send is blocked.", "Nothing has been marked failed.", ...(o.incidentSummary ? [o.incidentSummary] : [])],
      unknown: ["Whether the payment went through."],
      next: o.invoiceExpired && o.lastRecon === "NOT_FOUND" ? "The wallet has no record and the invoice has expired. You can confirm it was never sent." : "Orynt asks the wallet by payment hash and settles only when the proof is in hand. You can also check now." };
    case "SETTLED": return { headline: "Settled — proof in hand", known: ["The payee's node revealed the payment preimage, which matches the invoice's payment hash.", "A signed receipt is available."], unknown: ["Whether the work or goods were delivered — a receipt cannot prove that."], next: "Download the receipt." };
    case "SIMULATED_SETTLED": return { headline: "Simulated — no real money moved", known: ["This workspace used the simulator wallet."], unknown: [], next: "Connect a real wallet for real settlement." };
    case "DEFINITIVELY_FAILED": return { headline: "Failed — and proven not paid", known: ["The wallet reported a terminal failure, or it was proven the request never left."], unknown: [], next: "Retry if the invoice is still valid, or create a new revision with a fresh invoice." };
    case "REJECTED": return { headline: "Rejected", known: ["No money moved."], unknown: [], next: "Create a new payout if it is still needed." };
    case "CANCELLED": return { headline: "Cancelled", known: ["No money moved."], unknown: [], next: "—" };
  }
}

export async function paymentDto(q: Q, intent: Record<string, any>, conn: Record<string, any>, obl: Record<string, any>) {
  const attempts = (await q.query("SELECT * FROM execution_attempts WHERE intent_id=$1 ORDER BY attempt_no", [intent.id])).rows;
  const runs = (await q.query("SELECT count(*)::int AS n, max(started_at) AS last_at, (array_agg(result ORDER BY started_at DESC))[1] AS last_result FROM reconciliation_runs WHERE obligation_id=$1", [obl.id])).rows[0];
  const win = attempts.find((a) => a.outcome === "SUCCEEDED");
  return {
    id: intent.id, obligation_id: intent.obligation_id, payment_hash: intent.payment_hash, amount_msat: intent.amount_msat.toString(), network: intent.network, intent_digest: intent.intent_digest,
    wallet_connection_id: intent.wallet_connection_id, provider_kind: conn.provider_kind, is_simulator: conn.provider_kind === "simulator",
    attempts: attempts.map((a) => ({ attempt_no: a.attempt_no, started_at: isoMs(a.started_at), dispatched_at: a.dispatched_at ? isoMs(a.dispatched_at) : null, outcome: a.outcome, provider_status: a.provider_status, failure_reason: a.failure_reason, fee_msat: a.fee_msat?.toString() ?? null, finished_at: a.finished_at ? isoMs(a.finished_at) : null, note: a.note })),
    settlement: win ? { preimage: win.preimage, settled_at: isoMs(win.settled_at ?? win.finished_at), fee_msat: (win.fee_msat ?? 0n).toString(), amount_msat: (win.amount_msat ?? intent.amount_msat).toString(), reconciled_after_uncertainty: /uncertain|reconcil/i.test(win.note) } : null,
    reconciliation: { runs: runs.n, last_run_at: runs.last_at ? isoMs(runs.last_at) : null, last_result: runs.last_result ?? null, next_run_at: obl.next_reconcile_at ? isoMs(obl.next_reconcile_at) : null },
  };
}

export async function obligationDto(q: Q, orgId: string, id: string, role: Role | "system") {
  const o = (await q.query("SELECT * FROM payout_obligations WHERE id=$1 AND org_id=$2", [id, orgId])).rows[0];
  if (!o) return null;
  const rev = (await q.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [id, o.current_revision])).rows[0];
  const cp = (await q.query("SELECT * FROM counterparties WHERE id=$1", [rev.counterparty_id])).rows[0];
  const maker = (await q.query("SELECT id,name FROM users WHERE id=$1", [rev.created_by])).rows[0]; // author of the current revision
  const b = o.policy_id ? await bindingFor(q, o, rev) : null;
  const apps = await validApprovals(q, o, rev, b?.digest ?? null);
  const conn = o.wallet_connection_id ? (await q.query("SELECT * FROM wallet_connections WHERE id=$1", [o.wallet_connection_id])).rows[0] : null;
  const intent = (await q.query("SELECT * FROM payment_intents WHERE obligation_id=$1 ORDER BY revision DESC LIMIT 1", [id])).rows[0];
  const inc = (await q.query("SELECT * FROM incidents WHERE obligation_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1", [id])).rows[0];
  const payment = intent && conn ? await paymentDto(q, intent, conn, o) : null;
  const expired = new Date(rev.invoice_expires_at).getTime() <= Date.now();
  const validCount = apps.filter((a) => a.valid).length;
  const state = o.state as State;

  const notSentOk = (state === "UNKNOWN" || state === "RECONCILING") && payment?.reconciliation.last_result === "NOT_FOUND" && expired;
  const actions = stateActions(state).map((a) => {
    let allowed = a.allowed, reason = a.reason;
    if (a.action === "confirm_not_sent") { allowed = notSentOk; if (!allowed && (state === "UNKNOWN" || state === "RECONCILING")) reason = "Available only after the wallet reports no record of this payment and the invoice has expired."; }
    if (a.action === "execute" && allowed && validCount < (o.required_approvals ?? 1)) { allowed = false; reason = "An approval is no longer valid (for example the approver lost their role). Re-submit for approval."; }
    if (a.action === "retry" && allowed && expired) { allowed = false; reason = "The invoice has expired. Create a new revision with a fresh invoice."; }
    const perm = permFor[a.action];
    if (allowed && perm && !hasPermission(role, perm)) { allowed = false; reason = "Your role does not allow this."; }
    return allowed ? { action: a.action, allowed } : { action: a.action, allowed, reason };
  });

  return {
    id: o.id, ref: `PO-${String(o.seq).padStart(4, "0")}`, state, current_revision: o.current_revision,
    counterparty: { id: cp.id, name: cp.name, bound_payee_pubkey: cp.bound_payee_pubkey, verified: !!cp.verified_at },
    amount_msat: rev.amount_msat.toString(), memo: rev.memo, external_ref: rev.external_ref, network: rev.network, invoice: rev.invoice, payment_hash: rev.payment_hash,
    payee_pubkey: rev.payee_pubkey, invoice_expires_at: isoMs(rev.invoice_expires_at), wallet_connection_id: o.wallet_connection_id,
    policy: o.policy_id && b ? { id: b.pol.id, revision: b.pol.revision, required_approvals: o.required_approvals } : null,
    intent_digest: b?.digest ?? null, revision_hash: rev.revision_hash,
    approvals: apps.map(({ row: a, valid, why }) => ({ id: a.id, approver: { user_id: a.approver_user_id, name: a.uname, role: a.approver_role }, decision: a.decision, public_key: a.public_key ?? "", intent_digest: a.intent_digest ?? "", signed_at: isoMs(a.signed_at), reason: a.reason, valid: a.decision === "approved" ? valid : false, revoked_reason: a.decision === "approved" && !valid ? why : null })),
    created_by: maker, created_at: isoMs(o.created_at), updated_at: isoMs(o.updated_at), actions, payment,
    open_incident: inc ? { id: inc.id, obligation_id: inc.obligation_id, kind: inc.kind, severity: inc.severity, status: inc.status, summary: inc.summary, detail: inc.detail, opened_at: isoMs(inc.opened_at), resolved_at: null, resolution: null } : null,
    environment: conn ? (conn.provider_kind === "simulator" ? "SIMULATOR" : "REAL_PROVIDER") : "UNASSIGNED",
    explanation: explain(state, { invoiceExpired: expired, lastRecon: payment?.reconciliation.last_result ?? null, incidentSummary: inc?.summary }),
    _amountLabel: formatMsat(rev.amount_msat), _moneyMayHaveMoved: (MONEY_MAY_HAVE_MOVED as readonly string[]).includes(state),
  };
}
export type ObligationView = NonNullable<Awaited<ReturnType<typeof obligationDto>>>;
export function publicObligation(v: ObligationView) {
  const { _amountLabel: _a, _moneyMayHaveMoved: _m, ...rest } = v;
  return rest;
}

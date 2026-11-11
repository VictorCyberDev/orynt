import { OryntError } from "@orynt/core";
import { effectivePlan } from "./entitlements";
import type { Deps } from "./context";
import { toCsv } from "./csv";

/** Payout report. Amounts are sats/msat only; NO fiat conversion is produced (a fiat figure would be a reference, never a settlement). */
export async function payoutReport(
  d: Deps,
  orgId: string,
  q: { from?: string; to?: string; counterparty_id?: string; state?: string },
) {
  const eff = await effectivePlan(d, orgId);
  const hist = eff.entitlements.history_days;
  let from = q.from ?? null;
  const earliest = hist === -1 ? null : new Date(Date.now() - hist * 86400000).toISOString().slice(0, 10);
  if (earliest && (!from || from < earliest)) from = earliest; // history window is part of the plan
  const rows = (
    await d.pool.query(
      `SELECT o.seq, o.id, o.state, o.created_at, cp.name AS counterparty, r.amount_msat, r.memo, r.external_ref, r.network, r.payment_hash,
            (SELECT a.fee_msat FROM execution_attempts a JOIN payment_intents i ON i.id=a.intent_id WHERE i.obligation_id=o.id AND a.outcome='SUCCEEDED' LIMIT 1) AS fee_msat,
            (SELECT a.settled_at FROM execution_attempts a JOIN payment_intents i ON i.id=a.intent_id WHERE i.obligation_id=o.id AND a.outcome='SUCCEEDED' LIMIT 1) AS settled_at,
            (SELECT string_agg(u.name, '; ') FROM approvals ap JOIN users u ON u.id=ap.approver_user_id WHERE ap.obligation_id=o.id AND ap.revision=o.current_revision AND ap.decision='approved' AND ap.revoked_at IS NULL) AS approvers
     FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id AND r.revision=o.current_revision JOIN counterparties cp ON cp.id=r.counterparty_id
     WHERE o.org_id=$1 AND ($2::date IS NULL OR o.created_at >= $2::date) AND ($3::date IS NULL OR o.created_at < $3::date + 1) AND ($4::uuid IS NULL OR cp.id=$4) AND ($5::text IS NULL OR o.state=$5) ORDER BY o.seq`,
      [orgId, from, q.to ?? null, q.counterparty_id ?? null, q.state ?? null],
    )
  ).rows;
  const settled = rows.filter((r) => r.state === "SETTLED");
  return {
    generated_at: new Date().toISOString(),
    window: { from, to: q.to ?? null, history_days_plan: hist },
    totals: {
      payouts: rows.length,
      settled_count: settled.length,
      settled_msat: settled.reduce((a, r) => a + BigInt(r.amount_msat), 0n).toString(),
      fees_msat: settled.reduce((a, r) => a + BigInt(r.fee_msat ?? 0), 0n).toString(),
      simulated_excluded: rows.filter((r) => r.state === "SIMULATED_SETTLED").length,
    },
    note: "Totals count only real SETTLED payouts. Simulated settlements are listed but never summed. No fiat values are included.",
    rows: rows.map((r) => ({
      ref: `PO-${String(r.seq).padStart(4, "0")}`,
      id: r.id,
      state: r.state,
      created_at: new Date(r.created_at).toISOString(),
      settled_at: r.settled_at ? new Date(r.settled_at).toISOString() : null,
      counterparty: r.counterparty,
      amount_msat: r.amount_msat.toString(),
      fee_msat: r.fee_msat?.toString() ?? null,
      memo: r.memo,
      external_ref: r.external_ref,
      network: r.network,
      payment_hash: r.payment_hash,
      approvers: r.approvers,
    })),
  };
}
export const payoutReportCsv = (rep: Awaited<ReturnType<typeof payoutReport>>) =>
  toCsv([
    [
      "ref",
      "state",
      "created_at",
      "settled_at",
      "counterparty",
      "amount_msat",
      "fee_msat",
      "network",
      "memo",
      "external_ref",
      "payment_hash",
      "approvers",
    ],
    ...rep.rows.map((r) => [
      r.ref,
      r.state,
      r.created_at,
      r.settled_at,
      r.counterparty,
      r.amount_msat,
      r.fee_msat,
      r.network,
      r.memo,
      r.external_ref,
      r.payment_hash,
      r.approvers,
    ]),
  ]);
export async function recipientStatement(d: Deps, orgId: string, counterpartyId: string) {
  const cp = (
    await d.pool.query("SELECT id,name,bound_payee_pubkey FROM counterparties WHERE id=$1 AND org_id=$2", [
      counterpartyId,
      orgId,
    ])
  ).rows[0];
  if (!cp) throw new OryntError("not_found", 404, "Recipient not found.");
  return { recipient: cp, ...(await payoutReport(d, orgId, { counterparty_id: counterpartyId })) };
}

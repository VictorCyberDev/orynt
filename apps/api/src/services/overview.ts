import { isoMs, type Deps } from "./context";
import { formatMsat, type Role, APPROVER_ROLES } from "@orynt/core";

export async function overview(d: Deps, orgId: string, userId: string | undefined, role: Role) {
  const q = (s: string, p: unknown[]) => d.pool.query(s, p);
  const base = `SELECT o.id, o.seq, o.state, o.updated_at, o.state_changed_at, r.created_by, o.required_approvals, r.amount_msat, r.invoice_expires_at, cp.name AS cpname
    FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id AND r.revision=o.current_revision JOIN counterparties cp ON cp.id=r.counterparty_id WHERE o.org_id=$1`;
  const att: Array<{
    kind: string;
    obligation_id: string | null;
    ref: string | null;
    title: string;
    detail: string;
    since: string;
  }> = [];
  const ref = (n: bigint | number) => `PO-${String(n).padStart(4, "0")}`;

  const unresolved = (
    await q(
      base + ` AND o.state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING') ORDER BY o.state_changed_at`,
      [orgId],
    )
  ).rows;
  for (const r of unresolved)
    att.push({
      kind: "unresolved_payment",
      obligation_id: r.id,
      ref: ref(r.seq),
      title: `${ref(r.seq)} · ${r.cpname}: waiting for the wallet's record`,
      detail: `${formatMsat(r.amount_msat)} — a second send is blocked until this is settled or proven not paid.`,
      since: isoMs(r.state_changed_at),
    });
  const failed = (
    await q(base + ` AND o.state='DEFINITIVELY_FAILED' ORDER BY o.state_changed_at DESC LIMIT 10`, [orgId])
  ).rows;
  for (const r of failed)
    att.push({
      kind: "failed_payment",
      obligation_id: r.id,
      ref: ref(r.seq),
      title: `${ref(r.seq)} · ${r.cpname}: failed, proven not paid`,
      detail: `${formatMsat(r.amount_msat)} — retry or create a fresh invoice.`,
      since: isoMs(r.state_changed_at),
    });
  if ((APPROVER_ROLES as readonly string[]).includes(role)) {
    const mine = (
      await q(
        base +
          ` AND o.state='AWAITING_APPROVAL' AND r.created_by <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000') AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.obligation_id=o.id AND a.revision=o.current_revision AND a.approver_user_id=$2::uuid) ORDER BY o.state_changed_at`,
        [orgId, userId ?? null],
      )
    ).rows;
    for (const r of mine)
      att.push({
        kind: "approval_needed",
        obligation_id: r.id,
        ref: ref(r.seq),
        title: `${ref(r.seq)} · ${r.cpname}: needs your approval`,
        detail: `${formatMsat(r.amount_msat)} — review the exact amount and recipient, then sign.`,
        since: isoMs(r.state_changed_at),
      });
  }
  const ready = (await q(base + ` AND o.state='APPROVED' ORDER BY o.state_changed_at`, [orgId])).rows;
  for (const r of ready)
    att.push({
      kind: "ready_to_send",
      obligation_id: r.id,
      ref: ref(r.seq),
      title: `${ref(r.seq)} · ${r.cpname}: approved, ready to send`,
      detail: `${formatMsat(r.amount_msat)} — can be sent exactly once.`,
      since: isoMs(r.state_changed_at),
    });
  const expiring = (
    await q(
      base +
        ` AND o.state IN ('DRAFT','AWAITING_APPROVAL','APPROVED') AND r.invoice_expires_at < now() + interval '30 minutes' ORDER BY r.invoice_expires_at`,
      [orgId],
    )
  ).rows;
  for (const r of expiring)
    att.push({
      kind: "invoice_expiring",
      obligation_id: r.id,
      ref: ref(r.seq),
      title: `${ref(r.seq)} · ${r.cpname}: invoice ${new Date(r.invoice_expires_at) < new Date() ? "expired" : "expiring soon"}`,
      detail: `Expires ${isoMs(r.invoice_expires_at)}. Ask for a fresh invoice.`,
      since: isoMs(r.invoice_expires_at),
    });
  const conns = (await q("SELECT * FROM wallet_connections WHERE org_id=$1 AND status<>'disabled'", [orgId]))
    .rows;
  for (const c of conns)
    if (c.last_health_ok === false)
      att.push({
        kind: "wallet_problem",
        obligation_id: null,
        ref: null,
        title: `Wallet “${c.label}” needs attention`,
        detail: c.last_error ?? "Health check failed.",
        since: isoMs(c.last_health_at ?? c.created_at),
      });

  const counts: Record<string, number> = {};
  for (const r of (
    await q("SELECT state, count(*)::int AS n FROM payout_obligations WHERE org_id=$1 GROUP BY state", [
      orgId,
    ])
  ).rows)
    counts[r.state] = r.n;
  const s7 = (
    await q(
      `SELECT count(*)::int AS n, COALESCE(sum(pi.amount_msat),0)::bigint AS s FROM payment_intents pi JOIN payout_obligations o ON o.id=pi.obligation_id WHERE pi.org_id=$1 AND o.state='SETTLED' AND o.state_changed_at > now() - interval '7 days'`,
      [orgId],
    )
  ).rows[0];
  const blocked = (await q("SELECT count(*)::int AS n FROM blocked_attempts WHERE org_id=$1", [orgId]))
    .rows[0].n;
  return {
    generated_at: isoMs(new Date()),
    attention: att,
    counts,
    settled_last_7d: { count: s7.n, total_msat: s7.s.toString() },
    wallet: {
      connected: conns.length > 0,
      healthy: conns.length ? conns.every((c) => c.last_health_ok !== false) : null,
      simulator_only: conns.length > 0 && conns.every((c) => c.provider_kind === "simulator"),
    },
    duplicates_blocked: blocked,
  };
}

export async function listObligationIds(
  d: Deps,
  orgId: string,
  f: { state?: string; q?: string; cursor?: string; limit: number },
) {
  const states = f.state ? f.state.split(",") : null;
  const rows = (
    await d.pool.query(
      `SELECT o.id, o.seq FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id AND r.revision=o.current_revision JOIN counterparties cp ON cp.id=r.counterparty_id
     WHERE o.org_id=$1 AND ($2::text[] IS NULL OR o.state = ANY($2)) AND ($3::text IS NULL OR cp.name ILIKE '%'||$3||'%' OR r.memo ILIKE '%'||$3||'%' OR r.external_ref ILIKE '%'||$3||'%' OR ('PO-'||lpad(o.seq::text,4,'0')) ILIKE '%'||$3||'%' OR r.payment_hash = lower($3))
     AND ($4::bigint IS NULL OR o.seq < $4) ORDER BY o.seq DESC LIMIT $5`,
      [orgId, states, f.q ?? null, f.cursor ?? null, f.limit + 1],
    )
  ).rows;
  const page = rows.slice(0, f.limit);
  return {
    ids: page.map((r) => r.id as string),
    next: rows.length > f.limit ? String(page[page.length - 1].seq) : null,
  };
}

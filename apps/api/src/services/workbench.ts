import { OryntError, hashCanonical, type Role } from "@orynt/core";
import { isoMs, type Deps } from "./context";
import { obligationDto } from "./dto";

/**
 * Exception workbench: everything an investigator needs about one incident in one place, assembled from the system of record.
 * Nothing here is writable. A payment whose outcome is unknown is described as UNKNOWN — never as failed.
 */
type Ev = { at: string; source: "incident" | "audit" | "attempt" | "reconcile" | "note"; title: string; detail?: unknown; actor?: string };

export async function incidentDetail(d: Deps, orgId: string, role: Role | "system", id: string) {
  const inc = (await d.pool.query("SELECT i.*, u.name AS assignee_name, u.email AS assignee_email FROM incidents i LEFT JOIN users u ON u.id=i.assigned_to WHERE i.id=$1 AND i.org_id=$2", [id, orgId])).rows[0];
  if (!inc) throw new OryntError("not_found", 404, "Incident not found.");
  const timeline: Ev[] = [{ at: isoMs(inc.opened_at), source: "incident", title: `Incident opened (${inc.severity}): ${inc.summary}`, detail: inc.detail }];
  let ob: Awaited<ReturnType<typeof obligationDto>> | null = null;
  let approvals: unknown[] = [], attempts: unknown[] = [], runs: unknown[] = [], audit: Array<Record<string, any>> = [];
  if (inc.obligation_id) {
    ob = await obligationDto(d.pool, orgId, inc.obligation_id, role);
    approvals = (await d.pool.query("SELECT a.revision, a.decision, a.approver_role, u.name AS approver, a.signed_at, a.public_key, a.intent_digest, a.signature, a.reason, a.revoked_at FROM approvals a JOIN users u ON u.id=a.approver_user_id WHERE a.org_id=$1 AND a.obligation_id=$2 ORDER BY a.created_at", [orgId, inc.obligation_id])).rows.map((r) => ({ ...r, signed_at: isoMs(r.signed_at), revoked_at: r.revoked_at ? isoMs(r.revoked_at) : null }));
    attempts = (await d.pool.query("SELECT e.attempt_no, e.outcome, e.provider_status, e.failure_reason, e.started_at, e.dispatched_at, e.finished_at, e.settled_at, e.note, e.provider_ref FROM execution_attempts e JOIN payment_intents p ON p.id=e.intent_id WHERE p.org_id=$1 AND p.obligation_id=$2 ORDER BY p.revision, e.attempt_no", [orgId, inc.obligation_id])).rows;
    runs = (await d.pool.query("SELECT trigger, started_at, finished_at, provider_status, result, detail FROM reconciliation_runs WHERE org_id=$1 AND obligation_id=$2 ORDER BY started_at", [orgId, inc.obligation_id])).rows;
    audit = (await d.pool.query("SELECT seq, at, actor, type, subject, data, hash, prev_hash FROM audit_events WHERE org_id=$1 AND stream=$2 ORDER BY seq", [orgId, `obligation:${inc.obligation_id}`])).rows;
    for (const a of attempts as Array<Record<string, any>>) timeline.push({ at: isoMs(a.started_at), source: "attempt", title: `Attempt ${a.attempt_no}: ${a.outcome}${a.provider_status ? ` (wallet said ${a.provider_status})` : ""}`, detail: { failure_reason: a.failure_reason, note: a.note } });
    for (const r of runs as Array<Record<string, any>>) timeline.push({ at: isoMs(r.started_at), source: "reconcile", title: `Wallet record checked (${r.trigger}): ${r.result ?? "no result"}`, detail: { provider_status: r.provider_status } });
    for (const a of audit) timeline.push({ at: isoMs(a.at), source: "audit", title: a.type, actor: a.actor, detail: a.data });
  }
  const notes = (await d.pool.query("SELECT n.author, n.note, n.created_at FROM incident_notes n WHERE n.incident_id=$1 ORDER BY n.created_at", [id])).rows.map((n) => ({ author: n.author, note: n.note, at: isoMs(n.created_at) }));
  for (const n of notes) timeline.push({ at: n.at, source: "note", title: "Investigation note", actor: n.author, detail: n.note });
  if (inc.resolved_at) timeline.push({ at: isoMs(inc.resolved_at), source: "incident", title: `Resolved by ${inc.resolved_by}`, detail: inc.resolution });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const unresolved = !!ob && ["DISPATCHING", "PENDING", "UNKNOWN", "RECONCILING"].includes(ob.state);
  const lastRun = (runs as Array<Record<string, any>>).at(-1);
  return {
    incident: { id: inc.id, kind: inc.kind, severity: inc.severity, status: inc.status, summary: inc.summary, opened_at: isoMs(inc.opened_at), resolved_at: inc.resolved_at ? isoMs(inc.resolved_at) : null, resolved_by: inc.resolved_by, resolution: inc.resolution, assigned_to: inc.assigned_to ? { id: inc.assigned_to, name: inc.assignee_name, email: inc.assignee_email } : null },
    obligation: ob,
    // the plain statement an investigator should rely on
    payment_truth: ob ? { state: ob.state, explanation: ob.explanation, second_payment_blocked: unresolved, may_have_succeeded: unresolved, last_reconciliation: lastRun ? { at: isoMs(lastRun.started_at), result: lastRun.result, provider_status: lastRun.provider_status } : null } : null,
    approvals, attempts, reconciliation_runs: runs, notes, timeline,
    safe_actions: ob ? ob.actions : [],
    payment_id: ob?.payment?.id ?? null,
    _audit: audit,
  };
}

/** A self-describing evidence bundle with an integrity hash over its canonical form. It is a record of what Orynt knew, not a proof of payment — receipts are the proof. */
export async function incidentEvidence(d: Deps, orgId: string, role: Role | "system", id: string) {
  const { _audit, ...detail } = await incidentDetail(d, orgId, role, id);
  const raw = { evidence_version: 1, generated_at: new Date().toISOString(), orgId, ...detail, audit_chain: _audit.map((a) => ({ seq: String(a.seq), at: isoMs(a.at), actor: a.actor, type: a.type, hash: a.hash, prev_hash: a.prev_hash })),
    note: "Evidence export of an incident. The audit_chain hashes can be re-verified with GET /v1/audit/verify. A payment's proof is its signed receipt, not this file." };
  const body = JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>; // plain JSON: dates and bigints flattened before hashing
  return { ...body, integrity: { algorithm: "sha256(canonical json)", sha256: hashCanonical(body as never) } };
}

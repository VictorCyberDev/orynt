import type { Tx } from "../db/pool";
import { appendAudit } from "./audit";
import { emitEvent } from "./webhooks";
import { notifyIncidentOpened, notifyIncidentResolved } from "./notify";

export async function openIncident(
  tx: Tx,
  orgId: string,
  obligationId: string,
  kind: string,
  severity: "info" | "warning" | "critical",
  summary: string,
  detail: Record<string, unknown> = {},
) {
  const r = await tx.query(
    "INSERT INTO incidents(org_id,obligation_id,kind,severity,summary,detail) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (obligation_id, kind) WHERE status='open' AND obligation_id IS NOT NULL DO NOTHING RETURNING id",
    [
      orgId,
      obligationId,
      kind,
      severity,
      summary,
      JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    ],
  );
  if (r.rowCount) {
    await appendAudit(
      tx,
      orgId,
      `obligation:${obligationId}`,
      "system:incidents",
      "incident.opened",
      `obligation:${obligationId}`,
      { incident_id: r.rows[0].id, kind, summary },
    );
    await emitEvent(tx, orgId, "incident.opened", {
      incident_id: r.rows[0].id,
      obligation_id: obligationId,
      kind,
      severity,
      summary,
    });
    await notifyIncidentOpened(tx, orgId, summary, severity);
  }
}
export async function resolveIncidents(
  tx: Tx,
  orgId: string,
  obligationId: string,
  resolution: string,
  by = "system:reconciler",
) {
  const r = await tx.query(
    "UPDATE incidents SET status='resolved', resolved_at=now(), resolved_by=$3, resolution=$4 WHERE org_id=$1 AND obligation_id=$2 AND status='open' RETURNING id, kind",
    [orgId, obligationId, by, resolution],
  );
  for (const i of r.rows) {
    await appendAudit(
      tx,
      orgId,
      `obligation:${obligationId}`,
      by,
      "incident.resolved",
      `obligation:${obligationId}`,
      { incident_id: i.id, kind: i.kind, resolution },
    );
    await emitEvent(tx, orgId, "incident.resolved", {
      incident_id: i.id,
      obligation_id: obligationId,
      resolution,
    });
    await notifyIncidentResolved(tx, orgId, i.kind.replace(/_/g, " "), resolution);
  }
}

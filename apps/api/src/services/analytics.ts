import type { Deps } from "./context";
/** Privacy-conscious product analytics: an event NAME and an org id, nothing else — no user id, no amounts, no payee data. */
export async function track(d: Pick<Deps, "pool">, name: string, orgId: string | null) {
  try {
    await d.pool.query("INSERT INTO analytics_events(org_id,name) VALUES ($1,$2)", [orgId, name]);
  } catch {
    /* analytics must never break a request */
  }
}
export const orgFunnel = async (d: Deps, orgId: string) =>
  (
    await d.pool.query(
      "SELECT name, count(*)::int AS n, min(at) AS first_at FROM analytics_events WHERE org_id=$1 GROUP BY name ORDER BY min(at)",
      [orgId],
    )
  ).rows;

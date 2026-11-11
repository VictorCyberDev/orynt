import { Link } from "react-router-dom";
import { api, useAsync } from "../api";
import { Badge, Card, EmptyState, ErrorNote, Skeleton } from "../components/ui";
import { ago } from "../format";

export function Incidents() {
  const l = useAsync(() => api.incidents.list(), []);
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Incidents</h1>
          <p className="lede">Moments when Orynt couldn't be certain, and what it did about it.</p>
        </div>
      </header>
      {l.error ? <ErrorNote>{l.error}</ErrorNote> : null}
      {l.loading && !l.data ? <Skeleton rows={3} /> : null}
      {l.data && l.data.data.length === 0 ? (
        <Card>
          <EmptyState title="No incidents">
            If a wallet's answer is ever lost, Orynt blocks a second send, opens an incident here and checks
            the wallet's own record.
          </EmptyState>
        </Card>
      ) : null}
      {l.data?.data.length ? (
        <Card>
          <ul className="queue">
            {l.data.data.map((i) => (
              <li key={i.id}>
                <Badge
                  tone={i.status === "resolved" ? "ok" : i.severity === "critical" ? "danger" : "unknown"}
                >
                  {i.status === "resolved" ? "Resolved" : i.severity}
                </Badge>
                <div>
                  <strong>{i.summary}</strong>
                  <p className="muted">
                    {i.kind.replace(/_/g, " ")} · opened {ago(i.opened_at)}
                    {i.resolution ? ` · ${i.resolution}` : ""}
                  </p>
                </div>
                <Link className="btn btn-primary" to={`/incidents/${i.id}`}>
                  Investigate
                </Link>
                {i.obligation_id ? (
                  <Link className="btn btn-secondary" to={`/payouts/${i.obligation_id}`}>
                    Open payout
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

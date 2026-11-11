import { useState } from "react";
import { Link } from "react-router-dom";
import type { Obligation } from "@orynt/sdk";
import { api, useAsync, useSession } from "../api";
import { ApproveDialog } from "../components/Approve";
import { Button, Card, EmptyState, ErrorNote, Skeleton, Note } from "../components/ui";
import { sats, until, ago } from "../format";

export function Approvals() {
  const { me } = useSession();
  const l = useAsync(() => api.obligations.list({ state: "AWAITING_APPROVAL", limit: 50 }), []);
  const [sel, setSel] = useState<Obligation | null>(null);
  const canApprove = me && ["owner", "admin", "approver"].includes(me.role);
  const mine = (l.data?.data ?? []).filter(
    (o) => o.created_by.id !== me?.user.id && !o.approvals.some((a) => a.approver.user_id === me?.user.id),
  );
  const others = (l.data?.data ?? []).filter((o) => !mine.includes(o));
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Approvals</h1>
          <p className="lede">
            Review the exact amount and recipient, then sign. Your signature binds only these terms.
          </p>
        </div>
      </header>
      {!canApprove ? (
        <Note tone="info" title="View only.">
          Your role ({me?.role}) can't approve payments. Ask an approver or admin.
        </Note>
      ) : null}
      {!me?.approval_key.registered && canApprove ? (
        <Note tone="warn" title="Set up your approval key.">
          You'll be asked when you first approve — it takes one click. <Link to="/settings">Settings</Link>
        </Note>
      ) : null}
      {l.error ? <ErrorNote>{l.error}</ErrorNote> : null}
      {l.loading && !l.data ? <Skeleton rows={3} /> : null}
      {l.data && l.data.data.length === 0 ? (
        <Card>
          <EmptyState title="Nothing waiting for approval">
            When someone submits a payout, it appears here.
          </EmptyState>
        </Card>
      ) : null}
      {mine.length ? (
        <Card title="Waiting for you" id="mine">
          <ul className="queue">
            {mine.map((o) => (
              <Row
                key={o.id}
                o={o}
                action={
                  canApprove ? (
                    <Button variant="primary" onClick={() => setSel(o)}>
                      Review &amp; sign
                    </Button>
                  ) : null
                }
              />
            ))}
          </ul>
        </Card>
      ) : null}
      {others.length ? (
        <Card title="Submitted by you or already signed by you" id="oth">
          <ul className="queue">
            {others.map((o) => (
              <Row
                key={o.id}
                o={o}
                action={
                  <Link className="btn btn-secondary" to={`/payouts/${o.id}`}>
                    Open
                  </Link>
                }
              />
            ))}
          </ul>
        </Card>
      ) : null}
      {sel ? (
        <ApproveDialog
          ob={sel}
          onClose={() => setSel(null)}
          onDone={() => {
            setSel(null);
            l.reload();
          }}
        />
      ) : null}
    </div>
  );
}
function Row({ o, action }: { o: Obligation; action: React.ReactNode }) {
  const valid = o.approvals.filter((a) => a.valid).length;
  return (
    <li>
      <div>
        <strong>
          {o.ref} · {o.counterparty.name}
        </strong>
        <p>
          {sats(o.amount_msat)} · {valid}/{o.policy?.required_approvals ?? "?"} approvals · invoice{" "}
          {until(o.invoice_expires_at)}
        </p>
        <small>
          Submitted {ago(o.updated_at)}
          {o.environment === "SIMULATOR" ? " · practice wallet" : ""}
        </small>
      </div>
      <div className="row-actions">
        <Link to={`/payouts/${o.id}`}>Details</Link>
        {action}
      </div>
    </li>
  );
}

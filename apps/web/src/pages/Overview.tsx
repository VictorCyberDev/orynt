import { Link } from "react-router-dom";
import { api, useAsync, usePolling } from "../api";
import { useI18n } from "../i18n";
import { Card, EmptyState, ErrorNote, Skeleton, Badge, type Tone } from "../components/ui";
import { sats, ago } from "../format";

const KIND: Record<string, { tone: Tone; label: string; cta: string }> = {
  unresolved_payment: { tone: "unknown", label: "Checking", cta: "Review" }, approval_needed: { tone: "info", label: "Needs approval", cta: "Review & sign" },
  ready_to_send: { tone: "ok", label: "Ready", cta: "Open" }, failed_payment: { tone: "danger", label: "Failed", cta: "Open" },
  invoice_expiring: { tone: "warn", label: "Invoice", cta: "Open" }, wallet_problem: { tone: "warn", label: "Wallet", cta: "Open wallets" },
};

export function Overview() {
  const { t } = useI18n();
  const o = useAsync(() => api.overview(), []);
  const onb = useAsync(() => api.request<{ completed: boolean; progress: { done: number; total: number }; next: string | null }>("GET", "/v1/onboarding").then((r) => r.data), []);
  usePolling(o.reload, 8000);
  const d = o.data;
  const settledStates = ["SETTLED", "SIMULATED_SETTLED"];
  const total = d ? Object.values(d.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="page">
      <header className="page-h"><div><h1>{t("home.title", "Your payments, under control.")}</h1><p className="lede">What needs you now, and the truth about everything in motion.</p></div><Link className="btn btn-primary" to="/payouts/new">{t("btn.newPayout", "New payout")}</Link></header>
      {onb.data && !onb.data.completed ? <Card><div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><strong>Finish setting up</strong><p className="muted">{onb.data.progress.done} of {onb.data.progress.total} steps done.</p></div><Link className="btn btn-secondary" to="/start">Continue setup</Link></div></Card> : null}
      {o.error ? <ErrorNote>{o.error}</ErrorNote> : null}
      {o.loading && !d ? <Skeleton rows={4} /> : null}
      {d ? (
        <>
          <Card title={t("home.attention", "Needs attention")} id="att" aside={<Badge tone={d.attention.length ? "info" : "ok"}>{d.attention.length ? `${d.attention.length} open` : "All clear"}</Badge>}>
            {d.attention.length === 0 ? (
              total === 0 ? <EmptyState title="No payouts yet" action={<Link className="btn btn-primary" to="/guide">Start the 3-step guide</Link>}>Connect a wallet, create your approval key, then make your first payout. Everything here is calculated from real records — nothing is placeholder data.</EmptyState>
                : <p className="calm">{t("home.empty", "Nothing needs your attention.")} Payments in motion will appear here the moment they need you.</p>
            ) : (
              <ul className="queue">
                {d.attention.map((a, i) => (
                  <li key={i} className={`q-${a.kind}`}>
                    <Badge tone={KIND[a.kind]?.tone}>{KIND[a.kind]?.label}</Badge>
                    <div><strong>{a.title}</strong><p>{a.detail}</p><small>{ago(a.since)}</small></div>
                    <Link className="btn btn-secondary" to={a.obligation_id ? `/payouts/${a.obligation_id}` : "/connections"}>{KIND[a.kind]?.cta}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="grid3">
            <Card title="Settled, last 7 days" id="s7"><p className="big">{sats(d.settled_last_7d.total_msat)}</p><p className="muted">{d.settled_last_7d.count} payout{d.settled_last_7d.count === 1 ? "" : "s"} with proof of payment</p></Card>
            <Card title="Second sends blocked" id="dup"><p className="big">{d.duplicates_blocked}</p><p className="muted">Attempts to send a payment twice that Orynt refused.</p></Card>
            <Card title="Wallet" id="w">{d.wallet.connected ? <><p className="big">{d.wallet.healthy === false ? "Needs attention" : "Connected"}</p><p className="muted">{d.wallet.simulator_only ? "Practice wallet only — no real value moves." : "Real node on a test network."}</p></> : <><p className="big">Not connected</p><p className="muted"><Link to="/connections">Connect a wallet</Link> to create payouts.</p></>}</Card>
          </div>
          <Card title="Where everything stands" id="cnt">
            {total === 0 ? <p className="muted">No payouts yet.</p> : (
              <ul className="chips">
                {Object.entries(d.counts).sort().map(([s, n]) => <li key={s}><Link to={`/payouts?state=${s}`}><span className="n">{n}</span>{s.replace(/_/g, " ").toLowerCase()}</Link></li>)}
              </ul>
            )}
            <p className="muted small">Counts and sums are live database queries{settledStates.length ? "" : ""}; this workspace has no demo data unless it was created by the seed script and labelled so.</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}

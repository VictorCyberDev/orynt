import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useAsync } from "../api";
import { Card, EmptyState, ErrorNote, Skeleton, StateBadge, Badge } from "../components/ui";
import { sats, ago } from "../format";

const FILTERS: Array<[string, string]> = [["", "All"], ["AWAITING_APPROVAL", "Awaiting approval"], ["APPROVED", "Ready to send"], ["UNKNOWN,RECONCILING,PENDING,DISPATCHING", "In motion"], ["SETTLED,SIMULATED_SETTLED", "Settled"], ["DEFINITIVELY_FAILED", "Failed"], ["DRAFT", "Drafts"]];

export function Payouts() {
  const [sp, setSp] = useSearchParams();
  const state = sp.get("state") ?? "";
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const list = useAsync(() => api.obligations.list({ state: state || undefined, q: applied || undefined, limit: 50 }), [state, applied]);
  return (
    <div className="page">
      <header className="page-h"><div><h1>Payouts</h1><p className="lede">Every obligation, with the truth about where it stands.</p></div><Link className="btn btn-primary" to="/payouts/new">New payout</Link></header>
      <div className="toolbar">
        <div role="group" aria-label="Filter by status" className="seg">
          {FILTERS.map(([v, l]) => <button key={v} className={state === v ? "on" : ""} aria-pressed={state === v} onClick={() => setSp(v ? { state: v } : {})}>{l}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }} role="search" className="search">
          <label htmlFor="q" className="visually-hidden">Search payouts</label>
          <input id="q" type="search" placeholder="Search recipient, memo, reference or hash" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>
      {list.error ? <ErrorNote>{list.error}</ErrorNote> : null}
      {list.loading && !list.data ? <Skeleton rows={5} /> : null}
      {list.data && list.data.data.length === 0 ? <Card><EmptyState title={applied || state ? "Nothing matches" : "No payouts yet"} action={<Link className="btn btn-primary" to="/payouts/new">Create the first payout</Link>}>{applied || state ? "Try clearing the filter or search." : "A payout is an obligation to pay one recipient an exact amount, with approval and proof."}</EmptyState></Card> : null}
      {list.data && list.data.data.length > 0 ? (
        <div className="table-wrap" role="region" aria-label="Payouts" tabIndex={0}>
          <table className="table">
            <thead><tr><th>Payout</th><th>Recipient</th><th className="num">Amount</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {list.data.data.map((o) => (
                <tr key={o.id}>
                  <td data-label="Payout"><Link to={`/payouts/${o.id}`}><strong>{o.ref}</strong></Link><div className="muted small">{o.memo || o.external_ref || "—"}</div></td>
                  <td data-label="Recipient">{o.counterparty.name}</td>
                  <td data-label="Amount" className="num">{sats(o.amount_msat)}</td>
                  <td data-label="Status"><StateBadge state={o.state} />{o.environment === "SIMULATOR" ? <> <Badge tone="sim">Practice</Badge></> : null}</td>
                  <td data-label="Updated" className="muted">{ago(o.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

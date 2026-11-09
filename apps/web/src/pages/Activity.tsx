import { useState } from "react";
import { api, errorText, useAsync } from "../api";
import { Badge, Button, Card, EmptyState, ErrorNote, Mono, Note, Skeleton } from "../components/ui";
import { when } from "../format";

export function Activity() {
  const l = useAsync(() => api.audit.list({ limit: 100 }), []);
  const [v, setV] = useState<{ ok: boolean; entries: number; streams: number; broken: unknown[]; note: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <div className="page">
      <header className="page-h"><div><h1>Activity</h1><p className="lede">A tamper-evident record of every decision. Each entry commits to the one before it.</p></div>
        <Button busy={busy} onClick={async () => { setBusy(true); setErr(null); try { setV(await api.audit.verify()); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } }}>Verify the chain</Button></header>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {v ? <Note tone={v.ok ? "ok" : "danger"} title={v.ok ? `Chain intact — ${v.entries} entries in ${v.streams} streams re-hashed.` : "Chain broken."}>{v.note}{!v.ok ? <pre className="mono small">{JSON.stringify(v.broken, null, 2)}</pre> : null}</Note> : null}
      {l.loading && !l.data ? <Skeleton rows={5} /> : null}
      {l.data && !l.data.data.length ? <Card><EmptyState title="No activity yet" /></Card> : null}
      {l.data?.data.length ? <div className="table-wrap" role="region" aria-label="Audit log" tabIndex={0}><table className="table"><thead><tr><th>When</th><th>What</th><th>Who</th><th>Stream</th><th>Entry hash</th></tr></thead><tbody>
        {l.data.data.map((e) => <tr key={e.stream + e.seq}><td data-label="When">{when(e.at)}</td><td data-label="What"><strong>{e.type}</strong></td><td data-label="Who">{e.actor.startsWith("user:") ? "team member" : e.actor}</td><td data-label="Stream"><Badge>{e.stream === "org" ? "workspace" : e.stream.slice(0, 20) + "…"}</Badge> #{e.seq}</td><td data-label="Entry hash"><Mono value={e.hash} n={6} /></td></tr>)}</tbody></table></div> : null}
    </div>
  );
}

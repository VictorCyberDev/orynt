import { useState } from "react";
import type { ConnectionT } from "@orynt/sdk";
import { api, errorText, useAsync } from "../api";
import { Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Mono, Note, Skeleton, toast } from "../components/ui";
import { ago } from "../format";

export function Connections() {
  const l = useAsync(() => api.connections.list(), []);
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const check = async (c: ConnectionT) => { setBusy(c.id); try { await api.connections.check(c.id); toast("ok", "Wallet re-checked."); l.reload(); } catch (e) { toast("danger", errorText(e)); } finally { setBusy(null); } };
  const disable = async (c: ConnectionT) => { setBusy(c.id); try { await api.request("DELETE", `/v1/connections/${c.id}`); toast("ok", "Wallet disconnected."); l.reload(); } catch (e) { toast("danger", errorText(e)); } finally { setBusy(null); } };
  const tone = (v: string) => (v === "true" ? "ok" : v === "false" ? "danger" : "warn");
  return (
    <div className="page">
      <header className="page-h"><div><h1>Wallets</h1><p className="lede">The wallet pays; Orynt decides whether it may and keeps the record.</p></div><Button variant="primary" onClick={() => setAdd(true)}>Connect a wallet</Button></header>
      {l.error ? <ErrorNote>{l.error}</ErrorNote> : null}
      {l.loading && !l.data ? <Skeleton rows={3} /> : null}
      {l.data && l.data.data.length === 0 ? <Card><EmptyState title="No wallet connected" action={<Button variant="primary" onClick={() => setAdd(true)}>Connect a wallet</Button>}>Start with the practice wallet to explore with no funds.</EmptyState></Card> : null}
      {l.data?.data.map((c) => (
        <Card key={c.id} title={<>{c.label} {c.is_simulator ? <Badge tone="sim">Practice · simulator</Badge> : <Badge>{c.kind.toUpperCase()}</Badge>} <Badge>{c.network}</Badge> {c.status !== "active" ? <Badge tone="danger">{c.status}</Badge> : null}</>} id={`c-${c.id}`}
          aside={<div className="actions"><Button disabled={busy === c.id || c.status === "disabled"} onClick={() => check(c)}>Re-check</Button>{c.status !== "disabled" ? <Button variant="ghost" onClick={() => disable(c)}>Disconnect</Button> : null}</div>}>
          <dl className="summary">
            <dt>Node</dt><dd>{c.node_pubkey ? <Mono value={c.node_pubkey} /> : <span className="muted">none (simulator)</span>}</dd>
            <dt>Health</dt><dd>{c.health.ok === null ? "not checked" : c.health.ok ? <Badge tone="ok">healthy</Badge> : <Badge tone="danger">problem</Badge>} <span className="muted small">{c.health.checked_at ? `checked ${ago(c.health.checked_at)}` : ""}{c.health.error ? ` · ${c.health.error}` : ""}</span></dd>
            <dt>Discovered permissions</dt><dd><span>Send payments: <Badge tone={tone(c.capabilities.can_send)}>{c.capabilities.can_send === "true" ? "yes" : c.capabilities.can_send === "false" ? "no" : "unknown"}</Badge></span> <span>Look up payments: <Badge tone={tone(c.capabilities.can_lookup)}>{c.capabilities.can_lookup === "true" ? "yes" : c.capabilities.can_lookup === "false" ? "no" : "unknown"}</Badge></span>
              {c.capabilities.notes.map((n) => <div key={n} className="muted small">{n}</div>)}{c.capabilities.discovered_at ? <div className="muted small">Discovered {ago(c.capabilities.discovered_at)} — Orynt asks the wallet; it does not assume.</div> : null}</dd>
            <dt>Stored credentials</dt><dd className="muted small">{Object.entries(c.config_summary).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</dd>
          </dl>
        </Card>
      ))}
      {add ? <AddDialog onClose={() => setAdd(false)} onDone={() => { setAdd(false); l.reload(); }} /> : null}
    </div>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<"simulator" | "lnd">("simulator");
  const [label, setLabel] = useState("Practice wallet");
  const [url, setUrl] = useState("https://127.0.0.1:8081");
  const [mac, setMac] = useState(""); const [cert, setCert] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.request("POST", "/v1/connections", { body: { label, kind, ...(kind === "lnd" ? { lnd: { rest_url: url, macaroon_hex: mac.trim(), tls_cert_pem: cert.trim() || undefined } } : {}) } }); toast("ok", "Wallet connected."); onDone(); } catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  };
  return (
    <Dialog title="Connect a wallet" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="seg" role="group" aria-label="Wallet type"><button type="button" className={kind === "simulator" ? "on" : ""} aria-pressed={kind === "simulator"} onClick={() => { setKind("simulator"); setLabel("Practice wallet"); }}>Practice wallet</button><button type="button" className={kind === "lnd" ? "on" : ""} aria-pressed={kind === "lnd"} onClick={() => { setKind("lnd"); setLabel("Regtest LND"); }}>LND node (REST)</button></div>
        {kind === "simulator" ? <Note tone="info" title="No real value moves.">The practice wallet simulates payments so you can try approvals and exceptions. Its receipts are labelled “Simulated”.</Note> : <Note tone="warn" title="Use a least-privilege credential.">Bake a macaroon with only <code>offchain:read</code>, <code>offchain:write</code> and <code>info:read</code>. Never paste an admin macaroon or a seed phrase. This build accepts regtest/test networks only. The credential is encrypted at rest; Orynt never shows it again.</Note>}
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        <Field label="Name" htmlFor="c-label"><input id="c-label" required value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        {kind === "lnd" ? <>
          <Field label="REST address" htmlFor="c-url" hint="e.g. https://127.0.0.1:8081"><input id="c-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Macaroon (hex)" htmlFor="c-mac"><input id="c-mac" required autoComplete="off" className="mono" value={mac} onChange={(e) => setMac(e.target.value)} /></Field>
          <Field label="TLS certificate (PEM, to pin a self-signed cert)" htmlFor="c-cert"><textarea id="c-cert" rows={4} className="mono" value={cert} onChange={(e) => setCert(e.target.value)} /></Field></> : null}
        <div className="actions"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" busy={busy}>Connect &amp; check</Button></div>
      </form>
    </Dialog>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sha256Hex, hexToBytes } from "@orynt/core";
import type { Obligation } from "@orynt/sdk";
import { api, errorText, useAsync, usePolling, useSession } from "../api";
import { ApproveDialog } from "../components/Approve";
import { Badge, Button, Card, Dialog, ErrorNote, Field, Mono, Note, Skeleton, StateBadge, toast } from "../components/ui";
import { ago, msatLabel, sats, until, when } from "../format";
import { useI18n } from "../i18n";

const AUDIT_LABEL: Record<string, string> = {
  "obligation.created": "Created", "obligation.revised": "Terms revised", "obligation.submitted": "Submitted for approval", "obligation.approval_signed": "Approval signed",
  "obligation.approved": "Fully approved", "obligation.rejected": "Rejected", "obligation.cancelled": "Cancelled", "payment.reserved": "Send reserved — a second send is now blocked",
  "payment.dispatching": "Handed to the wallet", "payment.pending": "Wallet is routing the payment", "payment.unknown": "Wallet's answer was lost — checking its record",
  "payment.reconciling": "Asked the wallet for its record", "payment.lookup_not_found": "Wallet has no record (yet)", "payment.settled": "Settled — preimage verified",
  "payment.failed": "Failed — proven not paid", "payment.confirmed_not_sent": "Operator confirmed it was never sent", "payment.reservation_released": "Reservation released (never dispatched)",
  "incident.opened": "Incident opened", "incident.resolved": "Incident resolved", "receipt.issued": "Receipt issued",
};
type Action = { action: string; allowed: boolean; reason?: string };

export function PayoutDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { me } = useSession();
  const ob = useAsync(() => api.obligations.get(id!), [id]);
  const audit = useAsync(() => api.audit.list({ stream: `obligation:${id}`, limit: 100 }), [id]);
  const o = ob.data;
  const inMotion = !!o && ["DISPATCHING", "PENDING", "UNKNOWN", "RECONCILING", "EXECUTION_RESERVED"].includes(o.state);
  const refresh = useCallback(() => { ob.reload(); audit.reload(); }, [ob, audit]);
  usePolling(refresh, 3000, inMotion);
  const [dlg, setDlg] = useState<null | "approve" | "reject" | "cancel" | "edit" | "confirm">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name); setErr(null);
    try { await fn(); if (ok) toast("ok", ok); refresh(); } catch (e) { setErr(errorText(e)); refresh(); } finally { setBusy(null); }
  };
  if (ob.loading && !o) return <div className="page"><Skeleton rows={6} /></div>;
  if (!o) return <div className="page"><ErrorNote>{ob.error ?? "Payout not found."}</ErrorNote><Link to="/payouts">Back to payouts</Link></div>;
  const act = (n: string): Action => (o.actions as Action[]).find((a) => a.action === n) ?? { action: n, allowed: false };
  const unresolved = o.state === "UNKNOWN" || o.state === "RECONCILING";
  const preimageOk = o.payment?.settlement ? sha256Hex(hexToBytes(o.payment.settlement.preimage)) === o.payment.payment_hash : null;

  const doSend = () => run("send", async () => {
    const r = await api.obligations.execute(o.id);
    if (!r.certain) toast("warn", "The wallet's answer didn't come back. Nothing is marked failed — Orynt is checking the wallet's record.");
    else if (r.obligation.state === "SETTLED") toast("ok", "Settled with proof of payment.");
  });
  const download = async () => {
    try { const r = await api.payments.receipt(o.payment!.id); const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `orynt-receipt-${o.ref}.json`; a.click(); URL.revokeObjectURL(url); } catch (e) { setErr(errorText(e)); }
  };
  const approvalsValid = o.approvals.filter((a) => a.valid).length;
  const required = o.policy?.required_approvals ?? 0;
  const disabledNote = (a: Action) => (!a.allowed && a.reason ? <p className="why" id={`why-${a.action}`}>{a.reason}</p> : null);

  return (
    <div className="page detail">
      <nav aria-label="Breadcrumb" className="crumbs"><Link to="/payouts">Payouts</Link> / {o.ref}</nav>
      <header className="page-h">
        <div>
          <h1>{o.counterparty.name}</h1>
          <p className="amount"><span className="big">{sats(o.amount_msat)}</span> <span className="muted mono small">{msatLabel(o.amount_msat)}</span></p>
          <p className="badges"><StateBadge state={o.state} /><Badge>{o.network}</Badge>{o.environment === "SIMULATOR" ? <Badge tone="sim">Practice wallet · no real value</Badge> : null}<span className="muted small">{o.ref} · revision {o.current_revision}</span></p>
        </div>
      </header>

      <section className={`status-panel tone-${unresolved ? "unknown" : o.state === "SETTLED" ? "ok" : o.state === "DEFINITIVELY_FAILED" ? "danger" : o.state === "SIMULATED_SETTLED" ? "sim" : "info"}`} aria-labelledby="sp-h" aria-live="polite">
        <div className={`pulse ${unresolved ? "on" : ""}`} aria-hidden="true" />
        <div>
          <h2 id="sp-h">{o.explanation.headline}</h2>
          <div className="kn">
            <div><h3>{t("known", "What we know")}</h3><ul>{o.explanation.known.map((k) => <li key={k}><span aria-hidden="true">✓</span> {k}</li>)}</ul></div>
            {o.explanation.unknown.length ? <div><h3>{t("unknown", "What we don't know yet")}</h3><ul>{o.explanation.unknown.map((k) => <li key={k}><span aria-hidden="true">?</span> {k}</li>)}</ul></div> : null}
          </div>
          <p className="next"><strong>{t("next", "Next")}:</strong> {o.explanation.next}</p>
          {unresolved ? <p className="why-blocked"><strong>Why “Send” is off:</strong> the first attempt may already have paid. Sending again could pay twice, and a payment can't be taken back. Orynt will only unlock this when the wallet's own record proves what happened.</p> : null}
        </div>
      </section>
      {err ? <ErrorNote>{err}</ErrorNote> : null}

      <Card title="What you can do now" id="actions">
        <div className="actions wrap">
          {act("submit").allowed ? <Button variant="primary" busy={busy === "submit"} onClick={() => run("submit", () => api.obligations.submit(o.id), "Submitted for approval.")}>{t("btn.submit", "Submit for approval")}</Button> : null}
          {act("approve").allowed && me?.approval_key ? <Button variant="primary" onClick={() => setDlg("approve")}>{t("btn.approve", "Review & approve")}</Button> : null}
          {!["SETTLED", "SIMULATED_SETTLED", "REJECTED", "CANCELLED", "DEFINITIVELY_FAILED", "DRAFT"].includes(o.state) ? <Button variant="primary" disabled={!act("execute").allowed} aria-describedby="why-execute" busy={busy === "send"} onClick={doSend}>{t("btn.send", "Send payment")}</Button> : null}
          {unresolved ? <Button variant="primary" disabled={!act("reconcile").allowed} busy={busy === "recon"} onClick={() => run("recon", () => api.payments.reconcile(o.payment!.id), "Asked the wallet for its record.")}>{t("btn.checkWallet", "Check the wallet's record now")}</Button> : null}
          {o.state === "DEFINITIVELY_FAILED" ? <Button variant="primary" disabled={!act("retry").allowed} aria-describedby="why-retry" busy={busy === "retry"} onClick={() => run("retry", () => api.payments.retry(o.payment!.id))}>Retry payment</Button> : null}
          {unresolved ? <Button variant="danger" disabled={!act("confirm_not_sent").allowed} aria-describedby="why-confirm_not_sent" onClick={() => setDlg("confirm")}>Confirm it was never sent</Button> : null}
          {act("edit").allowed ? <Button onClick={() => setDlg("edit")}>Edit terms</Button> : null}
          {act("reject").allowed ? <Button onClick={() => setDlg("reject")}>Reject</Button> : null}
          {act("cancel").allowed ? <Button variant="ghost" onClick={() => setDlg("cancel")}>Cancel payout</Button> : null}
          {o.state === "SETTLED" || o.state === "SIMULATED_SETTLED" ? <Button variant="primary" onClick={download}>{t("btn.receipt", "Download receipt")}</Button> : null}
        </div>
        {(["execute", "retry", "confirm_not_sent"] as const).map((n) => (o.state !== "APPROVED" || n !== "execute") ? disabledNote(act(n)) : disabledNote(act(n)))}
        {act("approve").allowed && (o.created_by.id === me?.user.id) ? <p className="why">You created this payout, so policy asks someone else to approve it.</p> : null}
      </Card>

      <div className="cols">
        <div>
          <Card title="Terms" id="terms">
            <dl className="summary">
              <dt>Recipient</dt><dd>{o.counterparty.name} {o.counterparty.verified ? <Badge tone="ok">verified</Badge> : null}<div className="muted small">{o.counterparty.bound_payee_pubkey ? <>Bound to node <Mono value={o.counterparty.bound_payee_pubkey} n={8} /></> : "Not bound to a node key yet"}</div></dd>
              <dt>Invoice issued by</dt><dd><Mono value={o.payee_pubkey} n={10} /></dd>
              <dt>Invoice expires</dt><dd>{when(o.invoice_expires_at)} <span className="muted">({until(o.invoice_expires_at)})</span></dd>
              <dt>For</dt><dd>{o.memo || "—"}{o.external_ref ? <span className="muted"> · ref {o.external_ref}</span> : null}</dd>
              <dt>Payment hash</dt><dd><Mono value={o.payment_hash} n={10} /></dd>
              {o.intent_digest ? <><dt>Approval digest</dt><dd><Mono value={o.intent_digest} n={10} /></dd></> : null}
              <dt>Created</dt><dd>{when(o.created_at)} by {o.created_by.name}</dd>
            </dl>
          </Card>
          <Card title="Approvals" id="appr" aside={o.policy ? <Badge tone={approvalsValid >= required ? "ok" : "info"}>{approvalsValid} of {required} valid</Badge> : <Badge>Not submitted</Badge>}>
            {o.approvals.length === 0 ? <p className="muted">No approvals yet.{o.policy ? ` ${required} required by policy.` : ""}</p> : (
              <ul className="plain">{o.approvals.map((a) => <li key={a.id}><strong>{a.approver.name}</strong> <span className="muted">({a.approver.role})</span> — {a.decision === "approved" ? (a.valid ? <Badge tone="ok">valid signature</Badge> : <Badge tone="warn">no longer counts</Badge>) : <Badge>rejected</Badge>}<div className="muted small">{when(a.signed_at)}{a.reason ? ` · ${a.reason}` : ""}{a.revoked_reason ? ` · ${a.revoked_reason}` : ""}</div></li>)}</ul>
            )}
          </Card>
        </div>
        <div>
          <Card title="Timeline" id="tl">
            {audit.data ? (
              <ol className="timeline">{[...audit.data.data].reverse().map((e) => <li key={e.seq} className={`tl-${e.type.startsWith("payment.unknown") || e.type.includes("reconcil") || e.type.includes("not_found") ? "unknown" : e.type.includes("failed") ? "danger" : e.type.includes("settled") ? "ok" : ""}`}><strong>{AUDIT_LABEL[e.type] ?? e.type}</strong><span className="muted small">{when(e.at)} · {e.actor.startsWith("user:") ? "a team member" : e.actor.replace(/^[a-z]+:/, "")}</span></li>)}</ol>
            ) : <Skeleton rows={3} />}
          </Card>
          {o.payment ? (
            <Card title="Payment & evidence" id="ev">
              <dl className="summary">
                <dt>Attempts</dt><dd>{o.payment.attempts.map((a) => <div key={a.attempt_no}>#{a.attempt_no}: <strong>{a.outcome.toLowerCase().replace("_", " ")}</strong>{a.failure_reason ? ` (${a.failure_reason})` : ""} <span className="muted small">{a.note}</span></div>)}</dd>
                <dt>Wallet checks</dt><dd>{o.payment.reconciliation.runs} run{o.payment.reconciliation.runs === 1 ? "" : "s"}{o.payment.reconciliation.last_result ? ` · last: ${o.payment.reconciliation.last_result.toLowerCase().replace("_", " ")}` : ""}{o.payment.reconciliation.next_run_at && inMotion ? ` · next ${until(o.payment.reconciliation.next_run_at)}` : ""}</dd>
                {o.payment.settlement ? <>
                  <dt>Preimage</dt><dd><Mono value={o.payment.settlement.preimage} n={10} />{preimageOk ? <div className="ok-text">✓ Checked here in your browser: its SHA-256 equals the payment hash. Only the recipient's node could have revealed it.</div> : <div className="err">Does not match the payment hash.</div>}</dd>
                  <dt>Fee</dt><dd>{sats(o.payment.settlement.fee_msat)}</dd><dt>Settled</dt><dd>{when(o.payment.settlement.settled_at)}{o.payment.settlement.reconciled_after_uncertainty ? " · after an uncertain moment, resolved by the wallet's record" : ""}</dd></> : null}
              </dl>
              {o.state === "SIMULATED_SETTLED" ? <Note tone="info" title="Simulated.">This used the practice wallet. The “preimage” is from a simulator; the receipt is labelled so and cannot pass a real-payment check.</Note> : null}
              {o.payment.settlement ? <p className="small"><Link to="/verify">Verify the receipt independently</Link> · or run <code>orynt-verify</code> offline.</p> : null}
            </Card>
          ) : null}
          {o.open_incident ? <Card title="Open incident" id="inc" tone={o.open_incident.severity === "critical" ? "danger" : "unknown"}><p>{o.open_incident.summary}</p><p className="muted small">Opened {ago(o.open_incident.opened_at)}. It closes automatically when the wallet's record settles this payment.</p></Card> : null}
        </div>
      </div>

      {dlg === "approve" ? <ApproveDialog ob={o as Obligation} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} /> : null}
      {dlg === "reject" || dlg === "cancel" ? <ReasonDialog title={dlg === "reject" ? "Reject this payout" : "Cancel this payout"} cta={dlg === "reject" ? "Reject" : "Cancel payout"} onClose={() => setDlg(null)} onSubmit={async (r) => { await (dlg === "reject" ? api.obligations.reject(o.id, r) : api.obligations.cancel(o.id, r)); setDlg(null); refresh(); }} /> : null}
      {dlg === "confirm" ? <ReasonDialog title="Confirm this payment was never sent" cta="Confirm not sent" min={10} warn="Only do this if you've checked your wallet yourself. Orynt re-checks the wallet's record now and requires the invoice to have expired. This is recorded in the audit log under your name." onClose={() => setDlg(null)} onSubmit={async (r) => { await api.request("POST", `/v1/payments/${o.payment!.id}/confirm-not-sent`, { body: { note: r } }); setDlg(null); refresh(); }} /> : null}
      {dlg === "edit" ? <EditDialog ob={o} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} /> : null}
    </div>
  );
}

function ReasonDialog({ title, cta, onClose, onSubmit, min = 1, warn }: { title: string; cta: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>; min?: number; warn?: string }) {
  const [r, setR] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog title={title} onClose={onClose}>
      {warn ? <Note tone="warn">{warn}</Note> : null}
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Field label="Reason" htmlFor="reason" hint={min > 1 ? `At least ${min} characters.` : undefined}><textarea id="reason" rows={3} value={r} onChange={(e) => setR(e.target.value)} /></Field>
      <div className="actions"><Button onClick={onClose}>Back</Button><Button variant="danger" disabled={r.trim().length < min} busy={busy} onClick={async () => { setBusy(true); setErr(null); try { await onSubmit(r.trim()); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } }}>{cta}</Button></div>
    </Dialog>
  );
}

function EditDialog({ ob, onClose, onDone }: { ob: Obligation; onClose: () => void; onDone: () => void }) {
  const [memo, setMemo] = useState(ob.memo); const [ref, setRef] = useState(ob.external_ref); const [inv, setInv] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [memo, ref, inv]);
  return (
    <Dialog title={`Edit ${ob.ref}`} onClose={onClose}>
      <Note tone="warn">Editing creates a new revision and <strong>voids existing approvals</strong>. The old revision stays in the record.</Note>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Field label="What is this for?" htmlFor="e-memo"><input id="e-memo" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <Field label="Your reference" htmlFor="e-ref"><input id="e-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      <Field label="New invoice (optional)" htmlFor="e-inv" hint={ob.state === "DEFINITIVELY_FAILED" ? "Required: the failed attempt used the old invoice." : "Leave empty to keep the current invoice."}><textarea id="e-inv" rows={3} className="mono" value={inv} onChange={(e) => setInv(e.target.value)} /></Field>
      <div className="actions"><Button onClick={onClose}>Back</Button><Button variant="primary" busy={busy} onClick={async () => { setBusy(true); try { await api.request("PUT", `/v1/obligations/${ob.id}`, { body: { memo, external_ref: ref, ...(inv.trim() ? { invoice: inv.trim(), amount_msat: undefined } : {}) } }); onDone(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } }}>Save new revision</Button></div>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { decodeInvoice, formatMsat, parseSatsInput, type DecodedInvoice } from "@orynt/core";
import { api, errorText, useAsync } from "../api";
import { Button, Card, EmptyState, ErrorNote, Field, Note, Mono, Skeleton } from "../components/ui";
import { until, when } from "../format";
import { toast } from "../components/ui";

type Step = 1 | 2 | 3;
export function NewPayout() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [invoice, setInvoice] = useState("");
  const [cpMode, setCpMode] = useState<"existing" | "new">("new");
  const [cpId, setCpId] = useState("");
  const [cpName, setCpName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [memo, setMemo] = useState("");
  const [ref, setRef] = useState("");
  const [connId, setConnId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cps = useAsync(() => api.counterparties.list(), []);
  const conns = useAsync(() => api.connections.list(), []);

  const decoded = useMemo<{ ok: true; d: DecodedInvoice } | { ok: false; msg: string } | null>(() => {
    const s = invoice.trim();
    if (!s) return null;
    try {
      return { ok: true, d: decodeInvoice(s) };
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
  }, [invoice]);
  const dInv = decoded?.ok ? decoded.d : null;
  const amountMsat = useMemo(() => {
    try {
      return dInv?.amountMsat ?? (amountInput ? parseSatsInput(amountInput) : null);
    } catch {
      return null;
    }
  }, [dInv, amountInput]);
  const activeConns = (conns.data?.data ?? []).filter((c) => c.status === "active");
  const chosenConn =
    activeConns.find((c) => c.id === connId) ?? (activeConns.length === 1 ? activeConns[0] : undefined);
  const netMismatch = dInv && chosenConn && dInv.network !== chosenConn.network;
  const expired = dInv ? dInv.expiresAt * 1000 <= Date.now() : false;
  const cpOk = cpMode === "existing" ? !!cpId : cpName.trim().length > 0;
  const step1Ok = !!dInv && !expired && !netMismatch && amountMsat !== null && cpOk && !!chosenConn;

  const create = async (andSubmit: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const ob = await api.obligations.create({
        ...(cpMode === "existing" ? { counterparty_id: cpId } : { counterparty_name: cpName.trim() }),
        amount_msat: amountMsat!.toString(),
        invoice: invoice.trim(),
        memo,
        external_ref: ref,
        wallet_connection_id: chosenConn!.id,
      });
      if (andSubmit) {
        await api.obligations.submit(ob.id);
        toast("ok", `${ob.ref} submitted for approval.`);
      } else toast("ok", `${ob.ref} saved as a draft.`);
      nav(`/payouts/${ob.id}`);
    } catch (e) {
      setErr(errorText(e));
      setStep(1);
    } finally {
      setBusy(false);
    }
  };

  if (conns.loading && !conns.data)
    return (
      <div className="page">
        <Skeleton rows={4} />
      </div>
    );
  if (conns.data && activeConns.length === 0)
    return (
      <div className="page">
        <Card>
          <EmptyState
            title="Connect a wallet first"
            action={
              <Link className="btn btn-primary" to="/connections">
                Connect a wallet
              </Link>
            }
          >
            Payouts are paid from a wallet you control. Use the practice wallet to explore with no funds.
          </EmptyState>
        </Card>
      </div>
    );

  return (
    <div className="page narrow">
      <header className="page-h">
        <div>
          <h1>New payout</h1>
          <p className="lede">Check the invoice, confirm who it pays, and hand it to an approver.</p>
        </div>
      </header>
      <ol className="stepper" aria-label="Progress">
        {["Recipient & invoice", "Details", "Review"].map((l, i) => (
          <li
            key={l}
            aria-current={step === i + 1 ? "step" : undefined}
            className={step > i + 1 ? "done" : step === i + 1 ? "cur" : ""}
          >
            <span>{i + 1}</span>
            {l}
          </li>
        ))}
      </ol>
      {err ? <ErrorNote>{err}</ErrorNote> : null}

      {step === 1 ? (
        <Card>
          <Field
            label="Lightning invoice"
            htmlFor="inv"
            hint="Ask the recipient for a BOLT11 invoice (starts with lnbc, lntb or lnbcrt). Orynt reads and checks it on your device first."
            error={
              decoded && !decoded.ok
                ? `This isn't a valid invoice: ${decoded.msg}.`
                : expired
                  ? "This invoice has expired. Ask for a new one."
                  : null
            }
          >
            <textarea
              id="inv"
              rows={4}
              spellCheck={false}
              className="mono"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              aria-describedby="inv-hint"
            />
          </Field>
          {dInv ? (
            <div className="decoded" aria-live="polite">
              <h3>What this invoice says</h3>
              <dl>
                <dt>Amount</dt>
                <dd>
                  {dInv.amountMsat !== null ? (
                    <strong>{formatMsat(dInv.amountMsat)}</strong>
                  ) : (
                    <span className="muted">Any amount — you set it below</span>
                  )}
                </dd>
                <dt>Network</dt>
                <dd>
                  {dInv.network}
                  {netMismatch ? (
                    <span className="err"> · does not match the selected wallet ({chosenConn?.network})</span>
                  ) : null}
                </dd>
                <dt>Expires</dt>
                <dd>
                  {when(new Date(dInv.expiresAt * 1000).toISOString())} (
                  {until(new Date(dInv.expiresAt * 1000).toISOString())})
                </dd>
                <dt>Issued by node</dt>
                <dd>
                  <Mono value={dInv.payeePubkey} />
                </dd>
                <dt>Signature</dt>
                <dd>Valid — the node key above signed this invoice.</dd>
              </dl>
            </div>
          ) : null}
          {dInv && dInv.amountMsat === null ? (
            <Field label="Amount (sats)" htmlFor="amt" hint="Whole or fractional sats, e.g. 25000.">
              <input
                id="amt"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </Field>
          ) : null}
          <fieldset className="field">
            <legend>Recipient</legend>
            <div className="seg" role="group">
              <button
                type="button"
                className={cpMode === "new" ? "on" : ""}
                aria-pressed={cpMode === "new"}
                onClick={() => setCpMode("new")}
              >
                New recipient
              </button>
              <button
                type="button"
                className={cpMode === "existing" ? "on" : ""}
                aria-pressed={cpMode === "existing"}
                onClick={() => setCpMode("existing")}
                disabled={!cps.data?.data.length}
              >
                Existing
              </button>
            </div>
            {cpMode === "new" ? (
              <input
                aria-label="Recipient name"
                placeholder="e.g. Bob Studio"
                value={cpName}
                onChange={(e) => setCpName(e.target.value)}
              />
            ) : (
              <select aria-label="Recipient" value={cpId} onChange={(e) => setCpId(e.target.value)}>
                <option value="">Choose…</option>
                {cps.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.bound_payee_pubkey ? " (node key bound)" : ""}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
          {activeConns.length > 1 ? (
            <Field label="Pay from wallet" htmlFor="wal">
              <select id="wal" value={connId} onChange={(e) => setConnId(e.target.value)}>
                <option value="">Choose…</option>
                {activeConns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.network}
                    {c.is_simulator ? ", practice" : ""})
                  </option>
                ))}
              </select>
            </Field>
          ) : chosenConn ? (
            <p className="muted small">
              Paying from <strong>{chosenConn.label}</strong> ({chosenConn.network}
              {chosenConn.is_simulator ? ", practice wallet — no real value" : ""}).
            </p>
          ) : null}
          <div className="actions">
            <Button variant="primary" disabled={!step1Ok} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <Field label="What is this for?" htmlFor="memo" hint="Shown to approvers and kept in the receipt.">
            <input
              id="memo"
              value={memo}
              maxLength={500}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Design work, October"
            />
          </Field>
          <Field
            label="Your reference (optional)"
            htmlFor="ref"
            hint="An invoice or ticket number from your own system."
          >
            <input id="ref" value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <div className="actions">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" onClick={() => setStep(3)}>
              Review
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 && dInv && amountMsat !== null ? (
        <Card title="Review" id="rev">
          <dl className="summary">
            <dt>Pay</dt>
            <dd className="big">{formatMsat(amountMsat)}</dd>
            <dt>To</dt>
            <dd>
              {cpMode === "existing" ? cps.data?.data.find((c) => c.id === cpId)?.name : cpName}
              <div className="muted small">
                via node <Mono value={dInv.payeePubkey} n={8} />
              </div>
            </dd>
            <dt>From</dt>
            <dd>
              {chosenConn?.label} · {chosenConn?.network}
              {chosenConn?.is_simulator ? " · practice wallet" : ""}
            </dd>
            <dt>For</dt>
            <dd>
              {memo || <span className="muted">—</span>}
              {ref ? <span className="muted"> · ref {ref}</span> : null}
            </dd>
            <dt>Invoice valid</dt>
            <dd>{until(new Date(dInv.expiresAt * 1000).toISOString())}</dd>
          </dl>
          <Note tone="info">
            Nothing is sent yet. Submitting asks an approver — someone other than you — to sign these exact
            terms. If anything changes, approvals reset.
          </Note>
          <div className="actions">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => create(false)} busy={busy}>
              Save as draft
            </Button>
            <Button variant="primary" onClick={() => create(true)} busy={busy}>
              Submit for approval
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

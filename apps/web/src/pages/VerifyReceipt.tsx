import { useEffect, useState } from "react";
import { verifyReceipt, type Report } from "@orynt/verifier";
import { api, errorText } from "../api";
import { Badge, Button, Card, ErrorNote, Field, Note } from "../components/ui";

const VERDICT: Record<string, { tone: "ok" | "sim" | "warn" | "danger"; text: string }> = {
  VERIFIED: { tone: "ok", text: "Verified — real payment, trusted issuer" },
  VERIFIED_SIMULATED: { tone: "sim", text: "Verified as SIMULATED — no real payment" },
  INTEGRITY_ONLY: { tone: "warn", text: "Internally consistent — issuer NOT trusted" },
  REJECTED: { tone: "danger", text: "Rejected" },
};

/** Runs the same verifier library as the CLI, locally in your browser. For real assurance use the CLI from a source you trust: a page served by Orynt cannot vouch for itself. */
export function VerifyReceipt() {
  const [text, setText] = useState("");
  const [trust, setTrust] = useState("");
  const [requireReal, setRequireReal] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    api.request<{ data: { key_id: string; public_key: string }[] }>("GET", "/v1/public/issuer-keys").then(
      (r) => setHint(r.data.data[0]?.public_key ?? null),
      () => {},
    );
  }, []);
  const run = () => {
    setErr(null);
    setReport(null);
    try {
      const data = JSON.parse(text);
      setReport(
        verifyReceipt(data, {
          trustedKeys: trust.trim() ? [{ key_id: "you", public_key: trust.trim().toLowerCase() }] : [],
          requireReal,
        }),
      );
    } catch (e) {
      setErr(e instanceof SyntaxError ? "That isn't valid JSON." : errorText(e));
    }
  };
  const v = report ? VERDICT[report.verdict]! : null;
  return (
    <div className="page narrow">
      <header className="page-h">
        <div>
          <h1>Verify a receipt</h1>
          <p className="lede">
            Check a receipt without trusting Orynt's servers. Nothing is uploaded; verification runs in this
            page.
          </p>
        </div>
      </header>
      <Card>
        <Field label="Receipt JSON" htmlFor="r-json">
          <textarea
            id="r-json"
            rows={8}
            className="mono"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Load receipt file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
        <Field
          label="Issuer public key you trust (hex)"
          htmlFor="r-key"
          hint={
            <>
              Without it, the result can only be “internally consistent”. Get this key from a channel you
              trust, not from the receipt.{" "}
              {hint ? (
                <>
                  This server publishes <code>{hint.slice(0, 16)}…</code> — but a key fetched from the same
                  server proves nothing independent.{" "}
                  <button className="link-btn" onClick={() => setTrust(hint)}>
                    Use it anyway
                  </button>
                </>
              ) : null}
            </>
          }
        >
          <input id="r-key" className="mono" value={trust} onChange={(e) => setTrust(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={requireReal} onChange={(e) => setRequireReal(e.target.checked)} />{" "}
          Reject simulator receipts
        </label>
        <div className="actions">
          <Button variant="primary" onClick={run} disabled={!text.trim()}>
            Verify
          </Button>
        </div>
      </Card>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {report && v ? (
        <Card
          title={
            <>
              <Badge tone={v.tone}>{report.verdict.replace(/_/g, " ")}</Badge> {v.text}
            </>
          }
          id="res"
        >
          {report.summary ? (
            <p>
              {BigInt(report.summary.amountMsat).toLocaleString()} msat on {report.summary.network} (
              {report.summary.environment}) · payment hash{" "}
              <code>{report.summary.paymentHash.slice(0, 16)}…</code>
            </p>
          ) : null}
          <ul className="checks">
            {report.checks.map((c) => (
              <li key={c.id} className={`ck-${c.status}`}>
                <span className="ck-i" aria-hidden="true">
                  {c.status === "PASS" ? "✓" : c.status === "FAIL" ? "✗" : c.status === "WARN" ? "!" : "–"}
                </span>
                <div>
                  <strong>{c.id}</strong> <span className="visually-hidden">{c.status}</span>
                  <div className="muted small">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {report.cannotProve.length ? (
            <Note tone="info" title="What a receipt cannot prove.">
              <ul>
                {report.cannotProve.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Note>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

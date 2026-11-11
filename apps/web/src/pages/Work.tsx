import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorText, useAsync, useSession } from "../api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Note,
  Skeleton,
  StateBadge,
  toast,
} from "../components/ui";
import { sats, when } from "../format";

export function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}`;
  const r = useAsync(
    () =>
      api
        .request<{
          totals: Record<string, string | number>;
          note: string;
          rows: Array<Record<string, string | null>>;
          window: Record<string, unknown>;
        }>("GET", `/v1/reports/payouts${q}`)
        .then((x) => x.data),
    [from, to],
  );
  const d = r.data;
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Reports</h1>
          <p className="lede">
            Payout history for your accountant. Amounts are sats; no fiat values are produced.
          </p>
        </div>
        <a className="btn btn-secondary" href={`/v1/reports/payouts${q}${q === "?" ? "" : "&"}format=csv`}>
          Download CSV
        </a>
      </header>
      <div className="toolbar">
        <Field label="From" htmlFor="rf">
          <input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="rt">
          <input id="rt" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {r.error ? <ErrorNote>{r.error}</ErrorNote> : null}
      {r.loading && !d ? <Skeleton rows={4} /> : null}
      {d ? (
        <>
          <div className="grid3">
            <Card title="Settled (real)" id="t1">
              <p className="big">{sats(String(d.totals["settled_msat"]))}</p>
              <p className="muted small">{d.totals["settled_count"]} payouts with proof of payment</p>
            </Card>
            <Card title="Routing fees" id="t2">
              <p className="big">{sats(String(d.totals["fees_msat"]))}</p>
            </Card>
            <Card title="Simulated (not summed)" id="t3">
              <p className="big">{d.totals["simulated_excluded"]}</p>
              <p className="muted small">practice-wallet payouts, excluded from totals</p>
            </Card>
          </div>
          <Note tone="info">{d.note}</Note>
          {d.rows.length === 0 ? (
            <Card>
              <EmptyState title="No payouts in this window" />
            </Card>
          ) : (
            <div className="table-wrap" role="region" aria-label="Payout report" tabIndex={0}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Payout</th>
                    <th>Recipient</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>Approved by</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((x) => (
                    <tr key={x["id"]}>
                      <td data-label="Payout">
                        <Link to={`/payouts/${x["id"]}`}>{x["ref"]}</Link>
                        <div className="muted small">{when(x["created_at"])}</div>
                      </td>
                      <td data-label="Recipient">{x["counterparty"]}</td>
                      <td data-label="Amount" className="num">
                        {sats(x["amount_msat"]!)}
                      </td>
                      <td data-label="Status">
                        <StateBadge state={x["state"]!} />
                      </td>
                      <td data-label="Approved by" className="muted small">
                        {x["approvers"] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export function Batches() {
  const [csv, setCsv] = useState("counterparty,amount_sats,invoice,memo,external_ref\n");
  const [label, setLabel] = useState("");
  const [pv, setPv] = useState<{
    valid: number;
    invalid: number;
    total_msat: string;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const [res, setRes] = useState<{ batch_id: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const st = useAsync(
    () =>
      res
        ? api
            .request<{
              status: string;
              counts: Record<string, number>;
              items: Array<{
                id: string;
                ref: string;
                state: string;
                counterparty: string;
                amount_msat: string;
              }>;
            }>("GET", `/v1/batches/${res.batch_id}`)
            .then((r) => r.data)
        : Promise.resolve(null),
    [res?.batch_id],
  );
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setErr(null);
    try {
      await fn();
      st.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page narrow">
      <header className="page-h">
        <div>
          <h1>Batch payouts</h1>
          <p className="lede">
            Upload a CSV of recipients and Lightning invoices. Each row becomes its own payout with its own
            approval and its own status.
          </p>
        </div>
      </header>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Card>
        <Field label="Batch name" htmlFor="bl">
          <input
            id="bl"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. October contributors"
          />
        </Field>
        <Field
          label="CSV"
          htmlFor="bc"
          hint="Columns: counterparty, amount_sats, invoice (optional: memo, external_ref). One invoice per row; its amount must match. Max 200 rows."
        >
          <textarea
            id="bc"
            rows={8}
            className="mono"
            spellCheck={false}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        </Field>
        <div className="actions">
          <Button
            busy={busy === "pv"}
            onClick={() =>
              act("pv", async () =>
                setPv(
                  (
                    await api.request<NonNullable<typeof pv>>("POST", "/v1/batches/preview", {
                      body: { csv },
                    })
                  ).data,
                ),
              )
            }
          >
            Check file
          </Button>
          <Button
            variant="primary"
            disabled={!label.trim() || (!!pv && pv.valid === 0)}
            busy={busy === "mk"}
            onClick={() =>
              act("mk", async () => {
                const r = await api.request<{ batch_id: string; created: number; failed: number }>(
                  "POST",
                  "/v1/batches",
                  { body: { label, csv } },
                );
                setRes(r.data);
                toast(
                  "ok",
                  `${r.data.created} drafts created${r.data.failed ? `, ${r.data.failed} rows need attention` : ""}.`,
                );
              })
            }
          >
            Create drafts
          </Button>
        </div>
        {pv ? (
          <Note
            tone={pv.invalid ? "warn" : "ok"}
            title={`${pv.valid} valid · ${pv.invalid} with problems · ${sats(pv.total_msat)} total`}
          >
            {pv.errors.length ? (
              <ul>
                {pv.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            ) : (
              "Every row passed validation."
            )}
          </Note>
        ) : null}
      </Card>
      {res && st.data ? (
        <Card
          title={`Batch status: ${st.data.status.replace("_", " ")}`}
          id="bs"
          aside={
            <Badge
              tone={st.data.status === "completed" ? "ok" : st.data.status === "partial" ? "warn" : "info"}
            >
              {st.data.status}
            </Badge>
          }
        >
          <div className="actions wrap">
            <Button
              busy={busy === "sub"}
              onClick={() => act("sub", () => api.request("POST", `/v1/batches/${res.batch_id}/submit`))}
            >
              Submit all drafts for approval
            </Button>
            <Button
              variant="primary"
              busy={busy === "ex"}
              onClick={() => act("ex", () => api.request("POST", `/v1/batches/${res.batch_id}/execute`))}
            >
              Send all approved
            </Button>
          </div>
          <p className="muted small">
            A batch is “completed” only when every item is settled. Approvals are per payout (use Approvals).
          </p>
          <ul className="plain">
            {st.data.items.map((i) => (
              <li key={i.id}>
                <Link to={`/payouts/${i.id}`}>{i.ref}</Link> · {i.counterparty} · {sats(i.amount_msat)}{" "}
                <StateBadge state={i.state} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

interface Sched {
  id: string;
  cadence: string;
  amount_msat: string;
  memo: string;
  next_due_on: string;
  status: string;
  counterparty: string;
  awaiting_invoice: number;
}
interface Cycle {
  id: string;
  cycle: string;
  due_on: string;
  status: string;
  obligation_id: string | null;
  counterparty: string;
  amount_msat: string;
}
export function Schedules() {
  const s = useAsync(
    () => api.request<{ data: Sched[] }>("GET", "/v1/schedules").then((r) => r.data.data),
    [],
  );
  const cy = useAsync(
    () => api.request<{ data: Cycle[] }>("GET", "/v1/schedule-cycles").then((r) => r.data.data),
    [],
  );
  const cps = useAsync(() => api.counterparties.list(), []);
  const [f, setF] = useState({
    counterparty_id: "",
    amount_sats: "",
    cadence: "monthly",
    first_due: new Date().toISOString().slice(0, 10),
    memo: "",
  });
  const [inv, setInv] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const reload = () => {
    s.reload();
    cy.reload();
  };
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Recurring payouts</h1>
          <p className="lede">
            A Lightning invoice can only be paid once, so a schedule doesn't pay on its own: each cycle asks
            for a fresh invoice, then goes through normal approval.
          </p>
        </div>
        <Button
          onClick={async () => {
            await api.request("POST", "/v1/schedules/run-due");
            reload();
          }}
        >
          Check for due cycles
        </Button>
      </header>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Card title="New schedule" id="ns">
        <form
          className="formgrid"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await api.request("POST", "/v1/schedules", { body: f });
              toast("ok", "Schedule created.");
              reload();
            } catch (x) {
              setErr(errorText(x));
            }
          }}
        >
          <Field label="Recipient" htmlFor="sr">
            <select
              id="sr"
              required
              value={f.counterparty_id}
              onChange={(e) => setF({ ...f, counterparty_id: e.target.value })}
            >
              <option value="">Choose…</option>
              {cps.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (sats)" htmlFor="sa">
            <input
              id="sa"
              required
              inputMode="numeric"
              value={f.amount_sats}
              onChange={(e) => setF({ ...f, amount_sats: e.target.value })}
            />
          </Field>
          <Field label="Repeats" htmlFor="sc">
            <select id="sc" value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          <Field label="First due" htmlFor="sd">
            <input
              id="sd"
              type="date"
              required
              value={f.first_due}
              onChange={(e) => setF({ ...f, first_due: e.target.value })}
            />
          </Field>
          <div className="actions">
            <Button variant="primary" type="submit">
              Create schedule
            </Button>
          </div>
        </form>
      </Card>
      {s.data?.length ? (
        <Card title="Schedules" id="sl">
          <ul className="plain">
            {s.data.map((x) => (
              <li key={x.id}>
                <strong>{x.counterparty}</strong> · {sats(x.amount_msat)} {x.cadence} · next {x.next_due_on}{" "}
                <Badge tone={x.status === "active" ? "ok" : "neutral"}>{x.status}</Badge>
                {x.awaiting_invoice ? (
                  <Badge tone="warn">{x.awaiting_invoice} invoice needed</Badge>
                ) : null}{" "}
                {x.status !== "cancelled" ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api.request(
                          "POST",
                          `/v1/schedules/${x.id}/${x.status === "active" ? "pause" : "resume"}`,
                        );
                        reload();
                      }}
                    >
                      {x.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api.request("POST", `/v1/schedules/${x.id}/cancel`);
                        reload();
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {cy.data?.some((c) => c.status === "awaiting_invoice") ? (
        <Card title="Invoices needed" id="cn">
          {cy.data
            .filter((c) => c.status === "awaiting_invoice")
            .map((c) => (
              <div key={c.id} className="field">
                <label htmlFor={`i-${c.id}`}>
                  {c.counterparty} · {sats(c.amount_msat)} · cycle {c.cycle}
                </label>
                <textarea
                  id={`i-${c.id}`}
                  rows={2}
                  className="mono"
                  placeholder="Paste the Lightning invoice for exactly this amount"
                  value={inv[c.id] ?? ""}
                  onChange={(e) => setInv({ ...inv, [c.id]: e.target.value })}
                />
                <div className="actions">
                  <Button
                    variant="primary"
                    disabled={!inv[c.id]}
                    onClick={async () => {
                      try {
                        await api.request("POST", `/v1/schedule-cycles/${c.id}/invoice`, {
                          body: { invoice: inv[c.id] },
                        });
                        toast("ok", "Draft payout created — it still needs approval.");
                        reload();
                      } catch (x) {
                        setErr(errorText(x));
                      }
                    }}
                  >
                    Create draft payout
                  </Button>
                </div>
              </div>
            ))}
        </Card>
      ) : null}
    </div>
  );
}

export function Support() {
  const { me } = useSession();
  const t = useAsync(
    () =>
      api
        .request<{
          data: Array<{
            reference: string;
            category: string;
            subject: string;
            status: string;
            created_at: string;
          }>;
        }>("GET", "/v1/support")
        .then((r) => r.data.data),
    [],
  );
  const [f, setF] = useState({ category: "payment", subject: "", body: "" });
  const [ref, setRef] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="page narrow">
      <header className="page-h">
        <div>
          <h1>Help &amp; support</h1>
          <p className="lede">
            We attach safe diagnostics (your role, plan and wallet types — never credentials). We will never
            ask for seed phrases, macaroons or private keys.
          </p>
        </div>
      </header>
      {ref ? (
        <Note tone="ok" title={`Request ${ref} received.`}>
          We emailed an acknowledgement to {me?.user.email}.
        </Note>
      ) : null}
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Card title="New request" id="nr">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const r = await api.request<{ reference: string }>("POST", "/v1/support", { body: f });
              setRef(r.data.reference);
              setF({ ...f, subject: "", body: "" });
              t.reload();
            } catch (x) {
              setErr(errorText(x));
            }
          }}
        >
          <Field label="Topic" htmlFor="tc">
            <select id="tc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {["payment", "wallet", "billing", "account", "security", "other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Subject" htmlFor="ts">
            <input
              id="ts"
              required
              minLength={3}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
            />
          </Field>
          <Field
            label="What happened?"
            htmlFor="tb"
            hint="Include the payout reference (e.g. PO-0003) if it is about a payment."
          >
            <textarea
              id="tb"
              rows={5}
              required
              minLength={10}
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <div className="actions">
            <Button variant="primary" type="submit">
              Send request
            </Button>
          </div>
        </form>
      </Card>
      {t.data?.length ? (
        <Card title="Your requests" id="yr">
          <ul className="plain">
            {t.data.map((x) => (
              <li key={x.reference}>
                <strong>{x.reference}</strong> · {x.subject} <Badge>{x.status}</Badge>{" "}
                <span className="muted small">{when(x.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

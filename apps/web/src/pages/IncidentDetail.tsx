import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorText, useAsync } from "../api";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Note,
  Skeleton,
  StateBadge,
  toast,
  type Tone,
} from "../components/ui";
import { ago, when } from "../format";

interface Detail {
  incident: {
    id: string;
    kind: string;
    severity: string;
    status: string;
    summary: string;
    opened_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution: string | null;
    assigned_to: { id: string; name: string } | null;
  };
  obligation: {
    id: string;
    ref?: string;
    state: string;
    explanation: { headline: string; known: string[]; unknown: string[]; next: string };
  } | null;
  payment_truth: {
    state: string;
    explanation: { headline: string; known: string[]; unknown: string[]; next: string };
    second_payment_blocked: boolean;
    may_have_succeeded: boolean;
    last_reconciliation: { at: string; result: string | null } | null;
  } | null;
  approvals: Array<{ approver: string; approver_role: string; decision: string; signed_at: string }>;
  attempts: Array<{
    attempt_no: number;
    outcome: string;
    provider_status: string | null;
    started_at: string;
  }>;
  notes: Array<{ author: string; note: string; at: string }>;
  timeline: Array<{ at: string; source: string; title: string; actor?: string; detail?: unknown }>;
  safe_actions: Array<{ action: string; allowed: boolean; reason?: string }>;
  payment_id: string | null;
}
const SEV: Record<string, Tone> = { critical: "danger", warning: "warn", info: "info" };

export function IncidentDetail() {
  const { id } = useParams();
  const d = useAsync(() => api.request<Detail>("GET", `/v1/incidents/${id}`).then((r) => r.data), [id]);
  const members = useAsync(
    () =>
      api
        .request<{ data: Array<{ user: { id: string; name: string }; role: string; status: string }> }>(
          "GET",
          "/v1/members",
        )
        .then((r) => r.data.data.filter((m) => m.status === "active")),
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const x = d.data;
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      toast("ok", ok);
      d.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const exportEvidence = async () => {
    setBusy("export");
    try {
      const r = await api.request<unknown>("GET", `/v1/incidents/${id}/evidence`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `orynt-incident-${id}-evidence.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const unresolved = !!x?.payment_truth?.second_payment_blocked;
  const reconcile = x?.safe_actions.find((a) => a.action === "reconcile");

  return (
    <div className="page">
      <header className="page-h">
        <div>
          <p className="muted">
            <Link to="/incidents">← All incidents</Link>
          </p>
          <h1>{x ? x.incident.summary : "Incident"}</h1>
          {x ? (
            <p className="lede">
              <Badge tone={x.incident.status === "resolved" ? "ok" : (SEV[x.incident.severity] ?? "neutral")}>
                {x.incident.status === "resolved" ? "Resolved" : x.incident.severity}
              </Badge>{" "}
              {x.incident.kind.replace(/_/g, " ")} · opened {ago(x.incident.opened_at)}
              {x.incident.assigned_to ? ` · assigned to ${x.incident.assigned_to.name}` : " · unassigned"}
            </p>
          ) : null}
        </div>
        <Button onClick={exportEvidence} busy={busy === "export"} disabled={!x}>
          Export evidence (JSON)
        </Button>
      </header>
      {d.error ? <ErrorNote>{d.error}</ErrorNote> : null}
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {d.loading && !x ? <Skeleton rows={6} /> : null}
      {x ? (
        <>
          {x.payment_truth ? (
            <Card
              title="What is actually known about the payment"
              aside={<StateBadge state={x.payment_truth.state} />}
            >
              <p>
                <strong>{x.payment_truth.explanation.headline}</strong>
              </p>
              <div className="grid-2">
                <div>
                  <h3>Known</h3>
                  <ul>
                    {x.payment_truth.explanation.known.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Not known</h3>
                  {x.payment_truth.explanation.unknown.length ? (
                    <ul>
                      {x.payment_truth.explanation.unknown.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Nothing outstanding.</p>
                  )}
                </div>
              </div>
              <p className="muted">{x.payment_truth.explanation.next}</p>
              {unresolved ? (
                <Note tone="warn" title="A second payment is blocked">
                  The wallet may already have paid this. Orynt will not send again until the wallet's own
                  record shows the outcome. An unanswered request is <strong>not</strong> treated as a
                  failure.
                </Note>
              ) : null}
              <p className="muted">
                {x.payment_truth.last_reconciliation
                  ? `Last check of the wallet's record: ${ago(x.payment_truth.last_reconciliation.at)} — ${x.payment_truth.last_reconciliation.result ?? "no result"}.`
                  : "The wallet's record has not been checked yet."}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {x.payment_id && unresolved ? (
                  <Button
                    variant="primary"
                    busy={busy === "reconcile"}
                    disabled={reconcile ? !reconcile.allowed : false}
                    onClick={() =>
                      run(
                        "reconcile",
                        () => api.payments.reconcile(x.payment_id!),
                        "Checked the wallet's record.",
                      )
                    }
                  >
                    Check the wallet's record now
                  </Button>
                ) : null}
                {x.obligation ? (
                  <Link className="btn btn-secondary" to={`/payouts/${x.obligation.id}`}>
                    Open the payout
                  </Link>
                ) : null}
              </div>
              {reconcile && !reconcile.allowed && reconcile.reason ? (
                <p className="muted">{reconcile.reason}</p>
              ) : null}
            </Card>
          ) : null}

          <Card title="Investigation">
            <div className="row" style={{ gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <Field label="Investigator" htmlFor="assign">
                <select
                  id="assign"
                  value={x.incident.assigned_to?.id ?? ""}
                  onChange={(e) =>
                    run(
                      "assign",
                      () =>
                        api.request("POST", `/v1/incidents/${id}/assign`, {
                          body: { user_id: e.target.value || null },
                        }),
                      "Assignment saved.",
                    )
                  }
                  disabled={busy === "assign"}
                >
                  <option value="">Unassigned</option>
                  {members.data?.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} ({m.role})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  "note",
                  async () => {
                    await api.request("POST", `/v1/incidents/${id}/notes`, { body: { note } });
                    setNote("");
                  },
                  "Note added.",
                );
              }}
            >
              <Field
                label="Add an investigation note"
                htmlFor="note"
                hint="Visible to everyone in your organisation. Never paste wallet credentials or seed words."
              >
                <textarea
                  id="note"
                  rows={3}
                  value={note}
                  minLength={2}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button type="submit" busy={busy === "note"} disabled={note.trim().length < 2}>
                Add note
              </Button>
            </form>
            {x.notes.length ? (
              <ul className="plain">
                {x.notes.map((n, i) => (
                  <li key={i}>
                    <strong>{n.author}</strong> <span className="muted">{when(n.at)}</span>
                    <p>{n.note}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No notes yet.</p>
            )}
          </Card>

          {x.incident.status === "open" ? (
            <Card title="Resolve this incident">
              {unresolved ? (
                <p className="muted">
                  Available once the payment's outcome is known. Check the wallet's record first.
                </p>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    "resolve",
                    () => api.request("POST", `/v1/incidents/${id}/resolve`, { body: { note: resolution } }),
                    "Incident resolved.",
                  );
                }}
              >
                <Field label="What was concluded?" htmlFor="resolution">
                  <textarea
                    id="resolution"
                    rows={3}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    disabled={unresolved}
                  />
                </Field>
                <Button
                  type="submit"
                  busy={busy === "resolve"}
                  disabled={unresolved || resolution.trim().length < 5}
                >
                  Resolve incident
                </Button>
              </form>
            </Card>
          ) : (
            <Card title="Resolution">
              <p>{x.incident.resolution}</p>
              <p className="muted">
                By {x.incident.resolved_by} · {x.incident.resolved_at ? when(x.incident.resolved_at) : ""}
              </p>
            </Card>
          )}

          <Card title="Approvals on record">
            {x.approvals.length ? (
              <ul className="plain">
                {x.approvals.map((a, i) => (
                  <li key={i}>
                    <strong>{a.approver}</strong> ({a.approver_role}) — {a.decision}{" "}
                    <span className="muted">{when(a.signed_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No approvals recorded.</p>
            )}
          </Card>

          <Card title="Evidence timeline">
            <ol className="plain" aria-label="Evidence timeline">
              {x.timeline.map((t, i) => (
                <li key={i}>
                  <Badge tone="neutral">{t.source}</Badge> <strong>{t.title}</strong>{" "}
                  <span className="muted">
                    {when(t.at)}
                    {t.actor ? ` · ${t.actor}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorText, useAsync } from "../api";
import { Badge, Button, Card, ErrorNote, Field, Note, Skeleton, toast, type Tone } from "../components/ui";

interface Step {
  id: string;
  title: string;
  done: boolean;
  detail: string;
  path: string;
}
interface Onb {
  environment: { mode: string; label: string };
  steps: Step[];
  progress: { done: number; total: number };
  next: string | null;
  completed: boolean;
  can_complete: boolean;
}
interface OrgT {
  name: string;
  country: string | null;
  timezone: string | null;
  purpose: string | null;
}

const ENV_TONE: Record<string, Tone> = {
  none: "neutral",
  practice: "sim",
  regtest: "info",
  "test-network": "info",
  real: "warn",
};

/** Every checkmark below comes from the server, which derives it from real rows. Nothing on this page can mark a step done by itself. */
export function Start() {
  const o = useAsync(() => api.request<Onb>("GET", "/v1/onboarding").then((r) => r.data), []);
  const org = useAsync(() => api.request<OrgT>("GET", "/v1/org").then((r) => r.data), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{ country: string; timezone: string; purpose: string } | null>(null);
  const d = o.data;
  const f = form ?? {
    country: org.data?.country ?? "",
    timezone: org.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    purpose: org.data?.purpose ?? "",
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      toast("ok", ok);
      o.reload();
      org.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    return run(
      "profile",
      () =>
        api.request("PATCH", "/v1/org", {
          body: {
            country: f.country.trim().toUpperCase(),
            timezone: f.timezone.trim(),
            purpose: f.purpose.trim(),
          },
        }),
      "Profile saved.",
    );
  };
  const pct = d ? Math.round((d.progress.done / d.progress.total) * 100) : 0;

  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Get started</h1>
          <p className="lede">
            Twelve checks, then a finishing step, take you from sign-up to your first verified settlement.
            Leave and come back any time — progress is stored on the server.
          </p>
        </div>
      </header>
      {o.error ? <ErrorNote>{o.error}</ErrorNote> : null}
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {o.loading && !d ? <Skeleton rows={6} /> : null}
      {d ? (
        <>
          <Note tone={ENV_TONE[d.environment.mode] ?? "neutral"} title="Where you are working">
            <strong>{d.environment.label}</strong>
            {d.environment.mode === "practice"
              ? " — practice receipts are labelled SIMULATOR and prove nothing about real payments."
              : ""}
          </Note>
          <Card>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <label htmlFor="onb-progress">
                <strong>
                  {d.progress.done} of {d.progress.total} done
                </strong>
              </label>
              {d.completed ? <Badge tone="ok">Setup complete</Badge> : <Badge tone="neutral">{pct}%</Badge>}
            </div>
            <progress
              id="onb-progress"
              value={d.progress.done}
              max={d.progress.total}
              style={{ width: "100%" }}
              aria-label="Setup progress"
            />
          </Card>
          <Card>
            <ol className="queue" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {d.steps.map((s) => (
                <li key={s.id} aria-current={d.next === s.id ? "step" : undefined}>
                  <Badge tone={s.done ? "ok" : d.next === s.id ? "info" : "neutral"}>
                    {s.done ? "Done" : d.next === s.id ? "Next" : "To do"}
                  </Badge>
                  <div>
                    <strong>{s.title}</strong>
                    <p className="muted">{s.detail}</p>
                    {s.id === "profile" && !s.done ? (
                      <form onSubmit={saveProfile} className="stack" aria-label="Organisation profile">
                        <Field
                          label="Country (2-letter code)"
                          htmlFor="onb-country"
                          hint="For example NG, ZA, SN."
                        >
                          <input
                            id="onb-country"
                            value={f.country}
                            maxLength={2}
                            onChange={(e) => setForm({ ...f, country: e.target.value })}
                            aria-describedby="onb-country-hint"
                          />
                        </Field>
                        <Field label="Time zone" htmlFor="onb-tz">
                          <input
                            id="onb-tz"
                            value={f.timezone}
                            onChange={(e) => setForm({ ...f, timezone: e.target.value })}
                          />
                        </Field>
                        <Field label="What do you pay people for?" htmlFor="onb-purpose">
                          <input
                            id="onb-purpose"
                            value={f.purpose}
                            maxLength={300}
                            onChange={(e) => setForm({ ...f, purpose: e.target.value })}
                          />
                        </Field>
                        <Button
                          variant="primary"
                          type="submit"
                          busy={busy === "profile"}
                          disabled={
                            !/^[A-Za-z]{2}$/.test(f.country) ||
                            !f.timezone.trim() ||
                            f.purpose.trim().length < 3
                          }
                        >
                          Save profile
                        </Button>
                      </form>
                    ) : null}
                    {s.id === "plan" && !s.done ? (
                      <div className="row" style={{ gap: 8 }}>
                        <Link className="btn btn-secondary" to="/billing">
                          Compare plans
                        </Link>
                        <Button
                          busy={busy === "plan"}
                          onClick={() =>
                            run(
                              "plan",
                              () => api.request("POST", "/v1/onboarding/steps/plan/confirm"),
                              "Plan confirmed.",
                            )
                          }
                        >
                          Keep the free Developer plan
                        </Button>
                      </div>
                    ) : null}
                    {s.id === "policy" && !s.done ? (
                      <div className="row" style={{ gap: 8 }}>
                        <Link className="btn btn-secondary" to="/team">
                          Review or change the policy
                        </Link>
                        <Button
                          busy={busy === "policy"}
                          onClick={() =>
                            run(
                              "policy",
                              () => api.request("POST", "/v1/onboarding/steps/policy/confirm"),
                              "Policy reviewed.",
                            )
                          }
                        >
                          The default policy is fine
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {!s.done && !["profile", "plan", "policy"].includes(s.id) ? (
                    <Link className="btn btn-secondary" to={s.path}>
                      Go
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
          {!d.completed ? (
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <Button
                variant="primary"
                disabled={!d.can_complete}
                busy={busy === "complete"}
                onClick={() =>
                  run("complete", () => api.request("POST", "/v1/onboarding/complete"), "Setup complete.")
                }
              >
                Finish setup
              </Button>
              {!d.can_complete ? (
                <span className="muted">Available once every step above is done.</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

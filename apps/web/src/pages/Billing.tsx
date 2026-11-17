import { useState } from "react";
import { api, errorText, useAsync } from "../api";
import { Badge, Button, Card, ErrorNote, Note, Skeleton, toast } from "../components/ui";
import { when } from "../format";

interface Plan {
  id: string;
  name: string;
  price_usd_cents: number | null;
  entitlements: Record<string, number | boolean>;
  is_hypothesis: boolean;
}
interface Overview {
  current: {
    plan_id: string;
    status: string;
    provider: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  entitlements: Record<string, number | boolean>;
  usage: Record<string, number>;
  plans: Plan[];
  billing_provider: string;
  notes: string[];
}
const lim = (v: number | boolean) =>
  v === true ? "included" : v === false ? "not included" : v === -1 ? "unlimited" : String(v);
export function Billing() {
  const b = useAsync(() => api.request<Overview>("GET", "/v1/billing").then((r) => r.data), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const d = b.data;
  const paid = !!d && d.current.plan_id !== "developer" && d.current.status !== "canceled";
  const pick = async (plan: Plan) => {
    setBusy(plan.id);
    setErr(null);
    try {
      if (paid) {
        // paid → another paid plan: the server refuses a downgrade that would leave the organisation over the new limits and says exactly what to remove
        const r = await api.request<{ mode: string; url?: string | null; direction?: string }>(
          "POST",
          "/v1/billing/change-plan",
          { body: { plan_id: plan.id } },
        );
        if (r.data.mode === "redirect" && r.data.url) {
          window.location.href = r.data.url;
          return;
        }
        toast(
          "ok",
          `${plan.name} is now your plan (${r.data.direction ?? "changed"}).${d?.billing_provider === "sandbox" ? " Sandbox: no real money moved." : ""}`,
        );
        b.reload();
        return;
      }
      const r = await api.request<{ mode: string; url: string | null }>("POST", "/v1/billing/checkout", {
        body: { plan_id: plan.id },
      });
      if (r.data.mode === "redirect" && r.data.url) {
        window.location.href = r.data.url;
        return;
      }
      await api.request("POST", "/v1/billing/sandbox/complete", { body: { plan_id: plan.id } });
      toast("ok", `Sandbox checkout complete — ${plan.name} is active. No real money moved.`);
      b.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const portal = async () => {
    setBusy("portal");
    setErr(null);
    try {
      const r = await api.request<{ mode: string; url: string | null; note?: string }>(
        "POST",
        "/v1/billing/portal",
      );
      if (r.data.url) window.location.href = r.data.url;
      else toast("info", r.data.note ?? "No hosted portal is available for this provider.");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.request("POST", "/v1/billing/cancel");
      toast("ok", "Your plan will end at the close of the paid period.");
      b.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Plan &amp; billing</h1>
          <p className="lede">Limits are enforced by the server, not just hidden in the interface.</p>
        </div>
      </header>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {b.loading && !d ? <Skeleton rows={4} /> : null}
      {d ? (
        <>
          {d.billing_provider === "sandbox" ? (
            <Note tone="sim" title="Sandbox billing.">
              Checkout here simulates a payment so you can try plan changes. No card is charged and no real
              money moves.
            </Note>
          ) : null}
          <Card
            title="Current plan"
            id="cur"
            aside={
              <Badge
                tone={
                  d.current.status === "active" ? "ok" : d.current.status === "past_due" ? "warn" : "neutral"
                }
              >
                {d.current.status.replace("_", " ")}
              </Badge>
            }
          >
            <p className="big" style={{ textTransform: "capitalize" }}>
              {d.current.plan_id}
            </p>
            <p className="muted">
              {d.current.current_period_end
                ? `Renews/ends ${when(d.current.current_period_end)}`
                : "No billing period (free plan)."}
              {d.current.cancel_at_period_end ? " · cancellation scheduled" : ""}
            </p>
            {d.current.status === "past_due" ? (
              <Note tone="warn" title="Payment failed.">
                Update your payment method. Paid features lapse after a 7-day grace period.
              </Note>
            ) : null}
            <div className="grid3">
              {[
                ["Team members", `${d.usage["members"]} of ${lim(d.entitlements["members"]!)}`],
                ["Wallets", `${d.usage["wallets"]} of ${lim(d.entitlements["wallets"]!)}`],
                [
                  "Payouts this month",
                  `${d.usage["payouts_this_month"]} of ${lim(d.entitlements["payouts_per_month"]!)}`,
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="muted small">{k}</p>
                  <p>
                    <strong>{v}</strong>
                  </p>
                </div>
              ))}
            </div>
            {d.current.provider !== "none" &&
            d.current.status !== "canceled" &&
            !d.current.cancel_at_period_end ? (
              <div className="actions">
                <Button variant="ghost" busy={busy === "cancel"} onClick={cancel}>
                  Cancel at period end
                </Button>
              </div>
            ) : null}
          </Card>
          <div className="grid3">
            {d.plans.map((p) => (
              <Card
                key={p.id}
                title={
                  <>
                    {p.name} {p.id === d.current.plan_id ? <Badge tone="ok">current</Badge> : null}
                  </>
                }
                id={`p-${p.id}`}
              >
                <p className="big">
                  {p.price_usd_cents === null
                    ? "Custom"
                    : p.price_usd_cents === 0
                      ? "Free"
                      : `$${p.price_usd_cents / 100}`}
                  <span className="muted small">{p.price_usd_cents ? " / month" : ""}</span>
                </p>
                <ul className="plain small">
                  {[
                    "members",
                    "wallets",
                    "payouts_per_month",
                    "webhooks",
                    "api_keys",
                    "batch",
                    "recurring",
                    "history_days",
                  ].map((k) => (
                    <li key={k}>
                      <span className="muted">{k.replace(/_/g, " ")}:</span> {lim(p.entitlements[k]!)}
                    </li>
                  ))}
                </ul>
                {p.id !== d.current.plan_id ? (
                  p.price_usd_cents === null ? (
                    <a className="btn btn-secondary" href="/contact/">
                      Contact sales
                    </a>
                  ) : p.price_usd_cents === 0 ? null : (
                    <Button variant="primary" busy={busy === p.id} onClick={() => pick(p)}>
                      Choose {p.name}
                    </Button>
                  )
                ) : null}
              </Card>
            ))}
          </div>
          {paid ? (
            <Card
              title="Manage billing"
              aside={
                <Button busy={busy === "portal"} onClick={portal}>
                  Open billing portal
                </Button>
              }
            >
              <BillingHistory />
            </Card>
          ) : null}
          <p className="muted small">
            {d.notes.join(" ")} Plan prices and limits are hypotheses being tested, not offers.
          </p>
        </>
      ) : null}
    </div>
  );
}

function BillingHistory() {
  const h = useAsync(
    () =>
      api
        .request<{ data: Array<{ at: string; event: string; plan: string | null }>; note: string }>(
          "GET",
          "/v1/billing/history",
        )
        .then((r) => r.data),
    [],
  );
  if (h.loading) return <Skeleton rows={2} />;
  if (h.error) return <ErrorNote>{h.error}</ErrorNote>;
  return (
    <>
      {h.data?.data.length ? (
        <ul className="plain" aria-label="Billing history">
          {h.data.data.slice(0, 10).map((e, i) => (
            <li key={i}>
              <strong>{e.event.replace(/_/g, " ")}</strong>
              {e.plan ? ` — ${e.plan}` : ""} <span className="muted">{when(e.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No billing events yet.</p>
      )}
      <p className="muted small">{h.data?.note}</p>
    </>
  );
}

import { useState } from "react";
import { api, errorText, useAsync } from "../api";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Note, Skeleton, toast } from "../components/ui";
import { ago } from "../format";

export function Developers() {
  const keys = useAsync(
    () => api.request<{ data: import("@orynt/sdk").ApiKey[] }>("GET", "/v1/api-keys").then((r) => r.data),
    [],
  );
  const hooks = useAsync(() => api.webhooks.list(), []);
  const [secret, setSecret] = useState<{ what: string; value: string } | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Developers</h1>
          <p className="lede">
            Create payouts and read state from your own systems. API keys can create, submit, execute and read
            — never approve.
          </p>
        </div>
        <a className="btn btn-secondary" href="/v1/openapi.json">
          OpenAPI document
        </a>
      </header>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {secret ? (
        <Note tone="warn" title={`Copy your ${secret.what} now — it won't be shown again.`}>
          <code className="mono block">{secret.value}</code>
          <Button variant="ghost" onClick={() => setSecret(null)}>
            I've saved it
          </Button>
        </Note>
      ) : null}
      <Card title="API keys" id="keys">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const k = await api.request<{ secret: string }>("POST", "/v1/api-keys", {
                body: { name, role },
              });
              setSecret({ what: "API key", value: k.data.secret });
              setName("");
              keys.reload();
            } catch (e2) {
              setErr(errorText(e2));
            }
          }}
        >
          <Field label="Key name" htmlFor="k-n">
            <input id="k-n" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="k-r">
            <select id="k-r" value={role} onChange={(e) => setRole(e.target.value)}>
              <option>operator</option>
              <option>developer</option>
              <option>viewer</option>
            </select>
          </Field>
          <Button variant="primary" type="submit">
            Create key
          </Button>
        </form>
        {keys.loading && !keys.data ? (
          <Skeleton rows={2} />
        ) : keys.data?.data.length ? (
          <ul className="plain">
            {keys.data.data.map((k) => (
              <li key={k.id}>
                <strong>{k.name}</strong> <code>{k.prefix}…</code> <Badge>{k.role}</Badge>{" "}
                {k.revoked_at ? (
                  <Badge tone="danger">revoked</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.request("DELETE", `/v1/api-keys/${k.id}`);
                      keys.reload();
                    }}
                  >
                    Revoke
                  </Button>
                )}
                <span className="muted small">
                  {" "}
                  · {k.last_used_at ? `used ${ago(k.last_used_at)}` : "never used"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No API keys" />
        )}
      </Card>
      <Card title="Webhooks" id="hooks">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const h = await api.webhooks.create({ url, events: ["*"] });
              setSecret({ what: "webhook signing secret", value: h.signing_secret });
              setUrl("");
              hooks.reload();
              toast("ok", "Webhook registered.");
            } catch (e2) {
              setErr(errorText(e2));
            }
          }}
        >
          <Field label="Endpoint URL (https)" htmlFor="h-u">
            <input id="h-u" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Button variant="primary" type="submit">
            Add endpoint
          </Button>
        </form>
        {hooks.data?.data.length ? (
          <ul className="plain">
            {hooks.data.data.map((h) => (
              <li key={h.id}>
                <code>{h.url}</code> <Badge tone={h.status === "active" ? "ok" : "neutral"}>{h.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No endpoints. Events are signed (HMAC-SHA256), at-least-once, and carry a stable event id for
            de-duplication.
          </p>
        )}
      </Card>
      <Card title="Quick start" id="qs">
        <pre
          className="code"
          tabIndex={0}
          aria-label="Quick start code sample"
        >{`import { OryntClient } from "@orynt/sdk";
const orynt = new OryntClient({ baseUrl: "${window.location.origin}", apiKey: process.env.ORYNT_API_KEY });
const ob = await orynt.obligations.create({ counterparty_name: "Bob Studio", amount_msat: "25000000", invoice });
await orynt.obligations.submit(ob.id);          // a human approves in the app
const { obligation, certain } = await orynt.obligations.execute(ob.id);
if (!certain) { /* UNKNOWN: do NOT send again — poll until resolved */ }`}</pre>
      </Card>
    </div>
  );
}

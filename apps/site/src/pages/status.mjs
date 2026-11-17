import { codeBlock, table, tag } from "../helpers.mjs";
import { ctaBand, ctaButton, pageHero, section } from "../components.mjs";

// Honest status page: static on purpose. Health-endpoint semantics are checked against apps/api/src/http/handlers.ts by scripts/verify-claims.mjs.
const components = [
  ["Marketing site", "Static pages served by the same API process as the app.", "None"],
  ["Web app (<code>/app</code>)", "The product interface.", "None"],
  ["API (<code>/v1</code>)", "REST API, webhooks, receipts.", "None"],
  [
    "Customer wallets",
    "Owned and run by you, not by us. Orynt can only report what the wallet tells it.",
    "Not ours to monitor",
  ],
  ["Billing provider", "Sandbox provider only; live providers are not commissioned.", "None"],
  ["Email delivery", "Not commissioned; mail is queued, not delivered, by default.", "None"],
  [
    "Webhook delivery",
    "At-least-once with backoff; each endpoint has a delivery log in the app.",
    "Per-endpoint log only",
  ],
].map(([c, w, m]) => [c, w, m]);

export default {
  path: "/status/",
  title: "Status",
  description:
    "There is no public uptime history for Orynt yet, because no public instance is deployed. What the health endpoints mean, what they do not cover, and what we do not promise.",
  body: () => `
${pageHero({
  eyebrow: "Status",
  title: "No public uptime history yet.",
  lead: "Nothing is deployed publicly, so there is nothing to measure and no history to show. We would rather say that than show a green badge that means nothing.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Summary"><li>${tag("No public instance", "hypothesis")}</li><li>${tag("No uptime history", "neutral")}</li><li>${tag("No SLA", "neutral")}</li></ul>`,
})}

${section({
  id: "now",
  title: "What we can honestly say.",
  body: `<div class="grid grid--2">
<article class="card"><h3>Today</h3>
<ul class="list list--no">
<li>No public deployment of the app, the API or this site.</li>
<li>No status history, uptime figure or incident log. None has been recorded.</li>
<li>No uptime target, support SLA or on-call rota. Alert routing is not wired up.</li>
<li>No third-party status service is used, and none is embedded here.</li>
</ul></article>
<article class="card"><h3>When there is a public instance</h3>
<ul class="list">
<li>This page will link to a real status feed and say when monitoring began.</li>
<li>Uptime will be reported only from measurements, with the period they cover.</li>
<li>Incidents will be listed with what happened, not just that they ended.</li>
</ul></article>
</div>`,
})}

${section({
  id: "health",
  tint: true,
  title: "What the health endpoints mean.",
  intro:
    "If you run Orynt yourself, the API exposes two probes for your own monitoring or orchestrator. They are public and need no credentials.",
  body: `<div class="two-col">
<div class="prose">
<h3><code>GET /health/live</code></h3>
<p>Liveness. The process is up and answering. It returns <code>200</code> with <code>{"status":"ok"}</code> and checks nothing else. Use it to decide whether to restart the process.</p>
<h3><code>GET /health/ready</code></h3>
<p>Readiness. It checks that the database answers a query and that no migrations are pending. If both are fine it returns <code>200</code> with <code>"status":"ready"</code>. Otherwise it returns <code>503</code> with <code>"status":"not_ready"</code>. Use it to decide whether to send traffic.</p>
</div>
<div class="stack">
${codeBlock(
  `GET /health/ready

200 {"status":"ready","checks":{"database":"ok","migrations":"ok"}}

503 {"status":"not_ready","checks":{"database":"unavailable","migrations":"unknown"}}
# migrations can also read "pending: <names>"`,
  { lang: "sh", label: "response shape" },
)}
</div>
</div>
<div class="callout callout--warn" style="margin-top:28px;max-width:52rem"><p><strong>What “ready” does not tell you.</strong></p>
<p>It does not check your wallet connection, the billing provider, email, webhook delivery, or whether any payment is stuck. A healthy API can still have a payout that says <em>checking</em>. For payments, look at the app's overview and incidents, and see <a href="/help/#checking">what to do when a payment is checking</a>.</p></div>`,
})}

${section({
  id: "components",
  title: "What is monitored publicly.",
  body: `${table({ caption: "Components and whether they have public monitoring", head: ["Component", "What it is", "Public monitoring"], rows: components })}`,
})}

${section({
  id: "report",
  tint: true,
  title: "Something not working?",
  body: `<div class="prose"><p>Tell us. Contact support and include the <code>request_id</code> from any error. Do not include credentials, seed phrases or private keys.</p><div class="btn-row">${ctaButton("support")}${ctaButton("pilot", "secondary")}</div></div>`,
})}

${ctaBand({ title: "Want to try it where you can watch it?", text: "Run it locally with the practice wallet, or on regtest, and point your own monitoring at the health endpoints.", keys: ["signup", "support"], more: `<a class="btn btn--secondary" href="/help/#start">Run it locally</a>` })}
`,
};

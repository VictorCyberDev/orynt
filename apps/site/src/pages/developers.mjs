import { codeBlock, snippet, table, tag, esc } from "../helpers.mjs";
import { ctaBand, ctaButton, pageHero, section } from "../components.mjs";
import { repoPath, APP } from "../site.config.mjs";
import { PLANS, DIMENSIONS, valueLabel } from "../plans.mjs";

// Endpoints shown here are cross-checked against packages/contract/src/routes.ts by scripts/verify-claims.mjs.
const endpointGroups = [
  {
    id: "ep-payouts",
    title: "Payouts and payments",
    rows: [
      [
        "POST",
        "/v1/obligations",
        "Create a payout obligation (draft). Optional <code>Idempotency-Key</code>.",
      ],
      [
        "POST",
        "/v1/lnurl/resolve",
        "Resolve a Lightning Address into a verified invoice for an exact amount (<code>address</code>, <code>amount_msat</code>).",
      ],
      ["GET", "/v1/obligations", "List obligations, filter by state."],
      ["GET", "/v1/obligations/:id", "One obligation with approvals, payment and next safe actions."],
      ["PUT", "/v1/obligations/:id", "New immutable revision; voids earlier approvals."],
      ["POST", "/v1/obligations/:id/submit", "Freeze the revision, bind the policy, request approval."],
      [
        "POST",
        "/v1/obligations/:id/approve",
        "Approve with a signature over the intent digest (people only).",
      ],
      [
        "POST",
        "/v1/obligations/:id/execute",
        "Send exactly once. <code>Idempotency-Key</code> required. 202 means not yet certain.",
      ],
      ["GET", "/v1/payments/:id", "Payment attempts and settlement evidence."],
      ["POST", "/v1/payments/:id/reconcile", "Ask the wallet for its authoritative record."],
      [
        "GET",
        "/v1/payments/:id/receipt",
        "Issue (once) and download the signed receipt for a settled payment.",
      ],
      ["GET", "/v1/audit/verify", "Re-verify every audit hash chain in the workspace."],
      ["POST", "/v1/webhooks", "Register an endpoint; the signing secret is shown once."],
      [
        "GET",
        "/v1/public/issuer-keys",
        "Receipt-issuer public keys (informational; get your trust root out-of-band).",
      ],
      ["GET", "/v1/openapi.json", "The OpenAPI document, generated from the same contract the server uses."],
    ],
  },
  {
    id: "ep-batches",
    title: "Batches",
    rows: [
      ["POST", "/v1/batches/preview", "Validate a payout CSV. Creates nothing."],
      [
        "POST",
        "/v1/batches",
        "Create draft payouts from CSV. <code>label</code>, <code>csv</code>, optional <code>wallet_connection_id</code>. 201.",
      ],
      ["GET", "/v1/batches/:id", "Batch status with per-item states."],
      ["POST", "/v1/batches/:id/submit", "Submit every draft item for approval."],
      [
        "POST",
        "/v1/batches/:id/execute",
        "Execute every approved item; each is single-use and guarded on its own.",
      ],
    ],
  },
  {
    id: "ep-schedules",
    title: "Recurring schedules",
    rows: [
      ["GET", "/v1/schedules", "List schedules."],
      [
        "POST",
        "/v1/schedules",
        "Create a schedule. Opens an invoice-needed task each cycle; never pays by itself. 201.",
      ],
      [
        "POST",
        "/v1/schedules/:id/:action",
        "<code>action</code> is <code>pause</code>, <code>resume</code> or <code>cancel</code>.",
      ],
      ["POST", "/v1/schedules/run-due", "Open invoice-needed tasks for schedules that are due now."],
      ["GET", "/v1/schedule-cycles", "Cycles (the invoice-needed tasks)."],
      [
        "POST",
        "/v1/schedule-cycles/:id/invoice",
        "Provide the invoice for a cycle; creates a normal draft payout. 201.",
      ],
    ],
  },
  {
    id: "ep-reports",
    title: "Reports",
    rows: [
      [
        "GET",
        "/v1/reports/payouts",
        "Payout report as JSON or CSV. Real settlements only are summed; no fiat values.",
      ],
      ["GET", "/v1/reports/recipients/:id", "Statement for one recipient."],
    ],
  },
  {
    id: "ep-billing",
    title: "Plans and billing",
    rows: [
      ["GET", "/v1/plans", "Public plan catalogue. Prices are hypotheses."],
      ["GET", "/v1/billing", "Current plan, status, entitlements and usage."],
      [
        "POST",
        "/v1/billing/checkout",
        "Start a checkout for a plan (<code>plan_id</code>). Sandbox provider by default.",
      ],
      [
        "POST",
        "/v1/billing/sandbox/complete",
        "Sandbox only: complete a checkout through the real webhook path.",
      ],
      ["POST", "/v1/billing/cancel", "Cancel at the end of the paid period."],
      [
        "POST",
        "/v1/billing/webhook/:provider",
        "Billing-provider webhook. Signature-verified and idempotent. <code>provider</code> is <code>stripe</code>, <code>paystack</code> or <code>sandbox</code>.",
      ],
    ],
  },
  {
    id: "ep-support",
    title: "Support and account",
    rows: [
      ["POST", "/v1/support", "Open a support request; safe diagnostics are attached. 201."],
      ["POST", "/v1/public/support", "Support request without an account. 201."],
      ["GET", "/v1/export", "Export all organisation data (no secrets)."],
    ],
  },
];

const events = [
  ["obligation.submitted", "A revision was frozen and approval requested."],
  ["obligation.approved", "Enough valid signed approvals."],
  ["obligation.rejected", "An approver declined."],
  ["obligation.cancelled", "Cancelled before any send."],
  ["payment.dispatching", "The wallet is being asked to pay."],
  ["payment.pending", "The wallet reports the payment in flight."],
  ["payment.unknown", "No reliable answer yet. Do not resend."],
  ["payment.settled", "Settled, with provider-sourced evidence."],
  ["payment.failed", "The wallet&rsquo;s record proves the payment failed."],
  ["incident.opened", "A case needs a person&rsquo;s attention."],
  ["incident.resolved", "That case was resolved."],
];

export default {
  path: "/developers/",
  title: "Developers",
  description:
    "Orynt's REST API, typed TypeScript SDK, signed webhooks and offline receipt verifier, with real code samples. Early-stage; regtest only; the SDK is not published to a package registry.",
  body: () => `
${pageHero({
  eyebrow: "Developers",
  title: "Payout safety you can call from code.",
  lead: "A REST API with an OpenAPI document, a typed TypeScript SDK, signed webhooks and an offline receipt verifier. The samples below are taken from the SDK and the API contract in the repository, and checked against them.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Status of the developer platform">
<li>${tag("Real Lightning verified on regtest", "ok")}</li>
<li>${tag("Regtest only · mainnet disabled", "hypothesis")}</li>
<li>${tag("SDK not on npm", "neutral")}</li>
<li>${tag("v0.x · may change", "neutral")}</li>
</ul>
<div class="btn-row">${ctaButton("signup")}${ctaButton("support", "secondary")}<a class="btn btn--secondary" href="/help/#errors">Error codes</a></div>`,
})}

${section({
  id: "overview",
  title: "What is here.",
  body: `<div class="grid grid--3">
<article class="card"><h3>REST + OpenAPI</h3><p>JSON over HTTPS. Errors are RFC 7807 style <code>application/problem+json</code> with a stable <code>code</code> to switch on and a <code>request_id</code> to quote.</p></article>
<article class="card"><h3>TypeScript SDK</h3><p><code>@orynt/sdk</code>: a small <code>fetch</code>-based client with typed responses, idempotency helpers and approval-signing helpers. It lives in the repository (${repoPath("packages/sdk")}) and is <strong>not published to npm</strong> yet.</p></article>
<article class="card"><h3>Signed webhooks</h3><p>HMAC-SHA256 signatures with a timestamp, at-least-once delivery, and a verification helper that rejects bad signatures and replays.</p></article>
<article class="card"><h3>Verifier CLI</h3><p>Checks a receipt offline and exits with a code your scripts can act on. It sends no telemetry and needs no account.</p></article>
<article class="card"><h3>Idempotency</h3><p>Execute and retry require an <code>Idempotency-Key</code>. Reusing a key with a different request is rejected.</p></article>
<article class="card"><h3>Roles and keys</h3><p>API keys carry the role <code>operator</code>, <code>developer</code> or <code>viewer</code>. None of them can approve a payout.</p></article>
</div>`,
})}

${section({
  id: "quickstart",
  tint: true,
  title: "Quickstart: one payout, end to end.",
  intro:
    "Against a local API on regtest. The wallet connection and approver setup happen in the web app first.",
  body: `<div class="code-stack">
${codeBlock(snippet("1-create.ts.txt"), { label: "1 · create and submit (TypeScript)" })}
${codeBlock(snippet("2-approve.ts.txt"), { label: "2 · approve (TypeScript, run as the approver)" })}
${codeBlock(snippet("3-execute.ts.txt"), { label: "3 · execute once, handle uncertainty (TypeScript)" })}
${codeBlock(snippet("4-receipt.ts.txt"), { label: "4 · fetch the receipt (TypeScript)" })}
</div>
<div class="callout callout--unknown" style="margin-top:32px"><p><strong>The one rule to remember.</strong></p><p>If <code>certain</code> is <code>false</code> (HTTP 202), the payout is <em>Unknown</em>, not failed. Do not execute again. Reconcile or wait. The API refuses a second send anyway, with <code>send_blocked_unresolved</code>.</p></div>`,
})}

${section({
  id: "verify",
  title: "Verify a receipt, offline.",
  intro:
    "The verifier is a separate program that does not contact Orynt. It rejects tampered, replayed, stale or forged receipts, and tells you what a receipt cannot prove.",
  body: `<div class="code-stack">${codeBlock(snippet("5-verify.sh.txt"), { lang: "sh", label: "shell" })}</div>
<p class="small muted" style="margin-top:16px">The verifier lives in ${repoPath("packages/verifier")}. Build it with the command above; no binary is published.</p>`,
})}

${section({
  id: "webhooks",
  tint: true,
  title: "Webhooks.",
  intro:
    "Verify every delivery with the raw body. Deliveries are at-least-once, so de-duplicate on the event id.",
  body: `<div class="code-stack">${codeBlock(snippet("6-webhook.ts.txt"), { label: "TypeScript" })}</div>
<h3 style="margin:40px 0 16px">Event types</h3>
${table({ caption: "Webhook event types", head: ["Event", "When"], rows: events.map(([e, w]) => [`<code>${e}</code>`, w]) })}`,
})}

${section({
  id: "api",
  title: "Endpoints.",
  intro:
    "Every method and path here is checked against the API contract (<code>packages/contract/src/routes.ts</code>) when this site is built. The OpenAPI document served by the API is the full reference; the SDK covers the payout flow, and the newer endpoints below are called with <code>orynt.request</code> or plain HTTP.",
  body: `${endpointGroups
    .map(
      (g) => `<h3 id="${g.id}" style="margin:${g === endpointGroups[0] ? "0" : "40px"} 0 16px">${g.title}</h3>
${table({
  caption: `${g.title}: API endpoints`,
  head: ["Method", "Path", "What it does"],
  rows: g.rows.map(([m, p, d]) => [`<code>${m}</code>`, `<code>${esc(p)}</code>`, d]),
})}`,
    )
    .join("\n")}
<div class="code-stack" style="margin-top:32px">${codeBlock(snippet("7-curl.sh.txt"), { lang: "sh", label: "plain HTTP" })}</div>`,
})}

${section({
  id: "batches",
  tint: true,
  title: "Batches: payouts from a CSV.",
  intro:
    "Up to 200 rows per batch. Header <code>counterparty,amount_sats,invoice</code>, optionally <code>memo</code> and <code>external_ref</code>. Rows are validated one by one: a bad row is reported and never stops the others, and the same invoice twice in one file is flagged.",
  body: `<div class="code-stack">${codeBlock(snippet("8-batch.ts.txt"), { label: "TypeScript" })}</div>
<ul class="list" style="margin-top:24px;max-width:48rem">
<li>Batches are verified with the practice wallet and automated tests, not against real nodes.</li>
<li>Creating a batch needs a plan that includes batches, and counts every valid row against the monthly payout limit. If the rows would exceed it, the whole batch is refused with <code>entitlement_exceeded</code>.</li>
<li>Each item is an ordinary payout. It needs its own signed approval, and execution goes through the normal single-use path.</li>
<li>Batch status is <code>completed</code> only when every item has settled; <code>partial</code> when some did and some did not.</li>
</ul>`,
})}

${section({
  id: "schedules",
  title: "Recurring schedules never pay by themselves.",
  intro:
    "A Lightning invoice is single-use and expires, so a schedule cannot hold one. Each cycle becomes an “invoice needed” task instead, and only one task can exist per schedule per cycle.",
  body: `<div class="code-stack">${codeBlock(snippet("9-schedule.ts.txt"), { label: "TypeScript" })}</div>
<p class="small muted" style="margin-top:16px">Cadence is <code>weekly</code> or <code>monthly</code>. Recurring schedules need a plan that includes them. Amounts are given in sats as a string here (<code>amount_sats</code>); payouts elsewhere use millisatoshi strings.</p>`,
})}

${section({
  id: "reports",
  tint: true,
  title: "Reports and CSV export.",
  intro:
    "Totals count real settled payouts only. Simulated settlements are listed but never summed, and no fiat values are produced.",
  body: `<div class="code-stack">${codeBlock(snippet("10-report.sh.txt"), { lang: "sh", label: "plain HTTP" })}</div>`,
})}

${section({
  id: "limits",
  title: "Plan limits: 402 <code>entitlement_exceeded</code>.",
  intro:
    "Plan limits are enforced on the server, so an API call that would exceed one is refused with HTTP 402 and the code <code>entitlement_exceeded</code>.",
  body: `<div class="code-stack">${codeBlock(snippet("11-limit.ts.txt"), { label: "TypeScript" })}</div>
<div style="margin-top:32px">
${table({
  caption: "Current plan limits (from the plan catalogue)",
  head: ["Limit", ...PLANS.map((p) => esc(p.name))],
  rows: DIMENSIONS.map((d) => [
    `<code>${d.key}</code>`,
    ...PLANS.map((p) => valueLabel(d.key, p.entitlements[d.key])),
  ]),
})}
<p class="small muted" style="margin-top:12px">Read from the plan catalogue the server runs; prices are <a href="/pricing/">hypotheses under test</a>. Your live usage: <code>GET /v1/billing</code> or <a href="${APP.billing}">the billing page</a>.</p>
</div>`,
})}

${section({
  id: "billing-webhooks",
  tint: true,
  title: "Billing webhooks: the signature scheme.",
  intro:
    "<code>POST /v1/billing/webhook/:provider</code> is called by a billing provider, not by your code. It is public, so every request is authenticated by its signature, and each event is applied at most once.",
  body: `<div class="code-stack">${codeBlock(snippet("12-billing-signature.ts.txt"), { label: "TypeScript (Node)" })}</div>
<ul class="list" style="margin-top:24px;max-width:48rem">
<li>A missing, wrong or stale signature is <code>401 unauthenticated</code>. The secret is a server setting, <code>ORYNT_BILLING_WEBHOOK_SECRET</code>.</li>
<li>Events are de-duplicated on <code>(provider, event id)</code>. A repeat, an out-of-order older event, or an unknown subscription is acknowledged <code>200</code> so the provider stops retrying; the body says <code>applied</code>, <code>duplicate</code>, <code>stale</code> or <code>ignored</code>.</li>
<li>The <code>sandbox</code> provider uses the Stripe scheme, grants real entitlements to the workspace, and is refused when the server runs in production mode.</li>
<li>The Stripe and Paystack mappings follow each provider's documentation but have <strong>never been run against a live provider</strong>. No real charge has ever happened.</li>
</ul>`,
})}

${section({
  id: "errors",
  title: "Errors you should handle on purpose.",
  body: `<div class="grid grid--2">
<ul class="list">
<li><code>send_blocked_unresolved</code> (409): a payment already exists or is unresolved. Wait and reconcile.</li>
<li><code>approval_stale</code> (409): the policy changed after approval. Submit again.</li>
<li><code>idempotency_conflict</code> (422): that key was used with a different request.</li>
<li><code>mainnet_disabled</code> (409): mainnet execution is switched off on this server.</li>
<li><code>entitlement_exceeded</code> (402): a plan limit. See <a href="#limits">plan limits</a>.</li>
</ul>
<div class="callout callout--warn"><p><strong>Stability.</strong></p><p>Version 0.x. Routes, fields and event payloads may change without notice. Nothing here is a stable, supported interface yet. It has had an AI-assisted review but no human security audit. Every error code is in the <a href="/help/#errors">help center</a>.</p></div>
</div>`,
})}

${ctaBand({ title: "Building payouts into a product?", text: "Create a free account, get an API key and try the flow on regtest. Tell us where the API gets in your way: early feedback from developers shapes it directly.", keys: ["signup", "support"], more: `<a class="btn btn--secondary" href="/contact/">Request a pilot</a>` })}
`,
};

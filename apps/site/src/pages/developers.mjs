import { codeBlock, snippet, table, tag, esc } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";
import { repoPath } from "../site.config.mjs";

// Endpoints shown here are cross-checked against packages/contract/src/routes.ts by scripts/verify-claims.mjs.
const endpoints = [
  ["POST", "/v1/obligations", "Create a payout obligation (draft). Optional <code>Idempotency-Key</code>."],
  ["GET", "/v1/obligations", "List obligations, filter by state."],
  ["GET", "/v1/obligations/:id", "One obligation with approvals, payment and next safe actions."],
  ["PUT", "/v1/obligations/:id", "New immutable revision; voids earlier approvals."],
  ["POST", "/v1/obligations/:id/submit", "Freeze the revision, bind the policy, request approval."],
  ["POST", "/v1/obligations/:id/approve", "Approve with a signature over the intent digest (people only)."],
  ["POST", "/v1/obligations/:id/execute", "Send exactly once. <code>Idempotency-Key</code> required. 202 means not yet certain."],
  ["GET", "/v1/payments/:id", "Payment attempts and settlement evidence."],
  ["POST", "/v1/payments/:id/reconcile", "Ask the wallet for its authoritative record."],
  ["GET", "/v1/payments/:id/receipt", "Issue (once) and download the signed receipt for a settled payment."],
  ["GET", "/v1/audit/verify", "Re-verify every audit hash chain in the workspace."],
  ["POST", "/v1/webhooks", "Register an endpoint; the signing secret is shown once."],
  ["GET", "/v1/public/issuer-keys", "Receipt-issuer public keys (informational; get your trust root out-of-band)."],
  ["GET", "/v1/openapi.json", "The OpenAPI document, generated from the same contract the server uses."],
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
  lead: "A REST API with an OpenAPI document, a typed TypeScript SDK, signed webhooks and an offline receipt verifier. The samples below are taken from the SDK and the API contract in the repository.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Status of the developer platform">
<li>${tag("Designed · not yet verified", "neutral")}</li>
<li>${tag("Regtest only", "hypothesis")}</li>
<li>${tag("SDK not on npm", "neutral")}</li>
</ul>`,
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
  intro: "Against a local API on regtest. The wallet connection and approver setup happen in the web app first.",
  body: `<div class="code-stack">
${codeBlock(snippet("1-create.ts"), { label: "1 · create and submit (TypeScript)" })}
${codeBlock(snippet("2-approve.ts"), { label: "2 · approve (TypeScript, run as the approver)" })}
${codeBlock(snippet("3-execute.ts"), { label: "3 · execute once, handle uncertainty (TypeScript)" })}
${codeBlock(snippet("4-receipt.ts"), { label: "4 · fetch the receipt (TypeScript)" })}
</div>
<div class="callout callout--unknown" style="margin-top:32px"><p><strong>The one rule to remember.</strong></p><p>If <code>certain</code> is <code>false</code> (HTTP 202), the payout is <em>Unknown</em>, not failed. Do not execute again. Reconcile or wait. The API refuses a second send anyway, with <code>send_blocked_unresolved</code>.</p></div>`,
})}

${section({
  id: "verify",
  title: "Verify a receipt, offline.",
  intro: "The verifier is a separate program that does not contact Orynt. It rejects tampered, replayed, stale or forged receipts, and tells you what a receipt cannot prove.",
  body: `<div class="code-stack">${codeBlock(snippet("5-verify.sh"), { lang: "sh", label: "shell" })}</div>
<p class="small muted" style="margin-top:16px">The verifier lives in ${repoPath("packages/verifier")}. Build it with the command above; no binary is published.</p>`,
})}

${section({
  id: "webhooks",
  tint: true,
  title: "Webhooks.",
  intro: "Verify every delivery with the raw body. Deliveries are at-least-once, so de-duplicate on the event id.",
  body: `<div class="code-stack">${codeBlock(snippet("6-webhook.ts"), { label: "TypeScript" })}</div>
<h3 style="margin:40px 0 16px">Event types</h3>
${table({ caption: "Webhook event types", head: ["Event", "When"], rows: events.map(([e, w]) => [`<code>${e}</code>`, w]) })}`,
})}

${section({
  id: "api",
  title: "Selected endpoints.",
  intro: "A subset, for orientation. The OpenAPI document served by the API is the reference.",
  body: `${table({
    caption: "Selected API endpoints",
    head: ["Method", "Path", "What it does"],
    rows: endpoints.map(([m, p, d]) => [`<code>${m}</code>`, `<code>${esc(p)}</code>`, d]),
  })}
<div class="code-stack" style="margin-top:32px">${codeBlock(snippet("7-curl.sh"), { lang: "sh", label: "plain HTTP" })}</div>`,
})}

${section({
  id: "errors",
  tint: true,
  title: "Errors you should handle on purpose.",
  body: `<div class="grid grid--2">
<ul class="list">
<li><code>send_blocked_unresolved</code> (409): a payment already exists or is unresolved. Wait and reconcile.</li>
<li><code>approval_stale</code> (409): the policy changed after approval. Submit again.</li>
<li><code>idempotency_conflict</code> (422): that key was used with a different request.</li>
<li><code>mainnet_disabled</code> (409): mainnet execution is switched off on this server.</li>
</ul>
<div class="callout callout--warn"><p><strong>Stability.</strong></p><p>Version 0.x. Routes, fields and event payloads may change without notice. Nothing here is a stable, supported interface yet, and it has not been security reviewed.</p></div>
</div>`,
})}

${ctaBand({ title: "Building payouts into a product?", text: "Tell us what you are building and where the API gets in your way. Early feedback from developers shapes it directly." , button: "Talk to us"})}
`,
};

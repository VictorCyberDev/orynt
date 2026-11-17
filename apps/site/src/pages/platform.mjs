import { table, tag } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";
import { APP, repoPath } from "../site.config.mjs";

const real = tag("Verified · real regtest", "ok");
const sim = tag("Verified · simulator + tests", "ok");

// The five-step kernel. "routes" are checked against packages/contract/src/routes.ts by scripts/verify-claims.mjs.
const kernel = [
  {
    id: "obligation",
    name: "Obligation",
    line: "Write down the payout before anything moves.",
    what: "A payout is a record: payee, exact amount in whole millisatoshis, memo, your own reference, and a Lightning invoice that Orynt decodes and checks (signature, network, amount, expiry, payee node key). Edits never overwrite: each is a new immutable revision. Batches (a CSV of up to 200 rows) and recurring schedules do not bypass this step; they only create ordinary payouts.",
    features: [
      "Payee records, optionally bound to a node key",
      "Lightning Address resolved to a checked invoice",
      "Invoice decoding and binding",
      "Immutable revisions",
      "Plan limits checked on the server when a payout is created",
      "Batch CSV import with per-row validation",
      "Recurring schedules (each cycle asks for a fresh invoice)",
    ],
    routes: [
      "POST /v1/obligations",
      "PUT /v1/obligations/:id",
      "POST /v1/lnurl/resolve",
      "POST /v1/batches",
      "POST /v1/schedules",
    ],
    status: real,
    evidence:
      "Invoice decoder checked against spec vectors and against invoices from a real LND node; Lightning Address resolution checked against a local LNURL test server on regtest.",
  },
  {
    id: "authorization",
    name: "Authorization",
    line: "The right people approve the exact payout, with signatures.",
    what: "Submitting freezes a revision and binds the active policy. Each approver signs the intent digest, a fingerprint of the exact payout, with an Ed25519 key kept in their browser. Changing the payout or the policy voids earlier approvals. Roles are checked at approval and again at execution; API keys can never approve.",
    features: [
      "Policy revisions (approvals needed, maker-checker, thresholds)",
      "Ed25519 signed approvals",
      "Role and permission checks",
      "TOTP two-factor step-up (sign-in, approve, execute)",
      "Team invitations",
    ],
    routes: [
      "POST /v1/obligations/:id/submit",
      "POST /v1/obligations/:id/approve",
      "POST /v1/policies",
      "POST /v1/me/approval-key",
    ],
    status: sim,
    evidence:
      "Adversarial and security-regression suites on PostgreSQL: stale, duplicate, revoked-role and wrong-tenant approvals are refused.",
  },
  {
    id: "execution",
    name: "Execution",
    line: "An approved payout is sent exactly once.",
    what: "Before the wallet is called, a single-use execution record is reserved. A second send is refused while the first is unresolved, and the request needs an Idempotency-Key. Mainnet execution is switched off.",
    features: [
      "Single-use execution reservation",
      "Idempotency keys",
      "Wallet capability check",
      "Mainnet disabled",
    ],
    routes: ["POST /v1/obligations/:id/execute", "POST /v1/batches/:id/execute"],
    status: real,
    evidence:
      "On a real regtest node, 10 concurrent executes produced 1 payment. A simulator load run of 100 payouts with 3 concurrent executes each gave 100 sends and 0 doubles (not a capacity claim).",
  },
  {
    id: "reconciliation",
    name: "Reconciliation",
    line: "When the answer is lost, ask the wallet. Do not guess.",
    what: "If the wallet does not answer, the payout becomes UNKNOWN, then RECONCILING. Orynt asks the wallet for its own record by payment hash. Only that record moves the payout to SETTLED or DEFINITIVELY_FAILED; an expired invoice alone proves nothing. Unresolved cases open an incident with notes and an owner, and a person can attest, with fresh evidence, that nothing was sent.",
    features: [
      "UNKNOWN and RECONCILING states",
      "Lookup by payment hash",
      "Incident workbench (notes, assignment)",
      "Attested “confirm not sent”",
      "Retry only after proven failure",
      "Startup recovery of stuck payments",
    ],
    routes: [
      "POST /v1/payments/:id/reconcile",
      "POST /v1/payments/:id/confirm-not-sent",
      "POST /v1/payments/:id/retry",
      "POST /v1/incidents/:id/resolve",
    ],
    status: real,
    evidence:
      "Real regtest demo: the API was killed with SIGKILL after LND accepted the payment; after restart the payout was UNKNOWN, was reconciled, and settled once.",
  },
  {
    id: "evidence",
    name: "Evidence",
    line: "Proof anyone can check without trusting us.",
    what: "A settled payment can produce a signed receipt that binds the agreement, the signed approvals and the wallet's result, including the preimage whose hash is the payment hash. A separate command-line verifier checks it offline. The audit log is hash-chained, and reports can be exported as CSV.",
    features: [
      "Signed receipts (orynt.receipt/1)",
      "Offline verifier CLI",
      "Hash-chained audit log",
      "Payout reports and per-recipient statements",
      "Signed webhooks for your own systems",
    ],
    routes: [
      "GET /v1/payments/:id/receipt",
      "GET /v1/audit/verify",
      "GET /v1/reports/payouts",
      "POST /v1/webhooks",
    ],
    status: real,
    evidence:
      "Receipts from the real regtest demo verify (exit 0); tampered, replayed and substituted receipts are rejected. 26 verifier tests.",
  },
];

const layers = [
  [
    "Surfaces",
    `<ul class="list"><li>Web app at <code>/app</code></li><li>REST API at <code>/v1</code>, described by OpenAPI</li><li>TypeScript SDK (in the repository, not on npm)</li><li>Signed webhooks</li><li>Offline verifier CLI</li></ul>`,
  ],
  [
    "Workspace services",
    `<ul class="list"><li>Accounts, workspaces, roles, invitations, TOTP</li><li>Plans and server-enforced entitlements</li><li>Billing through a provider abstraction</li><li>Support requests</li><li>Counts-only product analytics</li></ul>`,
  ],
  ["Kernel", `<ol class="kernel-mini">${kernel.map((k) => `<li>${k.name}</li>`).join("")}</ol>`],
  [
    "Wallet adapters",
    `<ul class="list"><li>LND over REST: ${tag("Verified · regtest", "ok")}</li><li>Practice wallet (simulator): labelled, never a real receipt</li><li>NWC, BTCPay, Core Lightning: ${tag("Not built", "neutral")}</li></ul>`,
  ],
  [
    "Storage and evidence",
    `<ul class="list"><li>PostgreSQL, with versioned migrations</li><li>Hash-chained audit streams (tamper-evident, not immutable)</li><li>Ed25519-signed receipts</li></ul>`,
  ],
];

const evidenceRows = kernel.map((k) => [`${k.name}`, k.status, k.evidence]);

export default {
  path: "/platform/",
  title: "Platform",
  description:
    "Orynt's architecture in one page: a five-step kernel (Obligation, Authorization, Execution, Reconciliation, Evidence) between your team and a Lightning wallet you control, and what is verified on regtest.",
  body: () => `
${pageHero({
  eyebrow: "Platform",
  title: "A small kernel between the decision to pay and the wallet.",
  lead: "Everything the app, the API and the SDK do goes through the same five steps. That is what lets one payout be approved by people, sent once, checked when in doubt, and proven afterwards.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Status of the platform">
<li>${tag("Real Lightning verified on regtest", "ok")}</li>
<li>${tag("Mainnet disabled", "hypothesis")}</li>
<li>${tag("Not audited", "neutral")}</li>
</ul>`,
})}

${section({
  id: "kernel",
  title: "The five-step kernel.",
  intro:
    "Each step has one job and hands a stricter fact to the next. The order does not change, whichever door you come in by.",
  body: `<ol class="kernel" aria-label="The five steps">
${kernel.map((k, i) => `<li><a href="#k-${k.id}"><span class="kernel__n" aria-hidden="true">${i + 1}</span><span class="kernel__name">${k.name}</span><span class="kernel__line">${k.line}</span></a></li>`).join("\n")}
</ol>`,
})}

${section({
  id: "layers",
  tint: true,
  title: "How it fits together.",
  intro:
    "One Node.js API process serves this site at <code>/</code>, the app at <code>/app</code> and the API at <code>/v1</code>, backed by PostgreSQL. Multi-instance operation has not been verified.",
  body: `<div class="layers" role="group" aria-label="Architecture layers, top to bottom">
${layers.map(([t, b], i) => `<section class="layer${t === "Kernel" ? " layer--kernel" : ""}" aria-labelledby="layer-${i}"><h3 id="layer-${i}">${t}</h3>${b}</section>`).join("\n")}
</div>
<p class="small muted" style="margin-top:20px">Orynt never holds funds. The wallet holds the money; its credentials decide what Orynt could do with it. See <a href="/integrations/">integrations</a> and <a href="/security/#enforcement">who enforces what</a>.</p>`,
})}

${section({
  id: "steps",
  title: "What each step does.",
  body: `<div class="stack">
${kernel
  .map(
    (k, i) => `<article class="card kstep" id="k-${k.id}" aria-labelledby="k-${k.id}-t">
<p class="card__kicker">Step ${i + 1} of 5</p>
<h3 id="k-${k.id}-t">${k.name} ${k.status}</h3>
<p class="lead" style="font-size:1.125rem">${k.line}</p>
<p style="margin-top:12px">${k.what}</p>
<div class="two-col" style="margin-top:20px;gap:24px">
<div><h4 class="mini-h">Features</h4><ul class="list">${k.features.map((f) => `<li>${f}</li>`).join("")}</ul></div>
<div><h4 class="mini-h">API surface</h4><ul class="list list--code">${k.routes.map((r) => `<li><code>${r}</code></li>`).join("")}</ul></div>
</div>
</article>`,
  )
  .join("\n")}
</div>`,
})}

${section({
  id: "verified",
  tint: true,
  title: "What has been checked, and how.",
  intro: `“Verified” follows the project's execution register: a command was run in this environment and its result recorded. Source: ${repoPath("docs/EXECUTION-REGISTER.md")}.`,
  body: `${table({ caption: "Verification evidence per kernel step", head: ["Step", "Status", "Evidence"], rows: evidenceRows })}
<div class="callout callout--warn" style="margin-top:28px;max-width:52rem"><p><strong>Limits of that evidence.</strong></p>
<ul class="list">
<li>Real Lightning runs are on Bitcoin <strong>regtest</strong>, a private test network with no monetary value. Mainnet is disabled.</li>
<li>Checks are automated tests and scripted demos. There is no human security audit or penetration test, and no manual screen-reader testing.</li>
<li>Approval rules live in Orynt, not in the wallet. Someone holding your wallet credentials can bypass them.</li>
</ul></div>`,
})}

${section({
  id: "invariants",
  title: "Rules the kernel does not bend.",
  body: `<div class="grid grid--2">
<ul class="list list--ok">
<li>Amounts are integer millisatoshis, never decimals.</li>
<li>A payout's terms cannot change after approval without voiding the approval.</li>
<li>No payout can be sent twice; a second send is refused while the first is unresolved.</li>
<li>“Failed” only ever means the wallet's own record proves it.</li>
<li>Simulated payments are labelled everywhere and can never produce a real receipt.</li>
</ul>
<ul class="list list--ok">
<li>A recurring schedule never pays by itself. It opens a task asking for a new invoice; the payout then goes through approval like any other.</li>
<li>Reports sum only real settlements and carry no fiat values.</li>
<li>Plan limits are checked on the server, not just hidden in the interface.</li>
<li>Webhooks and billing events are signed, time-stamped and de-duplicated. Receipts are signed.</li>
</ul>
</div>`,
})}

${ctaBand({ title: "See the kernel work on regtest.", text: "Create a free account, connect the practice wallet or a regtest LND node, and walk one payout through all five steps.", more: `<a class="btn btn--secondary" href="${APP.guide}">Read the first-use guide</a>` })}
`,
};

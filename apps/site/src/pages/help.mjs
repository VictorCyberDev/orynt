import { codeBlock, table } from "../helpers.mjs";
import { ctaBand, ctaButton, pageHero, section } from "../components.mjs";
import { APP, repoPath } from "../site.config.mjs";

// Error codes: scripts/verify-claims.mjs checks that this table lists every code in packages/core/src/problems.ts and that each
// listed HTTP status for a code appears next to that code in apps/api/src (or the HTTP layer).
export const ERROR_ROWS = [
  [
    "validation_failed",
    "400, 422",
    "The request is malformed or a field is invalid. <code>errors[]</code> lists the paths. A missing or badly sized <code>Idempotency-Key</code> is a 400.",
    "Fix the request.",
  ],
  [
    "unauthenticated",
    "401",
    "No valid credentials, a stale webhook timestamp, or an unconfigured webhook secret.",
    "Sign in again or check the API key.",
  ],
  [
    "forbidden",
    "403",
    "Your role lacks the permission. Roles are checked fail-closed. API keys can never approve.",
    "Ask a workspace admin for the right role.",
  ],
  [
    "not_found",
    "404",
    "No such resource, or it belongs to another workspace (the two look the same on purpose).",
    "Check the id and the workspace.",
  ],
  [
    "conflict",
    "409",
    "The change collides with existing data or another request.",
    "Reload and retry if still valid.",
  ],
  [
    "idempotency_conflict",
    "422",
    "That <code>Idempotency-Key</code> was already used with a different request.",
    "Use a new key for a new request; reuse the key only to retry the same one.",
  ],
  ["rate_limited", "429", "Too many requests from your address.", "Wait and retry."],
  [
    "invalid_state",
    "409",
    "The action is not possible in the payout's current state; the message says why.",
    "Read the state; do the allowed next action.",
  ],
  [
    "policy_violation",
    "403, 409, 422",
    "The payout breaks the active policy (for example a limit or maker-checker rule).",
    "Change the payout or ask for a policy change.",
  ],
  [
    "invoice_invalid",
    "422",
    "The invoice cannot be decoded or its signature fails.",
    "Ask the payee for a new invoice.",
  ],
  [
    "invoice_expired",
    "409, 422",
    "The invoice has expired.",
    "Ask for a fresh invoice. Expiry alone never proves a payment failed.",
  ],
  [
    "network_mismatch",
    "409, 422",
    "The invoice is for a different network than the wallet or workspace.",
    "Use an invoice from the right network.",
  ],
  ["amount_mismatch", "422", "The amount differs from the invoice amount.", "Correct the amount."],
  [
    "destination_mismatch",
    "409, 422",
    "The invoice's node is not the payee's bound node key.",
    "Verify the payee, then ask for a new invoice.",
  ],
  [
    "approval_invalid",
    "401, 409, 422",
    "A signature or approval cannot be accepted. It is also how a missing or wrong authenticator code is reported, with <code>mfa_required: true</code> in the body.",
    "Re-sign the exact payout, or enter a current authenticator code.",
  ],
  ["approval_stale", "409", "The policy changed after approval.", "Submit the payout again."],
  ["approval_insufficient", "409", "Not enough valid approvals yet.", "Wait for the remaining approvers."],
  [
    "wallet_unavailable",
    "409, 422, 503",
    "The wallet cannot be reached or is not connected.",
    "Check the wallet connection. If a send was in progress, the payout will say <em>checking</em>, not failed.",
  ],
  [
    "wallet_insufficient_permissions",
    "409",
    "The wallet credential cannot do what is needed (for example it is read-only).",
    "Connect a credential that can pay invoices and look up payments.",
  ],
  [
    "mainnet_disabled",
    "409, 422",
    "Mainnet execution is switched off.",
    "Use regtest. Mainnet is not available.",
  ],
  [
    "entitlement_exceeded",
    "402",
    "Your plan's limit is reached or the feature is not in your plan. The body names <code>entitlement</code>, <code>plan</code>, <code>limit</code> and <code>used</code>.",
    `Free up a resource or change plan in <a href="${APP.billing}">billing</a>.`,
  ],
  [
    "mfa_required",
    "—",
    "Reserved in the contract. Today a missing authenticator code is reported as <code>approval_invalid</code> with <code>mfa_required: true</code>.",
    "See <code>approval_invalid</code>.",
  ],
  [
    "send_blocked_unresolved",
    "409",
    "A payment for this payout already exists or is unresolved. Sending again is refused.",
    "Reconcile or wait. Never retry.",
  ],
  [
    "internal",
    "500, 502",
    "Something went wrong on our side, or a billing provider call failed. Nothing changed unless the response says so.",
    "Quote the <code>request_id</code> to support.",
  ],
].map(([c, h, m, a]) => [`<code>${c}</code>`, h, m, a]);

const receiptFields = [
  ["schema", "<code>orynt.receipt/1</code>. The format version the verifier checks against."],
  [
    "receipt_id, issued_at",
    "A unique id and the time the issuer signed it. A replay ledger can reject a receipt id seen before.",
  ],
  [
    "issuer",
    "The key id and public key that signed the receipt. Trust in it is your decision: get the key out-of-band.",
  ],
  [
    "network, environment",
    "<code>regtest</code>, <code>mainnet</code> and so on, and whether the payment was <code>REAL_PROVIDER</code> or <code>SIMULATOR</code>. Simulator receipts are never a real payment.",
  ],
  ["provider", "The wallet kind and its node public key."],
  ["workspace", "The workspace that issued the receipt (id and name)."],
  [
    "agreement",
    "What was agreed: payee, amount in millisatoshis, memo, your reference, the invoice and its payment hash.",
  ],
  [
    "policy, intent",
    "The approval rules in force, and the fingerprint (digest) of the exact payout that approvers signed.",
  ],
  ["approvals", "Each approver, their public key and their signature over the intent digest."],
  ["attempts", "Every send attempt and its outcome, so a retry after proven failure is visible."],
  [
    "settlement",
    "The preimage (hashing it gives the payment hash), amount, fee, settled time, whether the result came from the wallet's response or a later lookup, and <code>reconciled_after_uncertainty</code>.",
  ],
  ["audit", "A short segment of the hash-chained audit log, with a signed checkpoint."],
  ["limitations", "What the receipt cannot prove. It travels with the receipt."],
  ["attestation", "The issuer's Ed25519 signature over everything above."],
].map(([f, m]) => [`<code>${f}</code>`, m]);

const verdicts = [
  ["VERIFIED", "0", "All checks passed, the issuer is a key you trust, and the payment was real."],
  ["REJECTED", "1", "A check failed: tampered, forged, replayed, stale or for the wrong payment."],
  [
    "INTEGRITY_ONLY",
    "3",
    "The receipt is internally consistent and the payment proof is valid, but the issuer key is not one you supplied.",
  ],
  [
    "VERIFIED_SIMULATED",
    "4",
    "Everything checks out, but the payment came from the labelled simulator. Not a real payment.",
  ],
].map(([v, e, m]) => [`<code>${v}</code>`, `<code>${e}</code>`, m]);

export default {
  path: "/help/",
  title: "Help center",
  description:
    "Quickstart summary, error codes, how to read a receipt, what to do when a payment says it is checking the wallet, and how to contact support.",
  body: () => `
${pageHero({
  eyebrow: "Help center",
  title: "Help, in plain words.",
  lead: "Short answers for the things people get stuck on. If yours is not here, contact support and quote the request id from any error.",
  extra: `<nav aria-label="Help topics" class="toc"><ul>
<li><a href="#start">Get started</a></li>
<li><a href="#account">Account and sign-in</a></li>
<li><a href="#checking">When a payment is “checking”</a></li>
<li><a href="#receipt">How to read a receipt</a></li>
<li><a href="#errors">Error codes</a></li>
<li><a href="#support">Contact support</a></li>
</ul></nav>
<div class="btn-row">${ctaButton("support")}${ctaButton("signup", "secondary")}</div>`,
})}

${section({
  id: "start",
  title: "Get started.",
  intro: `A summary of ${repoPath("docs/developers/quickstart.md")}. The repository file is the source; the code samples with full detail are on the <a href="/developers/#quickstart">developers page</a>.`,
  body: `<div class="two-col">
<div>
<ol class="mini-steps">
<li><span><strong>Create an account.</strong> Sign up in the app. You start on the free Developer plan with a workspace of your own.</span></li>
<li><span><strong>Connect a wallet.</strong> Use the practice wallet (a labelled simulator) or an LND node on regtest. Give Orynt a credential that can only pay invoices and look them up.</span></li>
<li><span><strong>Create your approval key.</strong> Approvers sign each payout with a key held in their browser. Set it up in Settings.</span></li>
<li><span><strong>Make a payout.</strong> Paste an invoice, submit it, have someone else approve it, send it once, then download the receipt.</span></li>
<li><span><strong>Automate if you want to.</strong> Create an API key in the app's Developers page (it can create, submit, execute and read, never approve).</span></li>
</ol>
<div class="btn-row">${ctaButton("signup")}<a class="btn btn--secondary" href="${APP.guide}">First-use guide</a></div>
</div>
<div>
${codeBlock(
  `# Run the whole thing yourself, locally (development mode, simulator wallet)
pnpm install && pnpm db:start
pnpm build:all
ORYNT_ENV=development ORYNT_SEED_DEMO=1 pnpm start
# app at /app, API at /v1 on the same port`,
  { lang: "sh", label: "local run" },
)}
<p class="small muted" style="margin-top:12px">No public instance is deployed yet, so today the app runs where you run it. See <a href="/status/">status</a>.</p>
</div>
</div>`,
})}

${section({
  id: "account",
  tint: true,
  title: "Account and sign-in.",
  body: `<div class="grid grid--2">
<article class="card"><h3>What you can do</h3>
<ul class="list">
<li>Verify your email with a single-use link, and request a new one in Settings.</li>
<li>Reset a forgotten password by email; resetting signs out every session.</li>
<li>Turn on two-factor protection with an authenticator app (TOTP); it is asked for at sign-in and again when approving or executing.</li>
<li>Invite teammates by email; an invitation expires after 7 days.</li>
<li>Export your organisation's data (no secrets), or close your own account.</li>
</ul></article>
<article class="card"><h3>Good to know</h3>
<ul class="list list--no">
<li>Email delivery is <strong>not commissioned</strong>. Unless a mail provider is configured, messages are queued in an outbox and marked sent without being delivered, so on a local setup you will not receive them.</li>
<li>A wrong or missing authenticator code is reported as <code>approval_invalid</code> with <code>mfa_required: true</code>.</li>
<li>Sign-in and registration are rate-limited (15 a minute per address).</li>
<li>Approval keys live in the browser. Clearing site data removes the key; register a new one.</li>
</ul></article>
</div>`,
})}

${section({
  id: "checking",
  title: "When a payment is “checking”.",
  intro:
    "In the app it reads “Checking wallet record”. The states behind it are <code>UNKNOWN</code> and <code>RECONCILING</code>. It means the wallet's answer was lost and nobody can yet say whether the money moved.",
  body: `<div class="two-col">
<div>
<ol class="mini-steps">
<li><span><strong>Do not pay again.</strong> Do not create a second payout for the same person, and do not pay from your wallet by hand. The first attempt may still have gone through. Orynt refuses a second send for this reason (<code>send_blocked_unresolved</code>).</span></li>
<li><span><strong>Ask the wallet.</strong> On the payout page choose “Check the wallet's record now”. Orynt looks the payment up by its payment hash. Only the wallet's own record moves the payout to <code>SETTLED</code> or <code>DEFINITIVELY_FAILED</code>.</span></li>
<li><span><strong>Check the connection.</strong> If the wallet is unreachable, fix that first (Wallets, then re-check the connection) and ask again.</span></li>
<li><span><strong>Still unclear?</strong> An incident is opened. Add notes and assign someone. The payment hash is on the payout; you can look for it in your own node.</span></li>
<li><span><strong>Only if you can show nothing was sent,</strong> use “Confirm it was never sent” with a written reason (at least 10 characters) and fresh evidence. This needs the incident-resolver permission. A new attempt can start only after a failure is proven or attested.</span></li>
</ol>
</div>
<div class="stack">
<div class="callout callout--unknown"><p><strong>Why not “failed”?</strong></p><p>A lost reply is not proof of failure, and an expired invoice is not either. Showing “failed” would invite a second payment. Indigo means not yet proven either way.</p></div>
<div class="callout callout--neutral"><p><strong>Over the API</strong></p><p>An <code>execute</code> that returns HTTP <code>202</code> is this same situation. Call <code>POST /v1/payments/:id/reconcile</code> or wait; do not call execute again.</p></div>
</div>
</div>`,
})}

${section({
  id: "receipt",
  tint: true,
  title: "How to read a receipt.",
  intro:
    "A receipt is a JSON file. You do not have to trust it or us: a separate verifier checks it offline, and tells you what it cannot prove.",
  body: `<h3 style="margin-bottom:16px">What is inside</h3>
${table({ caption: "Receipt fields and what they tell you", head: ["Field", "What it tells you"], rows: receiptFields })}
<h3 style="margin:40px 0 16px">What the verifier says</h3>
${table({ caption: "Verifier verdicts and exit codes", head: ["Verdict", "Exit code", "Meaning"], rows: verdicts })}
<p class="small muted" style="margin-top:12px">Exit code <code>2</code> means a usage or file error. The command and its options are on the <a href="/developers/#verify">developers page</a>. You can also paste a receipt into the <a href="${APP.verify}">in-app verifier</a>.</p>
<div class="callout callout--warn" style="margin-top:28px;max-width:52rem"><p><strong>What a receipt cannot prove.</strong></p>
<ul class="list list--no">
<li>That the work, goods or services were delivered or any good.</li>
<li>That the payee is the person or organisation named: that binding is a claim by the issuing workspace.</li>
<li>That no other payments exist for the same obligation outside Orynt.</li>
<li>That a contract is enforceable, or that funds were held in escrow.</li>
<li>Who was really paid, if the payer also controls the receiving node.</li>
</ul></div>`,
})}

${section({
  id: "errors",
  title: "Error codes.",
  intro:
    "Every API error is <code>application/problem+json</code> with a stable <code>code</code> to switch on, a human <code>detail</code> and a <code>request_id</code> (also the <code>x-request-id</code> header). Switch on <code>code</code>, not on the message.",
  body: `${table({ caption: "API error codes, HTTP status, meaning and what to do", head: ["Code", "HTTP", "Meaning", "What to do"], rows: ERROR_ROWS })}`,
})}

${section({
  id: "more",
  tint: true,
  title: "Common questions.",
  body: `<div class="faq">
<details><summary>Why is the Send button disabled?</summary><div class="answer"><p>The page says why next to the button: usually the payout is not yet approved, a payment is already unresolved, or your role cannot send. Disabled actions always carry a reason.</p></div></details>
<details><summary>Why did some rows of my batch fail?</summary><div class="answer"><p>Rows are checked one by one and a bad row never stops the others. The preview lists each problem: a missing recipient, an amount that is not a number of sats, an amount that differs from the invoice, an invalid invoice, or the same invoice twice. A batch is limited to 200 rows and needs a plan that includes batches.</p></div></details>
<details><summary>I got a 402. What now?</summary><div class="answer"><p>That is <code>entitlement_exceeded</code>: your plan's limit is reached or the feature is not in it. The response names which limit. See <a href="/pricing/#compare">the plan limits</a> and <a href="${APP.billing}">your usage</a>.</p></div></details>
<details><summary>Why did my recurring schedule not pay?</summary><div class="answer"><p>It is not supposed to. A schedule opens an “invoice needed” task each cycle, because a Lightning invoice is single-use. Supply the invoice and the payout goes through approval like any other.</p></div></details>
<details><summary>Can I get money back after a payment?</summary><div class="answer"><p>Lightning payments are final and Orynt cannot reverse them. A refund is a new payment that you create, approve and send.</p></div></details>
</div>`,
})}

${section({
  id: "support",
  title: "Contact support.",
  body: `<div class="two-col">
<div class="prose">
<p>Open a support request in the app, signed in or not. Signed in, safe diagnostics are attached automatically: ids, your plan, your role and the kinds of wallets you have connected. You get a reference number to quote. Categories: payment, wallet, billing, account, security, other (without an account: account, billing, security, other).</p>
<p>This is a one-person project, so replies can take days. There is no support SLA.</p>
<div class="btn-row">${ctaButton("support")}${ctaButton("pilot", "secondary")}</div>
</div>
<div class="callout callout--warn"><p><strong>Never send</strong> wallet credentials, macaroons, seed phrases, private keys or full invoices to support, here or anywhere else. We will not ask for them.</p></div>
</div>`,
})}

${ctaBand({ title: "Still stuck?", text: "Contact support with the request id from the error. If you have not tried Orynt yet, a free account is the quickest way to see how it behaves.", keys: ["support", "signup"], more: `<a class="btn btn--secondary" href="/status/">Check status</a>` })}
`,
};

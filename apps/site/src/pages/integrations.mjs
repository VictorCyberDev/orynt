import { table, tag } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";
import { APP, repoPath } from "../site.config.mjs";

const ok = (t) => tag(t, "ok");
const plan = (t = "Planned · not implemented") => tag(t, "pending");

// Wallet capability matrix. Only LND (and the labelled simulator) exist; every other row is stated as not implemented.
// Evidence: docs/EXECUTION-REGISTER.md (M4 rows; "NWC adapter, BTCPay adapter: NOT STARTED"), docs/product/product-spec.md, docs/hackathon/devpost-entry.md.
const wallets = [
  [
    "LND (REST)",
    ok("Verified · regtest"),
    "Yes",
    "Yes, by payment hash",
    "Discovered by authorization probes",
    "Rejected, with the reason shown",
    "Refused (mainnet is disabled)",
  ],
  [
    "Practice wallet (simulator)",
    tag("Built · labelled", "info"),
    "Simulated",
    "Simulated",
    "Simulated",
    "Simulated",
    "Not applicable",
  ],
  ["Nostr Wallet Connect (NWC)", plan(), "—", "—", "—", "—", "—"],
  ["BTCPay Server", plan(), "—", "—", "—", "—", "—"],
  ["Core Lightning", plan(), "—", "—", "—", "—", "—"],
  [
    "LNURL-pay and Lightning Address",
    ok("Verified · regtest, local LNURL server"),
    "Resolved to a checked BOLT11 invoice, then paid through LND",
    "As LND",
    "As LND",
    "As LND",
    "Refused (mainnet is disabled)",
  ],
];

const other = [
  [
    "REST API and OpenAPI",
    tag("Built", "neutral"),
    "JSON over HTTPS under <code>/v1</code>. The OpenAPI document is served at <code>/v1/openapi.json</code>.",
    `<a href="/developers/">Developers</a>`,
  ],
  [
    "TypeScript SDK",
    tag("Built · not on npm", "neutral"),
    "A typed client in the repository; it is not published to a package registry.",
    `<a href="/developers/#quickstart">Quickstart</a>`,
  ],
  [
    "Outbound webhooks",
    ok("Verified · tests"),
    "Signed with HMAC-SHA256, timestamped, at-least-once, de-duplicated by event id.",
    `<a href="/developers/#webhooks">Webhooks</a>`,
  ],
  [
    "Billing provider: sandbox",
    ok("Verified"),
    "Simulates checkout through the real signed-webhook path. No card is charged.",
    `<a href="/pricing/#billing-faq">Billing FAQ</a>`,
  ],
  [
    "Billing providers: Stripe, Paystack",
    plan("Implemented · not commissioned"),
    "Checkout and signature-verified webhooks are written but have never run against a live provider account. No real charge has ever happened.",
    `<a href="/pricing/#billing-faq">Billing FAQ</a>`,
  ],
  [
    "Email delivery",
    plan("Implemented · not commissioned"),
    "By default mail is written to an outbox and marked sent without being delivered. A Resend adapter exists but has never been exercised with a real key and a verified sending domain.",
    `<a href="/help/#account">Account help</a>`,
  ],
  [
    "CSV import and export",
    tag("Built", "neutral"),
    "Batch payouts in from CSV (up to 200 rows) and payout reports out as CSV. No accounting-package connectors.",
    `<a href="/solutions/">Solutions</a>`,
  ],
];

export default {
  path: "/integrations/",
  title: "Integrations",
  description:
    "Orynt's wallet capability matrix: LND, with LNURL-pay and Lightning Address on top, is verified on regtest; NWC, BTCPay and Core Lightning are not implemented. Plus what exists for API, webhooks, billing and email.",
  body: () => `
${pageHero({
  eyebrow: "Integrations",
  title: "One wallet type works. The rest are not built.",
  lead: "Orynt sits in front of a Lightning wallet you control. Today that means an LND node over REST, verified on Bitcoin regtest. This page says plainly what is and is not supported, so nobody plans around an adapter that does not exist.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Summary"><li>${ok("LND · verified on regtest")}</li><li>${ok("Lightning Address · regtest")}</li><li>${plan("NWC · BTCPay · Core Lightning")}</li><li>${tag("Mainnet disabled", "hypothesis")}</li></ul>`,
})}

${section({
  id: "wallets",
  title: "Wallet capability matrix.",
  intro: `Verified means a command was run against real software and the result recorded in ${repoPath("docs/EXECUTION-REGISTER.md")}: 15 real-node tests plus an end-to-end demo against bitcoind and two LND nodes on regtest.`,
  body: `${table({
    caption:
      "Wallet adapters and what each one supports. A dash means the capability does not exist because the adapter is not built.",
    head: [
      "Wallet",
      "Status",
      "Pay an invoice",
      "Look up a payment",
      "Capability discovery",
      "Read-only credential",
      "Mainnet",
    ],
    rows: wallets,
    className: "table--matrix table--wide",
  })}
<p class="small muted" style="margin-top:16px">“Planned” means we expect to look at it, not that it has a date. None of the planned adapters has code that can pay anything. Names of other products belong to their owners; listing them implies no partnership or endorsement.</p>`,
})}

${section({
  id: "lnd",
  tint: true,
  title: "Connecting LND.",
  body: `<div class="two-col">
<div class="prose">
<p>An operator connects an LND node over its REST interface with a macaroon. Orynt does not assume what the credential allows: it probes the permissions and records what it found. A credential that can only read cannot be used to send, and a connection that reports an unexpected network is refused.</p>
<p>Give Orynt the narrowest credential that works: one that can pay invoices and look up payments (LND's offchain read and write), never your admin macaroon. The credential is stored encrypted on the server.</p>
</div>
<div class="card">
<h3>What the real-node tests cover</h3>
<ul class="list list--ok">
<li>The invoice decoder agrees with LND's own decoding</li>
<li>A real payment, and a duplicate refused by the wallet</li>
<li>A lost response, then reconciliation: one payment only</li>
<li>Insufficient liquidity, expired invoice, payee node offline then retry</li>
<li>Read-only credential blocked; destination and network substitution rejected</li>
<li>10 concurrent executes produce 1 payment</li>
<li>Restart of our node in the middle of an uncertain payment</li>
</ul>
</div>
</div>
<p class="small muted" style="margin-top:20px">Not covered: mainnet, other LND versions than the one tested, other node implementations, and channel-management behaviour. First-use guide (public): <a href="${APP.guide}">${APP.guide}</a>.</p>`,
})}

${section({
  id: "payees",
  title: "What payees need to provide.",
  body: `<div class="two-col">
<div class="prose">
<p>Every payout is paid from a BOLT11 invoice. A Lightning invoice is single-use and expires, so a payee normally supplies a fresh one for each payout. Recurring schedules are built around this: each cycle opens a task that asks for a new invoice, and never pays by itself.</p>
<p>A payee can instead give a <strong>Lightning Address</strong> (<code>name@domain</code>, LUD-16). Orynt asks that server for an invoice for the exact amount and treats the answer as untrusted: it checks the amount, network, expiry and that the invoice commits to the advertised description before it can reach approval. The node key that signed the invoice is shown to the approver, because a name or domain alone is never proof of destination.</p>
</div>
<div class="callout callout--warn"><p><strong>How far that is verified.</strong></p><p>Against a local LNURL test server on regtest. It has not been run against real third-party Lightning Address providers. Keysend (spontaneous payments) is not supported, and the wallet-side fee limit is passed through but not separately asserted.</p></div>
</div>`,
})}

${section({
  id: "other",
  tint: true,
  title: "Everything else Orynt connects to.",
  body: `${table({ caption: "Other integration points and their status", head: ["Integration", "Status", "What exists", "Read more"], rows: other })}`,
})}

${ctaBand({ title: "Need a different wallet?", text: "Tell us which one and why. Demand is how we decide what to build next, and we will say plainly if we cannot verify it.", keys: ["pilot", "signup"] })}
`,
};

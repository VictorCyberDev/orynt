import { table, tag, esc } from "../helpers.mjs";
import { ctaBand, ctaButton, draftBanner, pageHero, section } from "../components.mjs";
import { DIMENSIONS, PLANS, MIGRATION_REPO_PATH, priceLabel, valueLabel, firstPlanWith } from "../plans.mjs";
import { APP, repoPath } from "../site.config.mjs";

// Every limit below is generated from the plan_definitions rows in the API migration (see src/plans.mjs).
// scripts/verify-claims.mjs re-reads the migration and fails if the built page disagrees.
export const HYPOTHESIS_NOTICE =
  "Pricing hypotheses under test — not final offers; the app currently uses a SANDBOX billing provider, no card is charged";

const cell = (p, key) =>
  `<span data-plan="${p.id}" data-ent="${key}" data-v="${p.entitlements[key]}">${esc(valueLabel(key, p.entitlements[key]))}</span>`;

const planCard = (p) => {
  const e = p.entitlements;
  const per = p.priceCents ? `<span class="price__per"> per month</span>` : "";
  const facts = [
    ["payouts_per_month", "payouts / month", "payout / month"],
    ["members", "team members", "team member"],
    ["wallets", "wallets", "wallet"],
  ].map(([k, l, one]) => `<li><strong>${esc(valueLabel(k, e[k]))}</strong> ${e[k] === 1 ? one : l}</li>`);
  facts.push(
    `<li>Batch CSV: <strong>${e.batch ? "yes" : "no"}</strong> &middot; Recurring: <strong>${e.recurring ? "yes" : "no"}</strong></li>`,
  );
  return `<article class="card plan" id="plan-${p.id}" aria-labelledby="plan-${p.id}-name">
<p class="plan__tag">${tag("Hypothesis", "hypothesis")}</p>
<h3 id="plan-${p.id}-name">${esc(p.name)}</h3>
<p class="price"><span class="price__amount">${esc(priceLabel(p))}</span>${per}</p>
<ul class="list plan__facts">${facts.join("")}</ul>
${p.priceCents === null ? `<p class="small muted">Not purchasable in the app. The checkout refuses it: this plan is by arrangement.</p>` : ""}
</article>`;
};

const billingFaq = [
  [
    "Will my card be charged?",
    `<p>No. The app is configured with a <strong>sandbox</strong> billing provider. Choosing a plan simulates a checkout and sends a correctly signed event through the same webhook code a real provider would use, so you can see plan changes and limits work. No card details are collected and no money moves.</p><p>Checkout for live Stripe and Paystack is written, but it is <strong>not commissioned</strong>: it has never been run against a live provider account, and no real charge has ever happened.</p>`,
  ],
  [
    "Why call these prices hypotheses?",
    `<p>Nobody has been asked what they would pay, and there are no customers or revenue. The figures are what we want to test. Every plan row in the catalogue is flagged as a hypothesis (<code>is_hypothesis</code> in <code>GET /v1/plans</code>), and we may change or drop any of them. The limits, by contrast, are real: the server enforces exactly the numbers in the table.</p>`,
  ],
  [
    "What happens when I reach a limit?",
    `<p>The server refuses the action with HTTP <code>402</code> and the code <code>entitlement_exceeded</code>. The response says which limit (<code>entitlement</code>), your plan, the <code>limit</code> and how much you have <code>used</code>. Hiding a button is not enforcement, so this applies to API calls too. Existing records stay; only new additions beyond the limit are refused. See the <a href="/developers/#limits">developer notes on 402 errors</a>.</p>`,
  ],
  [
    "What happens if a payment fails or I cancel?",
    `<p>Cancelling schedules the end of the paid period; the plan stays until then. If a subscription is cancelled or incomplete, or has been past due for more than 7 days, the account falls back to the free Developer limits, never to unlimited. In-app cancellation is not implemented for the Paystack provider.</p>`,
  ],
  [
    "Is Enterprise something I can buy?",
    `<p>Not today. The app refuses to check out the plan, which is by arrangement. In the entitlement configuration Enterprise has no numeric limits, but that does not come with single sign-on, uptime commitments or audit certifications: none of those exist. To talk about it, <a href="/contact/">request a pilot</a>.</p>`,
  ],
  [
    "Do you take a cut of my payouts?",
    `<p>No. There is no per-payment fee in any plan, and Orynt does not hold your funds. We lean towards flat pricing and would take legal advice before charging any other way. The offline receipt verifier and the receipt format are meant to stay free.</p>`,
  ],
  [
    "Taxes, invoices and refunds?",
    `<p>Not defined yet. There is no live billing account, so tax handling, invoices and a refund policy have not been written. They would be settled, and shown here, before any live checkout is switched on.</p>`,
  ],
  [
    "Where can I see my usage?",
    `<p>In the app, on the <a href="${APP.billing}">plan and billing page</a> (sign-in required): your current plan, status, and usage against each limit.</p>`,
  ],
];

export default {
  path: "/pricing/",
  title: "Pricing hypotheses",
  description:
    "Plan limits and pricing hypotheses under test: Developer free, Startup $29, Growth $99, Business $299, Enterprise custom per month. Not final offers; the app uses a sandbox billing provider and no card is charged.",
  body: () => `
${pageHero({
  eyebrow: "Pricing",
  title: "Plans and limits &mdash; prices are hypotheses.",
  lead: "The limits below are what the app enforces today. The monthly prices are what we are testing. Nothing here is a final offer.",
  extra: `<div class="callout callout--warn notice" role="note" style="margin-top:28px;max-width:48rem"><p><strong>${esc(HYPOTHESIS_NOTICE)}.</strong></p></div>
<div class="btn-row">${ctaButton("signup")}<a class="btn btn--secondary" href="${APP.billing}">See plans in the app</a>${ctaButton("pilot", "secondary")}</div>`,
})}

${section({
  id: "plans",
  title: "The five plans.",
  intro: `Monthly prices in US dollars. Read from the plan catalogue the server runs (${repoPath(MIGRATION_REPO_PATH)}).`,
  body: `<div class="grid grid--plans">${PLANS.map(planCard).join("\n")}</div>
<p class="small muted" style="margin-top:20px">${esc(HYPOTHESIS_NOTICE)}.</p>`,
})}

${section({
  id: "compare",
  tint: true,
  title: "Compare the limits.",
  intro:
    "Every number is an entitlement the server checks before it lets you add a resource. “Unlimited” is stored as −1 in the database.",
  body: `${table({
    caption: "Plan limits compared. Pricing hypotheses under test, not final offers.",
    head: ["Limit", ...PLANS.map((p) => esc(p.name))],
    rows: [
      [
        "Monthly price (hypothesis)",
        ...PLANS.map(
          (p) =>
            `<span data-plan="${p.id}" data-ent="price" data-v="${p.priceCents ?? "custom"}">${esc(priceLabel(p))}</span>`,
        ),
      ],
      ...DIMENSIONS.map((d) => [
        `${esc(d.label)}<span class="cell-note"><code>${d.key}</code> &middot; ${esc(d.note)}</span>`,
        ...PLANS.map((p) => cell(p, d.key)),
      ]),
    ],
    className: "table--plans table--wide",
  })}
<p class="small muted" style="margin-top:16px">Batch payouts need ${esc(firstPlanWith("batch").name)} or above; recurring schedules need ${esc(firstPlanWith("recurring").name)} or above. A batch also counts each valid row against the monthly payout limit, and a batch that would exceed it is refused as a whole.</p>`,
})}

${section({
  id: "everywhere",
  title: "On every plan, and on none.",
  body: `<div class="grid grid--2">
<article class="card"><h3>Not limited by plan</h3>
<p class="small muted">In the entitlement configuration these have no plan switch; only the counts above apply.</p>
<ul class="list list--ok">
<li>Signed approvals, send-once execution, reconciliation of uncertain payments</li>
<li>Signed receipts and the offline receipt verifier</li>
<li>Payout reports and CSV export (how far back they reach depends on the plan)</li>
<li>TOTP two-factor sign-in and team invitations (up to the member limit)</li>
<li>The REST API, TypeScript SDK and webhooks (up to the key and endpoint limits)</li>
<li>Support requests through <a href="/app/contact-support">Contact support</a></li>
</ul></article>
<article class="card"><h3>Not offered on any plan</h3>
<ul class="list list--no">
<li>Mainnet payments: mainnet execution is disabled</li>
<li>Single sign-on, uptime commitments or audit certifications</li>
<li>Wallet adapters other than LND (see <a href="/integrations/">integrations</a>)</li>
<li>A per-payment fee or any cut of payout volume</li>
</ul></article>
</div>`,
})}

${section({
  id: "billing-faq",
  tint: true,
  title: "Billing questions.",
  body: `<div class="faq">
${billingFaq.map(([q, a]) => `<details><summary>${q}</summary><div class="answer">${a}</div></details>`).join("\n")}
</div>
<p style="margin-top:28px"><a class="btn btn--secondary" href="${APP.billing}">Open plan and billing in the app</a></p>`,
})}

${section({
  id: "guardrails",
  title: "What we have promised ourselves.",
  body: `<div class="two-col">
<div class="prose">
<p>When we talk numbers with a team, we do it in conversation, after you have told us what the problem costs you today, and we label it as a test, not a quote.</p>
<p>A paid pilot, if you want one, is hands-on help mapping your workflow. No price is set for it. <a href="/contact/">Request a pilot</a> to talk it through.</p>
</div>
<div class="callout callout--info"><p><strong>Our guardrails.</strong></p>
<ul class="list">
<li>The offline verifier and the receipt format stay free, so anyone can check proof without Orynt.</li>
<li>Flat plans, not a share of payout volume, unless counsel advises otherwise.</li>
<li>No hidden fees, no false urgency, no automatic renewals in pilots.</li>
</ul></div>
</div>
<div style="margin-top:32px">${draftBanner("Draft — not reviewed by counsel")}<p class="small muted">Plan terms, refund and tax wording have not been reviewed by counsel. See the <a href="/terms/">draft terms</a>.</p></div>`,
})}

${ctaBand({ title: "Start on the free Developer plan.", text: "Create an account and try the whole flow on regtest. If you outgrow a limit, the app tells you exactly which one. Nothing is charged.", keys: ["signup", "pilot"], more: `<a class="btn btn--secondary" href="${APP.billing}">Plan and billing in the app</a>` })}
`,
};

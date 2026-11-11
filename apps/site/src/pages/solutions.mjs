import { tag, esc } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";
import { plan, firstPlanWith, valueLabel } from "../plans.mjs";

// Target use cases, written as hypotheses. No organisation uses Orynt today.
// Plan-fit lines are computed from the plan catalogue (src/plans.mjs), so they cannot drift from the migration.
const dev = plan("developer");
const startup = plan("startup");
const batchPlan = firstPlanWith("batch");
const recurPlan = firstPlanWith("recurring");
const ppm = (p) => valueLabel("payouts_per_month", p.entitlements.payouts_per_month);

const cases = [
  {
    id: "developer-payouts",
    title: "Developer payouts",
    who: "A product team or open-source maintainer that pays people from code: bounties, bug rewards, creator or referral rewards, sent over Lightning when something happens in their own system.",
    steps: [
      [
        "Create from code",
        "The backend calls <code>POST /v1/obligations</code> (or <code>obligations.create</code> in the SDK) with an API key. The payee, exact amount and invoice are recorded and the invoice is checked.",
      ],
      [
        "Humans approve",
        "The payout waits for the policy's signed approvals. API keys cannot approve, so software cannot release its own spending.",
      ],
      [
        "Execute once",
        "The backend calls execute with an <code>Idempotency-Key</code>. A <code>202</code> means “not certain yet”: it waits or reconciles and never sends again.",
      ],
      [
        "Close the loop",
        "A signed <code>payment.settled</code> webhook updates your own records, and the receipt can be attached to the reward.",
      ],
    ],
    fit: `The free ${esc(dev.name)} plan allows ${ppm(dev)} payouts a month, ${dev.entitlements.api_keys} API keys and ${dev.entitlements.webhooks} webhook endpoint${dev.entitlements.webhooks === 1 ? "" : "s"}.`,
    open: "Lightning invoices are single-use, so a payee supplies a fresh invoice for every payout, or a Lightning Address that Orynt resolves into a checked invoice. Whether that friction is acceptable for rewards is something we have not tested.",
  },
  {
    id: "contributor-funding",
    title: "Contributor funding",
    who: "Open-source projects, community programmes and grant makers that pay contributors in sats, on a schedule or in rounds.",
    steps: [
      [
        "Round of payouts",
        `A maintainer uploads a CSV (<code>counterparty,amount_sats,invoice</code>, optionally <code>memo</code> and <code>external_ref</code>, up to 200 rows). A preview flags bad rows without creating anything. Batch CSV needs the ${esc(batchPlan.name)} plan or above.`,
      ],
      [
        "Standing stipends",
        `A weekly or monthly schedule opens an “invoice needed” task each cycle. It never pays by itself: the contributor supplies a fresh invoice, which becomes a normal draft payout. Schedules need the ${esc(recurPlan.name)} plan or above.`,
      ],
      [
        "Approve and send",
        "Approvers sign each payout. Executing a batch sends every approved item through the normal single-use path, one by one; one failure or doubt never hides the others.",
      ],
      [
        "Report to funders",
        "A payout report and per-recipient statements export as CSV. They sum real settlements only and carry no fiat values.",
      ],
    ],
    fit: `Batch CSV starts at ${esc(batchPlan.name)}; recurring schedules start at ${esc(recurPlan.name)}. On ${esc(dev.name)} you can still create payouts one at a time.`,
    open: "Many such projects have little budget. This may suit the free plan and a self-hosted setup better than anything paid. A receipt proves a payment, not that a milestone was met.",
  },
  {
    id: "contractor-payments",
    title: "Contractor payments",
    who: "A small team that pays freelancers or contractors in Bitcoin over Lightning and wants a second person to approve, and a record of who agreed to what.",
    steps: [
      [
        "Know the payee",
        "Each contractor is a payee record, optionally bound to their Lightning node key so that a swapped invoice is caught. A payee can be suspended.",
      ],
      [
        "Record the work",
        "A payout carries a memo and your own reference, such as an invoice number, next to the amount and invoice.",
      ],
      [
        "Maker-checker",
        "A policy can require that the person who creates a payout is not the one who approves it. Each approver signs the exact terms.",
      ],
      [
        "Proof for both sides",
        "The contractor can verify the receipt offline with the standalone verifier, without an Orynt account. A recipient statement lists what was paid to them.",
      ],
    ],
    fit: `A small team fits within the ${esc(startup.name)} plan's ${startup.entitlements.members} members and ${ppm(startup)} payouts a month; the ${esc(dev.name)} plan allows ${dev.entitlements.members} members.`,
    open: "Orynt does not produce invoices, tax documents or fiat accounting, and does not check that work was delivered. Contractors have to be comfortable producing Lightning invoices.",
  },
  {
    id: "merchant-disbursements",
    title: "Merchant disbursements",
    who: "A merchant, marketplace or affiliate programme that owes refunds, supplier payments or commissions in Bitcoin, event by event or in a regular run.",
    steps: [
      [
        "Collect invoices",
        "Recipients send Lightning invoices. The batch preview checks each one: if an invoice carries an amount it must equal the amount in the file, and the same invoice twice in a file is flagged.",
      ],
      [
        "Review and submit",
        "Valid rows become draft payouts in a batch. Submitting the batch asks for approval on every item; failed rows are listed with the reason.",
      ],
      [
        "Run the batch",
        "Each approved item is executed on its own. A batch is “completed” only when every item has settled; it shows “partial” otherwise.",
      ],
      [
        "Handle exceptions",
        "Anything uncertain shows as “Checking wallet record” and opens an incident with notes and an owner, instead of being retried blindly.",
      ],
    ],
    fit: `Batches need the ${esc(batchPlan.name)} plan or above (${ppm(batchPlan)} payouts a month); a batch that would exceed the monthly limit is refused whole.`,
    open: "This is the weakest fit we can see: low volume, hard to reach, and other tools may cover it. A refund is a new payment, never a reversal, and recipients must provide an invoice or a Lightning Address. Lightning Address is verified only against a local test server, not real providers.",
  },
];

export default {
  path: "/solutions/",
  title: "Solutions",
  description:
    "Target use cases for Orynt, framed as hypotheses with the real features each workflow uses: developer payouts, contributor funding, contractor payments and merchant disbursements. No customers yet.",
  body: () => `
${pageHero({
  eyebrow: "Solutions",
  title: "Where we think Orynt could help.",
  lead: "Four target use cases, each written as a workflow in terms of features that exist in the app today. They are hypotheses: no organisation uses Orynt, and we are not describing any customer.",
  extra: `<ul class="state-chips" style="margin-top:24px" aria-label="Status"><li>${tag("Target use cases", "hypothesis")}</li><li>${tag("No customers", "neutral")}</li><li>${tag("Regtest only", "hypothesis")}</li></ul>
<nav aria-label="Use cases on this page" class="toc"><ul>${cases.map((c) => `<li><a href="#${c.id}">${c.title}</a></li>`).join("")}</ul></nav>`,
})}

${section({
  id: "cases",
  body: `<div class="stack">
${cases
  .map(
    (c) => `<article class="card solution" id="${c.id}" aria-labelledby="${c.id}-t">
<p style="margin-bottom:12px">${tag("Target use case", "hypothesis")} ${tag("No customers", "neutral")}</p>
<h2 id="${c.id}-t" style="font-size:1.75rem;margin-bottom:16px">${c.title}</h2>
<dl class="kv">
<div><dt>Who it might suit</dt><dd>${c.who}</dd></div>
<div><dt>Workflow</dt><dd><ol class="mini-steps">${c.steps.map(([t, d]) => `<li><span><strong>${t}</strong>${d}</span></li>`).join("")}</ol></dd></div>
<div><dt>Plan fit</dt><dd>${c.fit}</dd></div>
<div><dt>What we don&rsquo;t know</dt><dd>${c.open}</dd></div>
</dl>
</article>`,
  )
  .join("\n")}
</div>
<p class="small muted" style="margin-top:20px">Plan limits are read from the current plan catalogue; prices are <a href="/pricing/">hypotheses under test</a>.</p>`,
})}

${section({
  id: "fit",
  tint: true,
  title: "Probably not a fit.",
  body: `<div class="grid grid--2">
<ul class="list list--no">
<li>You want something to <strong>hold, convert or lend</strong> funds, or to run KYC. Orynt does none of that.</li>
<li>You want <strong>fully automatic spending</strong> with no human approval.</li>
<li>You need an <strong>audit report or certification today</strong>. None exists.</li>
<li>You need <strong>mainnet</strong> payments now. Mainnet is disabled.</li>
</ul>
<ul class="list list--no">
<li>You need a wallet other than LND. NWC, BTCPay and Core Lightning adapters are not built (<a href="/integrations/">integrations</a>).</li>
<li>You make only a handful of payouts a month. A wallet and a notebook may serve you well.</li>
<li>You already use a tool that does the approvals you need. If BTCPay Server&rsquo;s payout approvals are enough, use them.</li>
</ul>
</div>`,
})}

${ctaBand({ title: "Does one of these sound like you?", text: "Try the flow on regtest with a free account, or tell us how you pay people today, including what goes wrong. That is the most useful thing we can learn right now.", keys: ["signup", "pilot"] })}
`,
};

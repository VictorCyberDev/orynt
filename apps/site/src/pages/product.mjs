import { svgPartial, table, tag } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";

const status = tag("Designed · not yet verified");

const steps = [
  {
    id: "obligation",
    title: "Obligation",
    lead: "Write down the payout before anything moves: who, how much, and which invoice.",
    does: "An operator creates or imports a payout with the payee, the exact amount (whole millisatoshis, never decimals) and a Lightning invoice. Orynt decodes the invoice, checks its signature, and binds its network, amount, expiry and payee node key to the record. Any edit creates a new immutable revision and cancels earlier approvals.",
    prevents: "Paying a different amount, network or node than was agreed. Approving something that has since changed.",
    limits: "Orynt checks that the invoice is well formed and matches the record. To catch a swapped invoice, bind the payee to their node key.",
  },
  {
    id: "approval",
    title: "Approval",
    lead: "The right people approve the exact payout, and their approval is signed.",
    does: "A policy decides how many approvers are needed (for example maker-checker, thresholds, limits). Each approver signs the exact payout fingerprint (the &ldquo;intent digest&rdquo;) with an Ed25519 key held on their own device. Roles are checked when approving and checked again at execution.",
    prevents: "&ldquo;I thought you meant a different amount.&rdquo; One person creating and approving their own payout. Approvals that quietly survive an edit.",
    limits: "Operators and API keys cannot approve. What a signature means legally is a question for counsel, not something we claim.",
  },
  {
    id: "execution",
    title: "Execution",
    lead: "An approved payout is reserved exactly once, then sent through your wallet.",
    does: "A single-use, durable execution record is reserved in PostgreSQL inside a transaction, before the wallet is called. The wallet adapter is chosen per workspace: a real LND node (REST) on regtest, or a simulator that is always clearly labelled.",
    prevents: "Double sends from a double click, a retry or two operators acting at once.",
    limits: "Only an LND REST adapter and the simulator exist. Mainnet execution is not enabled by default.",
  },
  {
    id: "truth",
    title: "Truthful state",
    lead: "If the wallet&rsquo;s answer is lost, the payout says so, and waits.",
    does: "States only move forward and are based on evidence. A lost response becomes <strong>Unknown</strong>, then <strong>Reconciling</strong>, never Failed. A second send is refused until the wallet&rsquo;s own record, looked up by payment hash, says what happened. An expired invoice is not proof of failure.",
    prevents: "Paying twice because a timeout looked like a failure. Leaving a payee unpaid because nobody was sure.",
    limits: "Orynt can only be as truthful as the wallet&rsquo;s record. If the wallet cannot answer, a person resolves the case with fresh evidence, and that action is logged.",
  },
  {
    id: "evidence",
    title: "Evidence",
    lead: "A receipt anyone can check, without asking us.",
    does: "A versioned receipt binds the agreement, the approvals (with their signatures), the payee, amount and invoice, and the wallet&rsquo;s payment result including the payment preimage. Hashing the preimage gives the payment hash, which is cryptographic proof of payment independent of Orynt. A standalone command-line verifier checks it offline and rejects tampered, replayed, stale or forged receipts.",
    prevents: "Disputes that rest on screenshots. Needing to trust Orynt&rsquo;s database to prove a payment happened.",
    limits: "A receipt cannot prove that work was delivered or good, that an agreement is legally enforceable, that no other payments exist, or that funds were held in trustless escrow. You obtain the issuer&rsquo;s public key out-of-band; the verifier tells you when it is missing.",
  },
  {
    id: "platform",
    title: "Developer platform",
    lead: "Everything above is available to your own code.",
    does: "A REST API described by OpenAPI, a typed TypeScript SDK, signed webhooks and the verifier CLI. See the <a href=\"/developers/\">developer page</a> for real samples.",
    prevents: "Rebuilding payout safety logic inside every internal script.",
    limits: "Early and unstable. The SDK lives in the repository and is not published to a package registry.",
  },
];

const stateRows = [
  ["DRAFT", "Being prepared. Can be edited.", "No"],
  ["AWAITING_APPROVAL", "Frozen and waiting for the required approvers.", "No"],
  ["APPROVED", "Enough valid signed approvals.", "No"],
  ["EXECUTION_RESERVED", "The single send has been reserved; the wallet has not been called yet.", "No"],
  ["DISPATCHING", "The wallet is being asked to pay.", "Possibly"],
  ["PENDING", "The wallet says the payment is in flight.", "Possibly"],
  ["UNKNOWN", "No reliable answer. Sending again is refused.", "Possibly"],
  ["RECONCILING", "Asking the wallet for its authoritative record.", "Possibly"],
  ["SETTLED", "The wallet&rsquo;s record shows it paid, with the preimage.", "Yes"],
  ["SIMULATED_SETTLED", "Settled in the simulator only. Not a real payment.", "No (simulated)"],
  ["DEFINITIVELY_FAILED", "The wallet&rsquo;s record proves it did not pay. Only now can a new attempt start.", "No"],
  ["REJECTED", "An approver declined it. Only possible before any send.", "No"],
  ["CANCELLED", "Stopped before any send.", "No"],
].map(([s, m, mv]) => [`<code>${s}</code>`, m, mv]);

export default {
  path: "/product/",
  title: "Product",
  description:
    "How Orynt works in six steps: obligation, approval, execution, truthful state, evidence and a developer platform. Designed for Lightning payouts; early-stage and not yet audited.",
  body: () => `
${pageHero({
  eyebrow: "Product",
  title: "From &ldquo;we owe them&rdquo; to &ldquo;here is the proof&rdquo;.",
  lead: "Orynt is a layer between the decision to pay and the wallet that sends the money. This is the whole flow, in plain language.",
  extra: `<div class="callout callout--neutral" style="margin-top:28px;max-width:44rem"><p><strong>How to read the status labels.</strong> &ldquo;Designed &middot; not yet verified&rdquo; means the behaviour is specified and code exists, but the project&rsquo;s execution register does not yet mark it verified. Nothing here has been audited or used with real customer funds.</p></div>`,
})}

${section({
  id: "flow",
  title: "The six steps",
  body: `<ol class="steps">
${steps
  .map(
    (s) => `<li id="${s.id}"><div class="steps__body">
<h3>${s.title} ${status}</h3>
<p class="lead" style="font-size:1.1875rem">${s.lead}</p>
<dl class="kv">
<div><dt>What happens</dt><dd>${s.does}</dd></div>
<div><dt>What it prevents</dt><dd>${s.prevents}</dd></div>
<div><dt>Limits</dt><dd>${s.limits}</dd></div>
</dl>
</div></li>`,
  )
  .join("\n")}
</ol>`,
})}

${section({
  id: "states",
  tint: true,
  title: "Payment states, and why Unknown is not red.",
  intro: "States only move forward, and each move needs evidence. The colour carries meaning: green is proven paid, indigo is not yet proven either way, red is proven not paid.",
  body: `<figure class="figure">
<div class="only-wide">${svgPartial("states-wide")}</div>
<div class="only-narrow">${svgPartial("states-narrow")}</div>
<figcaption>The path of a payout. The shaded area is the case the product is built around: the wallet&rsquo;s answer is lost or unclear. The payout stays Unknown until the wallet&rsquo;s own record settles it.</figcaption>
</figure>
<div style="margin-top:40px">
<h3 style="margin-bottom:16px">Every state, in words</h3>
${table({
  caption: "Payment states",
  head: ["State", "Meaning", "Money may have moved?"],
  rows: stateRows,
})}
</div>`,
})}

${section({
  id: "wallet",
  title: "Works in front of a wallet you control.",
  body: `<div class="grid grid--2">
<div class="prose">
<p>Orynt does not hold funds. An operator connects a Lightning wallet they control, and Orynt discovers what that connection is allowed to do rather than assuming. The credentials you hand over decide what Orynt could do with your money, so give the least permission that works.</p>
<p>Today that means an <strong>LND node over REST on Bitcoin regtest</strong>, or a <strong>simulator</strong> that is always labelled and can never produce a real receipt. Other wallet types are not built.</p>
</div>
<div class="callout callout--warn"><p><strong>Where the limits live.</strong></p><p>Approval rules, roles and limits are enforced inside Orynt. They are not enforced by the wallet. If someone holds your wallet credentials directly, they can bypass Orynt entirely. Read the <a href="/security/">security page</a> for the full picture.</p></div>
</div>`,
})}

${ctaBand({ title: "Want to see it on regtest with your own workflow?", text: "Tell us how you pay people today. We will walk through the flow on test funds and tell you honestly where it does not fit." })}
`,
};

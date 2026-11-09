import { tag } from "../helpers.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";

const cases = [
  {
    id: "payouts",
    title: "Bitcoin payouts",
    who: "A team that pays ten or more people each cycle in Bitcoin over Lightning, with at least two humans involved in the decision: someone who asks, someone who approves.",
    flow: "The person running payouts lists each obligation with an invoice. Approvers review and sign. Each payout is sent once through the team&rsquo;s own wallet, and every payout ends with a state and a receipt instead of a screenshot.",
    open: "How often do lost responses and double payments really happen at this size? We have no data yet, and a careful operator may be fine with a wallet UI and a spreadsheet.",
  },
  {
    id: "contributors",
    title: "Contributor payments",
    who: "Open-source projects, community programmes and wallet teams that pay contributors, bounty hunters or rewards in sats, sometimes by script.",
    flow: "A maintainer or ops engineer creates payouts through the CLI or API. A second person approves above a threshold. Webhooks tell the project&rsquo;s own tools when a payout settles.",
    open: "Many such projects are volunteer-run with little budget. This may be a good fit for the free self-hosted core and a poor fit for anything paid.",
  },
  {
    id: "grants",
    title: "Grants",
    who: "Grant programmes and foundations that fund work in Bitcoin and pay recipients in instalments or at milestones.",
    flow: "Each instalment is an obligation tied to a reference such as a grant ID. Approvals record who agreed, on exactly what. When a funder or board asks for proof of payment, the receipt can be checked without anyone from the programme.",
    open: "A receipt proves a payment and its approvals. It does not prove that a milestone was met. Programmes may want accounting exports, which are not built yet.",
  },
  {
    id: "merchants",
    title: "Merchant operations",
    who: "Merchants that owe refunds or settlements in Bitcoin, event by event and at low volume.",
    flow: "Support raises a refund as an obligation, finance approves it, and the refund is sent once with a clear record of what was paid and why.",
    open: "This is the weakest fit we can see so far: low volume, hard to reach, and other tools may already cover it. We list it because the problem is real, not because we have evidence of demand.",
  },
];

export default {
  path: "/use-cases/",
  title: "Use cases",
  description:
    "Target use cases for Orynt, framed as hypotheses: Bitcoin payouts, contributor payments, grants and merchant operations. No customers yet.",
  body: () => `
${pageHero({
  eyebrow: "Use cases",
  title: "Where we think Orynt could help.",
  lead: "These are target use cases, written as hypotheses. No organisation uses Orynt today, and we are not describing any customer.",
})}

${section({
  id: "cases",
  body: `<div class="grid" style="gap:32px">
${cases
  .map(
    (c) => `<article class="card" id="${c.id}">
<p style="margin-bottom:12px">${tag("Hypothesis", "hypothesis")} ${tag("No customers", "neutral")}</p>
<h2 style="font-size:1.75rem;margin-bottom:16px">${c.title}</h2>
<dl class="kv">
<div><dt>Who it might suit</dt><dd>${c.who}</dd></div>
<div><dt>What Orynt would do</dt><dd>${c.flow}</dd></div>
<div><dt>What we don&rsquo;t know</dt><dd>${c.open}</dd></div>
</dl>
</article>`,
  )
  .join("\n")}
</div>`,
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
</ul>
<ul class="list list--no">
<li>You make only a handful of payouts a month. A wallet and a notebook may serve you well; the free self-hosted core may still be worth a look.</li>
<li>You already use a tool that does the approvals you need. If BTCPay Server&rsquo;s payout approvals are enough, use them.</li>
</ul>
</div>`,
})}

${ctaBand({ title: "Does one of these sound like you?", text: "Tell us how you pay people today, including what goes wrong. That is the most useful thing we can learn right now." })}
`,
};

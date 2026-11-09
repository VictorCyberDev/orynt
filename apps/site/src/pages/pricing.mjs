import { table, tag } from "../helpers.mjs";
import { ctaBand, draftBanner, pageHero, section } from "../components.mjs";

const tiers = [
  [
    "Developer Core",
    "Developers, open-source projects, evaluators",
    "Self-hosted API, SDK, CLI, offline receipt verifier, simulator and regtest.",
    "Free. The licence for the core is not finally decided.",
    tag("Hypothesis", "hypothesis"),
  ],
  [
    "Team Cloud",
    "Small teams that want hosted operation without running a database",
    "Hosted workspaces, policy set-up, longer evidence retention, managed upgrades, support.",
    "Paid, flat per workspace or per approver seat. To be tested. No price set.",
    tag("Hypothesis", "hypothesis"),
  ],
  [
    "Paid pilot",
    "The first three to five organisations",
    "Hands-on onboarding, mapping your payout workflow, integration help, measured results.",
    "A one-off fee, to find out whether anyone would pay. No price set.",
    tag("Hypothesis", "hypothesis"),
  ],
  [
    "Enterprise",
    "—",
    "Single sign-on, uptime commitments, audit certifications.",
    "Not offered. None of these exist, and none are planned in the near term.",
    tag("Not offered", "neutral"),
  ],
];

export default {
  path: "/pricing/",
  title: "Pricing hypotheses",
  description:
    "Pricing hypotheses, not offers. Orynt's intended shape: a free open-source core and possible paid team or cloud tiers, all unvalidated and without prices.",
  body: () => `
${pageHero({
  eyebrow: "Pricing",
  title: "Pricing hypotheses &mdash; not offers.",
  lead: "Nothing on this page can be bought. There is no price list, no billing entity and no sign-up. These are the models we intend to test in real conversations, and we may drop any of them.",
  extra: draftBanner("Draft — not reviewed by counsel").replace('class="draft-banner"', 'class="draft-banner" style="margin:28px 0 0"'),
})}

${section({
  id: "tiers",
  title: "The shape we expect to test.",
  body: `${table({
    caption: "Pricing hypotheses by tier. None of these is an offer.",
    head: ["Tier", "For", "Intended to include", "Hypothesis", "Status"],
    rows: tiers,
  })}
<p class="small muted" style="margin-top:16px">&ldquo;Intended to include&rdquo; describes design intent. A feature counts as built only when the project&rsquo;s execution register marks it verified.</p>`,
})}

${section({
  id: "numbers",
  tint: true,
  title: "Why there are no prices here.",
  body: `<div class="two-col">
<div class="prose">
<p>We have not asked any customer what they would pay, so any figure we printed would be invented. We also have not yet had counsel review pricing, and there is no entity to bill from.</p>
<p>When we do talk numbers, we will do it in conversation, after you have told us what the problem costs you today, and we will label it as a test, not a quote.</p>
</div>
<div class="callout callout--info"><p><strong>Our guardrails.</strong></p>
<ul class="list">
<li>The offline verifier and the receipt format stay free, so anyone can check proof without Orynt.</li>
<li>We lean towards flat or per-approver pricing, not a cut of payout volume, and will take legal advice before charging any other way.</li>
<li>No hidden fees, no false urgency, no automatic renewals in pilots.</li>
</ul></div>
</div>`,
})}

${section({
  id: "learn",
  title: "What we would like to learn from you.",
  body: `<ul class="list" style="max-width:44rem">
<li>What do you spend today to pay people in Bitcoin: tools, hosting, hours?</li>
<li>Who holds the budget for something like this, and what would they need to see?</li>
<li>Would the free self-hosted core be enough for you? If so, say so; that is a useful answer.</li>
</ul>`,
})}

${ctaBand({ title: "Tell us what it is worth to you, or that it is not.", text: "Either answer helps. Nothing is sold through this site and no payment details are collected.", button: "Share your view" })}
`,
};

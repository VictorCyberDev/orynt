import { draftBanner, pageHero, section } from "../components.mjs";

export default {
  path: "/terms/",
  title: "Terms of use (draft)",
  description: "Draft terms for using the Orynt website. Information only; no offers; early-stage software. Not reviewed by counsel.",
  body: () => `
${pageHero({
  eyebrow: "Terms",
  title: "Terms of use.",
  lead: "What you can and cannot rely on when you read this site.",
  extra: `<div style="margin-top:28px">${draftBanner("Draft — not reviewed by counsel")}</div>`,
})}
${section({
  id: "terms",
  body: `<div class="prose">
<h2>Information only</h2>
<p>Everything here is general information about an early-stage project. It is not an offer, a price quote, a contract, or financial, legal or tax advice. Statements about what Orynt does describe design intent unless they say a capability is verified.</p>

<h2>Early-stage software</h2>
<p>Orynt is unaudited and is developed on Bitcoin regtest. Do not use it with funds you cannot afford to lose, and do not rely on anything on this site for a decision about real money.</p>

<h2>No warranties</h2>
<p>The site and its content are provided &ldquo;as is&rdquo;, without warranties of any kind, and may be incomplete or wrong. If you spot a mistake, please tell us.</p>

<h2>Pricing and plans</h2>
<p>Pricing material is a set of hypotheses. Nothing can be purchased through this site, and no price here is binding.</p>

<h2>Third-party names</h2>
<p>Names of other products and projects belong to their owners. Mentioning them implies no partnership or endorsement. Comparisons are based on public documentation and may be out of date.</p>

<h2>Using the contact form</h2>
<p>Please do not send wallet credentials, keys, seed phrases or anything unlawful, and do not use the form to attack or overload the service.</p>

<h2>Liability, governing law, and the rest</h2>
<p>Limits of liability, governing law and similar terms are to be written and reviewed by counsel before launch. They are deliberately left unwritten here rather than copied from a template.</p>
</div>`,
})}
`,
};

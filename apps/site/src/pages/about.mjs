import { ctaBand, pageHero, section } from "../components.mjs";
import { repoPath } from "../site.config.mjs";

export default {
  path: "/about/",
  title: "About",
  description:
    "Orynt is an early-stage, solo-founder project building careful payment authorization for Bitcoin-native teams. No team page, because there is no team.",
  body: () => `
${pageHero({
  eyebrow: "About",
  title: "A small project with a narrow goal.",
  lead: "Bitcoin-native teams should be able to pay people without guessing whether a payment happened, or who agreed to it.",
})}

${section({
  id: "mission",
  title: "Mission.",
  body: `<div class="prose">
<p>Making a Lightning payment is easy. Running payments as a team is harder: agreeing on what is owed, getting the right approvals, sending each payment once, and being able to prove afterwards what happened.</p>
<p>Orynt tries to be the careful layer in front of a wallet you already control. It aims to be calm about uncertainty, plain about its limits, and checkable by people who do not trust it.</p>
</div>`,
})}

${section({
  id: "honesty",
  tint: true,
  title: "Who is behind it.",
  body: `<div class="two-col">
<div class="prose">
<p><strong>Orynt is currently one person&rsquo;s project.</strong> There is no team to introduce, no advisors, no investors and no customers, and we will not fill this page with any.</p>
<p>That has consequences you should weigh: one person is a single point of failure for support, security and continuity. Receipts are designed to verify offline without Orynt precisely so that your evidence does not depend on the project surviving.</p>
</div>
<div class="callout callout--neutral"><p><strong>The name is provisional.</strong></p><p>&ldquo;Orynt&rdquo; is a working name. No trademark or domain clearance has been established, and we make no claim of ownership of the name.</p></div>
</div>`,
})}

${section({
  id: "how",
  title: "How we work.",
  body: `<div class="grid grid--3">
<article class="card"><h3>Say what is verified</h3><p>A capability is described as built only when the project&rsquo;s execution register marks it verified, with evidence. Everything else is called designed, planned or a hypothesis.</p></article>
<article class="card"><h3>Test before claiming</h3><p>Whether anyone needs this, and would pay for it, is unproven. We plan interviews and small pilots with clear success and failure criteria, and we are prepared to stop.</p></article>
<article class="card"><h3>Open by default</h3><p>The repository currently carries an Apache-2.0 licence file; the long-term licence for the core is still an open decision. Source and planning documents, including the honest ones, are in ${repoPath("docs")}.</p></article>
</div>`,
})}

${ctaBand({ title: "Want to help test the idea?", text: "If you pay people in Bitcoin as a team, a conversation about what goes wrong today is the most useful thing you can give us." })}
`,
};

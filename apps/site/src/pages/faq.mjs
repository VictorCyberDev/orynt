import { pageHero, section, ctaBand } from "../components.mjs";

const qa = [
  ["Is Orynt a wallet?", `<p>No. Orynt sits in front of a Lightning wallet you already control and adds records, approvals, send-once execution, truthful state and receipts. It does not hold your funds.</p>`],
  ["Can I use it with real money today?", `<p>We do not recommend it. Orynt is developed on Bitcoin regtest, mainnet execution is off by default, and a run against a real Lightning node on regtest is still pending. It has not been audited.</p>`],
  ["What happens if my wallet does not answer?", `<p>The payout becomes <strong>Unknown</strong>, then <strong>Reconciling</strong>. Orynt asks the wallet for its own record of the payment, looked up by payment hash, and refuses a second send until that record says what happened. An expired invoice alone is not treated as proof of failure.</p>`],
  ["Can an approval be bypassed?", `<p>By anyone who goes around Orynt. Approval rules are enforced by the Orynt application, not by your wallet. If someone holds your wallet credentials directly, Orynt cannot stop them. Give Orynt the least wallet permission that works. See <a href="/security/#enforcement">who enforces what</a>.</p>`],
  ["What does a receipt prove, and what does it not?", `<p>It binds the agreement, the signed approvals and the wallet&rsquo;s payment result, including the preimage whose hash is the payment hash. That is proof a payment happened, checkable offline. It does not prove that work was delivered or good, that the agreement is legally enforceable, that no other payments exist, or that funds were held in escrow.</p>`],
  ["Is the audit log immutable?", `<p>No. It is tamper-evident: entries are chained by hashes, so changes can be detected, but a database administrator can still rewrite rows.</p>`],
  ["Isn&rsquo;t this just BTCPay Server?", `<p>BTCPay Server is a mature, open-source, self-hosted tool whose documentation describes an approval step for payouts. If it already does what you need, use it. Orynt explores additions around it: multiple signed approvals, an explicit Unknown state, and receipts you can verify offline. Whether those additions matter enough to anyone is exactly what we are trying to find out. Our comparison is based on reading public documentation, not on running the products.</p>`],
  ["Is it open source? What will it cost?", `<p>The repository currently contains an Apache-2.0 licence file, but the long-term licence for the core is not decided. Pricing is a set of <a href="/pricing/">hypotheses, not offers</a>; no prices exist.</p>`],
  ["Who is behind it?", `<p>One person. There is no team, no advisors and no customers. See <a href="/about/">About</a>.</p>`],
  ["Why is the name &ldquo;provisional&rdquo;?", `<p>No trademark or domain clearance has been established for &ldquo;Orynt&rdquo;. It may change.</p>`],
  ["Do you store my data when I use the contact form?", `<p>Yes: the name, email, organisation, message and consent you submit, so we can reply. The site itself uses no cookies, analytics or third-party scripts. See the <a href="/privacy/">privacy notice (draft)</a>.</p>`],
];

export default {
  path: "/faq/",
  title: "FAQ",
  description: "Plain answers about what Orynt is, what it is not, its limits, receipts, status, licence and pricing.",
  body: () => `
${pageHero({ eyebrow: "FAQ", title: "Questions, answered plainly.", lead: "Including the uncomfortable ones." })}
${section({
  id: "faq",
  body: `<div class="faq">
${qa.map(([q, a]) => `<details><summary>${q}</summary><div class="answer">${a}</div></details>`).join("\n")}
</div>`,
})}
${ctaBand({ title: "Not answered here?", text: "Ask. If we do not know, we will say so.", button: "Ask a question" })}
`,
};

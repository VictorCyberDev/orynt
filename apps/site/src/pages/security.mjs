import { existsSync, readdirSync } from "node:fs";
import { table, tag } from "../helpers.mjs";
import { REGISTER_PATH } from "../register.mjs";
import { ctaBand, pageHero, section } from "../components.mjs";
import { repoPath } from "../site.config.mjs";

const secDocs = REGISTER_PATH.replace("EXECUTION-REGISTER.md", "security");
const secDocsEmpty = !existsSync(secDocs) || readdirSync(secDocs).length === 0;

const glance = [
  ["Independent audit, penetration test or certification", "None. No SOC 2, ISO 27001, penetration test, code review by an outside party, or bug bounty exists.", tag("Not done", "danger")],
  ["Real funds", "Local development uses Bitcoin regtest only. Mainnet execution is not enabled by default, and we are not asking anyone to use Orynt with real funds.", tag("Regtest only", "hypothesis")],
  ["Custody of funds or keys", "Designed not to. The operator connects a wallet they control. Whether that is legally &ldquo;non-custodial&rdquo; is an open question for counsel.", tag("Designed", "neutral")],
  ["Protection against a double send", "A single-use execution record is reserved before the wallet is called; a second send is refused until the wallet&rsquo;s own record says what happened.", tag("Designed · not yet verified", "neutral")],
  ["Real Lightning regtest run", "Pending. The simulator is clearly labelled and is not a real payment.", tag("Pending", "pending")],
  ["Security contact and disclosure policy", "Not published yet.", tag("Planned", "pending")],
  ["Who is responsible for security", "One person, the founder. There is no dedicated security role and no second reviewer yet.", tag("Honest limit", "hypothesis")],
];

export default {
  path: "/security/",
  title: "Security and status",
  description:
    "Orynt's trust centre: threat model summary, what is enforced by the application versus the wallet, tamper-evident versus immutable logs, regtest-only status, and what has not been audited.",
  body: () => `
${pageHero({
  eyebrow: "Security and status",
  title: "What we have designed, and what nobody has checked yet.",
  lead: "This page separates three things: what is designed, what is verified, and what is not done. Orynt is early-stage and <strong>nothing here has been audited</strong>.",
})}

${section({
  id: "glance",
  title: "At a glance.",
  body: table({ caption: "Security status at a glance", head: ["Question", "Honest answer", "Status"], rows: glance }),
})}

${section({
  id: "threats",
  tint: true,
  title: "Threat model, in summary.",
  intro: `This is a plain-language summary drawn from the product brief and the due-diligence notes. It is <strong>not</strong> a formal threat model; it is not a substitute for a reviewed security document set.`,
  body: `<div class="grid grid--2">
<article class="card">
<h3>What the design tries to prevent</h3>
<ul class="list list--ok">
<li><strong>Changed details after approval.</strong> Edits create new revisions and cancel earlier approvals; approvals sign an exact fingerprint of the payout.</li>
<li><strong>Paying twice.</strong> One reservation per send, and no second send while the first is unresolved.</li>
<li><strong>Unclear approvals.</strong> Signatures from device-held keys; roles checked at approval and again at execution.</li>
<li><strong>Treating doubt as failure.</strong> A lost answer is Unknown until the wallet&rsquo;s record says otherwise.</li>
<li><strong>Forged or replayed receipts and webhooks.</strong> Signatures, timestamps and an offline verifier.</li>
<li><strong>Quietly rewritten history.</strong> A hash-chained audit log makes edits detectable.</li>
</ul>
<p class="small muted">All of the above is design intent. None is independently reviewed.</p>
</article>
<article class="card">
<h3>What it does not defend against</h3>
<ul class="list list--no">
<li><strong>Anyone holding your wallet credentials directly.</strong> They can bypass Orynt.</li>
<li><strong>A compromised Orynt server that also holds wallet credentials.</strong> Not yet assessed; we make no guarantee.</li>
<li><strong>A database administrator editing rows.</strong> See tamper-evident below.</li>
<li><strong>A stolen approver device, or an approver who is tricked.</strong></li>
<li><strong>Paying the wrong real-world person, or paying for work that is never delivered.</strong></li>
<li><strong>Bugs in your wallet, node or the Lightning network.</strong></li>
</ul>
</article>
</div>`,
})}

${section({
  id: "enforcement",
  title: "Who enforces what.",
  intro: "The most important limit on this page.",
  body: `<div class="grid grid--2">
<article class="card"><span class="card__kicker">Enforced by Orynt (application level)</span>
<ul class="list">
<li>How many approvers a payout needs, and who may approve</li>
<li>Thresholds and policy rules</li>
<li>One send per approved payout</li>
<li>Payment states and the receipt</li>
</ul></article>
<article class="card"><span class="card__kicker">Enforced by your wallet or node</span>
<ul class="list">
<li>Whether money can move at all</li>
<li>What the credentials you give Orynt are allowed to do</li>
<li>Any spending limits you set in the wallet itself</li>
</ul></article>
</div>
<div class="callout callout--warn" style="margin-top:24px;max-width:48rem"><p><strong>In short:</strong> protection of funds is only as strong as the wallet permissions you give Orynt.</p><p>Orynt&rsquo;s rules are checked inside Orynt. They cannot stop someone who goes around it. Give the least permission that works, and consider keeping only what a payout cycle needs in the connected wallet.</p></div>`,
})}

${section({
  id: "log",
  tint: true,
  title: "Tamper-evident, not immutable.",
  body: `<div class="two-col">
<div class="prose"><p>Every important action is written to an audit log whose entries are chained by hashes, with signed checkpoints. If an entry is changed later, the chain stops adding up and a check can show it.</p>
<p>That is <strong>not</strong> the same as immutable. A database administrator can rewrite rows, and the chain only helps if you also kept an earlier copy of a checkpoint. We have not built external anchoring of checkpoints.</p></div>
<div class="prose"><p>This is why receipts matter. A receipt carries the wallet&rsquo;s payment preimage, and hashing it gives the payment hash. That proof of payment does not depend on Orynt&rsquo;s database at all, and the offline verifier checks it without contacting us.</p>
<p>A receipt proves a payment. It does not prove delivery or quality of work, legal enforceability, the absence of other payments, or escrow.</p></div>
</div>`,
})}

${section({
  id: "regtest",
  title: "Regtest only, for now.",
  body: `<div class="prose"><p>Orynt is developed and demonstrated on Bitcoin <strong>regtest</strong>, a private test network with no monetary value. Mainnet execution is switched off by default.</p>
<p>A run against a <em>real</em> Lightning node on regtest is still pending; until it is done and recorded, anything that looks like a real payment in the product is a simulator payment, and is labelled that way.</p></div>`,
})}

${section({
  id: "not-done",
  tint: true,
  title: "What is not audited or not done.",
  body: `<div class="grid grid--2">
<ul class="list list--no">
<li>Independent code, architecture or cryptography review</li>
<li>Penetration test</li>
<li>SOC 2, ISO 27001 or any other certification</li>
<li>Bug bounty</li>
<li>Signed releases, software bill of materials, reproducible builds</li>
<li>Insurance</li>
</ul>
<ul class="list list--no">
<li>Backups, disaster recovery and uptime commitments</li>
<li>Hosting, subprocessors and data residency for any hosted tier</li>
<li>Written incident-response plan</li>
<li>External anchoring of audit checkpoints</li>
<li>Single sign-on and a multi-factor sign-in design</li>
<li>Legal review of the design (see <a href="/terms/">terms</a>, <a href="/privacy/">privacy</a>)</li>
</ul>
</div>`,
})}

${section({
  id: "report",
  title: "Reporting a problem.",
  body: `<div class="prose"><p>There is no formal vulnerability-disclosure policy or dedicated security address yet; that is planned. Until it exists, you can <a href="/contact/">use the contact form</a> and start your message with &ldquo;security&rdquo;. Please describe the issue in general terms and <strong>do not include secrets, keys or exploit details</strong> in the form.</p></div>`,
})}

${section({
  id: "docs",
  tint: true,
  title: "Read the sources.",
  intro: "These documents sit in the project repository. The statements on this site are drawn from them.",
  body: `<ul class="list">
<li>${repoPath("docs/product/PRODUCT-BRIEF.md")} — what Orynt does and its honest limits</li>
<li>${repoPath("docs/EXECUTION-REGISTER.md")} — what is verified, with evidence</li>
<li>${repoPath("docs/business/security-due-diligence.md")} — buyer security questions and the honest answers</li>
<li>${repoPath("docs/business/risk-register.md")} — product, technical, market and regulatory risks</li>
<li>${repoPath("docs/business/legal-regulatory-register.md")} — open questions for counsel</li>
<li>${repoPath("docs/research/differentiation-review.md")} — a candid look at where Orynt is, and is not, different</li>
</ul>
${secDocsEmpty ? `<p class="small muted" style="margin-top:16px">${tag("Note", "neutral")} The repository&rsquo;s <code>docs/security/</code> folder was empty when this site was built, so there is no formal threat-model document to link.</p>` : `<p class="small muted" style="margin-top:16px">More security documents: ${repoPath("docs/security")}.</p>`}`,
})}

${ctaBand({ title: "Security questions for a pilot?", text: "Ask them. If we cannot answer honestly, we will say so, and that goes on our to-do list." })}
`,
};

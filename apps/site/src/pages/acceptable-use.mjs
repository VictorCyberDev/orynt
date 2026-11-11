import { draftBanner, pageHero, section, ctaBand } from "../components.mjs";

export default {
  path: "/acceptable-use/",
  title: "Acceptable use policy (draft)",
  description:
    "Draft acceptable use policy for Orynt: what you may not do with the service. Not reviewed by counsel; no public instance exists yet.",
  body: () => `
${pageHero({
  eyebrow: "Acceptable use",
  title: "Acceptable use policy.",
  lead: "What we expect of people who use Orynt, and what we may act on. Short and plain, and not yet checked by a lawyer.",
  extra: `<div style="margin-top:28px">${draftBanner("Draft — not reviewed by counsel")}<p class="small muted" style="max-width:44rem">This draft was written without legal advice and has not been adopted by any legal entity. It describes our intent and will change. It is not a contract, and no public instance exists to which it could apply yet.</p></div>`,
})}
${section({
  id: "aup",
  body: `<div class="prose">
<h2>The short version</h2>
<p>Use Orynt to pay people you are entitled to pay, with money you are entitled to spend, in ways that are lawful where you and they are. Do not use it to hurt others or to hurt the service.</p>

<h2>You may not</h2>
<ul>
<li><strong>Break the law.</strong> That includes paying for illegal goods or services, financing terrorism, laundering money, evading sanctions, or taking part in fraud, scams or extortion.</li>
<li><strong>Spend money that is not yours to spend.</strong> Do not use a wallet, credential or approval key without the authority of whoever owns it, and do not get around another organisation's approval controls.</li>
<li><strong>Misrepresent payments.</strong> Do not present a simulator payment as real, alter a receipt, or use a receipt to claim a payment that did not happen.</li>
<li><strong>Attack or overload the service.</strong> No scanning, probing or load testing against an instance you do not run or have permission to test, no attempts to bypass rate limits, plan limits or tenant isolation, and no malicious uploads in CSV or text fields.</li>
<li><strong>Evade limits.</strong> Do not create accounts or workspaces to get around plan limits or a suspension.</li>
<li><strong>Send secrets to us.</strong> Never put wallet credentials, macaroons, seed phrases, private keys or API keys into forms, support requests or notes.</li>
<li><strong>Harass or target people.</strong> Do not use payment memos, references or recipient names to abuse, threaten or expose anyone, and do not add other people's personal data you have no reason to hold.</li>
</ul>

<h2>Things to keep in mind</h2>
<ul>
<li>Lightning payments are final. Orynt cannot reverse them or recover funds sent to the wrong place.</li>
<li>Orynt does not hold funds, check who a payee really is, or judge whether a payment is lawful. Those responsibilities stay with you.</li>
<li>You are responsible for everyone you invite to your workspace and every API key you create.</li>
</ul>

<h2>What we may do</h2>
<p>If we believe this policy is being broken, we may ask you to stop, restrict or suspend a workspace or key, or close an account. A formal process for notice, appeals and reporting to authorities has not been written, and will be set out, with counsel, before any public launch.</p>

<h2>Reporting abuse</h2>
<p>To report misuse or a security problem, use <a href="/app/contact-support">Contact support</a>. Please describe it in general terms and do not include secrets or exploit details.</p>

<h2>Related drafts</h2>
<p>See the <a href="/terms/">terms of use</a> and the <a href="/privacy/">privacy notice</a>, both also unreviewed drafts.</p>
</div>`,
})}
${ctaBand({ title: "Questions about what is allowed?", text: "Ask before you build around something that might not be. We would rather answer than guess.", keys: ["support", "pilot"], more: "" })}
`,
};

import { esc, svgPartial } from "../helpers.mjs";
import { ctaBand, ctaButton, section } from "../components.mjs";
import { readRegister, verifiedRows } from "../register.mjs";
import { repoPath } from "../site.config.mjs";

function statusStrip() {
  const reg = readRegister();
  const verified = verifiedRows(reg);
  const verifiedHtml = verified.length
    ? `<ul class="list list--ok">${verified.map((r) => `<li><strong>${esc(r.milestone)}</strong> — ${esc(r.workstream)} <span class="tag tag--ok">${esc(r.status)}</span></li>`).join("")}</ul>`
    : `<p><strong>Nothing is marked VERIFIED yet.</strong> We only call something &ldquo;working&rdquo; when the project&rsquo;s execution register lists it as verified, with a command and evidence behind it. Today the register shows:</p>
<ul class="list list--pending" style="margin-top:12px">${reg.rows.map((r) => `<li><strong>${esc(r.milestone)}</strong> — ${esc(r.workstream)} <span class="tag tag--pending">${esc(r.status)}</span></li>`).join("") || "<li>The register could not be read when this page was built, so we are claiming nothing.</li>"}</ul>
<p class="small muted" style="margin-top:12px">Code for the API, SDK, verifier and wallet adapters exists in the repository, with automated tests, but we describe it as <em>designed and under construction</em> until the register says otherwise.</p>`;
  return `<section class="section section--tint" id="status" aria-labelledby="status-title">
<div class="container">
<div class="status-strip">
<div class="status-strip__head"><h2 id="status-title">Honest status</h2><p class="small muted">Early-stage. Read this before anything else on this site.</p></div>
<div class="status-strip__cols">
<div>
<h3><span class="tag tag--ok">Verified</span> Checked in this project</h3>
${verifiedHtml}
</div>
<div>
<h3><span class="tag tag--pending">Open</span> Not yet verified</h3>
<ul class="list list--no">
<li><strong>Mainnet is disabled.</strong> Real Lightning payments are verified on Bitcoin regtest only, a test network with no monetary value.</li>
<li><strong>One wallet type.</strong> NWC, BTCPay and Core Lightning adapters are not built. Lightning Address payments are verified on regtest against a local test server only.</li>
<li><strong>No human audit.</strong> One AI-assisted independent code review was done and its findings fixed; no penetration test, human security audit, SOC 2 or other certification exists.</li>
<li><strong>Billing is a sandbox.</strong> Live Stripe and Paystack checkout is written but not commissioned; no card has ever been charged.</li>
<li><strong>Nothing is deployed publicly</strong>, and there are <strong>no customers</strong>, revenue, testimonials or usage numbers.</li>
<li>Pricing, willingness to pay and market size are <strong>unvalidated hypotheses</strong>. The name &ldquo;Orynt&rdquo; has unresolved trademark risk and no domain is owned.</li>
</ul>
</div>
</div>
<p class="status-strip__foot">Source of truth: ${repoPath("docs/EXECUTION-REGISTER.md")}, read when this site was built. More detail on the <a href="/security/">security and status page</a>.</p>
</div>
</div>
</section>`;
}

const steps = [
  [
    "Obligation",
    "Record who is owed what: the exact amount and a Lightning invoice that is decoded, checked and bound to the payout.",
  ],
  [
    "Approval",
    "The right people approve the exact payout, each signing with a key held on their own device.",
  ],
  ["Execution", "An approved payout is reserved once, then sent through a wallet you control."],
  [
    "Truthful state",
    "If an answer is lost, the payout says <strong>Unknown</strong>, not Failed, and is not sent twice.",
  ],
  [
    "Evidence",
    "A receipt ties the agreement, the approvals and proof of payment together. A separate command-line verifier checks it offline.",
  ],
  [
    "Developer platform",
    "A REST API, a typed TypeScript SDK and signed webhooks, so payouts can live inside your own tools.",
  ],
];

export default {
  path: "/",
  title: "Every payment. Under control.",
  description:
    "Orynt is early-stage software that sits in front of a Lightning wallet you control: obligations, signed approvals, send-once execution, truthful payment state and checkable receipts.",
  body: () => `
<section class="hero" aria-labelledby="hero-title">
<div class="container hero__grid">
<div>
<p class="status-pill">Early-stage &middot; Real Lightning verified on regtest &middot; Mainnet disabled &middot; Not yet audited</p>
<h1 id="hero-title">Your payments, under control.</h1>
<p class="lead">Orynt sits in front of a Lightning wallet you already control. It records what you owe, gets the right people to approve it, sends each payment once, and keeps proof you can check without trusting us.</p>
<div class="btn-row">
${ctaButton("signup")}
${ctaButton("login", "secondary")}
${ctaButton("pilot", "secondary")}
</div>
<p class="small muted" style="margin-top:16px">Free Developer plan. Practice wallet or your own regtest node. No card is charged. <a href="/product/">See how it works</a>.</p>
<p class="hero__tagline">Every payment. Under control.</p>
</div>
<figure class="figure">
${svgPartial("hero")}
<figcaption>Illustration: the scattered places a payout leaves traces, resolving into one ordered receipt. Not a real receipt.</figcaption>
</figure>
</div>
</section>

${section({
  id: "problem",
  tint: true,
  title: "Paying people in Bitcoin leaves a trail in too many places.",
  intro:
    "Teams that pay contractors, contributors or grant recipients over Lightning often keep each piece somewhere different.",
  body: `<div class="grid grid--3">
<article class="card"><h3>Scattered records</h3><p>The amount is in a spreadsheet, the &ldquo;ok&rdquo; is in a chat, the payment is in a wallet app, and the proof is a screenshot. Answering &ldquo;who approved this, and was it paid?&rdquo; becomes detective work.</p></article>
<article class="card"><h3>A lost answer</h3><p>When a wallet&rsquo;s reply is lost mid-payment, nobody can tell whether the money moved. People either retry and risk paying twice, or wait and leave someone unpaid.</p></article>
<article class="card"><h3>Weak proof</h3><p>A screenshot shows what someone saw, not what was agreed or who authorised it. Accountants, funders and payees often ask for more.</p></article>
</div>
<p class="small muted" style="margin-top:20px">These are the problems the product is designed around. We have not yet measured how often they occur for real teams; that is one of the things we want to learn.</p>`,
})}

${section({
  id: "what",
  title: "One careful path from &ldquo;we owe them&rdquo; to &ldquo;here is the proof&rdquo;.",
  body: `<ol class="grid grid--3 steps-grid" style="list-style:none;margin:0;padding:0">
${steps
  .map(
    ([t, d], i) =>
      `<li class="card"><span class="card__kicker">Step ${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`,
  )
  .join("")}
</ol>
<div class="btn-row"><a class="btn btn--secondary" href="/product/">See the full flow</a><a class="btn btn--secondary" href="/developers/">For developers</a></div>`,
})}

<section class="section section--tint" aria-labelledby="unknown-title">
<div class="container two-col">
<div>
<p class="eyebrow">Truthful state</p>
<h2 id="unknown-title">When the answer is lost, we say &ldquo;unknown&rdquo;. Not &ldquo;failed&rdquo;.</h2>
<p class="lead" style="margin-top:20px">A payout only becomes <em>failed</em> when the wallet&rsquo;s own record proves it. Until then, sending again is refused, because the first attempt may still have gone through.</p>
<p style="margin-top:16px"><a href="/product/#states">See the state timeline</a></p>
</div>
<div>
<div class="callout callout--unknown">
<p><strong>Unknown is indigo, on purpose.</strong></p>
<p>It is a situation to work through, not an error to panic about. Orynt asks the wallet what happened and shows what is known and what is not.</p>
</div>
<ul class="state-chips" aria-label="Three possible outcomes">
<li><span class="chip-state chip-state--ok">SETTLED</span></li>
<li><span class="chip-state chip-state--unknown">UNKNOWN</span></li>
<li><span class="chip-state chip-state--danger">DEFINITIVELY_FAILED</span></li>
</ul>
<p class="small muted" style="margin-top:12px">Green when proven paid. Indigo when not yet proven either way. Red only when proven not paid.</p>
</div>
</div>
</section>

${section({
  id: "not",
  title: "What Orynt is not.",
  intro: "Clear limits are part of the design.",
  body: `<div class="grid grid--2">
<ul class="list list--no">
<li><strong>Not a custodian.</strong> Orynt does not hold your funds. You connect a wallet you control.</li>
<li><strong>Not an exchange, escrow service or lender.</strong></li>
<li><strong>Not a trading tool.</strong></li>
<li><strong>Not an autonomous AI spender.</strong> People approve payouts; software does not decide to spend.</li>
</ul>
<div class="callout callout--warn">
<p><strong>Honest limit.</strong></p>
<p>Approval and limit checks are enforced by the Orynt application, not by the wallet. Protection of funds is only as strong as the permissions you give Orynt in your wallet. See <a href="/security/">security</a>.</p>
</div>
</div>`,
})}

${section({
  id: "app",
  tint: true,
  title: "What you can do in the app today.",
  intro:
    'Beyond a single payout. Each of these exists in the app and the API; the limits per plan are on the <a href="/pricing/">pricing page</a>.',
  body: `<div class="grid grid--3">
<article class="card"><h3>Batch CSV payouts</h3><p>Upload up to 200 rows. A preview flags bad rows without creating anything, and each item still needs its own approval.</p></article>
<article class="card"><h3>Recurring schedules</h3><p>Weekly or monthly. Each cycle asks for a fresh invoice and never pays by itself.</p></article>
<article class="card"><h3>Reports and CSV</h3><p>Payout reports and recipient statements. Only real settlements are summed; no fiat values.</p></article>
<article class="card"><h3>Teams and sign-in</h3><p>Invite teammates, set roles, turn on authenticator-app (TOTP) two-factor sign-in.</p></article>
<article class="card"><h3>API, SDK and webhooks</h3><p>A typed client and signed webhooks. Plan limits are enforced on the server and surface as <code>402</code> errors.</p></article>
<article class="card"><h3>Plans and support</h3><p>Plans with real limits, billed through a sandbox provider for now. Support requests with safe diagnostics attached.</p></article>
</div>
<p class="small muted" style="margin-top:20px">Single payouts are verified against real LND nodes on regtest. Batches, schedules, reports, accounts and billing are verified with the practice wallet and automated tests, not on real nodes. Support requests and analytics are implemented, with less testing.</p>
<div class="btn-row"><a class="btn btn--secondary" href="/platform/">How the platform works</a><a class="btn btn--secondary" href="/solutions/">Target use cases</a><a class="btn btn--secondary" href="/pricing/">Pricing hypotheses</a></div>`,
})}

<section class="section" id="start" aria-labelledby="start-title">
<div class="container">
<div class="section__head"><h2 id="start-title">Three ways to start.</h2></div>
<div class="grid grid--3">
<article class="card"><h3>Try it yourself</h3><p>Create an account, connect the practice wallet or a regtest LND node, and send a first payout through approval to a receipt.</p><p>${ctaButton("signup")}</p></article>
<article class="card"><h3>Come back</h3><p>Already have a workspace? Sign in to your payouts, approvals and receipts.</p><p>${ctaButton("login", "secondary")}</p></article>
<article class="card"><h3>Talk first</h3><p>Want to walk through your own workflow before touching anything? Ask for a pilot conversation, or ask support a question.</p><p>${ctaButton("pilot", "secondary")} ${ctaButton("support", "secondary")}</p></article>
</div>
</div>
</section>

${statusStrip()}

${ctaBand()}
`,
};

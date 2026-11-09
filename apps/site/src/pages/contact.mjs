import { pageHero, section } from "../components.mjs";
import { LEADS_ENDPOINT } from "../site.config.mjs";

export default {
  path: "/contact/",
  title: "Request a pilot conversation",
  description:
    "Ask for a demo or a pilot conversation about Orynt. Early-stage, regtest first, no payment taken. Your message goes to the project's own API, with explicit consent.",
  body: () => `
${pageHero({
  eyebrow: "Contact",
  title: "Request a pilot conversation.",
  lead: "Tell us how you pay people today and what goes wrong. We will reply personally. This is an early-stage project, so a first conversation is about learning, not selling.",
})}

${section({
  id: "form",
  body: `<div class="contact-grid">
<div>
<noscript><div class="callout callout--warn" role="note"><p><strong>This form needs JavaScript.</strong></p><p>It sends your request with a small script, and scripts appear to be turned off in your browser. Please enable JavaScript for this page and reload. We have not published an email address, so there is no other way to reach us from this site yet.</p></div></noscript>
<form id="lead-form" class="form js-only" method="post" action="#" data-endpoint="${LEADS_ENDPOINT}" novalidate>
<div class="field">
<label for="f-name">Your name <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span></label>
<input class="input" id="f-name" name="name" type="text" autocomplete="name" required maxlength="120">
<p class="field__error" id="err-name"></p>
</div>
<div class="field">
<label for="f-email">Email <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span></label>
<input class="input" id="f-email" name="email" type="email" autocomplete="email" required maxlength="200">
<p class="field__error" id="err-email"></p>
</div>
<div class="field">
<label for="f-org">Organisation <span class="muted">(optional)</span></label>
<input class="input" id="f-org" name="organization" type="text" autocomplete="organization" maxlength="200">
<p class="field__error" id="err-organization"></p>
</div>
<div class="field">
<label for="f-message">What do you want to talk about? <span class="muted">(optional)</span></label>
<textarea class="input" id="f-message" name="message" rows="5" maxlength="2000" aria-describedby="h-message"></textarea>
<p class="hint" id="h-message">For example: how many people you pay each month, how you approve and track it, and what has gone wrong. Please do not include wallet credentials, seed phrases or invoices.</p>
<p class="field__error" id="err-message"></p>
</div>
<div class="field">
<div class="check">
<input id="f-consent" name="consent" type="checkbox" required>
<label for="f-consent">I agree that Orynt may store my name, email, organisation and message in order to reply to this request. I can ask for them to be deleted. See the <a href="/privacy/">privacy notice (draft)</a>. <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span></label>
</div>
<p class="field__error" id="err-consent"></p>
</div>
<div id="form-status" class="form-status" hidden></div>
<div><button class="btn btn--primary" type="submit">Send request</button></div>
</form>
</div>
<aside aria-labelledby="expect-title">
<div class="card">
<h2 id="expect-title" style="font-size:1.5rem;margin-bottom:12px">What to expect</h2>
<ul class="list">
<li>A personal reply from the one person who runs the project, which can take a few days.</li>
<li>Honest answers, including &ldquo;that is not built&rdquo; and &ldquo;a different tool fits you better&rdquo;.</li>
<li>Regtest first. We will not ask you to put real funds at risk.</li>
<li>No payment is taken, and no account is created.</li>
</ul>
</div>
<div class="callout callout--warn" style="margin-top:20px"><p><strong>Please never send</strong> wallet credentials, macaroons, seed phrases, API keys or private keys, here or anywhere else.</p></div>
</aside>
</div>`,
})}
`,
};

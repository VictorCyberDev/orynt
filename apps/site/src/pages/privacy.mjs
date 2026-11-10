import { draftBanner, pageHero, section } from "../components.mjs";

export default {
  path: "/privacy/",
  title: "Privacy notice (draft)",
  description: "Draft privacy notice for the Orynt website: no cookies or analytics; contact-form details are stored with your consent. Not reviewed by counsel.",
  body: () => `
${pageHero({
  eyebrow: "Privacy",
  title: "Privacy notice.",
  lead: "Short and plain. The site collects very little.",
  extra: `<div style="margin-top:28px">${draftBanner("Draft — not reviewed by counsel")}</div>`,
})}
${section({
  id: "privacy",
  body: `<div class="prose">
<h2>Who is responsible</h2>
<p>This site is run by the individual behind the Orynt project. A legal entity has not been confirmed, and full operator and contact details will be added before launch. Until then, to reach us about your data, use the <a href="/contact/">contact form</a>.</p>

<h2>What the site collects</h2>
<ul>
<li><strong>Browsing.</strong> No cookies, no analytics, no advertising or tracking scripts, no local storage, and no third-party fonts or embeds. Fonts are served from this site. A build-time check fails if any page loads something from another host or if the scripts touch cookies or storage. We do not measure visits at all. Whoever hosts the site may keep ordinary server logs (for example IP address, time and page requested). We have not yet documented how long those are kept.</li>
<li><strong>Contact form.</strong> If you submit it: your name, email address, organisation and message (the last two are optional), a record that you ticked the consent box, the label &ldquo;site&rdquo; showing where the request came from, and the time it was received.</li>
</ul>

<h2>If you create an account in the app</h2>
<p>The app at <code>/app</code> is separate from this site and does collect data, because it has to: your name and email, a salted password hash, your workspace&rsquo;s payouts, payees, approvals and audit log, wallet credentials you connect (stored encrypted), and any support request you send, with safe diagnostics (ids, plan, role, kinds of wallets; never credentials). When you sign in it sets one strictly necessary session cookie, <code>orynt_session</code> (HTTP-only, 12 hours).</p>
<p><strong>Product analytics are counts only.</strong> The app records the name of an activation event (for example &ldquo;checkout started&rdquo;) and your workspace id, with a timestamp. It records no user id, no amounts, no payee data and no page content, and sends nothing to a third party. A workspace can read its own counts.</p>
<p>The app&rsquo;s own terms, retention periods and processors are not written yet.</p>

<h2>Why, and on what basis</h2>
<p>We use contact-form details only to reply to your request and to understand who is interested. Our basis is your consent, which you give by ticking the box. We do not sell data, share it with advertisers, or add you to a mailing list.</p>

<h2>Where it goes</h2>
<p>Form submissions are sent to Orynt&rsquo;s own API and stored in its database. The hosting provider, region and any processors are not yet decided and will be listed here before launch.</p>

<h2>How long we keep it</h2>
<p>A retention period has not been decided. You can ask us at any time to delete your request.</p>

<h2>Your choices</h2>
<p>You can ask to see, correct or delete what we hold about you, or withdraw consent, through <a href="/app/contact-support">Contact support</a> or the <a href="/contact/">contact form</a>. Depending on where you live, you may have further rights under local law; we have not yet had that checked.</p>

<h2>Children</h2>
<p>This site is not aimed at children, and we do not knowingly collect their data.</p>

<h2>Changes</h2>
<p>This is a draft and will change. A reviewed version will replace it before any launch.</p>
</div>`,
})}
`,
};

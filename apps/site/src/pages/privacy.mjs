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
<li><strong>Browsing.</strong> No cookies, no analytics, no advertising or tracking scripts, and no third-party fonts or embeds. Fonts are served from this site. Whoever hosts the site may keep ordinary server logs (for example IP address, time and page requested). We have not yet documented how long those are kept.</li>
<li><strong>Contact form.</strong> If you submit it: your name, email address, organisation and message (the last two are optional), a record that you ticked the consent box, the label &ldquo;site&rdquo; showing where the request came from, and the time it was received.</li>
</ul>

<h2>Why, and on what basis</h2>
<p>We use contact-form details only to reply to your request and to understand who is interested. Our basis is your consent, which you give by ticking the box. We do not sell data, share it with advertisers, or add you to a mailing list.</p>

<h2>Where it goes</h2>
<p>Form submissions are sent to Orynt&rsquo;s own API and stored in its database. The hosting provider, region and any processors are not yet decided and will be listed here before launch.</p>

<h2>How long we keep it</h2>
<p>A retention period has not been decided. You can ask us at any time to delete your request.</p>

<h2>Your choices</h2>
<p>You can ask to see, correct or delete what we hold about you, or withdraw consent, through the <a href="/contact/">contact form</a>. Depending on where you live, you may have further rights under local law; we have not yet had that checked.</p>

<h2>Children</h2>
<p>This site is not aimed at children, and we do not knowingly collect their data.</p>

<h2>Changes</h2>
<p>This is a draft and will change. A reviewed version will replace it before any launch.</p>
</div>`,
})}
`,
};

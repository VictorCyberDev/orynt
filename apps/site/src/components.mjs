import { esc } from "./helpers.mjs";

export const pageHero = ({ eyebrow, title, lead, extra = "" }) => `<section class="page-hero">
<div class="container">
${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
<h1>${title}</h1>
${lead ? `<p class="lead">${lead}</p>` : ""}
${extra}
</div>
</section>`;

export const ctaBand = ({ title = "Tell us about your payouts.", text = "We are looking for a small number of conversations with teams that pay people in Bitcoin over Lightning. No sales pressure, no payment taken, regtest first.", button = "Request a pilot conversation" } = {}) => `<section class="band" aria-labelledby="cta-title">
<div class="container">
<h2 id="cta-title">${esc(title)}</h2>
<p>${esc(text)}</p>
<div class="btn-row"><a class="btn btn--primary" href="/contact/">${esc(button)}</a><a class="btn btn--secondary" href="/security/">Read the honest security status</a></div>
</div>
</section>`;

export const draftBanner = (text = "Draft — not reviewed by counsel") => `<p class="draft-banner" role="note">${esc(text)}</p>`;

export const section = ({ id, tint = false, tight = false, title, intro = "", body, headingId }) => {
  const hid = headingId ?? (id ? `${id}-title` : undefined);
  return `<section class="section${tint ? " section--tint" : ""}${tight ? " section--tight" : ""}"${id ? ` id="${id}"` : ""}${hid ? ` aria-labelledby="${hid}"` : ""}>
<div class="container">
${title ? `<div class="section__head"><h2${hid ? ` id="${hid}"` : ""}>${title}</h2>${intro ? `<p>${intro}</p>` : ""}</div>` : ""}
${body}
</div>
</section>`;
};

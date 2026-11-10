import { esc } from "./helpers.mjs";
import { CTA } from "./site.config.mjs";

export const pageHero = ({ eyebrow, title, lead, extra = "" }) => `<section class="page-hero">
<div class="container">
${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
<h1>${title}</h1>
${lead ? `<p class="lead">${lead}</p>` : ""}
${extra}
</div>
</section>`;

/** A button link for one of the four standard calls to action. kind: primary | secondary */
export const ctaButton = (key, kind = "primary", label) => `<a class="btn btn--${kind}" href="${CTA[key].href}">${esc(label ?? CTA[key].label)}</a>`;

/** Row of standard CTA buttons, e.g. ctaRow(["signup","pilot"]). The first is primary, the rest secondary. */
export const ctaRow = (keys = ["signup", "pilot"], { extra = "", style = "" } = {}) =>
  `<div class="btn-row"${style ? ` style="${style}"` : ""}>${keys.map((k, i) => ctaButton(k, i === 0 ? "primary" : "secondary")).join("")}${extra}</div>`;

export const ctaBand = ({
  title = "Try it on regtest, or tell us about your payouts.",
  text = "Create a free account and use the practice wallet or your own regtest node, or ask for a pilot conversation. No sales pressure, no card charged, no real funds at risk.",
  keys = ["signup", "pilot"],
  more = `<a class="btn btn--secondary" href="/security/">Read the honest security status</a>`,
} = {}) => `<section class="band" aria-labelledby="cta-title">
<div class="container">
<h2 id="cta-title">${esc(title)}</h2>
<p>${esc(text)}</p>
${ctaRow(keys, { extra: more })}
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

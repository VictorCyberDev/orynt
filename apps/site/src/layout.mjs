import { esc } from "./helpers.mjs";
import { NAV, FOOTER, NAME, TAGLINE, SITE_URL, CTA } from "./site.config.mjs";

const abs = (path) => (SITE_URL ? SITE_URL + path : path);

const FONT_PRELOADS = ["inter-latin-wght-normal.woff2", "fraunces-latin-wght-normal.woff2"];

export function head(page) {
  const title = page.path === "/" ? `${NAME} — ${TAGLINE}` : `${page.title} — ${NAME}`;
  const url = abs(page.path);
  const img = abs("/brand/og.png");
  const jsonLd = page.path === "/" ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: NAME })}</script>` : "";
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex">' : ""}<link rel="canonical" href="${esc(url)}">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="same-origin">
<meta name="theme-color" content="#f6f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a1220" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${NAME} — ${TAGLINE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
${FONT_PRELOADS.map((f) => `<link rel="preload" href="/fonts/${f}" as="font" type="font/woff2" crossorigin>`).join("\n")}
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/boot.js"></script>
<script src="/js/site.js" defer></script>
${jsonLd}
${page.headExtra ?? ""}
</head>`;
}

function logo(cls) {
  return `<picture><source srcset="/brand/logo-dark.svg" media="(prefers-color-scheme: dark)"><img class="${cls}" src="/brand/logo.svg" width="135" height="33" alt="${NAME}"></picture>`;
}

export function header(page) {
  const items = NAV.map((n) => {
    const current = page.path === n.href || (n.href !== "/" && page.path.startsWith(n.href));
    return `<li><a href="${n.href}"${current ? ' aria-current="page"' : ""}>${esc(n.label)}</a></li>`;
  }).join("");
  return `<header class="site-header">
<div class="container site-header__bar">
<a class="brand" href="/" aria-label="${NAME} home">${logo("brand__logo")}</a>
<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="menu-toggle__label">Menu</span><span class="menu-toggle__icon" aria-hidden="true"></span></button>
<nav class="site-nav" id="site-nav" aria-label="Primary">
<ul class="site-nav__list">${items}</ul>
</nav>
<div class="header-actions">
<a class="btn btn--secondary btn--sm" href="${CTA.login.href}">${CTA.login.label}</a>
<a class="btn btn--primary btn--sm" href="${CTA.signup.href}">${CTA.signup.label}</a>
</div>
</div>
</header>`;
}

export function footer() {
  const cols = Object.entries(FOOTER)
    .map(
      ([title, links]) =>
        `<div class="footer-col"><h2 class="footer-col__title">${esc(title)}</h2><ul>${links.map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`).join("")}</ul></div>`,
    )
    .join("");
  return `<footer class="site-footer">
<div class="container">
<div class="site-footer__top">
<div class="site-footer__brand">
<a class="brand" href="/" aria-label="${NAME} home">${logo("brand__logo")}</a>
<p class="site-footer__tag">${TAGLINE}</p>
</div>
${cols}
</div>
<div class="site-footer__legal">
<p><strong>Early-stage and unaudited.</strong> Nothing on this site is an offer, a price quote, or financial, legal or tax advice. Real Lightning payments are verified on Bitcoin regtest only; mainnet is disabled. Billing uses a sandbox provider and no card is charged. ${NAME} is a provisional name: no trademark or domain clearance has been established.</p>
</div>
</div>
</footer>`;
}

export function renderPage(page, bodyHtml) {
  return `<!doctype html>
<html lang="en">
${head(page)}
<body${page.bodyClass ? ` class="${page.bodyClass}"` : ""}>
<a class="skip-link" href="#main">Skip to main content</a>
${header(page)}
<main id="main" tabindex="-1">
${bodyHtml}
</main>
${footer()}
</body>
</html>
`;
}

// Site-wide configuration. Override at build time with environment variables.
//
// ORYNT_SITE_URL  absolute origin used for canonical/OG/sitemap. The name "Orynt" and any domain are NOT cleared,
//                 so by default canonical links are relative and the sitemap uses the reserved ".example" TLD as a
//                 clearly fake placeholder. Set the real origin only once a domain has been secured.
// ORYNT_API_BASE  origin of the Orynt API for the contact form (default: same origin, i.e. /v1/public/leads).
// ORYNT_REPO_URL  public repository URL. Unset by default (repo visibility is unknown), so repo paths render as plain text.

const trim = (s) => (s ?? "").replace(/\/+$/, "");

export const SITE_URL = trim(process.env.ORYNT_SITE_URL);
export const SITEMAP_ORIGIN = SITE_URL || "https://orynt.example";
export const API_BASE = trim(process.env.ORYNT_API_BASE);
export const REPO_URL = trim(process.env.ORYNT_REPO_URL);
export const LEADS_ENDPOINT = `${API_BASE}/v1/public/leads`;

export const NAME = "Orynt";
export const TAGLINE = "Every payment. Under control.";

/** Links into the product app (served by the same API process under /app). They are not pages of this static site. */
export const APP = {
  signup: "/app/signup",
  login: "/app/login",
  support: "/app/contact-support",
  billing: "/app/billing",
  guide: "/app/guide",
  verify: "/app/verify",
};

/** The four calls to action, with the exact labels used everywhere on the site. */
export const CTA = {
  signup: { href: APP.signup, label: "Create account" },
  login: { href: APP.login, label: "Sign in" },
  support: { href: APP.support, label: "Contact support" },
  pilot: { href: "/contact/", label: "Request a pilot" },
};

export const NAV = [
  { href: "/product/", label: "Product" },
  { href: "/platform/", label: "Platform" },
  { href: "/solutions/", label: "Solutions" },
  { href: "/integrations/", label: "Integrations" },
  { href: "/developers/", label: "Developers" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/help/", label: "Help" },
];

export const FOOTER = {
  Product: [
    { href: "/product/", label: "How it works" },
    { href: "/platform/", label: "Platform" },
    { href: "/solutions/", label: "Solutions" },
    { href: "/integrations/", label: "Integrations" },
    { href: "/pricing/", label: "Pricing hypotheses" },
  ],
  "Build and get help": [
    { href: "/developers/", label: "Developers" },
    { href: "/help/", label: "Help center" },
    { href: "/status/", label: "Status" },
    { href: CTA.support.href, label: CTA.support.label },
  ],
  Trust: [
    { href: "/security/", label: "Security" },
    { href: "/faq/", label: "FAQ" },
    { href: "/privacy/", label: "Privacy (draft)" },
    { href: "/terms/", label: "Terms (draft)" },
    { href: "/acceptable-use/", label: "Acceptable use (draft)" },
  ],
  "Get started": [
    { href: CTA.signup.href, label: CTA.signup.label },
    { href: CTA.login.href, label: CTA.login.label },
    { href: CTA.pilot.href, label: CTA.pilot.label },
    { href: "/about/", label: "About" },
  ],
};

/** Link to a path in the project repository. Plain text unless ORYNT_REPO_URL is set. */
export function repoPath(path) {
  const code = `<code>${path}</code>`;
  if (!REPO_URL) return code;
  return `<a href="${REPO_URL}/blob/main/${path}">${code}</a>`;
}

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

export const NAV = [
  { href: "/product/", label: "Product" },
  { href: "/use-cases/", label: "Use cases" },
  { href: "/developers/", label: "Developers" },
  { href: "/security/", label: "Security" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/about/", label: "About" },
];

export const FOOTER = {
  Product: [
    { href: "/product/", label: "How it works" },
    { href: "/use-cases/", label: "Use cases" },
    { href: "/developers/", label: "Developers" },
    { href: "/pricing/", label: "Pricing hypotheses" },
  ],
  Trust: [
    { href: "/security/", label: "Security and status" },
    { href: "/faq/", label: "FAQ" },
    { href: "/privacy/", label: "Privacy (draft)" },
    { href: "/terms/", label: "Terms (draft)" },
  ],
  Company: [
    { href: "/about/", label: "About" },
    { href: "/contact/", label: "Request a pilot conversation" },
  ],
};

/** Link to a path in the project repository. Plain text unless ORYNT_REPO_URL is set. */
export function repoPath(path) {
  const code = `<code>${path}</code>`;
  if (!REPO_URL) return code;
  return `<a href="${REPO_URL}/blob/main/${path}">${code}</a>`;
}

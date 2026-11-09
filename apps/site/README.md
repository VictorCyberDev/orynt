# @orynt/site

Public marketing site for Orynt (provisional name; no trademark or domain clearance is claimed anywhere on the site).
Plain HTML + CSS + about 4 KB of vanilla JS, built by one Node script. No framework, no bundler, no runtime dependencies.

## Commands

Run from the repo root (`pnpm --filter @orynt/site <script>`) or from this folder.

| Script | What it does |
|---|---|
| `build` | `node build.mjs`: assembles `src/pages/*.mjs` with the layout partials into `dist/`, copies tokens/base CSS and brand assets from `packages/ui`, self-hosts the latin-subset fonts (OFL, see `dist/fonts/LICENSES.txt`), writes `sitemap.xml` and `robots.txt` |
| `typecheck` | `node --check build.mjs` |
| `serve` | static server for `dist/` at http://127.0.0.1:4173 (`PORT` or first argument to change) |
| `check:links` | every internal link, asset and `#fragment` in `dist/` resolves |
| `check:claims` | cross-checks what the site says (endpoints, webhook events, states, error codes, contact payload, verifier flags) against `packages/contract`, `packages/core`, `apps/api` and `packages/verifier`, and type-checks the TypeScript samples against `packages/sdk` |
| `check:a11y` | axe-core on every page, light and dark, at 375 px and 1440 px, plus the open mobile menu; fails on serious/critical violations |
| `screenshots` | full-page PNGs of home, product, developers, security, pricing, contact at 375/768/1440 into `screenshots/`, and a horizontal-overflow check on every page (`SCHEME=dark` for dark) |
| `verify` | build, then claims, links and a11y |

`check:a11y` and `screenshots` use the pre-installed global Playwright (not a dependency of this package); `check:claims` needs the repo's `typescript`. Set `TMPDIR` to control where the sample type-check writes.

## Layout

```
build.mjs               build entry
src/layout.mjs          <head> (title, description, canonical, Open Graph, Twitter, JSON-LD), header, footer
src/components.mjs      page hero, CTA band, section, draft banner
src/helpers.mjs         escaping, code blocks, tags, responsive tables, SVG/snippet loaders
src/register.mjs        reads docs/EXECUTION-REGISTER.md for the home-page "honest status" strip
src/site.config.mjs     nav, footer links, environment-driven URLs
src/pages/*.mjs         one module per page: { path, title, description, body() }
src/partials/*.svg      hero illustration and the two state-timeline diagrams (inline SVG, theme-aware)
src/snippets/*.txt      code samples shown on /developers/ (type-checked by check:claims)
src/assets/             site.css, site.js
scripts/                server, link check, claims check, axe, screenshots
```

## Configuration (environment variables at build time)

- `ORYNT_SITE_URL`: absolute origin for canonical, Open Graph and sitemap URLs. Unset by default because no domain is cleared: canonicals are relative and the sitemap uses the reserved placeholder `https://orynt.example`. Set it before publishing.
- `ORYNT_API_BASE`: origin of the Orynt API for the contact form (default: same origin).
- `ORYNT_REPO_URL`: public repo URL. Unset by default (visibility unknown), so repo paths render as plain `code`.

## Contact form and the API

The form POSTs JSON `{email, name, organization, message, consent: true, source: "site"}` to `/v1/public/leads` (`createLead` in `packages/contract`; implemented in `apps/api`). The API sends no CORS headers, so serve the site and `/v1/*` from the same origin (reverse proxy), or add the site origin to the API in a future change. Without JavaScript the form is hidden and a message explains why.

## Content rules

No customers, logos, testimonials, metrics, partners, certifications or prices appear, by design. Capability is called "designed" unless `docs/EXECUTION-REGISTER.md` marks it VERIFIED: the home-page status strip is generated from that file at build time, and shows "Nothing is marked VERIFIED yet" while that is true. Privacy and terms are drafts marked "Draft — not reviewed by counsel". No French or other translation is shipped, because an unreviewed translation would present itself as verified.

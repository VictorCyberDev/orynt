# Name clearance checks: "Orynt" (provisional)

**This is NOT legal clearance.** It is a set of quick, automated and web-search checks run on **2026-11-09 (14:25-14:30 UTC)** from a sandbox with a restricted proxy. Absence of a hit proves nothing about trademark rights. No trademark attorney reviewed this. Do not rely on it to launch, register, file or spend on branding.

Labels: **FACT** = observed result; **INTERP** = my reading; **NOT DONE** = could not be performed here.

## 1. Result summary

| Check | Result | Status |
|---|---|---|
| npm `orynt` | 404 "Not found" | Name appears unclaimed |
| npm scope `@orynt` | 404 for `@orynt/sdk`, `@orynt/cli`, `@orynt/core`; org page returned 403 | **Inconclusive** (a scope can exist without those packages) |
| GitHub `orynt` | `curl` blocked by sandbox (HTTP 403 from proxy policy). A separate page fetch of https://github.com/orynt returned a **user account** (not org) named "Orynt orynt", 0 public repos, no bio | **Name TAKEN as a GitHub username** (via page fetch, unverified by `curl -I`) |
| PyPI `orynt` | 404 | Appears unclaimed |
| crates.io `orynt` | 404 (with User-Agent header) | Appears unclaimed |
| Domains | See section 3 | `.com`, `.io`, `.co` are held and parked for sale; `.dev` is in use by another site |
| Web search for companies named Orynt | No company found in 4 searches | Weak evidence only |
| Trademark: aggregator snippet | An **ORYNT** application, serial 99583221, reported live/pending | **Potential conflict, unverified** |
| WIPO / USPTO / EUIPO / OAPI / Nigeria | NOT DONE | Manual steps in section 5 |

## 2. Package registries and code hosts

Commands run (UTC 2026-11-09T14:25:51Z):

```
curl https://registry.npmjs.org/orynt                      -> 404 {"error":"Not found"}
curl https://registry.npmjs.org/%40orynt%2Fsdk|cli|core    -> 404, 404, 404
curl https://www.npmjs.com/org/orynt                       -> 403
curl -I https://github.com/orynt                           -> proxy HTTP 403 (sandbox policy, not a GitHub answer)
curl https://api.github.com/users/orynt                    -> proxy refusal ("sessions are bound to their configured repositories")
curl https://pypi.org/pypi/orynt/json                      -> 404
curl -A "orynt-name-check (research)" https://crates.io/api/v1/crates/orynt -> 404
```

Interpretation:
- npm/PyPI/crates 404 = no package of that name at this moment. **It does not reserve the name**, and npm's `@orynt` scope status needs a logged-in check (try creating the org in npm; the result is authoritative).
- GitHub: only the page fetch worked. Result described a personal account with zero repos. The username `orynt` is therefore unavailable to you; plan a different org name (e.g. `orynt-hq`, `getorynt`; availability not checked).

## 3. Domains

DNS via `getent hosts` (no `dig`/`nslookup`/`host` installed). A DNS record only suggests registration; lack of a record does **not** prove availability. RDAP via https://rdap.org where the registry supports it.

| Domain | DNS (getent) | RDAP / other evidence | Reading |
|---|---|---|---|
| orynt.com | resolves (44.232.173.249, 52.40.42.113) | RDAP: registered 2021-06-18, expires 2027-06-18, status `client transfer prohibited`, last changed 2026-05-19. Page fetch: parked "for-sale" page on Spaceship, **listed at $175,000** (as reported by the fetch tool) | Registered; for sale at a price far above a hackathon-stage budget |
| orynt.io | resolves (13.248.169.48, 76.223.54.146) | Page fetch: redirects (HTTP 307) to a GoDaddy "forsale" page. RDAP: none for this TLD via rdap.org (404) | Registered, parked for sale (price not retrieved) |
| orynt.co | resolves (same IPs as .io) | Redirects to GoDaddy "forsale" page. RDAP none (404) | Registered, parked for sale |
| orynt.app | no A/AAAA | RDAP: created 2025-09-23, expiration 2026-09-23, status `pending delete`, `redemption period`, last changed 2026-11-04 | Registration lapsed; **may become available soon** (INTERP: pending-delete domains are deleted after a short period and then re-registerable; the exact date was not stated). Re-check daily |
| orynt.xyz | no A/AAAA | RDAP: HTTP 403 from rdap.org | **Inconclusive** |
| orynt.africa | no A/AAAA | Registry RDAP (rdap.nic.africa) returned 404 | Suggests unregistered (INTERP); verify at a registrar |
| orynt.sn | no A/AAAA | NIC Sénégal whois: `%% NOT FOUND` | Suggests unregistered (INTERP); .sn registration typically has local requirements, not checked |
| orynt.dev | resolves (172.67.193.65, 104.21.92.124) | RDAP: registered 2026-08-17. Page fetch: active site of a brand shown as "**Orient**" ("Platform orientation for API teams": SpecPulse, Pipelink, anyscan, Paramio, Dispatcher; .NET and API tooling), no payments content | In use by someone else; **the spelling "Orient" came from the fetch summary; open the site and read it yourself** (possible adjacent-field brand in classes 9/42) |
| orynt.org | no A/AAAA | RDAP: registered 2025-09-21, expired 2026-09-21, status `client transfer prohibited`, `redemption period` | Lapsed; may be re-registerable |
| orynt.net | no A/AAAA | RDAP: same pattern as .org | Lapsed; may be re-registerable |

INTERP: `orynt.com` is not realistically obtainable. A viable plan would use a different primary domain (e.g. `.app` if it drops, or a variant) **only after** the trademark checks below.

## 4. Web search for existing companies/marks (standard search engine, US-only index)

Queries run: `"Orynt" fintech OR crypto OR bitcoin OR payments company`; `"Orynt" trademark OR startup OR software`; `Orynt bitcoin lightning payout OR "payment authorization" OR "financial operations"`; `Orynt Nigeria OR Senegal OR Africa company OR brand`.

| Finding | Detail | Verification |
|---|---|---|
| No company named Orynt in fintech/crypto | First, third and fourth queries returned only unrelated near-names (Orbital, Oryxian, OroPocket, Oryx Energies, etc.) | Negative search results are weak evidence |
| **ORYNT trademark application** | A third-party aggregator listing (markinton.com, serial **99583221**) reported by the search tool: filed **2026-01-07**, status live/pending, individual applicant in Dover, DE, **Class 32** (the tool itself noted this is odd for software) | **Could not open the page** (markinton.com did not resolve from this network, via WebFetch or Firecrawl). **Unverified. Check USPTO directly.** |
| ORYN OS | Aggregator listing, serial 99101760, filed 2025-03-25 by an individual; described as a **blockchain data-verification SaaS** | Unverified (same reason). Near-identical sound/appearance, adjacent field (verification of data on blockchain) |
| THE ORYN | Aggregator listing, serial 99746736, filed April 2026; SaaS "software for application and database integration" | Unverified (same reason) |
| Oracle v. "CryptoOracle" lawsuit | Search results surfaced a 2019 article about Oracle suing a crypto startup over a similar name | Context: large incumbents enforce names in crypto/software; not about Orynt |

INTERP: if the ORYN OS / THE ORYN listings are accurate, there are at least two near-identical software/SaaS marks filed 2025-2026 plus an identical ORYNT filing (in a different class on the snippet). This is enough to treat the name as **high risk** until a professional search says otherwise.

## 5. Registry searches NOT DONE (manual steps for the owner)

These are interactive/anti-scraping databases; I did not attempt to bypass them. Run them yourself and save dated screenshots to `docs/evidence/`.

1. **WIPO Global Brand Database** (https://branddb.wipo.int/): Brands tab -> text "ORYNT"; repeat for `ORYN`, `ORINT`, `ORIENT`, `ORYNTH`, `ORYNTA`; use "Similar" matching; filter by Nice classes 9, 35, 36, 42, 45; note each owner, status, designations (include OAPI, Nigeria, Senegal, EU, US).
2. **USPTO**: use the official trademark search (https://tmsearch.uspto.gov/) for `ORYNT`, `ORYN*`, `ORIN*`; then open TSDR for serial **99583221** (also **99101760**, **99746736**) and record owner, class, goods/services, status, filing basis.
3. **EUIPO / TMview** (https://www.tmdn.org/tmview/): same terms, classes 9/36/42; TMview aggregates many national offices, including some African ones where participating.
4. **OAPI** (African Intellectual Property Organization, covers Senegal among its members: confirm member list on the OAPI site): ask OAPI (oapi.int) or a local IP agent for an availability search for ORYNT in classes 9, 36, 42. OAPI registrations are usually searched through the office or agent, not a public scraping-friendly API (I did not verify the current online search tool).
5. **Nigeria**: the Trademarks Registry (Trademarks, Patents and Designs Registry) accepts online searches via its official portal; I did not verify the portal URL. Use a local trademark agent for a search and registrability opinion in classes 9, 36, 42.
6. **Company registers**: Nigeria CAC, Senegal registry, UK Companies House, US state registers (Delaware, etc.) for "Orynt".
7. **Package/social handles** not checked: npm org creation, X/LinkedIn/Telegram/Discord handles, Google Play/App Store names, Nostr NIP-05 names.
8. **Phonetic and translation checks**: French reading of "Orynt" (Dakar audience), possible meanings in Wolof/Hausa/Yoruba/Kazakh; "Orynt" resembles "Orient" and "Oryn" (INTERP: not checked linguistically).
9. Consult a trademark attorney in the target launch jurisdictions before spending money on branding or filing.

## 6. Stop conditions (stop using the name and re-brand if any is true)

1. Any **live or pending mark identical or confusingly similar** to ORYNT/ORYN in **Nice class 9** (software), **36** (financial services), or **42** (SaaS / software development), in any jurisdiction where you plan to operate (US, EU, UK, OAPI member states including Senegal, Nigeria).
2. A conflicting mark in **class 35** (business administration) or **45** with fintech/payments goods, if the owner is active.
3. The ORYNT application 99583221 turns out to cover software/financial goods, or its owner is an active business in payments/crypto.
4. ORYN OS / THE ORYN (or similar) are live and used for blockchain-verification or payments software.
5. A cease-and-desist or a platform (npm/GitHub/app store) takedown on the name.
6. An active company named Orynt/Orient-like in fintech/crypto/SaaS using the mark in commerce, even without registration (common-law rights).
7. The primary domain and handles needed cannot be obtained at reasonable cost (`orynt.com` is listed at $175,000 per the fetch tool; GitHub `orynt` is taken).
8. A search result in any of the local languages for your launch market that makes the name offensive or misleading.
9. The professional search report advises against.

## 7. Recommended next actions (advice)

- Treat "Orynt" as **provisional with elevated risk**. Do not buy domains or file marks yet; keep the code namespace generic until the manual searches (section 5) are done.
- Prepare 2-3 backup names and run the same checks on them before the hackathon submission, so the README and demo do not become costly to rename.
- Hackathon submission name: it can be provisional, but disclose that the name is a working title.

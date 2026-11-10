# Orynt R2 — owner report and release state

*Branch `claude/busy-goodall-ajeb0p`, draft PR #1 (https://github.com/VictorCyberDev/orynt/pull/1). Not merged. Written 2026-11-10. Every status below uses one class: VERIFIED COMPLETE · IMPLEMENTED, NOT COMMISSIONED · SIMULATOR-VERIFIED · PARTIAL · BLOCKED · FAILED · NOT STARTED. Evidence lives in `docs/EXECUTION-REGISTER.md`.*

## Release state (never collapsed)
| State | Reached? | Basis |
|---|---|---|
| DEVELOPMENT | **yes** | code on the branch |
| TEST-VERIFIED (simulator) | **yes** | 51 unit, 102 integration, 138 browser checks; hosted CI green on c33ad69 (6 jobs) |
| REGTEST-VERIFIED (real Lightning) | **yes** | 15 real-LND tests + `demo:full` against bitcoind 29.5 + 2×LND v0.20.1 |
| STAGING-DEPLOYED | **no** | nothing is hosted |
| PRODUCTION-COMMISSIONED (real mail, billing, hosting, backups, monitoring) | **no** | needs owner approvals below |
| LEGALLY CLEARED / INDEPENDENTLY AUDITED | **no** | no counsel review, no human security audit |
| PAID CUSTOMER JOURNEY VERIFIED | **no** | no customer, no charge, no mainnet payment has occurred |

Level C / "commercial launch" is **not** claimed and cannot be claimed from this environment.

## A. Engineering
- SaaS foundation, LNURL-pay, batch/recurring/reports, billing abstraction, entitlements: **SIMULATOR-VERIFIED** (`saas.itest`, `lnurl.itest`, E2E).
- Real-Lightning (LND REST on regtest): **VERIFIED (regtest)**; failure modes include SIGKILL mid-payment, node restart, payee offline, concurrent executes.
- Defects found by real execution and fixed: padded-base64 payment-hash path, `checkpermissions` scope, startup recovery latency, Bitcoin Core/LND version incompatibility. Webhook mapping defects (Stripe basil fields; Paystack subscription id, event-id collisions, `not_renew`) fixed with tests; **mappings unverified against live providers**.
- Problem-type URIs no longer point at a third party's domain.
- Not done: formatting gate, SBOM/provenance, multi-instance deployment, WebAuthn, SSO.

## B. Product
Implemented: payout lifecycle with signed approvals, receipts + standalone verifier, recipients, BOLT11, LNURL/Lightning Address, batch CSV, recurring schedules (drafts only), reports/CSV export, support tickets, plans/entitlements, accounts/MFA/invites. **Not done:** exception-workbench UI beyond the incident list, onboarding checklist, NWC/BTCPay/Core Lightning adapters, internal admin console. Plans (Developer free, Startup $29, Growth $99, Business $299, Enterprise custom) are **hypotheses**, configurable, labelled as such on the site.

## C. Real Lightning
Capability matrix: `docs/product/wallet-capability-matrix.md`. Only LND is supported and only on regtest. **Mainnet and testnet: never run, disabled.** A tenant-registered fake LND endpoint with a self-held preimage can still yield a "REAL" receipt; receipts state this limitation.

## D. Security
`docs/security/threat-model.md` + `threat-model-r2-delta.md`. **No human audit or pentest.** MFA is opt-in per user (no org policy forces it). Approval key still lives in browser storage. Wallet-credential blast radius unchanged (Orynt enforces approvals; the wallet does not). Gitleaks history scan passes with one narrow allowlist.

## E. Paid SaaS
Billing: provider abstraction, Stripe + Paystack parsers, sandbox provider (refused in production), idempotent and order-tolerant events, server-side entitlements. **IMPLEMENTED, NOT COMMISSIONED:** no provider account, no live webhook, no charge. Desk evaluation: `docs/business/billing-provider-evaluation.md` (recommends Polar, conditional on written support answers; Stripe via US entity as fallback; key risk is crypto/financial-services acceptable-use). Pricing must not be shown as final until counsel review and an entity exist.

## F. Infrastructure
Dockerfile builds and starts on hosted CI. `infra/deploy/` templates exist; **nothing deployed**. No backups/PITR, TLS, alerting or on-call wired. `docs/ops/production-readiness.md` still lists these (parts of it predate R2 and under-state MFA/e-mail/CI progress — refresh pending).

## G. UX / brand
Web app: 138 automated checks, axe serious/critical 0, no overflow at 375/768/1440. Site: 18 pages, 596 claim checks, 0 broken links, privacy checks (no third-party requests/cookies/storage). **No human usability study and no screen-reader test.** Brand mark reviewed only as a PNG; name clearance (`docs/brand/name-clearance.md`) shows conflicts — **trademark/domain decision is the owner's**.

## H. Business
`docs/business/` is hypotheses; **no customer validation exists.** Desk research only: prospect list (30 organisations, none contacted), competitor re-verification (BTCPay already has revision-bound approval, so that differentiator is falsified; signed intent digest, per-approver signatures and the offline verifier remain untested differentiators), interview recruitment plan (empty tracker).

## I. Dakar submission
**NOT SUBMITTED. Dakar assets are STALE:** `docs/hackathon/` still describes R1; real-regtest evidence (`docs/evidence/demo-real-regtest-*.md`) is not yet folded into the script/deck/Devpost text; video and deck unrendered. Rules pages conflict on eligibility (owner decision). Deadline 2026-11-20 20:00 UTC.

## J. Acceptance matrix (six journeys)
| Journey | Status |
|---|---|
| A new customer (signup → verify → plan → first payout) | PARTIAL — signup, verify (outbox), plan, payout SIMULATOR-VERIFIED in E2E; real e-mail and live billing absent |
| B financial execution | REGTEST-VERIFIED (real LND) |
| C exception handling | PARTIAL — incidents + reconcile verified; no dedicated workbench UI |
| D org workflow (roles, invites, maker-checker) | SIMULATOR-VERIFIED |
| E billing operations | SIMULATOR-VERIFIED (sandbox); live NOT COMMISSIONED |
| F operational recovery | REGTEST-VERIFIED (SIGKILL, restart, reconcile); backup restore rehearsal PASSED on a local DB in R1, not re-run in R2 |
No external-customer journey has occurred; no UX participants were used.

## K. Owner decisions and approvals needed (none requested or taken)
| # | Action | Cost | Risk | Why | Expected result |
|---|---|---|---|---|---|
| 1 | Choose billing provider and open an account (after asking Polar/Paddle support the gating questions) | account free; fees per sale; possible entity formation cost (Stripe Atlas price: unverified estimate, check before acting) | provider may refuse crypto-adjacent software; tax/regulatory exposure in Nigeria | live billing commissioning | webhook signing secret + test-mode sandbox to verify the parsers against real traffic |
| 2 | Buy a domain and a sending domain; configure SPF/DKIM/DMARC; provide a mail-provider key | domain price: unverified estimate; mail provider pricing: not checked | name/trademark conflict (`orynt.*` mostly held; `orynt.dev` belongs to another brand) | real e-mail verification/reset | verified mail delivery |
| 3 | Approve a paid host / managed Postgres for a staging environment | not quoted; no provider was priced | secrets handling, data exposure if misconfigured | staging deployment + monitoring + backups | public staging URL, restore drill |
| 4 | Commission an independent security review | thousands of USD (not quoted) | none to the repo | human audit is a gate for real funds | findings list |
| 5 | Counsel review (privacy, terms, pricing, Nigeria/other regulation) | legal fees | launching without it | pricing may be shown only after review | cleared documents |
| 6 | Decide the name/brand clearance outcome | possible rebrand cost | collision with existing marks | affects domains, packages, site | final name |
| 7 | Dakar: resolve eligibility, approve submission, supply video/deck | none | ineligibility | deadline 2026-11-20 | submission only on your explicit go |
| 8 | Any mainnet payment | real bitcoin | loss of funds | not recommended before items 3–5 | — |

## L. GitHub delivery
Draft PR #1, branch `claude/busy-goodall-ajeb0p`, all work committed and pushed, hosted CI green on c33ad69 (6 jobs; earlier runs red for gitleaks false positives and a flaky test of mine, both fixed). Nothing merged to main, nothing published to npm, no email sent, nothing submitted.

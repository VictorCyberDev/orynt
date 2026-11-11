# R3 closure register

*Authoritative resume point. Branch `claude/busy-goodall-ajeb0p`, draft PR #1; R3 started from `97a0951`. Statuses use only: VERIFIED COMPLETE · IMPLEMENTED, NOT COMMISSIONED · SIMULATOR-VERIFIED · PARTIAL · BLOCKED · FAILED · NOT STARTED. A row is not VERIFIED COMPLETE unless it was tested in the environment named in its evidence. Commit SHAs, counts and exit codes for each milestone are in `docs/OWNER-REPORT-R3.md`. **Resume rule:** continue from the first row whose "Final acceptance" is not "accepted" and is not an external gate.*

Columns: **Req** acceptance requirement · **Now** current implementation · **Missing** · **Action** required next · **Deps** · **Status** · **Evidence** · **Final**.

## 0. Starting state and repaired documentation
| Item | Result |
|---|---|
| HEAD 97a0951, push + PR CI green | re-verified (`gh run list`) |
| PR #1 title/body said real Lightning unverified, 55 tests, E2E 100 | **repaired** (title and body re-read after patching) |
| `docs/ops/production-readiness.md` (MFA/e-mail/CI "NOT BUILT", real LND "NOT DONE") | **rewritten** |
| `docs/product/product-spec.md`, differentiation review | corrected in R2 (BTCPay already binds approval to a revision) |
| Dakar materials (R1 state, no real-regtest evidence) | **refreshed** from verified evidence (see §H) |
| `docs/EXECUTION-REGISTER.md` | R3 rows and figures added at close |

## A. Operations application
| ID | Req | Now | Missing | Action | Deps | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|---|
| O-1 | Persistent onboarding; every step derived from backend state; resumable; distinguishes practice / regtest / real | `GET /v1/onboarding` (12 derived steps + finish), org profile, explicit audited decisions only for plan + policy, server refuses completion until all done; Start page + Overview prompt | a real e-mail and billing provider to complete steps 2 and 5 outside the sandbox | commission providers | owner | **SIMULATOR-VERIFIED**; regtest assertions on a real wallet | `onboarding.itest` (9), `lnd.itest`, E2E | accepted for the sandbox; real-provider steps BLOCKED |
| O-2 | Exception workbench: queue, severity, linked payout, true payment state, approvals, attempts, evidence timeline, last reconcile, safe actions, manual reconcile, assign, notes, resolution, export, uncertain ≠ failed | `GET /v1/incidents/:id`, evidence export with integrity hash, notes/assign, reconcile action, UI page, `Investigate` link, notifications on open/resolve | per-incident event-log filter for webhook events; provider-callback hints are not shown | optional | – | **VERIFIED COMPLETE** (simulator) and on a real uncertain payment (regtest) | `workbench.itest` (4), `lnd.itest`, E2E + axe | accepted |
| O-3 | Org admin: profile, invites, roles, removal, ownership transfer, session revocation, MFA policy, API-key lifecycle, policy mgmt, audit, account/org closure, export, retention | all present at API level: ownership transfer (password + step-up), session list/revoke, org 2FA policy, org closure (guard + 90-day retention), existing invite/remove/role/keys/policy/audit/export | **web UI for transfer, closure, sessions**; automatic purge after retention; API-key expiry; data deletion on request is manual | build screens; purge job | – | **PARTIAL** | `orgadmin.itest` (3), `security-r3.itest` | open |
| O-4 | Separate support console; staff cannot read secrets, impersonate or pay; all activity logged | `/staff` page + API, separate identity, mandatory MFA + replay/lockout, reasoned org summary, ticket replies with customer notification, append-only audit | staff password change / MFA reset, browser E2E, independent review, hosting behind VPN | follow-up | – | **SIMULATOR-VERIFIED** | `staff.itest` (5) | open |
| O-5 | Product quality pass | axe serious/critical 0 on every routed screen incl. the new ones, at 375/768/1440 px in light and dark; E2E 166 checks | new org-admin screens absent; no manual usability test, no screen-reader test | user study | participants | **PARTIAL** | E2E | open |

## B. Wallet interoperability
| ID | Req | Now | Missing | Action | Deps | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|---|
| W-1 | LND not broken | 15 real tests + `demo:full`; stricter NOT_FOUND, connect-time DNS vetting, lookup gate | testnet / mainnet never run | owner decision | – | **VERIFIED COMPLETE** (regtest) | `lnd.itest` 15/15, `docs/evidence/real-lightning-test-2026-11-11.txt` | accepted |
| W-2 | NWC per NIP-47 | `packages/wallets/src/nwc` (strict URI, BIP-340/NIP-44/NIP-04, kind 13194/23194/23195, authenticity checks, error classification, `lookup_invoice` reconciliation) | wiring into the API (`providers.ts`, config shape, receipt provider kind); operational test with a real wallet service | owner supplies a throwaway NWC wallet; then wire | real NWC wallet | **IMPLEMENTED, NOT COMMISSIONED** (contract-tested vs local fake; BIP-340/NIP-44 spec vectors pass) | `packages/wallets` 203 NWC tests, `docs/product/nwc-adapter.md` | open |
| W-3 | BTCPay per current APIs; document differences | `packages/wallets/src/btcpay` (pay → existing-payment check → lookup; 503/timeout = unknown; permission probes) | wiring; real BTCPay run (needs Docker/.NET + bitcoind + LN backend); `trustAbsenceOfPayment` operator attestation | owner runs the documented regtest procedure | Docker host | **IMPLEMENTED, NOT COMMISSIONED** (54 contract tests vs a documentation-derived fake) | `docs/product/btcpay-adapter.md` | open; verdict "not recommended as supported yet" |
| W-4 | Evaluate Core Lightning | – | evaluation | decision doc | – | **NOT STARTED** (deferred to protect scope) | – | open |
| W-5 | Per-adapter matrix, fixtures, errors, secrets, limits | matrix updated: LND verified (regtest); NWC/BTCPay contract-only; CLN none | – | – | – | **PARTIAL** | `docs/product/wallet-capability-matrix.md` | accepted as honest |
| W-6 | (found) `can_lookup` unenforced | execute refuses `can_lookup=false`; non-LND providers need `true` | – | – | – | **VERIFIED COMPLETE** | `lnd.itest`, full integration | accepted |

## C. E-mail
| ID | Req | Now | Missing | Action | Deps | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|---|
| E-1 | Durable queue; retry/backoff; no double send | lease-based claiming, exponential backoff, 8 attempts, redaction | – | – | – | **VERIFIED COMPLETE** (local) | `mail.itest` incl. mutation check (lease removed → 22 sends instead of 12) | accepted |
| E-2 | Templates: verify, reset, invite, security, approval request, exception, resolution, billing, support ack/reply | all nine kinds with triggers (verify, reset, invite, password-changed, security notices, approval request, payment exception, incident resolved, billing notices, support ack, support reply) | HTML templates, localisation | – | – | **SIMULATOR-VERIFIED** | `mail.itest`, `saas.itest`, `staff.itest` | accepted |
| E-3 | Provider abstraction; delivery-status webhook; rate limiting | `log`, `resend`, `brevo`; Svix-signature verification; per-recipient hourly caps | provider accounts, sending domain (SPF/DKIM/DMARC), webhook endpoint registration | commission | **owner: domain + key** | **IMPLEMENTED, NOT COMMISSIONED** | `mail.itest` against a local Resend/Brevo-shaped service | external gate |
| E-4 | State | code complete · provider sandbox **not** verified · real delivery **not** verified · production sending **not** commissioned | – | – | owner | – | – | – |

## D. Billing
| ID | Req | Now | Missing | Action | Deps | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|---|
| B-1 | Provider decision from verified facts | desk evaluation (Polar conditional); no decision | entity/jurisdiction facts; provider answers on crypto-adjacent software | owner | **owner** | **BLOCKED** | `billing-provider-evaluation.md` | external gate |
| B-2 | Journeys: checkout, activation, renewal, failure, upgrade, downgrade, cancel, expiry, invoices, portal, refunds, reconciliation, replay, ordering | all except refunds and provider invoices: change-plan with downgrade guard, portal (Stripe, unverified), history, past-due grace, expiry sweep, duplicate/stale/late-event handling | refund handling; provider invoice retrieval; provider reconciliation job | with an account | provider | **SIMULATOR-VERIFIED** | `saas.itest`, `billing-journeys.itest` (6) | open |
| B-3 | Sandbox acceptance against the provider's real sandbox | none possible | credentials | exact list in the owner report | provider | **BLOCKED** | – | external gate |
| B-4 | Billing ≠ wallet commissioning | no mainnet/real-funds entitlement; mainnet is a server setting | – | – | – | **VERIFIED COMPLETE** | `billing-journeys.itest` | accepted |
| B-5 | (security) activation only for a plan the org started to buy | pending-checkout rule, paid-status check, late-event guard | Paystack verify-API call | follow-up | – | **VERIFIED COMPLETE** (sandbox) | `saas.itest` | accepted |

## E. Infrastructure
| ID | Req | Now | Missing | Action | Deps | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|---|
| I-1 | Deployable, repeatable, TLS, secrets, health, backups, restore, rollback, limits | `infra/production` (Caddy TLS → API+worker → PostgreSQL, limits, read-only fs), backup + restore-check scripts, README with limits; boot guard; CI builds image, migrates a fresh DB, serves health, refuses placeholder config, validates the compose file | the production compose stack has never been started (no Docker daemon here); no PITR/HA; no log shipping or alert routing; single instance only | stand up staging | **owner: paid host** | **IMPLEMENTED, NOT COMMISSIONED** | GitHub CI `docker` job; `pnpm restore:rehearsal` (local) | external gate |
| I-2 | Public staging URL | none | – | – | owner | **BLOCKED** | – | external gate |
| I-3 | Monitoring/alerting/error tracking | metrics + alert rules documented | wiring | – | owner | **NOT STARTED** (documented only) | `infra/production/README.md` | open |

## F. Security
| ID | Req | Now | Status | Evidence | Final |
|---|---|---|---|---|---|
| X-1 | Independent review pass over the 20 focus areas | AI-assisted reviewer agent; dispositions in `docs/security/threat-model-r3-review.md` (H1, M1, M2, M4, M6, M8, M10, L7, L8, L12 fixed; H2, M3, M7, M9, L11 partial; M5 + several Low open) | **PARTIAL** | `security-r3.itest` (13), others | open items listed |
| X-2 | MFA enforcement coverage | unified step-up, org policy | **VERIFIED COMPLETE** (simulator) | `security-r3.itest` | accepted |
| X-3 | Browser-held approval keys | unchanged (WebAuthn not started) | **PARTIAL** | – | open |
| X-4 | Human audit; jurisdictional legal review | – | **BLOCKED** | – | external gate |

## G. Quality gates (Phase 10)
| Gate | Result |
|---|---|
| lint · typecheck · **format (new)** · unit · dependency audit · container build · secret scan · real-regtest · E2E + axe | all run locally at the final commit and on hosted CI (see OWNER-REPORT-R3 §15) |
| PostgreSQL integration incl. migration up/down | included |
| Dedicated "email integration" / "billing" / "authorization-regression" jobs | covered by files in the single integration job (`mail`, `saas`, `billing-journeys`, `security-r3`, `security`); not separate CI jobs |
| Skipped tests | wallets package: 2 skipped = opt-in operational NWC test (needs `ORYNT_NWC_URI`); integration job on hosted CI skips nothing; the `verify` job skips the real-LND file (it runs in the `real-lightning` job) |

## H. Dakar, customer validation
| ID | Result |
|---|---|
| D-1 | Rules re-verified 2026-11-11: deadline **20 Nov 2026 20:00 UTC** unchanged; **eligibility is a hard gate** (an organiser forum reply says "strictly for students"; the Rules page says "reside in Africa"); wallet requirement still unanswered → `docs/hackathon/organizer-inquiry.md` drafted, **not sent** |
| D-2 | Devpost text, README, architecture diagram (SVG+PNG), real-regtest runbook, evidence index, captions, 12-slide deck (PDF), 179-second **silent captioned** video with source-tagged scenes — **no voice-over** |
| D-3 | **NOT SUBMITTED.** Judges opening the repo see an empty `main` (all work is on the branch / PR) — owner decision |
| C-1…3 | 30 organisations researched, 8 re-verified against live pages, 6 with a sourced public contact route, 8 personalised drafts — **nothing sent** |
| C-4 | contacted 0 · replies 0 · interviews 0 · pilots 0 · activated orgs 0 · paying customers 0 · revenue 0 · retention n/a · **product-market fit NOT VALIDATED** (`docs/business/validation-scorecard.md`) |

## I. Journeys A–G
See `docs/ACCEPTANCE-JOURNEYS-R3.md`. B and C are VERIFIED COMPLETE on regtest; A, D, E, G are SIMULATOR-VERIFIED with real-provider steps BLOCKED; F is PARTIAL.

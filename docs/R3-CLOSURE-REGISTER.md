# R3 closure register

*Authoritative checkpoint for the R3 mandate. Starting point: branch `claude/busy-goodall-ajeb0p` at `97a0951` (CI green: push run 42829777494, PR run 42829760498), draft PR #1. Statuses use only: VERIFIED COMPLETE · IMPLEMENTED, NOT COMMISSIONED · SIMULATOR-VERIFIED · PARTIAL · BLOCKED · FAILED · NOT STARTED. A row is not VERIFIED COMPLETE unless the functionality was tested in the environment named in its evidence column. **Resume rule:** the next session starts at the first row whose "Final acceptance" is not VERIFIED COMPLETE / agreed external gate.*

*Last updated: 2026-11-11 (session start). Rows are updated in place as milestones land; commit SHAs are recorded in `docs/OWNER-REPORT-R3.md`.*

## Reconciled starting state (re-verified at the start of R3)
| Claim in the R3 brief | Re-verified? |
|---|---|
| HEAD = 97a0951, push + PR CI green | **yes** — `gh run list`: runs 42829777494 / 42829760498 success on 97a0951 |
| 15 real-LND, 102 integration, 138 E2E, 51 unit | counts re-run on 2026-11-10 in R2 (see `docs/EXECUTION-REGISTER.md`); re-run again at R3 close (Phase 10) |
| PR #1 description | **stale and wrong** — still says real Lightning is unverified, 55 tests, E2E 100. Fixed in this milestone (see S-1) |

## A. Stale-documentation repairs (Phase 0)
| ID | Item | Status | Evidence |
|---|---|---|---|
| S-1 | PR #1 title/body said real Lightning unverified | see `OWNER-REPORT-R3.md` for the commit; updated via `gh api -X PATCH repos/VictorCyberDev/orynt/pulls/1` | PR body re-read after patch |
| S-2 | `docs/EXECUTION-REGISTER.md` | current for R2 numbers; R3 figures added at close | — |
| S-3 | `docs/ops/production-readiness.md` still said MFA/e-mail verification/CI "NOT BUILT" and real LND "NOT DONE" | rewritten in this milestone | file diff |
| S-4 | Dakar docs (R1 state) | delegated to the Dakar workstream, see section H | — |
| S-5 | `docs/product/product-spec.md`, differentiation review | corrected in R2 (d7a2a15 / 81ed7a3) | — |

## B. Operations application (Phase 1)
| ID | Acceptance requirement | Current implementation (verified by reading code at 97a0951) | Missing | Required action | Depends on | Status | Test evidence | Final acceptance |
|---|---|---|---|---|---|---|---|---|
| O-1 | Persistent onboarding checklist, each step derived from backend state, resumable, distinguishes practice/regtest/real | none (`grep -i onboard` finds nothing in api/web/contract) | everything | `GET /v1/onboarding` computing 13 steps from DB facts; web checklist page; environment banner | org, connection, policy, approval key, counterparty, obligation, receipt tables | NOT STARTED | — | open |
| O-2 | Exception workbench: queue, severity, linked payout/state/approval/execution history, evidence timeline, last reconcile, safe actions, manual reconcile, assign, notes, resolution history, event log, evidence export | backend: `incidents`, `/v1/incidents/:id/{resolve,notes,assign}`, reconcile worker; UI `Incidents.tsx` is a 20-line list | incident detail endpoint with evidence timeline; manual reconcile action on incident; evidence export; workbench UI; unsafe-duplicate guard shown | add `GET /v1/incidents/:id`, evidence bundle export, UI page | incidents, payment_attempts, audit | NOT STARTED | `saas.itest` covers notes+assign only | open |
| O-3 | Org administration: profile, invites, roles, removal, **ownership transfer**, session revocation, **MFA policy for privileged roles**, API-key lifecycle, policy mgmt, org audit, account/org closure, export, retention | invites, add/update/revoke member, API keys list/revoke, policies create/list, audit list, `POST /v1/me/close`, `GET /v1/export` | org profile edit, ownership transfer, org-level MFA enforcement, session list/revoke UI+API, org closure, retention controls | implement the missing set with regression tests | accounts.ts, handlers | NOT STARTED | — | open |
| O-4 | Separate access-controlled internal support console with audited, scoped staff access; no secrets, no impersonation, no payment initiation | tenant-side tickets only; **no staff identity exists** | staff accounts (separate table, MFA mandatory), scoped read endpoints, audit of every staff read, ticket replies | implement `/v1/staff/*` + minimal staff UI | new migration | NOT STARTED | — | open |
| O-5 | Product quality pass (no dead buttons/fake data, loading/empty/error states, keyboard, reduced motion, mobile) | E2E 138 checks incl. axe on 12 routes × 3 widths × 2 themes | not re-audited for new screens | audit every screen after the above lands | O-1…O-4 | PARTIAL | E2E 138 (2026-11-10) | open |

## C. Wallet interoperability (Phase 2)
| ID | Acceptance requirement | Current | Missing | Action | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|
| W-1 | LND on regtest not broken | 15 real tests, real demo | — | keep in CI | VERIFIED COMPLETE (regtest) | `lnd.itest` | accepted; re-run at close |
| W-2 | NWC (NIP-47) adapter, official spec, operationally verified where possible | none | adapter, fake relay/service contract tests, integration into `providers.ts`, UI | delegated workstream; integration by me | IN PROGRESS (agent) → expected IMPLEMENTED, NOT COMMISSIONED | will be: contract tests vs local fake; **no real NWC wallet reachable** | open |
| W-3 | BTCPay adapter against official APIs; document differences | none | adapter + facts about what Greenfield exposes | delegated workstream | IN PROGRESS (agent) | contract tests vs fixtures; **no BTCPay instance available** | open |
| W-4 | Core Lightning evaluation | none | decision record | `docs/product/core-lightning-decision.md` | NOT STARTED | — | open |
| W-5 | Per-adapter capability matrix, typed contract, fixtures, error classification, secret handling, docs | LND only | other providers | update `wallet-capability-matrix.md` when W-2/W-3 land | PARTIAL | — | open |

## D. Email (Phase 3)
| ID | Requirement | Current | Missing | Action | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|
| E-1 | Durable queue, retry/backoff, no duplicate send under concurrent pumps | `mail_outbox` + `pumpMail`: **`FOR UPDATE SKIP LOCKED` runs outside a transaction, so the row lock is released immediately — two pumps can send the same mail**; flat retry (no backoff); Resend URL hard-coded | claim/lease semantics, exponential backoff, configurable provider base URL for tests | fix + regression tests | NOT STARTED | — | open |
| E-2 | Templates for 9 mail kinds (verify, reset, invite, security notice, approval request, payment exception, incident resolution, billing, support ack) | verify, reset, invite, payment_failed, ticket-related partially | approval-request, exception, incident-resolved, security notice, support ack, billing notices | templates + triggers | NOT STARTED | — | open |
| E-3 | Provider abstraction (Resend, plus one more), delivery-status webhook with signature verification, rate limit | log + resend only; no webhook | provider interface, Resend/Svix webhook verification, per-recipient rate limit | implement; verify against a controlled local HTTP test service | NOT STARTED | — | open |
| E-4 | Final status distinguishing code-complete / sandbox-verified / real delivery verified / production sending commissioned | — | — | will report: **code complete + verified against a local controlled service only**; real delivery requires owner's domain + key | NOT STARTED | — | external gate |

## E. Billing (Phase 4)
| ID | Requirement | Current | Missing | Action | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|
| B-1 | Provider decision from verified facts, not desk preference | desk evaluation recommends Polar conditional on support answers | owner's entity/jurisdiction facts; provider support answers | decision record + owner gate | BLOCKED (external) | `billing-provider-evaluation.md` | owner decision |
| B-2 | Journeys: checkout, activation, renewal, failed renewal, upgrade, downgrade, cancel, expiry, invoices, portal, refunds, reconcile, replay, out-of-order | checkout (sandbox + Stripe/Paystack session creation unexercised), activation, cancel, past_due, stale/duplicate handling, free-plan fallback | upgrade/downgrade endpoints, portal URL, invoice list, expiry sweep, refund handling, provider reconciliation job | implement on provider abstraction; test against sandbox provider | NOT STARTED | — | open |
| B-3 | Sandbox acceptance against the provider's real sandbox with authorized credentials | none possible without credentials | credentials | document exact missing credentials; **never claim paid acceptance from locally signed webhooks** | BLOCKED (external) | — | external gate |
| B-4 | Billing and wallet commissioning are separate gates | plan limits don't enable mainnet; mainnet disabled | explicit test + doc | add test that a paid plan cannot enable mainnet | NOT STARTED | — | open |

## F. Infrastructure (Phase 5)
| ID | Requirement | Current | Missing | Action | Status | Evidence | Final |
|---|---|---|---|---|---|---|---|
| I-1 | Deployable stack: API + worker + web + site + Postgres, health checks, migrations, backups/restore, rollback, resource limits | Dockerfile verified on CI; `infra/docker-compose.yml` is a dev template with **no worker service, dev secrets, failpoints on**; `infra/deploy/{fly.toml,render.yaml}` unverified; restore rehearsal exists | production compose, worker service, secrets handling, backup script + restore drill, rollback doc, compose smoke test in CI | build `infra/production/` + CI smoke | NOT STARTED | — | open (Docker daemon unavailable locally → CI-verified only) |
| I-2 | Public staging URL | none | owner approval for paid host | package only | BLOCKED (external) | — | external gate |
| I-3 | Monitoring / alerting / error tracking | `/metrics`-style counters exist; no wiring | alert rules doc, structured log shape, optional error-tracker hook | document + minimal wiring | NOT STARTED | — | open |

## G. Security (Phase 6)
| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| X-1 | Independent AI review pass over the 20 focus areas | IN PROGRESS (read-only reviewer agent) | findings → fixes with regression tests; labelled AI-assisted, not a pentest |
| X-2 | MFA enforcement: API-key actors, batch execute, schedule fulfil | NOT STARTED | verify the `mfaRequiredAndValid` call sites cover every approving/executing path (reviewer to confirm) |
| X-3 | Browser-held approval keys | NOT STARTED (design limitation) | document; WebAuthn is a future item |
| X-4 | Human security audit, jurisdictional legal review | BLOCKED (external) | owner commissioning |

## H. Dakar (Phase 7)
| ID | Requirement | Status |
|---|---|---|
| D-1 | Re-verify official rules/deadline/wallet requirement; organizer inquiry (not sent) | IN PROGRESS (agent) |
| D-2 | Devpost text, README, architecture diagram, real-regtest runbook, evidence index, captions, deck, 3-min video | IN PROGRESS (agent); video only if tooling allows, else honest "not produced" |
| D-3 | Submission | NOT SUBMITTED — requires explicit owner authorization |

## I. Customer validation (Phase 8)
| ID | Requirement | Status |
|---|---|---|
| C-1 | Prospect research with sources | PARTIAL — R2 list (30 orgs, desk research); needs refinement to Bitcoin-payout operators |
| C-2 | Interview guide | exists (`docs/business/interview-guide.md`); recruitment plan exists |
| C-3 | Outreach | drafts only (IN PROGRESS, agent); **nothing sent** — sending from the owner's identity requires explicit authorization |
| C-4 | Funnel counters | prospects researched = 30; contacted = 0; replies = 0; interviews = 0; pilots = 0; activated orgs = 0; paying customers = 0; revenue = 0 |

## J. Acceptance journeys A–G (Phase 9) and gates (Phase 10)
| Journey | Status now |
|---|---|
| A acquisition (needs real e-mail + provider sandbox) | PARTIAL — simulator/outbox only |
| B financial onboarding (real regtest) | PARTIAL — real execution proven; onboarding checklist absent |
| C exception handling (real regtest) | PARTIAL — real UNKNOWN→reconcile proven by `lnd.itest`/`demo:full`; no workbench UI/export |
| D org operations | PARTIAL — no MFA policy enforcement / ownership transfer |
| E subscription ops | SIMULATOR-VERIFIED only |
| F reliability (restart, restore) | PARTIAL — restore rehearsal PASSED (R1/R2 local), worker restart not asserted in a deployed stack |
| G support | PARTIAL — no staff console, no reply notification |
| Gate: formatting (prettier) | NOT STARTED — `.prettierrc.json` exists, **no CI gate; repo may not be formatted** |
| Gates: lint, typecheck, unit, integration, real-regtest, E2E, container, secret scan, audit | VERIFIED COMPLETE at 97a0951 (hosted CI) |
| Gates: dedicated accessibility job, email integration, authorization-regression, migration validation | partly inside `verify`/E2E; separate gates NOT STARTED |

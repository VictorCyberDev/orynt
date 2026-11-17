# Orynt R3 — owner report

*Written 2026-11-11 against branch `claude/busy-goodall-ajeb0p`, draft PR #1 (https://github.com/VictorCyberDev/orynt/pull/1). Not merged; nothing deployed, charged, sent, published or submitted. Status classes: VERIFIED COMPLETE · IMPLEMENTED, NOT COMMISSIONED · SIMULATOR-VERIFIED · PARTIAL · BLOCKED · FAILED · NOT STARTED. The living register is `docs/R3-CLOSURE-REGISTER.md`.*

## Bottom line
**R3 is not complete and Orynt is not commercially launchable.** The engineering that can be finished and proven in this environment is finished: the product runs a real Lightning payment, recovery and reconciliation against real nodes on regtest, and the customer-facing, administrative, billing, e-mail and support software exists and passes its tests against simulators and local controlled services. Every step that needs a real external account or a decision of yours (an e-mail domain, a billing provider, a paid host, a human audit, counsel, Dakar eligibility) is **BLOCKED on you**. No paying customer, no real e-mail, no real subscription charge, and no public deployment exists.

**Final commercial release classification: ENGINEERING-VERIFIED ON REGTEST AND SANDBOX — NOT COMMISSIONED, NOT LAUNCHED.** (Release states: DEVELOPMENT ✔ · TEST-VERIFIED ✔ · REGTEST-VERIFIED ✔ · STAGING-DEPLOYED ✘ · PRODUCTION-COMMISSIONED ✘ · AUDITED / LEGALLY CLEARED ✘ · PAID CUSTOMER JOURNEY VERIFIED ✘.)

## 1. Starting repository state
HEAD `97a0951`; hosted CI green on push and PR (6 jobs); 15 real-LND tests, 102 integration, 138 E2E, 51 unit as recorded then. PR #1's title and body still claimed real Lightning was unverified and quoted R1 counts — **repaired first**. `production-readiness.md` still listed MFA/e-mail verification/CI as unbuilt — **rewritten**.

## 2. Every R2 gap and its disposition
| R2 gap | Disposition |
|---|---|
| Exception workbench UI | **VERIFIED COMPLETE** (§9) |
| Onboarding checklist | **SIMULATOR-VERIFIED** + real-regtest assertions (§6) |
| Org admin (transfer, sessions, closure, MFA policy) | **PARTIAL**: API + tests, no web screens (§10) |
| Internal support console | **SIMULATOR-VERIFIED** (§10) |
| NWC / BTCPay / Core Lightning | NWC, BTCPay **IMPLEMENTED, NOT COMMISSIONED** (contract-tested, not wired); Core Lightning **NOT STARTED** (§5) |
| Real e-mail | **IMPLEMENTED, NOT COMMISSIONED** (§7) |
| Real billing | journeys **SIMULATOR-VERIFIED**; provider **BLOCKED** (§8) |
| Deployment / monitoring | package **IMPLEMENTED, NOT COMMISSIONED**; staging **BLOCKED** (§11) |
| Formatting gate | **VERIFIED COMPLETE** |
| Security review | **PARTIAL** (§12) |
| Dakar package | refreshed; **not submitted; eligibility unresolved** (§14) |
| Customer validation | research + drafts; **nothing sent, no evidence** (§13) |

## 3. Completed product features (this round)
Backend-derived onboarding; organisation profile; incident workbench with evidence export; unified MFA step-up with replay/lockout and an org-level "2FA required" policy; durable mail pipeline with nine notification kinds; plan-change journeys with a downgrade guard, portal entry and billing history; session management, ownership transfer, organisation closure; separate support console; production deployment package; Prettier gate; hardening items from the independent review.

## 4. Real Lightning results
Re-run today against a freshly started regtest network (bitcoind 29.5 + two LND v0.20.1): **15/15** real-node tests pass (also re-run after the stricter NOT_FOUND rule and connect-time address vetting), and `pnpm demo:full` passed (all assertions: single settlement, injected lost response reconciled, API SIGKILL recovered, receipts verified with `--require-real`, tampering rejected) — evidence in `docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.*`, `real-lightning-test-2026-11-11.txt`, `verifier-real-2026-11-11.txt`. **Never run on testnet or mainnet; mainnet is disabled.** Fault injection is by failpoint (the response is dropped after LND accepted), not a real network partition.

New this round on the money path: an execute-time **lookup gate** (a wallet that cannot look payments up is refused — this was stored but not enforced before) and LND "not found" counted as authoritative only for LND's own payment messages (a proxy's bare "Not Found" is an unknown outcome).

## 5. NWC and BTCPay results
Both adapters exist in `packages/wallets` with typed contracts, error classification, secret redaction and documentation (`docs/product/nwc-adapter.md`, `btcpay-adapter.md`).
- **NWC (NIP-47):** 203 contract tests against a local fake relay and wallet service; official BIP-340 vectors (19) and NIP-44 v2 vectors pass; strict URI parsing; authenticity checks on every response; a timeout is never a failure and `PAYMENT_FAILED` is confirmed by lookup before it is believed. Found along the way: the NIP-47 appendix example event is not self-consistent (the adapter rejects it); NIP-47 has no fee-limit parameter (the adapter refuses by default) and no idempotency key.
- **BTCPay:** 54 contract tests against a fake built from the official swagger. Differences from LND that shaped it: no "already paid" error (existence is checked first), a 503 can hide a completed payment, a 400 is not proof of failure, absence of a payment is not reliable unless the operator attests the backend, one broad permission covers pay + lookup. Verdict in its doc: **not recommended as a supported wallet yet**.
- **Neither is wired into the API** and neither has met a real wallet service. They cannot be selected by a customer. Core Lightning: **NOT STARTED**.

## 6. Customer onboarding
`GET /v1/onboarding` computes twelve steps from real rows (verified e-mail, profile, plan, wallet, capabilities incl. lookup, policy review, approval key, recipient, first approval, receipt) plus a finish step the server refuses until all are done. It reports whether you are in practice mode, regtest, test network or (disabled) mainnet. Only plan and policy have an explicit, audited decision because they leave no other trace. 9 integration tests; on a real regtest wallet the checklist reports `regtest` and "real wallet provider on regtest" for the settlement step. Browser E2E covers the page, the disabled "Finish setup" and persistence across reload.

## 7. E-mail integration
Lease-based claiming (two workers cannot send the same message — **mutation-checked**: removing the lease made the test send 22 mails instead of 12), exponential backoff to 8 attempts, providers `log` / `resend` / `brevo`, Svix-signature delivery webhook, token redaction after delivery and after 7 days, per-recipient hourly caps. Nine notification kinds are wired to real events. 9 tests, **all against a local controlled service shaped like the providers' documented APIs.**
Final status: **code complete ✔ · provider sandbox verified ✘ · real delivery verified ✘ · production sending commissioned ✘.** To commission you must supply a sending domain you own (SPF/DKIM/DMARC), a provider API key and a webhook secret; see `infra/production/README.md`.

## 8. Subscription billing
Journeys implemented and tested on the sandbox provider: checkout, activation (only for a plan the organisation started to buy, only when paid), duplicates / stale / out-of-order / late events, past-due grace, final cancellation back to the free plan, upgrade, **downgrade refused while usage exceeds the target plan**, portal entry (Stripe; honest refusal elsewhere), history, and "a paid plan never enables mainnet". Refunds and provider-issued invoice retrieval: **NOT STARTED**. The provider decision is **BLOCKED**: the desk evaluation (`billing-provider-evaluation.md`) leans to Polar *conditional on written answers from their support*, with a US-entity Stripe route as fallback; I did not choose a provider because the facts that decide it (your legal entity, jurisdiction, whether any provider accepts Bitcoin-adjacent software) are yours to establish. **Every webhook in the tests was signed by the test itself; nothing here is real paid acceptance.** Credentials needed for B-3: a provider account with sandbox keys, a webhook signing secret, price/plan IDs for each plan, and a customer-portal configuration.

## 9. Exception workbench
Incident queue → detail with: the payment's true state in words (an uncertain payment is shown as UNKNOWN and "may have succeeded", never failed), second-send-blocked banner, approvals, attempts, reconciliation runs, merged evidence timeline, safe actions with reasons, manual reconcile, assignment, notes, resolution (refused while the payment is unresolved), integrity-hashed evidence export. Verified on the simulator and on a **real** uncertain regtest payment. 4 integration tests, E2E with axe at three widths.

## 10. Organisation administration and support console
- **Admin (API, no web UI yet):** session list/revoke/revoke-others; ownership transfer (password + step-up, atomic role swap, both parties notified); organisation closure (owner, exact name, password, step-up; **refused while any payment is unresolved**; revokes sessions/keys, disables wallets/schedules/webhooks; 90-day retention; no automatic purge job yet). Org-level "2FA required for privileged roles" (owner-only change, itself a step-up).
- **Support console:** separate staff identity (own tables, cookie, CSRF), password + mandatory TOTP with replay protection and lockout, ticket list/read/reply with customer notification, organisation summary that **requires a stated reason** and contains no credentials/hashes/invoices/member e-mails, append-only staff audit. There is **no route** to impersonate, approve, pay, or reach wallet secrets (tested). Gaps: no staff password change or MFA reset, no browser E2E, created by a CLI, minimal UI, not independently reviewed.

## 11. Staging deployment
`infra/production`: Caddy (automatic TLS) → API + in-process worker → PostgreSQL, health checks, memory/CPU limits, read-only filesystem, no capabilities, `/metrics` and `/staff` not exposed; `backup.sh`, `restore-check.sh`, README with rollback, alert rules and hard limits (**single instance only; no HA/PITR**). The API boot guard refuses sandbox billing / log mail / non-https URL in production unless `ORYNT_ALLOW_UNCOMMISSIONED=1`, and CI proves the container refuses to start without it. **The compose stack has never been started** (no Docker daemon here); CI builds the image, migrates a fresh database, serves health and validates the compose file. Local `pnpm restore:rehearsal` passed. **No public URL exists and none is claimed.**

## 12. Security
An AI-assisted independent review (read-only agent) plus the author's checks: **not a penetration test, not an audit.** Fixed with regression tests: MFA step-up coverage (H1), TOTP replay/lockout (M8), cross-tenant schedule run (M1), silent membership of existing accounts (M2), plaintext token retention (M4), billing activation trust and late-event cancel (M6), LND "not found" misclassification (M10), production fail-closed config (L7), query-string tokens in logs (L8), mail double-send (L12). **Still open:** browser-held approval key and no WebAuthn (H2, partial), entitlement gaps after lapse/invite-accept (M5), `trustProxy` granularity and generic wallet error text (M7/M9 partial), several Low items (enumeration, unbounded work, key expiry, CSP/cookie prefix, no key-rotation tool, Actions not pinned by SHA). Full table: `docs/security/threat-model-r3-review.md`. A human audit and counsel review remain **external gates**.

## 13. Customer research
Prospects researched **30**; re-verified against live pages **8**; with a sourced public contact route **6** (2 on hold); personalised drafts **8** (`docs/business/outreach-drafts.md`, each marked NOT SENT). Contacted **0**, replies **0**, interviews **0**, pilots **0**, activated organisations **0**, paying customers **0**, revenue **0**, retention n/a. **Product-market fit: NOT VALIDATED** (`validation-scorecard.md`, with proposed stop/pivot thresholds awaiting your ratification). Honest fit risk: OpenSats (strongest recurrence evidence) appears to pay on-chain, while Orynt pays BOLT11 only. BTCPay already binds approval to a numbered revision, so that is not a differentiator.

## 14. Dakar assets
Refreshed from verified evidence: Devpost text, README, architecture diagram (SVG/PNG), real-regtest runbook, evidence index, captions, a 12-slide deck (PDF), and a 179-second **silent captioned** video whose scenes are source-tagged (real regtest browser captures, real transcript/verifier output, one labelled practice-mode scene). No voice-over. **Re-verified 2026-11-11: the deadline is unchanged (20 Nov 2026 20:00 UTC) but eligibility is now a hard gate** — an organiser forum reply says the event is "strictly for students", the Rules page says "reside in Africa", and the "wallet implementation" requirement is unanswered. Orynt is payout-authorization software that integrates with LND, not a wallet, and the materials say so. The organiser inquiry (EN/FR) is drafted and **not sent**. **Not submitted.** Also: `main` holds only the baseline commit, so judges opening the repository would see an empty project until you merge or link the branch.

## 15. CI results
Hosted GitHub Actions on commit `1cee6b2` (push run 43014282912, PR run 43014275615): **all six jobs succeeded in both runs** — `verify` (lint, typecheck, **format check**, unit, build, integration on the simulator), dependency audit (hard gate, high/critical), secret scan, real Lightning on regtest (bitcoind + 2×LND), browser E2E (Chromium, 375/768/1440, axe), and the container job (image build, fresh-database migration and health, **boot guard must refuse placeholder providers**, production compose file parses). Earlier red runs during this round, all fixed: gitleaks false positives on public test vectors; a time-dependent regression test; two E2E races (async prompts counted once); a lint error; the Prettier-formatted `eslint.config.js` that I had failed to commit. The report commit that follows is documentation-only and triggers one more run, which is not covered by the statement above.

Local verification (unit, integration, audit at the last source change; E2E, site and restore rehearsal after the final test-only edits) — commands and exit codes: `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm format:check` 0 · `pnpm test` 0 (core 24, contract 1, verifier 26, wallets 257 passed + 2 skipped) · `pnpm audit --prod --audit-level=high` 0 · `pnpm test:integration` with real regtest 0 (**152 passed, 15 files, none skipped**, includes the 15 real-LND tests) · browser E2E 0 (**166/166**, repeated twice, axe serious/critical 0) · `pnpm --filter @orynt/site verify` 0 (596 claim checks, 0 broken of 874 links, privacy 452 checks, axe 74 runs) · `pnpm restore:rehearsal` 0 · README quickstart verified from the built bundle on a fresh database. **Skipped tests:** 2 in `packages/wallets` (the opt-in operational NWC test, needs `ORYNT_NWC_URI`; release impact: NWC stays uncommissioned); on hosted CI the `verify` job skips the real-LND file, which runs in the `real-lightning` job.

## 16. User-journey acceptance
`docs/ACCEPTANCE-JOURNEYS-R3.md`. **B and C: VERIFIED COMPLETE on regtest. A, D, E, G: SIMULATOR-VERIFIED with their real-provider steps BLOCKED. F: PARTIAL.**

## 17. Remaining blockers
Real e-mail (domain + key); billing provider (entity, jurisdiction, account); paid host; human security audit; counsel review; Dakar eligibility and submission; a real NWC wallet and a real BTCPay environment for operational tests; Core Lightning evaluation; web screens for the new organisation-admin actions; refunds and provider invoices; an automatic retention purge; WebAuthn and key rotation; the open Medium/Low review items.

## 18. Owner approvals required (none requested or taken)
| # | Action | Cost | Risk | Why | Result |
|---|---|---|---|---|---|
| 1 | Decide Dakar eligibility (student? Africa-resident?) and send `organizer-inquiry.md` from your identity | free | being disqualified after effort | it decides whether anything else in the package matters | a written organiser answer |
| 2 | Decide how judges see the code: merge PR #1 to `main` or submit the branch link | free | publishing unfinished work under your name | `main` is empty | a visible repository |
| 3 | Dakar submission, voice-over and upload | free | factual errors in public | deadline | submission only on your explicit go |
| 4 | Billing provider: ask Polar/Paddle the gating questions, then open an account | account free; fees per sale; entity formation may cost (unverified estimate) | refusal of crypto-adjacent software; tax exposure | live billing commissioning | sandbox keys to test the parsers against real traffic |
| 5 | Domain + sending domain + mail provider key | domain and provider pricing: not checked | `orynt.*` names are mostly taken (`docs/brand/name-clearance.md`) | real e-mail | verified delivery |
| 6 | Paid host / managed PostgreSQL for staging | not quoted | misconfiguration, data exposure | staging + backups + monitoring | a public URL and a restore drill |
| 7 | Independent security review (human) | not quoted | none to the repo | gate before real funds | findings list |
| 8 | Counsel review (privacy, terms, pricing, regulation) | legal fees | launching without it | pricing may be shown as final only after it | cleared documents |
| 9 | Send the 8 outreach drafts (and ratify the exception to the "published route" rule) | free | reputation if sloppy | the only way to get customer evidence | contacted/replies counters move |
| 10 | Provide a throwaway real NWC wallet / a BTCPay regtest environment | free to modest | none if testnet/regtest only | to promote the adapters | recorded operational runs |
| 11 | Name / trademark outcome | possible rebrand | collisions | affects domains and packages | final name |
| 12 | Any mainnet payment | real bitcoin | loss of funds | **not recommended** before 6–8 | – |

## 19. Exact branch and PR
Branch `claude/busy-goodall-ajeb0p`, draft PR #1 (open, not merged). Commits since `97a0951` (361 files changed): `c0849fb` register + production-readiness · `14aecd9` onboarding · `ea6dbc4` MFA step-up + security batch 1 · `3fdb5f6` mail pipeline · `dd936ae` workbench · `d4b4181` wallet adapters · `dfab33f` Dakar refresh · `0e3c058` quickstart fixes · `1eaf4e9` CI fixes · `2595362` workbench UI + security batch 2 · `9d5e6a0` org admin + staff console · `aa2ef7a` lint · `b64dc1e` Prettier gate + production package + outreach · `e39129d` eslint config · `8355f1c` billing journeys · `8dab308` closure register + journeys + review dispositions · `651f01e` E2E race fixes · `1cee6b2` matrix + register · and the commit containing this report.

## 20. Final commercial release classification
**Not launchable.** What exists is a verified engineering foundation: real Lightning execution and recovery proven on regtest, with the surrounding SaaS software proven on simulators and local controlled services. Level C / "commercial launch" requires real production commissioning, lawful operation, billing acceptance and an external customer journey — none of which exists. Overall R3 completion is **not** declared: Phases 2 (operational wallet verification, Core Lightning), 3 and 4 (real providers), 5 (staging), 6 (human audit), 7 (submission) and 8 (customer evidence) each have a mandatory milestone that remains incomplete.

---
*Aspiration check lives in the closing message of the session that produced this report, not in this file.*

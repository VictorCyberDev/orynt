# Metrics and privacy: ethical instrumentation plan

Status: DRAFT v0.1, 2026-11-09. This is a plan. No instrumentation is verified as built (see [`../EXECUTION-REGISTER.md`](../EXECUTION-REGISTER.md)). Privacy and consent wording is not legal advice; applicable law (for example Nigeria's NDPA and its 2025 directive, EU/UK GDPR, others by user location) must be confirmed by counsel (see [`legal-regulatory-register.md`](legal-regulatory-register.md)).

## 1. Principles

1. **Measure to learn, not to impress.** Metrics exist to test the hypotheses in [`thesis-and-falsification.md`](thesis-and-falsification.md). A metric nobody will act on is not collected.
2. **Collect the minimum.** Counts and timestamps, not payee identities, invoices, amounts tied to people, wallet identifiers or IP-level profiles.
3. **Consent and control.** Product telemetry is opt-in for hosted use and off by default for self-hosted use. Users can see, export and delete what is collected about them.
4. **No dark patterns.** No tracking before consent, no pre-ticked boxes, no guilt-trip banners, no fake urgency, no nagging for reviews, no deceptive "scarcity".
5. **No false activity.** Regtest, simulator and test traffic must be labelled and excluded from "real activity" counts. Never display or report counts that include founder usage, test data, bots or seeded records as if they were customers.
6. **Honest reporting.** Report numerators and denominators, sample sizes, and the share of users who consented. Small numbers are shown as small numbers.
7. **Separate research data from product telemetry.** Interview data governed by [`interview-guide.md`](interview-guide.md) consent; do not merge with telemetry without separate consent.

## 2. Metrics catalogue

Each metric has a purpose, a definition, an exclusion rule and a decision it informs. Environment labels: `real_mainnet`, `regtest`, `testnet`, `simulator`. Only the first is "real funds". Report the others separately.

| # | Metric | Definition | Numerator / denominator | Exclusions | Decision it informs | Privacy note |
|---|---|---|---|---|---|---|
| M1 | Onboarding completion | Share of new workspaces that complete the defined onboarding steps (create workspace, define policy, add approver) | completed / created, per 14-day cohort | Founder/test workspaces, bots | Is setup too hard? (T5, T9) | Count only; no names |
| M2 | Connected-wallet % | Share of workspaces with a wallet adapter connected and passing a health check | connected / workspaces | Simulator-only workspaces counted separately | Trust barrier (T5) | Do not store macaroons or keys in telemetry; adapter type (enum) only |
| M3 | First authorised payout | Time from workspace creation to the first payout that reaches APPROVED with required signatures | median, p90 and n | Test fixtures | Time to value | Timestamps only |
| M4 | First fully reconciled payout | Time from workspace creation to first payout reaching SETTLED (or SIMULATED_SETTLED, labelled) with a receipt | median, p90, n; separate by environment | Test fixtures | Value delivered (T2, T3) | No payee data |
| M5 | Exception time-to-resolution | Time from UNKNOWN or RECONCILING entered to a terminal state (SETTLED or DEFINITIVELY_FAILED) | median, p90, count of exceptions | Injected test faults must be labelled `fault_injection` | Is "truthful state" useful and support load acceptable? (T3, cost to serve) | State transitions only |
| M6 | Duplicates blocked | Count of second-send attempts refused by the execution guard | count per 100 payouts, with n | Test faults labelled | Does the guard prevent real harm? (T3) | Count only; counting a refusal does not prove a loss was avoided; do not present it as "money saved" |
| M7 | Verifier success | Share of verifier runs that return valid for genuine receipts, and share that reject tampered/replayed/stale/forged receipts in the test corpus | success / runs for each class | Only the project's own test corpus; verifier is offline and does not phone home | Correctness of evidence claim | The offline verifier sends **no telemetry**; this metric comes from the CI test suite and voluntary user reports |
| M8 | Pilot requests | Qualified requests via the landing page CTA, plus requests arising from interviews | count of unique organisations | Duplicates, personal/friend requests (listed separately) | Demand signal (T6, T7) | Form fields minimal; consent checkbox for contact |
| M9 | Interview-derived metrics | Items in the scorecard aggregate | See interview guide | Warm interviews | Thresholds | Participant codes only |
| M10 | Support load | Support minutes and tickets per active workspace per month | hours / workspaces | Founder dev time | Cost to serve ([`pricing-hypotheses.md`](pricing-hypotheses.md)) | Ticket text may contain personal data; avoid in analytics |

## 3. Consent, retention and rights

| Topic | Plan (counsel to confirm) |
|---|---|
| Lawful basis and consent | Hosted telemetry: opt-in consent at first run, plain language, granular toggles. Self-hosted: no telemetry unless enabled by the operator. Website: no non-essential cookies or third-party trackers without consent; prefer cookieless first-party aggregate counts |
| Notice | Short privacy notice listing what is collected, why, retention, who processes it, how to delete |
| Retention | Telemetry events: 90 days raw, then aggregated; interview notes: up to 12 months unless deleted sooner; audio: delete within 30 days of transcription; pilot data: per pilot contract (default delete within 30 days of end on request). These are proposals |
| Data subject rights | Access, correction, deletion, objection handled by email; documented response process; track requests |
| Children | Not a target; no collection of age data; no features aimed at minors |
| Payee personal data | Payees are third parties who never interacted with Orynt directly. Telemetry must not include payee identifiers. Operators' own processing of payee data is their responsibility; Orynt's role (processor/controller) is a counsel item |
| Cross-border transfers | Hosting region and subprocessors undecided; counsel item given Nigeria, Kenya, South Africa and EU users |
| Security of analytics | Access-controlled, encrypted at rest, pseudonymised user IDs, no analytics keys in client code beyond public ingestion endpoints |
| Third parties | No ad networks, no data brokers, no session-replay tools |
| Breach handling | Written incident procedure (not done); notify per applicable law and pilot terms |

## 4. Instrumentation rules for engineering

- [ ] Telemetry events have a schema in the repo; any new field requires a documented purpose.
- [ ] Every event carries `environment` (real_mainnet | regtest | testnet | simulator) and `synthetic` boolean.
- [ ] Never log: macaroons, API tokens, seed phrases, preimages in analytics, full invoices, payee names, emails in event properties.
- [ ] Preimages stay in receipts and the database only as designed; never in telemetry.
- [ ] Opt-out and delete endpoints exist before telemetry ships.
- [ ] Dashboards show n next to every percentage; hide percentages when n < 5.
- [ ] Founder and test accounts are flagged and excluded by default.

## 5. Anti-patterns to avoid (explicit)

| Anti-pattern | Why prohibited |
|---|---|
| Counting regtest or simulator payouts as "payments processed" in public statements | Creates false impression of production use. Label as test |
| Showing "X organisations trust Orynt" or similar | There are none; fabricating would breach the product brief |
| Embedding fake live activity feeds | Deceptive |
| Using the hackathon demo traffic as adoption data | Not validation (see [`go-no-go-framework.md`](go-no-go-framework.md)) |
| Hidden tracking pixels in emails | Not allowed; if open-tracking is ever used, disclose and offer opt-out |
| Retargeting people who visited once | Not part of plan |
| Reporting percentages on tiny n | Misleading; show counts |

## 6. Reporting cadence

| Cadence | Content | Audience |
|---|---|---|
| Weekly during validation | M8, interview count, qualified count, funnel from [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md) | Founder |
| At each stage gate | M1-M7 with environment labels and n | Founder, advisers |
| Day 30/60/90 | Scorecard aggregates vs thresholds | Decision review in [`go-no-go-framework.md`](go-no-go-framework.md) |

All reports include a line: "Metrics exclude warm contacts, test traffic and founder usage; sample sizes shown; no claim of product-market fit."

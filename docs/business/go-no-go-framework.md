# Go / no-go framework and validation timeline

Status: DRAFT v0.1, 2026-11-09. Thresholds below are **proposed and must be ratified by the founder before any data is read** (pre-registration). Changing a threshold after seeing data requires an entry in the change log (section 8) with date and reason.

## 1. Hackathon versus company

The hackathon is a **forcing function**: it creates a deadline, a demo and an audience. It is **not validation**.

| | Hackathon | Company |
|---|---|---|
| Question answered | Can a working demo be built and shown in a few weeks? | Does a repeatable group of buyers pay to remove a recurring pain? |
| Audience | Judges, peers, sponsors | Buyers, operators, integrators |
| Success signals that do count | A demo that runs on regtest; code others can inspect | Behavioural commitments by independent organisations: pilots, data shared, money |
| Signals that do **not** count | Prizes, judge praise, stars, followers, "great idea" comments, demo views | Same list |
| Time horizon | Fixed submission date | 90-day validation then a decision |
| Risk | Optimising the demo and polishing claims | Mistaking demo success for demand |

Rules:
1. Do not describe hackathon outcomes as traction in any document, deck or grant application.
2. Anything a judge or sponsor says is marked "hackathon contact" in the scorecard and excluded from thresholds.
3. The demo may show features only if EXECUTION-REGISTER lists them as VERIFIED; otherwise label "designed".
4. Use the hackathon audience as a recruiting pool for **interviews**, not as evidence.

Hackathon date: not recorded in the repo reviewed. This plan **assumes submission on Monday 2026-12-07 (ASSUMPTION; replace D0 with the real date and shift all dates by the same offset)**. Day 90 after D0 is Sunday 2027-03-07.

## 2. Decision framework (evaluated at day 90, with checkpoints at day 30, 45 and 60)

Measure from independent organisations only (no friends, no warm contacts, one count per organisation, hackathon contacts excluded). Definitions: see [`interview-guide.md`](interview-guide.md) (qualified, real incident, access willingness), [`pricing-hypotheses.md`](pricing-hypotheses.md) (commitment ladder).

| # | Metric | GO | CONDITIONAL | NO-GO | Must-have? |
|---|---|---|---|---|---|
| 1 | Completed interviews (orgs counted once) | 20 or more | 12-19 | under 12 | yes (for a valid decision) |
| 2 | Qualified share of completed | 50% or more | 30-49% | under 30% | no |
| 3 | Qualified orgs with a real payout incident in last 12 months | 6 or more | 3-5 | 2 or fewer | yes |
| 4 | Mean pain score of qualified orgs (0-4) | 2.5 or more | 1.8-2.4 | under 1.8 | no |
| 5 | Share of qualified with Access score of 3 or more | 40% or more | 20-39% | under 20% | no |
| 6 | Orgs completing a stage-2 regtest/simulator trial on their own process map | 3 or more | 1-2 | 0 | yes |
| 7 | Independent written commitments with an amount or paid pilot (E5/E6 in pricing file) | 3 or more | 1-2 | 0 | yes |
| 8 | Qualified pilot requests from landing page with no paid traffic | 10 or more from 5+ orgs | 4-9 | under 4 | no |
| 9 | Counsel written view on intended architecture in first-launch jurisdiction(s) | Does not require a licence that the founder will not pursue | Pending or partial | Adverse and not pursuable | yes |
| 10 | Independent review of the money-moving paths (signing, reservation, reconciliation) | Done, no unresolved critical finding | Scheduled | Critical finding unresolved | required before any mainnet pilot, not for the decision itself |

Decision rule:
- **GO** (continue as a company, scale up pilots): row 1, 3, 6, 7 and 9 are at GO or CONDITIONAL-high (defined: at least the CONDITIONAL lower bound with a written explanation) AND at least 6 of the 10 rows at GO AND no row at NO-GO among must-haves.
- **CONDITIONAL** (extend 30 days once, or change segment/model): no must-have at NO-GO but fewer than 6 rows at GO. The extension must state which metrics it will improve and by when. Only one extension.
- **NO-GO**: any must-have at NO-GO (rows 1, 3, 6, 7, 9), after the one allowed extension. Or the founder cannot continue (key-person).
- A GO is a decision to keep investing; it is not a claim of product-market fit.

Before concluding, complete the disconfirming-evidence review (section 6).

## 3. Kill criteria that trigger earlier action

| Trigger | Checkpoint | Action |
|---|---|---|
| Fewer than 8 completed interviews by day 30 | Day 30 | Change recruitment channel; if still under 8 by day 45, no-go on current approach |
| Zero real incidents among first 10 qualified orgs | Day 45 | Stop and revisit ICP (segment switch rule in [`thesis-and-falsification.md`](thesis-and-falsification.md)) |
| Counsel says licensing is required in all first-launch jurisdictions | Any time | Pause hosted/mainnet plans; choose self-host only, change jurisdiction, or stop |
| Independent review finds unfixable funds-safety defect | Any time | Halt pilots with real funds |
| Founder unavailable more than 3 weeks | Any time | Pause; invoke continuity steps in [`risk-register.md`](risk-register.md) K1 |
| Any proof that metrics or claims were inflated | Any time | Correct publicly and internally; reset evidence count |

## 4. Timeline

All dates are 2026-2027. **D0 = 2026-12-07 is an assumption** for hackathon submission. Weeks begin on Monday.

### 4.1 Pre-hackathon (2026-11-09 to 2026-12-06): use the forcing function without confusing it for validation

| Week (Mon) | Business/validation work | Product/technical dependency |
|---|---|---|
| 2026-11-09 | Ratify thresholds in this file; finalise screener and consent script; start counted census (A1); shortlist counsel; read competitor matrix and update whitespace scores | Execution register: run and record verification commands for the demo path; label anything unverified as "designed" |
| 2026-11-16 | Send first 10 interview invitations (cold-first) using drafts after consent text is checked; book interviews; start landing page copy (honest limits) | Decide core licence (affects grants, pricing) |
| 2026-11-23 | Run first 4-6 interviews (no product pitch); second-score scorecards; log disconfirming evidence | Hackathon feature freeze plan |
| 2026-11-30 | Finish 8+ interviews if possible; adjust segment quotas; write counsel brief with architecture facts | Demo hardening; regtest-only; simulator labelled |
| 2026-12-07 (D0) | Hackathon submission. Publish honest limits page with demo. No traction claims | Demo |

Pre-hackathon success is not scored against GO thresholds, but interviews done count toward row 1 if they meet criteria.

### 4.2 Post-hackathon 90-day validation plan

| Day | Date range | Focus | Deliverables | Gate |
|---|---|---|---|---|
| 0-6 | 2026-12-07 to 12-13 | Debrief; separate hackathon contacts; thank-yous; launch landing page CTA test | Landing page live with honest limits; hackathon contact list tagged | Threshold ratification confirmed |
| 7-13 | 2026-12-14 to 12-20 | Interview sprint 1 (target cumulative 10) | Scorecard rows; first aggregate | |
| 14-20 | 2026-12-21 to 12-27 | Holiday lull: census + counsel engagement + docs | Census v1 (A1 counted); counsel engagement letter | |
| 21-27 | 2026-12-28 to 2027-01-03 | Documentation, regtest quickstart for pilots | Quickstart verified against register | |
| 28-34 | 2027-01-04 to 01-10 | Interview sprint 2 (target cumulative 14) | Day-30 checkpoint on 2027-01-06: interviews >= 8 | **Checkpoint D30** |
| 35-41 | 2027-01-11 to 01-17 | Stage-0/1 qualification with interested orgs; ROI worksheets | 5 worksheets started | |
| 42-48 | 2027-01-18 to 01-24 | Interview sprint 3 (target cumulative 18); begin stage-2 trials | Day-45 checkpoint on 2027-01-21: incidents among first 10 qualified | **Checkpoint D45** |
| 49-55 | 2027-01-25 to 01-31 | Stage-2 trials (regtest) with up to 3 orgs; counsel questions X1/NG1 answered or chased | Trial logs | |
| 56-62 | 2027-02-01 to 02-07 | Pricing experiments E3-E6; reach 20 interviews | Day-60 checkpoint on 2027-02-05: scorecard aggregate; segment decision | **Checkpoint D60** |
| 63-69 | 2027-02-08 to 02-14 | Paid concierge / LOI conversations; funding applications if eligible (see [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md)) | Commitments logged | |
| 70-76 | 2027-02-15 to 02-21 | Gap-fill: segments under-sampled; independent review scoping | Day-75 on 2027-02-20: any must-have at NO-GO? Decide whether to use the single extension | **Checkpoint D75** |
| 77-83 | 2027-02-22 to 02-28 | Final trials; metrics compiled; disconfirming-evidence review by an outside reader | Draft decision memo | |
| 84-90 | 2027-03-01 to 03-07 | Decision week | Decision memo; log in change log; communicate decision | **Decision D90 on 2027-03-07** (Sunday; hold the review the preceding Friday 2027-03-05) |

If using the one 30-day extension: new decision date is D120 = 2027-04-06 (Tuesday); no further extension.

## 5. Decision outcomes and what happens next

| Outcome | Actions within 14 days |
|---|---|
| GO | Choose first paying cohort; confirm entity and counsel; plan independent review and, if justified, capped mainnet pilot; update thesis and risk register; restate honest limits |
| CONDITIONAL | Name the single hypothesis to repair, the experiment, the date (max 30 days); keep interviews going |
| NO-GO | Publish learnings (internal and optionally public, without participant details); either open-source what exists with a clear status notice, archive, or stop; delete personal data per consent promises; thank participants |
| Pivot (alternative segment) | Use [`thesis-and-falsification.md`](thesis-and-falsification.md) section 4; restart interview quota; reset the 90-day clock only once, after documenting why |

## 6. Disconfirming-evidence review (required before any GO)

- [ ] Re-read all disconfirming notes; list the five strongest reasons to stop.
- [ ] An outside reader (not a friend with a stake) reviews the scorecard and the memo.
- [ ] Check for selection bias: regions, roles, channels.
- [ ] Check the commitments: are they from independent orgs? Do they cost the counterparty something?
- [ ] Verify product claims in the memo against EXECUTION-REGISTER (VERIFIED only).
- [ ] Confirm no number from [`market-model.md`](market-model.md) is presented as fact.

## 7. Investment gates (what each step unlocks)

| Gate | Unlocks | Requires |
|---|---|---|
| G0 (now) | Interviews, regtest demos, landing page | Consent script; honest limits |
| G1 | Regtest pilots with outside organisations | Counsel-reviewed pilot template (P2); data handling facts true |
| G2 | Paid concierge pilots | Entity or legal ability to invoice; counsel on terms; accountant |
| G3 | Capped mainnet pilot with consented funds | Rows 9 and 10 at GO level; execution-register VERIFIED for path; per-payout approval; rollback rehearsal |
| G4 | Hosted Team Cloud | Counsel X2; security due-diligence items 5.x addressed; privacy basics |
| G5 | Raising external funds or hiring | GO decision; second reviewer; continuity plan |

## 8. Change log (thresholds and plan)

| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-11-09 | v0.1 proposed thresholds | Initial draft | Pending founder ratification |

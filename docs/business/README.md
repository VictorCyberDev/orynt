# Orynt business documentation: index

Status: DRAFT v0.1, 2026-11-09. Orynt is a provisional name (no trademark or domain clearance). Product source of truth: [`../product/PRODUCT-BRIEF.md`](../product/PRODUCT-BRIEF.md). Build status source of truth: [`../EXECUTION-REGISTER.md`](../EXECUTION-REGISTER.md). Competitor facts: `docs/research/competitor-matrix.md` (separate workstream; not duplicated here).

## Honest summary

**Validated: nothing.** There are no customers, no interviews, no pilots, no revenue, no partners, no endorsements, no certifications, no audits, and no legal opinions. As of this writing the execution register shows the first milestone in progress and nothing marked verified. What exists is a product design (a Lightning payout authorization-to-settlement layer in front of a wallet the operator controls), a set of **hypotheses** about who needs it and why, and a plan to test those hypotheses cheaply and honestly: at least 20 interviews with a pre-registered scorecard, regtest-first pilots, willingness-to-pay experiments, counsel review of an issue register, and a go/no-go decision 90 days after the hackathon. Market size, pricing, willingness to pay, non-custodial legal characterisation and the segment ranking are all unvalidated assumptions, labelled as such. The hackathon is a forcing function, not validation.

## Reading order

| # | File | Read it to learn |
|---|---|---|
| 1 | [`thesis-and-falsification.md`](thesis-and-falsification.md) | What must be true, how each belief will be tested, kill criteria, alternative markets, moat skepticism |
| 2 | [`icp-and-segments.md`](icp-and-segments.md) | Who we think the customer is (categories only), their journeys, triggers, disqualifiers |
| 3 | [`interview-guide.md`](interview-guide.md) | How to run 20+ interviews, scorecard (empty), consent script, bias warnings |
| 4 | [`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md) | Blank ROI worksheet; pilot contract template (unreviewed by counsel) |
| 5 | [`pricing-hypotheses.md`](pricing-hypotheses.md) | Free core vs paid tiers as hypotheses, cost-to-serve assumptions, willingness-to-pay experiments |
| 6 | [`market-model.md`](market-model.md) | Transparent bottom-up/top-down skeleton; all inputs ASSUMPTION; no market-size claim |
| 7 | [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md) | Channels, funding landscape (cited), draft outreach (never sent), CTA measurement, pilots, objections |
| 8 | [`metrics-and-privacy.md`](metrics-and-privacy.md) | Ethical instrumentation: what is measured, consent, retention, no false activity |
| 9 | [`legal-regulatory-register.md`](legal-regulatory-register.md) | Questions for counsel by jurisdiction; no conclusions |
| 10 | [`security-due-diligence.md`](security-due-diligence.md) | Buyer security questions and honest status |
| 11 | [`risk-register.md`](risk-register.md) | Product, technical, market, regulatory, key-person and supply-chain risks |
| 12 | [`go-no-go-framework.md`](go-no-go-framework.md) | Thresholds, dated timeline to 2027-03-07, hackathon vs company |

## Conventions used across these files

- **ASSUMPTION**: a number or belief with a stated rationale and a way to falsify it. Never a fact.
- **HYPOTHESIS**: a belief to be tested, including all prices.
- **designed / planned / not done**: capability status; "built" requires VERIFIED in the execution register.
- **Empty tables** (interview results, counsel log, risk log, due-diligence log) are empty on purpose. Do not populate them with illustrative data.
- Regulatory citations are context for counsel and **must be verified by counsel**; no licence exemption is concluded anywhere.
- All dates assume today is 2026-11-09; the hackathon date is not recorded in the repo, so D0 = 2026-12-07 is an assumption to be replaced.

## Open decisions for the founder

- [ ] Ratify (or change) thresholds in the go/no-go framework before reading any data.
- [ ] Confirm the hackathon submission date (replace D0).
- [ ] Decide the core licence (affects grants and pricing).
- [ ] Engage counsel; supply architecture facts for register item X1.
- [ ] Read `docs/research/competitor-matrix.md` and re-score "whitespace" in the alternative-market table.

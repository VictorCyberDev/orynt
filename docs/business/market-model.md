# Market model (skeleton)

Status: DRAFT v0.1, 2026-11-09. **This file does not state a market size.** It is a transparent model structure in which every input is an ASSUMPTION. The outputs show how wide the plausible range is and which inputs matter. They are not forecasts, not estimates of reality, and must not be quoted externally.

No market-size claim should be used in investor, grant or public material until at least the "organisation census" input (A1) has been replaced with counted, cited data and independent interviews have replaced A2-A4.

## 1. Bottom-up model (beachhead: organisations running recurring Lightning payouts)

Formula:

```
Paying orgs (N_pay)  = A1 * A2 * A3 * A4
Annual revenue (R)   = N_pay * P
```

| Ref | Input | Low | Base | High | Status | Rationale (why this range) | How to falsify / replace |
|---|---|---|---|---|---|---|---|
| A1 | Organisations globally making recurring (at least monthly) Lightning or Bitcoin payouts to 10+ payees | 200 | 1,000 | 5,000 | ASSUMPTION | No public census known to this author. Low = a few per category; high = broad tail of projects, platforms and small companies | Build a counted census sheet from public sources (grant lists, bounty platforms, wallet app ecosystems, community directories) and interview screener hit-rate; replace with count + coverage estimate |
| A2 | Share of A1 where pain is high enough to adopt a tool (pain score >= 3 on rubric in [`interview-guide.md`](interview-guide.md)) | 5% | 15% | 30% | ASSUMPTION | Most small teams tolerate spreadsheets; severity concentrated in those with incidents | Share of qualified interviews with pain score >= 3 (needs unbiased sample) |
| A3 | Share of A2 reachable and willing to connect a wallet to Orynt or self-host within 3 years | 10% | 25% | 50% | ASSUMPTION | Trust, security posture, competing in-house tools and incumbent features limit it | Share of qualified interviews with Access >= 3; pilot conversion |
| A4 | Share of A3 that pays for a hosted/team tier (rest use free core) | 10% | 20% | 40% | ASSUMPTION | Open-source core cannibalises; developer culture resists paying | Paid commitments / pilots completed ([`pricing-hypotheses.md`](pricing-hypotheses.md)) |
| P | Annual revenue per paying org (USD) | 600 | 3,000 | 12,000 | ASSUMPTION | Brackets flat monthly price ranges in pricing hypotheses (about 50 to 1,000 per month) | Price conversations, paid pilots |

Outputs (pure arithmetic on the assumptions; **not a market-size statement**):

| Case | A1 | A2 | A3 | A4 | N_pay | P (USD) | R (USD/year) |
|---|---|---|---|---|---|---|---|
| Low | 200 | 5% | 10% | 10% | 0.1 | 600 | 60 |
| Base | 1,000 | 15% | 25% | 20% | 7.5 | 3,000 | 22,500 |
| High | 5,000 | 30% | 50% | 40% | 300 | 12,000 | 3,600,000 |

Reading: the spread is about 60,000x (25 x 6 x 5 x 4 x 20 = 60,000). That spread is the real finding: with a narrow beachhead, the base case is a small business at best (a lifestyle or open-source-funded project), and the high case is only reached if every input is favourable. A venture-scale story would need expansion beyond the beachhead (section 4), which is a separate hypothesis with its own assumptions and larger regulatory exposure.

Spreadsheet-ready (paste as CSV):

```csv
case,A1_orgs,A2_pain_share,A3_reach_share,A4_pay_share,P_usd_year,N_pay,Revenue_usd_year
low,200,0.05,0.10,0.10,600,=B2*C2*D2*E2,=G2*F2
base,1000,0.15,0.25,0.20,3000,=B3*C3*D3*E3,=G3*F3
high,5000,0.30,0.50,0.40,12000,=B4*C4*D4*E4,=G4*F4
```

## 2. Top-down cross-check (payout volume lens)

Formula:

```
Volume per org      = V1
Total in-scope volume (V) = A1 * V1
Software spend pool (S_pool) = V * s
Implied spend per org = S_pool / A1 = V1 * s
```

| Ref | Input | Low | Base | High | Status | Rationale | How to falsify |
|---|---|---|---|---|---|---|---|
| V1 | Annual Bitcoin payout volume per qualifying org (USD equivalent) | 25,000 | 100,000 | 400,000 | ASSUMPTION | Small teams paying tens of contributors modest sums; no data | Ask in screener; ROI worksheet Part A (a x b x c x 12) |
| s | Share of payout volume an org would plausibly spend on payout-control software | 0.1% | 0.3% | 0.5% | ASSUMPTION | Control software spend is usually small relative to flows; borrowed intuition from payments software, not a cited figure | Price conversations; compare with what they actually pay for adjacent tools |

Outputs (arithmetic only):

| Case | V (USD/yr) | S_pool (USD/yr) | Implied spend per org (USD/yr) |
|---|---|---|---|
| Low | 200 x 25,000 = 5,000,000 | 5,000 | 25 |
| Base | 1,000 x 100,000 = 100,000,000 | 300,000 | 300 |
| High | 5,000 x 400,000 = 2,000,000,000 | 10,000,000 | 2,000 |

**Inconsistency flagged on purpose:** the base-case implied spend per org via volume (300 USD/yr) is 10x below the base revenue-per-paying-org assumption P (3,000 USD/yr). If payout volume per organisation is small, a volume-proportional budget will not support the hypothesised price. The price must then be justified by labour saved, incident avoided or compliance evidence (worksheet Part A), not by volume. This is a hypothesis to test in interviews; it could also mean P is too high.

Note: the figure "total volume of Bitcoin payments globally" is deliberately not used. No source was verified for it and it would invite an inflated top-down number.

## 3. Sensitivity discussion

One-at-a-time swing (Low to High with all other inputs at Base), applied to base revenue 22,500 USD:

| Input | Low-to-high factor | Resulting revenue range holding others at base |
|---|---|---|
| A1 | 25x (200 to 5,000) | 4,500 to 112,500 |
| P | 20x (600 to 12,000) | 4,500 to 90,000 |
| A2 | 6x (5% to 30%) | 7,500 to 45,000 |
| A3 | 5x (10% to 50%) | 9,000 to 45,000 |
| A4 | 4x (10% to 40%) | 11,250 to 45,000 |

(Check: base N_pay 7.5 x 3,000 = 22,500; each row scales one factor proportionally.)

What this says:
1. The two most uncertain inputs (organisation count A1, price P) dominate. They are also the cheapest to learn about: a counted census and 20 interviews.
2. The three "share" inputs compound: three coin-flip-ish shares multiply to a few percent. Funnel conversion in pilots (not stated intent) is the evidence that matters.
3. Even the most favourable single-input swing leaves revenue at roughly 112,500 USD per year on these assumptions; larger outcomes require several inputs to move together.
4. If the interview programme shows A1 at the low end, the right conclusion is that this is a niche; options are open-source/grant-funded, services-led, or stop (see [`go-no-go-framework.md`](go-no-go-framework.md)).

## 4. Expansion scenarios (separate hypotheses; no numbers asserted)

| Scenario | New assumption needed | Dependency | Risk |
|---|---|---|---|
| Wallet/app teams embed Orynt as payout layer (integration channel) | Number of teams with payout features; willingness to white-label or pay per integration | Competitor behaviour (see `docs/research/competitor-matrix.md`) | They build in-house |
| Grant/foundation programmes as a repeatable segment | Number of programmes paying in sats | Open-source licence and funder relations | Low budgets |
| Additional rails or assets beyond Lightning | Technical and regulatory scope growth | Counsel; product capacity of a solo founder | Dilutes the non-custodial positioning; unverified legal exposure |
| Regional payout corridors (for example African markets) | Demand data, local licensing, partner banks/off-ramps (which would change the non-custodial premise) | Counsel for Nigeria, Senegal/UEMOA, Kenya, South Africa | High regulatory load; see [`legal-regulatory-register.md`](legal-regulatory-register.md) |

## 5. Data collection plan (replace assumptions)

| Input | Data source | Method | Target date | Owner | Status |
|---|---|---|---|---|---|
| A1 | Public directories, grant lists, bounty platform pages, community forums, interview referrals | Counted census with source URLs, deduplicated | Day 30 post-hackathon | Founder | NOT STARTED |
| A2, A3 | Interview scorecard | Share of qualified interviews | Day 60 | Founder | NOT STARTED |
| A4, P | Pilot and pricing experiments | Paid commitments | Day 90 | Founder | NOT STARTED |
| V1 | ROI worksheet baseline | Median across pilot-prospect orgs | Day 60 | Founder | NOT STARTED |
| s | Price discussions | Ratio of stated budget to volume | Day 90 | Founder | NOT STARTED |

## 6. Rules for using this model

- Do not copy any output into pitch material as "market size", "TAM", "SAM" or "opportunity".
- Any use of a number must include its label (ASSUMPTION) and link to this file.
- When a number is replaced with data, record the source URL/date or interview IDs and change its status to MEASURED, with the sample size.

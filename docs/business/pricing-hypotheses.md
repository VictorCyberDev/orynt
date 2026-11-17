# Pricing hypotheses

Status: DRAFT v0.1, 2026-11-09. **No price in this file is a quote, a decision or a fact.** Every figure is a labelled ASSUMPTION or a HYPOTHESIS TEST CELL to be confirmed or killed by evidence. No customer has been asked about price. Nothing may be shown as "pricing" on a public page until counsel has reviewed it and an entity exists to bill from.

## 1. Model hypothesis (H-PRICE-1)

| Tier | Who | What is included (design intent; **not built unless EXECUTION-REGISTER says VERIFIED**) | Pricing hypothesis |
|---|---|---|---|
| Developer Core | Developers, open-source projects, evaluators | Self-hosted API, SDK, CLI, offline receipt verifier, simulator + regtest | Free. Licence not yet decided; the choice affects eligibility for some grants (see GTM file) |
| Team Cloud | Small orgs that want hosted operation without running Postgres, backups, upgrades | Hosted workspaces, policy configuration, longer evidence retention, managed upgrades, support | Paid, flat per workspace or per approver seat (to test) |
| Paid pilot / concierge setup | First 3-5 organisations | Hands-on onboarding, workflow mapping, integration help, measured outcomes | One-off fee, to test whether any money changes hands |
| Enterprise | Not offered | SSO, SLAs, audit certifications | **Not offered.** None of these exist or are planned in the validation window |

Guardrails:
- The offline verifier and receipt format stay free forever (trust principle: anyone can check proof independent of Orynt).
- Do **not** price as a percentage of payout volume or per-payment fee until counsel has addressed whether that moves Orynt toward a money-transmission or payment-service characterisation (see [`legal-regulatory-register.md`](legal-regulatory-register.md)). Prefer flat or seat-based pricing.
- No dark-pattern urgency, no hidden fees, no auto-renew in pilots.

## 2. Cost-to-serve model (transparent; all inputs ASSUMPTION)

Inputs are placeholders chosen to show structure, not estimates from vendor quotes. Replace each with real invoices and time logs during the first pilot.

| Ref | Input | Low | Base | High | Unit | Rationale | How to falsify |
|---|---|---|---|---|---|---|---|
| H | Hosting, managed Postgres, monitoring, backups, per Team workspace | 15 | 40 | 120 | USD/month | Small managed database plus one app container; shared infra amortised | Actual cloud bill over first 8 weeks divided by active workspaces |
| S | Founder support time per Team customer | 1 | 3 | 8 | hours/month | Money-moving software generates anxious questions; early customers consume more | Time log per customer in pilots |
| R | Value of founder hour (opportunity cost) | 30 | 60 | 100 | USD/hour | Not a salary claim; a notional cost so margin is not overstated | Founder's own alternative income / chosen internal rate |
| O | One-off onboarding hours per new team | 4 | 10 | 24 | hours | Wallet connection, policy setup, rehearsal on regtest | Time log |
| B | Billing and payment fees | 3 | 4 | 5 | % of revenue | Typical card/invoicing processor range; if paid in BTC differs | Actual processor statement |
| X | Fixed costs not allocated here: independent security review, insurance, counsel, domain/trademark clearance | n/a | n/a | n/a | USD | **No quote obtained.** Must be priced before any pricing is public | Obtain written quotes |

Formulas:

```
Monthly cost to serve (CTS)  = H + S * R + (O * R) / 12            (onboarding amortised over 12 months)
Break-even monthly price     = CTS / (1 - B)
Contribution at price P      = P * (1 - B) - CTS
```

Illustrative outputs (arithmetic on the assumptions above, not forecasts):

| Case | CTS (USD/month) | Break-even price (USD/month) |
|---|---|---|
| Low inputs | 15 + 1*30 + (4*30)/12 = 55 | 55 / 0.97 = about 57 |
| Base inputs | 40 + 3*60 + (10*60)/12 = 270 | 270 / 0.96 = about 281 |
| High inputs | 120 + 8*100 + (24*100)/12 = 1,120 | 1,120 / 0.95 = about 1,179 |

Reading: on base assumptions with founder time valued at 60/hour, a low-priced hosted tier does not cover its cost to serve. A flat price of the order of a few dozen dollars per month is only profitable if support is minimal (low case). The cost structure pushes toward fewer, higher-touch customers or toward heavy self-service documentation. This is a finding about the model, not about customers.

Support-cost drivers to watch: lost-response incidents (UNKNOWN/RECONCILING cases need explanation), wallet-permission setup, key-rotation help, and questions about receipts. Track tickets per payout.

## 3. Price test cells (HYPOTHESIS, never quotes)

These exist only to structure willingness-to-pay conversations. Show a cell to a prospect only as "if this were priced around X, what would you do?" after they have articulated their own cost of the problem (worksheet Part A in [`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md)).

| Cell | Value metric | Test range (USD) | Why test it |
|---|---|---|---|
| P1 | Flat per workspace per month | 50-150 | Does a low flat fee signal "tool" and unlock small teams? |
| P2 | Flat per workspace per month | 300-800 | Does it match base cost-to-serve and value of avoided incidents? |
| P3 | Per approver seat per month | 20-60 | Aligns with maker-checker usage; penalises larger approval groups |
| P4 | Paid concierge pilot, one-off | 500-3,000 | Filters for real intent and funds the onboarding effort |
| P5 | Annual prepay with exit refund | to define | Tests commitment without lock-in |

Rationale for ranges: they bracket the cost-to-serve table (low to high) and informal reasoning that small Bitcoin-native teams have small tool budgets. They are guesses. Discard any range if interviews show different anchors (record what people say they currently pay for comparable tools).

## 4. Willingness-to-pay experiments

Run in this order; each is cheaper and weaker than the next. Pre-register the threshold; record outcomes in the go/no-go log.

| # | Experiment | Design | Honest-framing requirement | Success threshold (proposed, ratify before running) | Weakness |
|---|---|---|---|---|---|
| E1 | Interview price-anchoring | In interviews, after Set F, ask what they currently spend/built; only then show P1-P3 and ask for reaction and the last comparable purchase | No pitch before pain is described | At least 5 of 20 qualified interviews name a budget line or purchase comparable in size to P1-P3 | Stated, not behavioural |
| E2 | Smoke-test CTA ("Request a pilot") | Landing page CTA with short form (org, role, payouts per month) and clear text that the product is early, regtest-first, and no payment is taken; measurement in [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md) | No fake "buy now". No fake scarcity. State product status truthfully | At least 10 qualified requests (meets ICP screener) from at least 5 organisations in 6 weeks with no paid ads | Traffic quality unknown; small n |
| E3 | Pricing-page A/B ("See hypothesised plans") | Show Core vs Team range as "planned, not yet available" with a "Tell us what you would pay" free-text field | Label plans as hypotheses | Free-text answers cluster inside or above test ranges for at least 5 respondents | Weak signal; do not interpret as demand |
| E4 | Concierge pilot, unpaid | Run workflow on regtest/simulator with their real process map | Pilot contract (counsel-reviewed) | At least 3 organisations complete pilot with measured baseline vs pilot | Unpaid pilots can be polite |
| E5 | Concierge pilot, paid (P4) | Charge a modest fixed fee for setup and measurement | Needs entity, counsel, invoicing | At least 2 organisations pay P4 | Money is hard to take legally/practically early on |
| E6 | Letter of intent with price range | Non-binding LOI that states conditions (security review, regtest results) | Plain language, no pressure | At least 3 LOIs from organisations independent of the founder | Non-binding |
| E7 | Pre-pay or deposit | Offer refundable deposit for Team Cloud founding slot | Only if entity, counsel and a working hosted product exist | Any independent deposits | Probably premature during validation window |

Interpretation ladder (weakest to strongest): stated interest < pilot request < data shared < time spent in joint session < written commitment < money paid < money paid again.

## 5. What would make us change the model

| Observation | Model change to consider |
|---|---|
| Buyers say the free core is enough and cloud adds little | Drop paid cloud; consider services/support contracts or open-source-only with sponsorship (OpenSats-style grants; see GTM file), or stop |
| Buyers value evidence/receipts and audit trails more than operations | Price on evidence/retention features; consider accountant-facing tier |
| Willingness to pay appears only in segments with heavy regulatory load | Pause pricing there until counsel advice; revisit segment choice ([`thesis-and-falsification.md`](thesis-and-falsification.md)) |
| Support hours per customer exceed 8/month | Raise price, narrow customers, or write better docs before onboarding more |
| Wallet/node vendors bundle similar features free | Compete on integration and cross-wallet neutrality, or stop |
| Prospects pay only if hosted in a specific jurisdiction | Reassess feasibility; log in risk register |
| Pilots pay but do not renew | Value is one-off (setup, audit), not recurring; move to project pricing |
| Buyers prefer per-payout pricing | Do not adopt until counsel clears; explore flat-with-volume-bands |

## 6. Open items

- [ ] Replace every ASSUMPTION with measured values after first pilot (hosting invoices, support time log).
- [ ] Obtain quotes for fixed costs (security review, insurance, counsel) before publishing any price.
- [ ] Decide core licence and test its effect on grant eligibility and on conversion.
- [ ] Confirm billing entity and tax treatment with counsel/accountant (not started).

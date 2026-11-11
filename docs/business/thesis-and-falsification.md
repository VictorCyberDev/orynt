# Thesis and falsification

Status: DRAFT v0.1, 2026-11-09. Author: strategy workstream. Nothing in this file is validated.
Product facts come only from [`../product/PRODUCT-BRIEF.md`](../product/PRODUCT-BRIEF.md). Capability status comes only from [`../EXECUTION-REGISTER.md`](../EXECUTION-REGISTER.md) (as of today: M0 in progress, nothing VERIFIED).
Competitor facts live in `docs/research/competitor-matrix.md` (written by a sibling researcher); this file does not duplicate them and refers to them by path.

## 1. Core thesis (one sentence, falsifiable)

> A small but real set of Bitcoin-native organisations repeatedly pay many people over Lightning, currently do it with spreadsheet + chat + wallet UI + screenshots, have experienced (or fear) a double payment or an unresolvable "did it go through?" payment, and would change their workflow, and eventually pay, for an authorization-to-settlement layer that sits in front of a wallet they already control.

This is a hypothesis. We do not claim product-market fit, demand, or willingness to pay.

### What would have to be true (assumption ledger)

| ID | Assumption | Why we believe it might be true (reasoning, not evidence) | Falsification test | Evidence threshold to keep going | Kill / pivot trigger |
|---|---|---|---|---|---|
| T1 | Target orgs make recurring payouts (at least monthly, at least 10 distinct payees per cycle) | Grants, bounties, contributor stipends and supplier payments are recurring by nature | Screener in [`interview-guide.md`](interview-guide.md): count of qualified orgs among those reached | At least 12 of the first 24 completed interviews pass the screener on recurrence and payee count | Fewer than 6 of 24 pass: the ICP is too thin, re-pick segment (see section 4) |
| T2 | The current process is a painful mix of spreadsheet, chat approval, wallet UI and screenshots | Brief problem statement; plausible but only founder-reasoned | Observation task 1 in the interview guide: ask them to walk through the last payout cycle on screen | At least 10 interviewees show a process with approval and evidence in different places | Most show an integrated internal tool already in use: thesis weakens |
| T3 | Double payments or "unknown outcome" payments occur, or are feared enough to change behaviour | The UNKNOWN/RECONCILING design exists because lost wallet responses are a known failure shape | Ask for the last incident (Q-set C). Count real incidents, not hypothetical ones | At least 6 of 24 describe a real incident (duplicate, lost response, unreconcilable payment) in the past 12 months | Zero or one incident across 24 and no fear-driven workarounds: pain is not acute enough |
| T4 | Buyer and operator care about approval + evidence, not just execution | Maker-checker and receipts are the differentiated design | Rank-order exercise (interview Q20): do they rank approvals/evidence above speed/fees? | Majority rank approval or evidence in their top 2 | Majority rank cost/speed first and treat approvals as overhead |
| T5 | They will connect a wallet they control to a third-party layer (or self-host) | Non-custodial positioning is the design intent | Q on trust boundary + the pilot ask (pilot contract template) | At least 5 agree in principle to a pilot with a limited-permission wallet credential on regtest/testnet or a capped mainnet wallet with written consent | Fewer than 2 agree: trust barrier is the real product problem |
| T6 | Someone will pay, and the free core does not satisfy them | Cloud/team features (policy, multi-approver, reconciliation, retention) are costly to self-run | Willingness-to-pay experiments in [`pricing-hypotheses.md`](pricing-hypotheses.md) | At least 3 organisations give a written, specific commitment (paid pilot, signed non-binding LOI naming an amount range, or paid concierge) | No paid commitment by day 90 post-hackathon: stop or become a pure open-source project |
| T7 | Orynt can be reached cheaply (communities, wallet teams, grant bodies) | Bitcoin builder communities are concentrated and online | GTM channel tests in [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md) | At least 24 qualified conversations obtainable in 6 weeks at no paid acquisition | Under 10 qualified conversations from all channels: distribution problem |
| T8 | Non-custodial positioning is sustainable legally and operationally | Orynt does not hold keys or funds by design | Counsel review of the register in [`legal-regulatory-register.md`](legal-regulatory-register.md) | Counsel opinion (not yet requested) does not require licensing for the intended architecture in at least the first launch jurisdictions | Counsel indicates licensing would be required: stop, restructure as self-host-only tooling, or exit |
| T9 | A solo founder can deliver a trustworthy enough product for money-moving workflows | Scope is deliberately narrow | Security due diligence in [`security-due-diligence.md`](security-due-diligence.md); first external code review | At least one independent review of the signing, reservation and reconciliation paths before any mainnet use | Reviewer finds a funds-loss class bug that cannot be fixed within the pilot window |

## 2. How to read evidence (rules to avoid self-deception)

1. An interview "yes, that would be useful" is not evidence of demand. Only behaviour counts: time spent, data shared, a pilot scheduled, a payment, a written commitment.
2. Count only evidence obtained from people outside the founder's immediate circle, with no relationship to the founder, for the thresholds above. Friends and hackathon judges are listed separately and do not count toward kill/keep thresholds.
3. Pre-register thresholds (this file) before reading results. Changing a threshold after seeing data requires writing the date and reason in [`go-no-go-framework.md`](go-no-go-framework.md) change log.
4. A hackathon award, GitHub stars, or social media engagement is not validation (see go-no-go framework).

## 3. Kill criteria (company level)

Stop or materially pivot if, at the day-90 review after hackathon submission, any of the following holds (full detail in [`go-no-go-framework.md`](go-no-go-framework.md)):

- [ ] Fewer than 12 qualified interviews completed (cannot decide: extend once by 30 days, otherwise stop).
- [ ] Fewer than 6 interviewees report a real payout incident (T3 fails).
- [ ] Zero organisations complete a pilot on real workflow data (regtest/testnet or consented small mainnet).
- [ ] Zero written paid commitments (T6 fails).
- [ ] Counsel indicates the intended architecture requires a licence in all first-target jurisdictions and the founder cannot or will not pursue it (T8 fails).
- [ ] Independent review finds unfixable funds-safety defects (T9 fails).

## 4. Alternative-market assessment

The initial segment is "organisations that run repeated Lightning payouts with approvals". The scoring below tests whether another segment is a better first wedge. **All scores are the strategist's pre-evidence judgement, 1 (worst) to 5 (best) for Orynt, not measurements.** Differences under about 10 percentage points are noise. The ranking is a prompt for interviews, not a finding. "Whitespace" depends on `docs/research/competitor-matrix.md` and must be re-scored once that exists.

Weights (sum 100): pain severity 20, payout recurrence 15, buyer budget plausibility 15, reachability 15, regulatory lightness 15 (5 = lightest), fit with non-custodial "in front of a wallet" design 10, competitive whitespace 10.

| Segment | Pain | Recur. | Budget | Reach | Reg. light | NC fit | White-space | Weighted % | Candid notes |
|---|---|---|---|---|---|---|---|---|---|
| Grant programs / foundations paying recipients in sats | 4 | 3 | 3 | 4 | 3 | 5 | 3 | 71 | Approvals and evidence matter to funders; payouts are few per cycle but high-accountability. Budget holders exist but are small teams. |
| Bitcoin/Lightning wallet and app teams with payout features (integration users) | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 68 | Could be distribution partner and customer; risk is they build in-house. |
| Bounty / creator / affiliate platforms paying out in sats | 4 | 5 | 3 | 3 | 2 | 3 | 2 | 65 | High payout counts, higher chance they are in a regulated money-movement posture themselves. |
| Open-source contributor payouts | 3 | 3 | 1 | 5 | 3 | 5 | 3 | 64 | Easy to reach, very low budget. Likely a free-core adopter and distribution channel, not a revenue segment. |
| African remittance-adjacent payroll | 4 | 5 | 3 | 3 | 1 | 2 | 2 | 60 | Strong recurring need, but the closer to money transmission/payroll for individuals, the heavier the licensing and consumer-protection load and the weaker the non-custodial story. High counsel dependency. |
| Merchant refunds / supplier payments | 3 | 4 | 4 | 2 | 2 | 3 | 2 | 58 | Real budgets, but buyers sit in ERP/accounting stacks and procure slowly; hard to reach as a solo founder. |
| DAO-like treasuries | 4 | 3 | 3 | 3 | 2 | 2 | 1 | 55 | Strong multisig/treasury tooling culture, mostly non-Bitcoin; crowded with a different security model. |
| Exchanges' mass payouts | 3 | 5 | 5 | 1 | 1 | 1 | 1 | 52 | Large volume and budget, but custodial, internally built, heavily regulated, unreachable for a pre-product solo founder. Not a wedge. |

### Candid reading

- The scoring is intentionally unflattering to exchanges, DAOs and remittance payroll: they have the biggest pain/volume stories but the lowest reachability or the heaviest regulatory load.
- The two highest-scoring segments (grant programs, wallet teams) are also the ones most likely to have small budgets or the ability to self-build. The commercial risk is that the best-fit segments are the worst payers. Interviews must test this directly.
- Open-source contributor payouts are likely the best **distribution** segment and the worst **revenue** segment. Treat as a funnel for the free developer core, not as the ICP.
- African remittance-adjacent payroll should not be a first market until counsel has answered the register items for Nigeria, Senegal/UEMOA, Kenya and South Africa; the pull is real as a hypothesis but the regulatory exposure is highest there.

### Segment-switch rule

If after 12 qualified interviews the first-ranked segment shows a lower pain score (rubric in interview guide) than any other segment by at least 0.5 points on average, switch the interview quota towards that segment for the remaining interviews and record the change.

## 5. Competitive-moat skepticism

Honest starting position: today there is no moat. The reasons and what could become one:

| Claimed advantage | Skeptical view | What would make it real | Test |
|---|---|---|---|
| Truthful UNKNOWN/RECONCILING state machine | Any wallet or payout tool can copy a state machine; it is an idea, and some implementers may already do it | Deep, boring correctness: tested adapters for multiple Lightning backends, years of edge-case handling | Count real incident classes handled that competitors/in-house tools miss (needs competitor-matrix.md and pilot data) |
| Preimage-based receipts + offline verifier | The cryptography is public (sha256 preimage = proof of payment). The verifier is easy to re-implement | A receipt format that auditors, accountants or counterparties adopt; network effects of verification | Do any auditors/accountants ask for it unprompted? |
| Maker-checker with device-held Ed25519 signatures | Enterprise treasury tools do approvals; Bitcoin-native multisig covers some of the same ground | Integration with the way Bitcoin-native orgs actually approve (chat, mobile, hardware keys) | Observation tasks: do approvers accept a device-signing step? |
| Non-custodial | Reduces regulatory exposure (hypothesis) but also reduces the ability to prevent loss; it is also the default for open-source self-host alternatives | Not a moat; it is a constraint | Counsel review (T8) |
| First mover in a niche | A niche this small may not attract competitors, which is evidence the market is small | Developer ecosystem (SDK, adapters, integrations) | Integrations adopted by third parties |
| Open-source core | Lets anyone fork; commoditises the core | Trust and community, plus cloud/hosting convenience as the paid layer | Whether free-core users convert (pricing-hypotheses.md) |

Threats to rate explicitly: (a) wallet/node vendors adding payout approvals natively; (b) payout/invoicing platforms adding Lightning rails; (c) in-house scripts being "good enough"; (d) a larger company giving the same functionality away. Each is a plausible reason for a no-go at day 90. Detailed competitor facts: `docs/research/competitor-matrix.md`.

## 6. Open questions this file cannot answer

- How many qualifying organisations exist (see [`market-model.md`](market-model.md), all inputs assumptions).
- Whether buyers are individuals with discretionary budgets or committees (see [`icp-and-segments.md`](icp-and-segments.md)).
- Whether the product, as built to date, meets any of the thresholds above (EXECUTION-REGISTER lists nothing VERIFIED).

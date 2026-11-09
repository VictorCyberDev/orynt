# ROI worksheet and pilot contract template

Status: DRAFT v0.1, 2026-11-09. Both parts are **templates**. The worksheet is blank on purpose. The pilot contract has **not been reviewed by counsel** and must not be sent to anyone before it is.

---

## Part A. Pain / alternative / ROI worksheet (blank)

Use with one organisation at a time, with the organisation's own numbers, in a joint session. Do not pre-fill. Do not present outputs as Orynt's claimed savings; they are the organisation's own estimate, and the worksheet is also a test of whether the problem is large enough to justify any payment.

### A1. Baseline (their numbers, last 3 months)

| Ref | Item | Unit | Value | Source / confidence (H/M/L) |
|---|---|---|---|---|
| a | Payout cycles per month | count | | |
| b | Payouts per cycle (average) | count | | |
| c | Average payout amount | currency or sats | | |
| d | Operator time per cycle (collect, request approval, execute, reconcile, evidence) | hours | | |
| e | Approver time per cycle | hours | | |
| f | Loaded hourly cost of operator | currency/hour | | |
| g | Loaded hourly cost of approver | currency/hour | | |
| h | Exceptions per month (lost response, "did it arrive?", payee query, wrong invoice) | count | | |
| i | Average time to resolve one exception | hours | | |
| j | Duplicate or erroneous payments in last 12 months | count | | |
| k | Average value lost or unrecovered per such event | currency | | |
| l | Time to assemble evidence for one external request (audit, funder, accountant) | hours | | |
| m | External evidence requests per year | count | | |
| n | Current tooling cost (software, subscriptions, custom script upkeep) | currency/month | | |

### A2. Current cost formulas

```
Monthly process labour     = a * (d * f + e * g)
Monthly exception labour   = h * i * f
Monthly evidence labour    = (m / 12) * l * f
Annualised loss events     = j * k                  (use last-12-month actuals; do not extrapolate from one event)
Annual current cost (C0)   = 12 * (Monthly process labour + Monthly exception labour + Monthly evidence labour + n) + Annualised loss events
```

### A3. Alternative options considered (they list; do not steer)

| Option | One-off cost | Annual cost | Time to implement | Residual risk | Why chosen / not chosen |
|---|---|---|---|---|---|
| Status quo | | | | | |
| In-house script / internal tool | | | | | |
| Wallet or node features alone | | | | | |
| Another third-party tool (see `docs/research/competitor-matrix.md` for candidates) | | | | | |
| Orynt (hypothesis) | | | | | |

### A4. Orynt scenario (their estimate, to be tested in pilot)

| Ref | Item | Their estimate | Pilot-measured |
|---|---|---|---|
| p | Fraction of process labour removed (0-1) | | |
| q | Fraction of exception labour removed (0-1) | | |
| r | Fraction of evidence labour removed (0-1) | | |
| s | Loss events avoided per year | | |
| t | New cost: subscription (hypothesis only; see [`pricing-hypotheses.md`](pricing-hypotheses.md)) | | |
| u | New cost: onboarding / integration / training hours * loaded rate | | |
| v | New cost: additional controls overhead (extra approver steps) | | |

```
Annual benefit (B)  = 12 * (p * Monthly process labour + q * Monthly exception labour) + r * (m * l * f) + s * k
Annual cost (K)     = t + v + (u / expected years of use)
Net annual value    = B - K
Payback (months)    = u / ((B - K) / 12)           (if B <= K: no payback)
Break-even price    = B - v - (u / years)          (the most they could pay and still break even; a ceiling, not a price)
Risk-adjusted B     = B * probability benefit materialises (state and justify the probability)
```

### A5. Decision readout

| Question | Answer |
|---|---|
| Is C0 large enough that a rational buyer would act? (They say, not us) | |
| Is break-even price above our cost-to-serve ([`pricing-hypotheses.md`](pricing-hypotheses.md))? | |
| Biggest assumption in their estimate | |
| What measurement in the pilot would change their mind? | |
| Decision-maker and timeline | |

Interpretation rule: if net annual value is under about twice what they would plausibly pay, or most value comes from avoided loss events with n = 0 or 1 in history, record "weak ROI" and do not push a paid conversion.

---

## Part B. Pilot experiment contract (TEMPLATE, NOT REVIEWED BY COUNSEL)

> **WARNING:** This is a working template to structure a conversation. It is not legal advice, has not been reviewed by a lawyer, and must not be signed or sent until counsel has reviewed it for each relevant jurisdiction. It deliberately avoids guarantees, indemnities and warranties that the founder cannot currently back. Product status per [`../EXECUTION-REGISTER.md`](../EXECUTION-REGISTER.md): nothing verified as of 2026-11-09.

**Parties:** [Pilot Organisation legal name, address] ("Pilot Participant") and [Orynt legal entity / founder, TBD; no entity exists yet unless confirmed] ("Orynt"). Name "Orynt" is provisional with no trademark or domain clearance.

**1. Purpose.** A time-boxed experiment to test whether Orynt's payout authorization workflow reduces the Pilot Participant's manual effort and payout exceptions. It is an evaluation, not a commercial service. No fitness-for-purpose assurance is given.

**2. Pilot scope.**

| Item | Setting |
|---|---|
| Duration | [e.g. 4 weeks; start date / end date] |
| Environment | [Regtest only / testnet / mainnet with cap, choose one; default regtest] |
| Wallet adapter | [Simulator / LND REST on regtest / other]. Mainnet adapter is not enabled by default. |
| Payout volume cap (if mainnet) | [max per payout; max per day; max total in sats], set by Pilot Participant |
| Users | [named approvers and operators, roles] |
| Data in scope | [payee identifiers, amounts, invoices, approval metadata] |
| Out of scope | Custody of funds, conversion, escrow, lending, trading, KYC of payees, autonomous AI spending |

**3. No real funds without explicit written consent.**
- The default is regtest or simulator. No payment from the Pilot Participant's real wallet will be attempted unless the Pilot Participant has given written consent naming the wallet, the permission set granted, the caps in section 2, and the start window.
- The Pilot Participant keeps control of its wallet keys. Orynt will never request seed phrases or private keys. Orynt will request only the least-privilege credential needed (for example a restricted macaroon for specific actions), documented in writing.
- The Pilot Participant may revoke wallet credentials at any time; Orynt will stop attempting payments immediately upon notice.
- Both parties acknowledge: approval and limit enforcement are application-level; funds protection is only as strong as the wallet permissions granted. Orynt's audit log is tamper-evident, not immutable.
- Each real-funds payout in the pilot requires per-payout human approval by the Pilot Participant's designated approver.

**4. Success metrics (agree before start; record baseline).**

| Metric | Definition | Baseline (their data) | Target (to be agreed, not promised) | Measured how |
|---|---|---|---|---|
| Time per payout cycle | Operator + approver minutes | | | Self-report + timestamps |
| Exceptions | Count of lost-response/unclear-outcome events | | | Orynt states: UNKNOWN/RECONCILING events and time to resolution |
| Duplicate payouts blocked | Attempts refused by the execution guard | | | Orynt log |
| First fully reconciled payout | Time from start to first payout with provider-sourced result and receipt | | | Orynt log |
| Evidence handling | Time to produce proof for one external request | | | Task timing |
| User assessment | Would they continue? Why? (open question) | | | Exit interview |
| Net value | Worksheet A4 pilot-measured column | | | Joint review |

Success is whatever the parties agree here. A failed pilot is a valid result and will be recorded honestly.

**5. Data handling.**
- Data categories: [list]. Personal data of payees should be minimised; use pseudonymous references where possible.
- Orynt acts as [processor/controller, to be determined by counsel] for personal data. Applicable data-protection law (for example Nigeria's NDPA, Kenya, South Africa, EU/UK GDPR, depending on the participant) must be confirmed by counsel.
- Storage location and subprocessors: [to be listed; none assumed].
- Retention: pilot data is deleted or returned within [30] days of pilot end on request. Audit log entries needed to verify receipts may be retained in a form the Pilot Participant chooses.
- No data is used for marketing, model training, or sold. Aggregated, non-identifying metrics (for example "number of payouts reconciled") may be used in Orynt's validation reporting only with the Pilot Participant's agreement.
- Security incidents: Orynt will notify the Pilot Participant of confirmed incidents affecting its data within [72] hours of confirming them. Security status of the product is described in [`security-due-diligence.md`](security-due-diligence.md); no audit or certification exists.

**6. Responsibilities.**
- Pilot Participant: designates approvers, keeps its own backups and payout records, remains responsible for payee obligations, tax, reporting and compliance with its own legal duties.
- Orynt: operates the pilot as described, discloses known defects affecting funds safety promptly, and does not accept liability for pre-existing processes it does not control (liability terms: counsel to draft).

**7. Confidentiality, IP and feedback.** [Counsel to draft.] Open-source licence terms of the core apply to code; the pilot grants no exclusivity.

**8. Fees.** Default: none. Any paid pilot is a separate order with the price stated as agreed by both parties; any price in Orynt's documents is a hypothesis, not a quote.

**9. Public statements.** Neither party names the other publicly (including as a customer, partner or testimonial) without separate written permission.

**10. Exit.**
- Either party may end the pilot at any time on [3] days' written notice, or immediately if funds-safety concerns arise.
- On exit: credentials revoked, data returned or deleted per section 5, final exit interview offered (not required), and a short written summary of what was measured shared with the Pilot Participant.
- No penalties, no minimum term, no auto-renewal.

**11. Governing law and disputes.** [Counsel to determine.]

**12. Signatures / acceptance.** Not valid until reviewed by counsel and signed by authorised representatives.

### Pilot readiness checklist (internal)

- [ ] Counsel has reviewed this template for the participant's jurisdiction.
- [ ] Participant has signed; wallet permission set agreed in writing.
- [ ] Baseline metrics captured on the worksheet (Part A).
- [ ] Regtest/simulator rehearsal completed with the participant's workflow.
- [ ] If mainnet: caps configured, per-payout approval enforced, rollback/stop procedure rehearsed, status in EXECUTION-REGISTER supports it as VERIFIED.
- [ ] Data-handling facts in section 5 are true (no placeholder left).

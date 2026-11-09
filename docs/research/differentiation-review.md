# Differentiation review (candid)

Date: 2026-11-09. Inputs: `docs/research/competitor-matrix.md`, `docs/research/source-register.md`, `docs/product/PRODUCT-BRIEF.md`.
Labels: **FACT** (sourced) / **INTERP** (my reading) / **HYP** (untested). Source IDs S## are in the source register.

## 0. Ground rules for this review

- The matrix is built from vendor docs pages, mostly via summarising fetches. "NOT FOUND" means not found on a handful of pages, not "absent from the product". Everything below inherits that weakness.
- Nothing in Orynt is verified built (EXECUTION-REGISTER: M0 in progress, nothing VERIFIED). Differentiation here means *designed* differentiation.
- No customer, usage or willingness-to-pay data exists in the repo (brief: "unvalidated hypotheses").

## 1. Where Orynt is potentially differentiated (only where the matrix has NF across the board)

| # | Claim | What the matrix supports | Strength | What would falsify it |
|---|---|---|---|---|
| D1 | **Human approvals are cryptographically signed over an exact intent digest by a device-held key** (matrix row 4: NF in every column) | No retrieved doc shows signed human approvals. NWC signs *app-to-wallet* requests (S12), which is a different trust relation. **INTERP:** the approval signature is the one design element with no visible analogue. | Medium (absence-of-evidence) | (a) BTCPay/Bitwave/Strike docs or plugins show signed or hardware-bound approvals; (b) a buyer interview where "who clicked approve" in an app log is judged sufficient evidence (then the signature adds cost without value). |
| D2 | **Receipts bound to approvals + agreement + preimage, verifiable offline by a standalone CLI** (rows 9-10) | Preimage proof is standard (S23, S19, S25). No retrieved vendor offers an offline verifier (row 10 NF all). The *combination* with approvals is the claimed new part. | Medium-low. The cryptography is commodity; the packaging is the claim. | (a) A competitor ships exported evidence bundles; (b) in 5+ interviews, nobody who audits payouts accepts a CLI verifier as better than a screenshot plus the payee's confirmation; (c) auditors want accounting-system export (S41 style) rather than cryptographic proof. |
| D3 | **Truthful UNKNOWN state with a refusal to resend until the provider record resolves** (row 8) | Provider primitives exist (S19, S20, S26, S13) but no retrieved product docs present reconciliation as a user-facing workflow; OpenNode docs show only confirmed/error (S36). **INTERP:** a workflow gap, not a technology gap. | Medium for the *workflow*; zero for the *primitive*. | (a) Regtest test shows LND/CLN already refuse or collapse a duplicate send for the same payment hash, making the guard redundant for the wallet-adapter case (CLN: S25 says repeat pay after success returns immediately); (b) measured frequency of lost-response events among target users is near zero. |
| D4 | **Immutable revisions that invalidate prior approvals** (row 2) | NF everywhere; BTCPay's "approve fixes amounts" (S06) suggests post-approval edits are constrained but revision history is not documented. | Low-medium. This is a conventional maker-checker control; absence from docs may mean documentation silence. | BTCPay or Bitwave trial shows approval is voided on edit. |
| D5 | **Combination in one open, self-hostable layer in front of a customer-controlled wallet** | BTCPay is the only retrieved product with approval + batch + non-custodial + self-host (S06, S09, S10). Orynt would add D1-D4 above BTCPay's gate. | Low until the single-feature gaps are proven | BTCPay plugin or core change adds multi-approver approvals (then Orynt reduces to a nicer UI). |

**FACT summary:** Rows 2, 3 (as maker-checker for Lightning payouts), 4, 8, 9 (as receipt documents) and 10 have **no CONFIRMED cell** among the surveyed Bitcoin-native vendors, except Bitwave on row 3 (S41).

## 2. Where Orynt is a feature of existing products, not a product

| Orynt element | Who already has the nearest equivalent | Source |
|---|---|---|
| Approve-then-pay, separate steps, Lightning/BOLT11 payouts, batch | BTCPay pull payments/payouts | S06, S07 |
| Idempotent execution | Strike (idempotency keys), CLN (repeat pay returns success) | S34, S25 |
| NWC connectivity and wallet-side spend limits | NWC spec and ecosystem | S12, S13, S14 |
| Multi-step approvals with accounting sync | Bitwave (enterprise) | S41 |
| Payment lookup by hash and preimage | LND, CLN, NIP-47 | S19, S20, S25, S26, S12 |
| Webhooks, REST API | Strike, OpenNode, Voltage, Lightspark | S34, S36, S38, S39 |

**INTERP:** The most plausible form of Orynt that incumbents could absorb quickly is "multi-approver + audit trail + evidence export" as a **BTCPay plugin** or a Bitwave module. D1-D4 are each a few weeks of work for an incumbent with the user base (HYP, not measured).

## 3. Strongest arguments that Orynt should NOT be built as a company

1. **Substitute is free and good enough (FACT + INTERP).** BTCPay is open source, non-custodial, self-hostable and already separates approval from payment (S06, S09). A customer who wants "approval before payout" has an answer today at zero licence cost.
2. **Willingness to pay is untested and the nearest price anchor is low (FACT + HYP).** Zaprite lists $25/month (S30, S31). Bitwave is demo-led, so enterprise accounting buyers are already served by sales-led vendors (S41). No evidence exists that Bitcoin-native small orgs pay for payout controls.
3. **The core control is app-level, not wallet-level (brief).** If Orynt's approval is bypassed (someone holds wallet credentials), funds are not protected. Wallet-native limits (NWC budgets S13, macaroons) enforce where the money is. Serious treasuries may demand the latter and treat Orynt as a ledger of intent only (INTERP).
4. **Tamper-evident log is weaker than what auditors ask for (brief + INTERP).** A DBA can rewrite rows. The product's strongest compliance story is the offline verifier, which proves *payment*, not *authorisation integrity*.
5. **The pain (lost response, double pay) may be rare (HYP).** At low payout counts, an operator can resolve ambiguity with `TrackPaymentV2` / `listpays` (S19, S26). No incident-rate data was collected.
6. **Narrow initial market (HYP).** Bitcoin-native organisations repeatedly paying many BOLT11 invoices. Payees paying with BOLT11 per payout is itself friction; many orgs use LNURL/Lightning address or on-chain (BTCPay supports on-chain, S06); Orynt's first scope is BOLT11 only (brief).
7. **Platform risk (INTERP).** Dependency on wallet APIs (LND REST, later NWC) that change; CLN has already deprecated `pay` per the docs page (S25).
8. **Regulatory exposure is unassessed.** Authorising and orchestrating payments for others may attract rules in some jurisdictions. This review makes **no legal conclusion**; get counsel before any mainnet/commercial use.
9. **Hackathon fit is a separate problem.** The Dakar page asks for local-impact, low-bandwidth UX and (overview page) "at least a bitcoin/lightning wallet implementation" (S03). Winning there is not evidence of a market. See `docs/hackathon/rules-checklist.md`.

## 4. Falsification plan (cheap tests, in order)

| # | Test | Falsifies | Cost |
|---|---|---|---|
| F1 | Regtest: duplicate `SendPaymentV2` after client crash; record node behaviour (S18 silent) | D3 (duplicate guard value) | hours |
| F2 | BTCPay trial: two users, edit-after-approve, export | D1/D4/D5 | hours |
| F3 | Read BTCPay Greenfield reference and plugin list (S11 gap) | D5 | 1-2 hours |
| F4 | Strike sandbox: idempotency + payout initiate (S33, S34) | "not novel" boundaries | hours |
| F5 | 8-10 structured interviews with Bitcoin-native orgs/DAOs/grant programmes: current payout process, last time a payment was lost or duplicated, who audits | #3, #5 above; D2 value | 2 weeks |
| F6 | Show a sample receipt + verifier output to an accountant/auditor; ask what they would accept | D2 | 1 week |
| F7 | Pricing probe: ask interviewees what they pay today for BTCPay hosting, Zaprite, accounting tools | #2 above | with F5 |

**Decision rule (HYP, owner to adjust):** if F1 shows nodes already prevent double-send and F5 yields fewer than 3 organisations reporting a real lost/duplicate/unauthorised-payment incident, treat Orynt as a BTCPay-plugin-sized feature, not a company.

## 5. Bottom line (INTERP)

Orynt is **defensible as a focused open-source tool** that adds signed multi-party approval and a verifiable evidence trail in front of existing wallets. It is **not shown to be a venture-scale company**, and the matrix cannot show it because the matrix measures documentation, not demand. The riskiest unproven assumptions are demand (#2, #5) and incumbent response (#1, D5), not technology.

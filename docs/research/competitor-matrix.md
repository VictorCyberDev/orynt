# Competitor matrix (capability level)

Retrieved 2026-11-09. Source IDs (S##) refer to `docs/research/source-register.md`. Product facts about Orynt come only from `docs/product/PRODUCT-BRIEF.md` and are **PROPOSED**, not built.

## How to read this

Cell codes (only these four are used):

- **C[S##]** = CONFIRMED by the cited retrieved source (what exactly is confirmed is in the cell).
- **NF** = NOT FOUND IN DOCS. Means only: *not found in the specific pages listed in the "NF search scope" table below*. It is **not** evidence the product lacks the feature; vendor docs I could not read, gated dashboards and changelogs may contain it.
- **U** = UNKNOWN (I had no relevant page, or the page was too thin to say).
- **P** = PROPOSED (Orynt only; designed per brief, not built).

Method caveat: most vendor rows rest on `[WF]`/`[Q]` extractions (a model summarised the page for me), not on my own read of full pages. Treat every C as "needs a human re-read of the cited page before external use".

### NF search scope (what was searched per column)

| Column | Pages searched for the NF cells |
|---|---|
| BTCPay | S06 (pull payments), S07 (payouts), S08 (reporting), S09 (users), S10 (home). **Not** read: Greenfield API reference (S11 not retrieved), payout processors (404), plugin ecosystem, store-roles page. |
| Alby Hub / NWC | S29 (Alby Hub guide), S12 (NIP-47), S13 (NWC repo), S14 (nwc.dev). |
| Zaprite | S30 (home), S31 (pricing). |
| Strike | S32 (business), S33 (docs intro), S34 (API endpoint list). |
| OpenNode | S35 (home), S36 (withdrawals docs). |
| Voltage | S37 (home), S38 (docs overview). |
| Lightspark | S39 (home), S40 (docs). |
| Bitwave | S41 (home). |
| Lightning Bounties | S15, S16 (landing, deposit page; FAQ and solving pages were link indexes). |
| Drips / Geyser | S45 (Drips home), S42 (Geyser home). |

## Matrix

| Capability | BTCPay Server (pull payments/payouts) | Alby Hub / NWC wallets | Zaprite | Strike | OpenNode | Voltage | Lightspark | Bitwave | Lightning Bounties | Drips / Geyser | Orynt (proposed) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. Obligation records (payee, amount, destination stored before payment) | C[S06]: each claim "becomes a payout" with a status (Awaiting Approval etc.) | NF | C[S30]: invoices (receivable side only); outbound NF | C[S34]: `POST payouts`, payout originators | C[S36]: withdrawal objects with status | U | C[S40]: "Send a payout" (object model U) | C[S41]: payables/receivables | C[S15,S16]: bounties and sats balance | U (Drips: funding streams, S45; Geyser: grants, S42; neither shows BOLT11 obligations) | P: obligation with integer msat + decoded BOLT11 |
| 2. Immutable revisions (edit creates revision, voids approvals) | NF (S06: approval "fixes amounts"; no revisioning mentioned) | NF | NF | NF | NF | U | NF | U | NF | NF | P |
| 3. Multi-approver / maker-checker policy | NF (S06 says "the store" approves; "multi-approver... not mentioned") | NF as maker-checker. Related but different: per-connection budgets/spend limits exist C[S13 spec 13; S12 "arbitrary constraints (eg. budgets)"] | NF | NF | NF | U ("team permissions" listed, S38; approvals not seen) | NF | C[S41]: "configurable approval flows", "Customizable payments approvals" (number of approvers U) | NF | NF | P: policy-driven N approvers, thresholds |
| 4. Signed approvals (approver signs exact intent digest with own key) | NF | NF (NWC requests are signed Nostr events, S12, but that authenticates the *app* to the wallet, not a human approver) | NF | NF | NF | NF | NF | U | NF | NF | P: device-held Ed25519 over intent digest |
| 5. Payout to BOLT11 invoice | C[S06]: Lightning payout method, "Minimum acceptable expiration time for BOLT11" | C[S12]: `pay_invoice` | NF (no payouts, S30) | C[S34]: `POST payment-quotes/lightning` | C[S36]: Lightning withdrawals | U (Payments API S38; Lightning detail not read) | U (payouts S39; Lightning not stated) | NF (Lightning not stated, S41) | C[S16]: withdraw "by providing a Lightning invoice" | NF | P (real LND adapter on regtest or labelled simulator) |
| 6. Payout batches / pull payments | C[S06]: pull payments; "multiple payouts can be selected and processed together" | NF (`multi_pay_invoice` is not in the NIP-47 core page, S12; extensions list in S13 has no batch spec) | NF | U | U | U | U | U | NF | NF | P (not in brief's first scope; HYP) |
| 7. Idempotent execution intent / duplicate-send protection | NF | NF (S12: "Idempotency: not specified") | NF | C[S34]: `Idempotency-Key` on payment-quote endpoints; "Payout has already been initiated" | NF (S36) | U | NF | U | NF | NF | P: single-use durable reservation before wallet call. **Not novel as a concept** (see CLN row below and Strike) |
| 8. Ambiguous-outcome reconciliation (UNKNOWN until provider record resolves) | NF as a product feature | NF as app feature; primitive exists: `lookup_invoice` by `payment_hash` C[S12], payment lookup spec C[S13 spec 09] | NF | NF as documented; has `GET payments/{id}` + webhooks that carry no data C[S34] | NF (statuses are confirmed/error, S36) | U | U | NF | NF | NF | P: UNKNOWN -> RECONCILING via lookup by payment hash. Node primitives already exist: LND `TrackPaymentV2`/`ListPayments` C[S19,S20], CLN `listpays` C[S26] |
| 9. Preimage-based receipts | NF | C[S12]: `pay_invoice` returns preimage (a receipt *primitive*, not a receipt document) | NF | U | NF | U | U | NF | NF | NF | P: receipt binds agreement hash, approvals, preimage. Preimage/hash proof is standard Lightning (C[S23]; LND C[S19]; CLN C[S25]) |
| 10. Independent offline verifier (CLI checks receipt without the vendor) | NF | NF | NF | NF | NF | NF | NF | NF | NF | NF | P |
| 11. Accounting export | C[S08]: CSV reports (On-Chain Wallets, Products Sold, Payments); payout-specific report NF | NF | C[S31] "Data Exports"; QuickBooks/Xero "Coming soon" C[S30] | NF | NF | NF | NF | C[S41]: ERP sync (QuickBooks, NetSuite, Sage Intacct, Xero) | NF | NF | P (format TBD; HYP: CSV first) |
| 12. Audit log | NF | NF | NF | NF | NF | U | NF | U ("Always audit-ready" is a claim; "audit trail" not stated, S41) | NF | NF | P: hash-chained, tamper-*evident* (not immutable) |
| 13. API / SDK / webhooks | C[S06]: Greenfield API covers pull payments and payouts (detail NOT RETRIEVED, S11) | C[S12] protocol; C[S29] "Developer APIs" | C[S31]: API listed (1% fee) | C[S33,S34]: API, webhooks | C[S35,S36]: API, `callback_url` webhooks | C[S38]: Payments API | C[S39]: API | U | NF | U | P: REST+OpenAPI, TS SDK, signed webhooks, CLI |
| 14. Self-hostable | C[S10]: Operators section "Deploy, configure, and maintain a BTCPay Server instance" (term "self-hosted" not used on page) | NF in S29 (wallet is "self-custodial"; hosting model not stated) | NF | NF | NF | NF (customer-controlled node option, S38) | NF | NF | NF | NF | P: operator runs it; connects own wallet |
| 15. Custody model | C[S09]: "does not hold funds as a payment intermediary" | C[S29]: "self-custodial" | C[S30]: "we never touch your money" | C[S32]: custodial-style (cold storage, backed 1:1) | NF | C[S38]: two models (customer-controlled node vs credit-backed); custody wording not defined | C[S39]: "not banks, exchanges, or asset custodians" (a disclaimer; payouts mechanics NF) | U | NF (balance shown, S16; custody not stated) | NF | P: non-custodial; operator-controlled wallet |
| 16. Fiat on/off-ramp | NF (S06: fiat-*denominated* pull payments convert at approval; not a ramp) | NF | C[S30]: accepts fiat in checkout (off-ramp NF) | C[S32]: buy BTC with USD; settle to USD | C[S35]: fiat conversion | NF | C[S39]: "ramps" | NF | NF | NF | P: out of scope (none planned in brief) |
| 17. Team roles | NF in S09 (page lists "user access" but names no roles; S07 mentions "store clerks") | NF (S29: "sub-wallets" only) | C[S31]: "Teams" feature (roles U) | NF | NF | C[S38]: "team permissions" (details NOT READ) | NF | C[S41]: approval flows imply roles (INTERP; roles U) | NF | NF | P: roles checked at approval and again at execution |

### Extra provider-level facts (not a column, but they bound the novelty claim)

| Fact | Source |
|---|---|
| CLN: "Once a payment has succeeded, calls to pay with the same bolt11 will succeed immediately." Error 201 if already paid with different amount/destination. | C[S25] |
| LND `SendPaymentV2` docs page says nothing on duplicate sends; `cancelable` note says in-flight attempts can still settle after cancellation. | C[S18] |
| LND `PaymentStatus` has IN_FLIGHT / SUCCEEDED / FAILED / INITIATED; `UNKNOWN` deprecated. | C[S19] |
| BOLT 11: preimage = proof of payment; payer may present signed invoice + successful payment in a dispute. | C[S23] |

## Not-novel list (do not claim these as differentiators)

1. Idempotent send protection: Strike documents `Idempotency-Key` (S34); CLN repeat-pay safety (S25).
2. NWC wallet connectivity and spend budgets (S12, S13, S14).
3. Payout approval step: BTCPay (S06, S07) and Bitwave (S41).
4. Basic receipt generation / preimage return: NIP-47 (S12), LND (S19), CLN (S25).
5. Lookup of payment outcome by hash: LND, CLN, NWC extension (S19, S20, S26, S13).
6. Non-custodial positioning: BTCPay (S09), Alby Hub (S29), Zaprite (S30).
7. Webhooks / API / OpenAPI-style platform: Strike, OpenNode, Voltage, Lightspark (S34, S36, S38, S39).

## Disconfirming evidence

What existing tools already cover (FACT, with sources):

- **BTCPay Server** documents a payout object with an approval gate separate from payment, Lightning payout method with a BOLT11 expiry guard, batch selection, fiat-denominated pull payments, CSV reports and an API (S06-S08). It is described as non-custodial (S09). It is the incumbent for exactly "Bitcoin-native org pays people from its own wallet".
- **Strike** documents quote-then-execute payments, idempotency keys, payouts with a separate `initiate` step, and webhooks (S34).
- **Bitwave** documents configurable multi-step payment approvals and ERP sync (S41).
- **Wallet/node layer** already offers hash-based outcome lookup and preimage proof (S12, S19, S20, S25, S26).

Reasons customers might not need Orynt (INTERP/HYP unless sourced):

1. If the customer already runs BTCPay, the approval gate and batch payouts exist; the remaining gap (multi-approver, signed approvals, offline verification) may be too small to pay for (HYP).
2. Approval/limit enforcement in Orynt is application-level (brief). A wallet with native spend limits (NWC budgets, S13; macaroon scoping for LND) enforces limits where the money is. Buyers who care about funds protection may prefer wallet-level controls (INTERP).
3. Tamper-*evident*, not immutable, audit log (brief): a DBA can rewrite rows. Auditors may want stronger guarantees than Orynt offers (INTERP).
4. The "lost response" pain may be rare at small payout volumes; manual lookup in LND/CLN (S19, S26) may be good enough (HYP; no frequency data collected).
5. Spreadsheets + chat + wallet UI may be adequate; the brief itself lists commercial viability and willingness to pay as unvalidated.
6. Lightning Bounties, bounty.ninja and similar tools bundle the obligation and payment for their niche (S15, S44).
7. The documentation behind several NF cells may simply be thinner than the products; a cell marked NF could flip to C after a human trial of the product (HYP; mitigation: sign up for BTCPay on regtest/testnet and Strike sandbox S33 and test items 2, 7, 8 empirically).

## Suggested empirical checks (cheap, would convert U/NF to evidence)

1. Install BTCPay (regtest) and test: can two different users approve one payout? Does editing a payout amount after approval void it?
2. On regtest LND, kill the client mid-`SendPaymentV2` and call it again with the same invoice; record what happens (S18 is silent).
3. Strike sandbox: create a payout, reuse the idempotency key, repeat after a simulated timeout.
4. Read the Greenfield API reference (S11 gap) for payout approval endpoints and webhook events.

# Competitor re-verification, November 2026

Retrieved 2026-11-10 (all URLs below were read on that date unless a row says otherwise). This re-checks the claims in `competitor-matrix.md` and `differentiation-review.md` (both dated 2026-11-09) against **vendors' own current documentation**. Labels: **CONFIRMED** (stated in the cited doc), **PARTIAL** (a primitive or an adjacent feature, not the full capability), **NOT FOUND** (I searched the places listed and saw nothing; this is *not* proof the product lacks it, since dashboards, plugins, changelogs and gated pages were mostly out of reach), **INFERENCE** (my reading).

Orynt's own state, from `docs/product/product-spec.md`: approvals, `UNKNOWN` handling, receipts, verifier and a BOLT11 payout path are built; **NWC, BTCPay, BOLT12/LNURL, batch payouts, fiat references, email notifications, SSO/MFA and multi-instance deployment are not implemented**. That matters below: several competitors lead on batch and automation.

## 1. Summary (one line per vendor)

| Vendor | Approval workflow | Batch / CSV | Recurring | Uncertain-payment reconciliation | Receipts / evidence | API | Self-host | Custody model |
|---|---|---|---|---|---|---|---|---|
| BTCPay Server | CONFIRMED (single gate, revision-bound, permission-scoped; multi-approver NOT FOUND) | Batch in UI CONFIRMED; payout CSV NOT FOUND | PARTIAL (interval payout processors; recurring pull payments not in request schema) | NOT FOUND | PARTIAL (free-form `paymentProof`, webhooks) | CONFIRMED | CONFIRMED (MIT) | Non-custodial CONFIRMED |
| Alby Hub / NWC | NOT FOUND (per-app budgets only) | CSV wallet export CONFIRMED; batch NOT FOUND | PARTIAL (third-party ZapPlanner) | PARTIAL (`lookup_invoice` primitive) | PARTIAL (preimage returned) | CONFIRMED (protocol + APIs) | CONFIRMED (open source) | Self-custodial CONFIRMED |
| Zaprite | NOT FOUND | CSV transaction export CONFIRMED (receipts side); payouts NOT FOUND | Recurring *invoices* exist (receivables) | NOT FOUND | NOT FOUND | CONFIRMED (exists) | NOT FOUND | "never touch your money" CONFIRMED |
| Strike | NOT FOUND | NOT FOUND | NOT FOUND | PARTIAL (payment state, events endpoint) | PARTIAL (`preImage` field) | CONFIRMED | No | Account balances (custodial in effect, INFERENCE) |
| OpenNode | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | CONFIRMED | No | NOT FOUND |
| Voltage | NOT FOUND (customer-defined; wallet policies exist) | NOT FOUND | NOT FOUND | CONFIRMED as guidance | PARTIAL (receipts array with preimage) | CONFIRMED | Hosted; node-backed option | Two models CONFIRMED |
| Lightspark Grid | PARTIAL (agent-action approvals, limited availability; SCA) | NOT FOUND | NOT FOUND | CONFIRMED as guidance (general, not Lightning-specific) | PARTIAL (regulatory customer receipts) | CONFIRMED | No | Internal accounts hold funds; Global Accounts self-custodial |
| Bitwave | PARTIAL (batch needs signer approval; marketing mentions approval flows) | Payment batches CONFIRMED (on-chain, no Lightning found) | NOT FOUND | NOT FOUND | NOT FOUND | CONFIRMED (invoices, customers, accounts) | No | Customer wallets (self- or custodial) |
| Geyser | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Lightning Bounties | PARTIAL (maintainer merge/confirmation) | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | Platform balances (INFERENCE) |

## 2. Per-vendor detail

### 2.1 BTCPay Server (pull payments, payouts, approvals, Greenfield API)

Sources read: Greenfield OpenAPI https://docs.btcpayserver.org/API/Greenfield/v1/swagger.json (564 KB, parsed in full; the HTML page https://docs.btcpayserver.org/API/Greenfield/v1/ shows only a title to a fetcher, which is why the earlier matrix had a gap); https://docs.btcpayserver.org/Payouts/ ; https://docs.btcpayserver.org/Users/pull-payments/ ; https://docs.btcpayserver.org/Users/ ; https://docs.btcpayserver.org/Reporting/ ; https://btcpayserver.org/ ; license file https://raw.githubusercontent.com/btcpayserver/btcpayserver/master/LICENSE. (https://docs.btcpayserver.org/Payouts/PayoutProcessors/ returned HTTP 404; the processors are nevertheless in the API spec.)

- **Approval workflow, CONFIRMED.** States `AwaitingApproval`, `AwaitingPayment`, `InProgress`, `Completed`, `Cancelled` (`PayoutState` schema). "Approve Payout" is `POST /api/v1/payouts/{payoutId}`; cancel is `DELETE` on the same path. Docs: "Approval and payment are separate steps. Automatic approval does not automatically send funds." (pull-payments page). UI actions: "Approve selected payouts", "Approve & send selected payouts", "Cancel selected payouts" (Payouts page).
- **Revision-bound approval, PARTIAL-to-CONFIRMED, and important.** The `PayoutData` schema says `revision` "is incremented when the payout amount or destination is modified before the approval", and the approve request body takes a `revision` integer ("The revision number of the payout being modified"). So BTCPay already binds approval to a numbered version of the payout. What the spec does **not** say: that approving a stale revision is rejected, or that any signature covers the terms. This directly touches Orynt's claim D4.
- **Permission scoping, CONFIRMED.** API-key permissions listed in the spec include `btcpay.store.canviewpayouts`, `canmanagepayouts`, `canmanagepullpayments`, `cancreatepullpayments` and `cancreatenonapprovedpullpayments`. Approve and mark endpoints require `canmanagepullpayments`. So "may create but not approve" is expressible for API keys.
- **Multi-approver / threshold / signed approval, NOT FOUND.** Searched the payout and pull-payment paths of the OpenAPI spec for approver, multi, sign, audit (zero hits) and read the Payouts and pull-payments pages (approver is "the store"; no second approver described).
- **Batch, PARTIAL.** UI: "you can batch these to be signed and sent out" (Payouts page); "Multiple payouts can be selected and processed together" (pull-payments page). Batch or bulk API endpoint: NOT FOUND (zero hits for batch/bulk). Payout CSV: NOT FOUND. Store reports exist via `GET/POST /api/v1/stores/{storeId}/reports` and the Reporting page says it will "visualize and export CSV data of your store"; whether a payout report exists is not stated in what I read.
- **Recurring / automation, PARTIAL.** Lightning and on-chain **automated payout processors** exist in the API (`.../payout-processors/LightningAutomatedPayoutSenderFactory/{payoutMethodId}`), with settings `intervalSeconds`, `cancelPayoutAfterFailures` and `processNewPayoutsInstantly`. The description of "Create a new pull payment" says a pull payment lets a receiver "ask for payouts up to `amount` of `currency` every `period`", but the create-request schema lists only name, description, amount, currency, `BOLT11Expiration`, `autoApproveClaims`, `startsAt`, `expiresAt`, `payoutMethods`, with no `period` field. Recurring obligations are therefore not confirmed from the spec. The earlier register note S07 that processors were "not stated" is superseded: they exist.
- **Create-time guards, PARTIAL.** Create-payout errors include `duplicate-destination`, `expired`, `not-started`, `archived`, `overdraft`, `amount-too-low`, `payment-method-not-supported`. No idempotency key (zero hits). `BOLT11Expiration` rejects BOLT11 invoices that expire too soon.
- **Reconciliation of uncertain payments, NOT FOUND.** Zero hits for unknown, uncertain, reconcile, in-flight. There is an `InProgress` state and an operator endpoint `POST /api/v1/payouts/{payoutId}/mark` ("Completed and cancelled payouts are final and cannot transition"). The processor setting `cancelPayoutAfterFailures` shows automatic cancel after failures; how an ambiguous Lightning result is treated is not documented in what I read.
- **Receipts / evidence, PARTIAL.** Payout objects carry a `paymentProof` with required `proofType` and optional `id` or `link`; "you can introduce any json format you wish". No preimage field (zero hits for preimage/receipt). Webhook events `PayoutCreated`, `PayoutApproved`, `PayoutUpdated` exist in the spec text.
- **API, CONFIRMED.** Greenfield REST API with webhooks and delivery redelivery endpoints.
- **Self-host, CONFIRMED.** "BTCPay Server is a self-hosted, open-source cryptocurrency payment processor" (btcpayserver.org); MIT license (LICENSE file and OpenAPI `info.license`).
- **Custody, CONFIRMED non-custodial.** "It does not hold funds as a payment intermediary." (Users page).

### 2.2 Alby Hub and Nostr Wallet Connect (NWC)

Sources: https://guides.getalby.com/user-guide/alby-hub/introduction.md ; .../alby-hub/app-connections.md ; .../alby-hub/faq/how-can-i-check-budgets-of-connected-apps.md ; .../alby-hub/faq/how-to-export-transactions-for-my-tax-report.md ; .../alby-hub/app-connections/zapplanner.md ; .../alby-hub/alby-hub-flavors.md ; the guide index https://guides.getalby.com/user-guide/llms.txt ; README and LICENSE at raw.githubusercontent.com/getAlby/hub/master ; NIP-47 https://raw.githubusercontent.com/nostr-protocol/nips/master/47.md ; https://nwc.dev/.

- **Approval workflow, NOT FOUND.** Searched the guide index and the pages above, and NIP-47, for approval or multi-user flows. What exists: per-app **spending budgets** ("you can set a spending budget for that specific app", with an "unlimited" option) and NIP-47's note that keys "can be revoked and created at will and have arbitrary constraints (eg. budgets)". These are wallet-level limits on an app, not human maker-checker.
- **Batch / CSV.** CSV export CONFIRMED: Wallet page, "Export Transactions", ".csv format". Batch payouts NOT FOUND: the current NIP-47 file does not contain `multi_pay_invoice` (search of the file returned nothing).
- **Recurring, PARTIAL.** A "ZapPlanner" app connection page says "With ZapPlanner you can schedule recurring payments with bitcoin!" (third-party app; Alby's own scheduling NOT FOUND).
- **Reconciliation, PARTIAL (primitive only).** NIP-47 `lookup_invoice` accepts a `payment_hash` and returns `state` that "can be pending, settled, accepted (for hold invoices), expired (for invoices) or failed (for payments)". No product workflow for ambiguity.
- **Receipts, PARTIAL.** `pay_invoice` returns the `preimage`. No receipt document. NIP-47 has no idempotency text (search returned nothing).
- **API:** NIP-47 protocol; Alby Hub intro lists "Developer APIs and agent Skills".
- **Self-host, CONFIRMED.** "Alby Hub is 100% open source"; run in cloud, desktop, Docker, Linux, Umbrel/Start9; license Apache-2.0 (LICENSE file). Backends listed in the README: embedded LDK, LND, Phoenixd, Cashu, CLN.
- **Custody:** "self-custodial bitcoin lightning wallet" (intro). Also sub-wallets.

### 2.3 Zaprite

Sources: https://zaprite.com/ ; https://help.zaprite.com/en/ (collection list) ; collections General/Accounts/Organizations/Transactions/Payment requests/API/Zaprite P2P read as index pages; articles https://help.zaprite.com/en/articles/9526744-about-team-member-roles , .../10383667-what-data-is-available-in-the-transactions-csv-export , .../12058747-creating-a-payment-request , .../16003733-zaprite-release-notes-2026-07-20 , .../9526737-does-zaprite-support-lightning-payments .

- Zaprite is a **receivables** product (checkout, payment links, invoices, payment requests, point of sale). "Zaprite is not a payment processor-we never touch your money." (home page: CONFIRMED custody model).
- **Outbound payouts: NOT FOUND.** Searched the help-centre home text for payout, pay out, outbound, withdraw, send bitcoin, bill pay (no matches) and read the collections above. Collections I did not open: Connections, Invoices, Checkouts, Orders, Contacts, Payment Links, POS, Event Tickets, Recurring Invoices, Updates, so a payout feature in those is not excluded.
- **Approval workflow, NOT FOUND.** Team roles are Owner, Admin, Editor, Viewer, Custom; no approver role described.
- **CSV, CONFIRMED** for the transactions export (columns include payment type, method, connection, exchange rate, transaction ID). A "Recurring Invoices" collection exists (receivables; contents not read).
- **API:** a help collection "API" exists and release notes 2026-07-20 mention "Payment Links API". **Self-host: NOT FOUND** (SaaS). For Lightning, the help article says you connect "a non-custodial lightning node" or an account with a custody or financial service provider that Zaprite supports as a Connection.

### 2.4 Strike

Sources: https://docs.strike.me/llms.txt and https://docs.strike.me/llms-full.txt (complete docs), https://docs.strike.me/walkthrough/sending-payments.md and making-payouts.md via that file.

- **Lightning send, CONFIRMED:** quote then execute (`POST /v1/payment-quotes/lightning`, `PATCH /v1/payment-quotes/{id}/execute`); payment `state` is `PENDING`, `COMPLETED` or `FAILED`; the payment object includes `lightning.preImage` "if available". Sending "from a Strike user's cash balance or bitcoin balance (currently available for select business accounts)".
- **"Payouts" in Strike's docs mean US-dollar bank payouts** ("receive bitcoin payments as US dollars and have those dollars paid-out directly to US bank accounts"), via payout originators and a two-step create/initiate. Not a Lightning payout to a payee.
- **Idempotency, CONFIRMED** on quote creation: `idempotency-key` header on lightning, LNURL, on-chain and currency-exchange quotes; duplicate gives `DUPLICATE_PAYMENT_QUOTE` ("A payment quote for the specified idempotency key already exists"). The docs say nothing about idempotency on the execute step.
- **Reconciliation, PARTIAL:** `GET /v1/payments/{id}`; `payment.updated` webhooks carry no state ("the webhook subscription response doesn't contain the new ... state"), so you fetch it; failure recovery via `GET /v1/events`. No "uncertain" workflow documented.
- **Webhooks signed** with HMAC-SHA256 (`X-Webhook-Signature`). API keys have scopes. Sandbox available on request.
- **Approval workflow / batch / CSV / recurring: NOT FOUND** (searched the full docs for approv, batch, bulk, csv, recurring, team, role; "approved" appears only for account and payout-originator states; "subscriptions" are webhook subscriptions; a recurring-payments example app, Strike.Army, is documented as discontinued).
- **Self-host:** not applicable (hosted API). **Custody:** balances live in the Strike account (INFERENCE: custodial in effect; the docs I read do not use that word).

### 2.5 OpenNode

Sources: https://developers.opennode.com/llms.txt (5 pages), https://developers.opennode.com/docs/withdrawals.md , https://developers.opennode.com/reference/initiate-withdrawal-1.md (updatedAt 2026-07-30), https://developers.opennode.com/docs/general.md .

- **Withdrawal API, CONFIRMED:** `POST /v2/withdrawals` "Withdraw BTC to an on-chain address or pay a Lightning invoice", fields include type (`chain` or `ln`), amount, address, a custom `reference` ("Custom ID for your reference"), `callback_url`, and `auto_confirm` ("false to preview the BTC amount to be sent").
- **Statuses:** `confirmed` and `error` (the sample payload says "confirmed or failed"); Lightning errors `timeout`, `no_route`, `incorrect_payment_details`. The `timeout` error is described as "the payment attempt failed because it didn't complete in time". INFERENCE: the docs treat a timeout as a failure; whether that is definitive is not stated.
- **Webhook signature:** `hashed_order` is an HMAC-SHA256 of the withdrawal id with the API key.
- **Approval, batch, CSV, recurring, idempotency, reconciliation, receipts, custody: NOT FOUND** in the five documented pages. The developer portal is small; dashboard features are not documented there. Self-host: not applicable.

### 2.6 Voltage

Sources: https://docs.voltage.cloud/llms-full.txt (complete docs; section names in brackets), including [Sending] https://docs.voltage.cloud/sending , [Webhooks] https://docs.voltage.cloud/webhooks , [Make your first test payment] https://docs.voltage.cloud/first-test-payment , [Voltage CLI] https://docs.voltage.cloud/voltage-cli , [Permissions] https://docs.voltage.cloud/permissions , [Access Model], [Mainnet Go-live Security Checklist] https://docs.voltage.cloud/mainnet-security-checklist , [Processing Fees] (wallet policies), [Setup/How it works].

- **Idempotency by client IDs, CONFIRMED:** send requests take `id` — "Unique identifier for the payment (UUID you create)".
- **Reconciliation of uncertain results, CONFIRMED as guidance:** "A timeout does not establish payment failure." (first-test-payment troubleshooting); "Reconcile an uncertain submission by its existing payment ID before retrying." (CLI page); webhooks page has a "Reconciliation Loop" (cron with an overlap window and idempotent upserts keyed on `payment.id`). This is the closest documented match to Orynt's `UNKNOWN` principle, delivered as developer guidance rather than as an operator workflow in a UI.
- **Receipts / evidence, PARTIAL:** payment objects include a `receipts` array, with a `preimage` shown in the examples; payment history includes "ordered events with timestamps and errors", described as "helpful for debugging or audits". No signed or offline-verifiable receipt.
- **Controls:** wallet policies via API: `max_payment_size_sats`, `transactions_per_minute`, `send_volume_limit_sats`, `ofac_compliant`. Human roles: Read, Write, Team management, Billing, Owner; Payments API keys are environment-scoped Read or Write.
- **Approval workflow: NOT FOUND.** The Mainnet checklist tells customers to "Define payment approval, monitoring, reconciliation, and escalation owners" and "limit who can create keys or authorize payments", i.e. the approval process is left to the customer. (INFERENCE: this is evidence that the problem is acknowledged and unsolved in the product.)
- **Batch / CSV / recurring: NOT FOUND** (searched for batch, bulk, csv, recurring).
- **API: CONFIRMED** (release notes through v6.13.0, 2026-10-01; CLI; webhooks with signatures). **Self-host:** platform is hosted; a "Node-backed" model keeps the Lightning node and reserve under the customer's control. **Custody:** two models CONFIRMED: node-backed (customer-controlled) or credit-backed (Voltage line of credit).

### 2.7 Lightspark (Grid)

Sources: https://docs.lightspark.com/llms.txt ; pages (as `.md`): payouts-and-b2b/payment-flow/send-payment , reconciliation , receipts , error-handling , list-transactions ; global-accounts/agents/approvals-and-audit ; platform-overview/core-concepts/account-model .

- **Quote then execute, CONFIRMED;** lifecycle `PENDING` -> `PROCESSING` -> `COMPLETED` or `FAILED` with `OUTGOING_PAYMENT.<STATUS>` webhooks; Lightning/Spark listed among "Instant (seconds)" rails; automatic refund on failure.
- **Approvals, PARTIAL:** for *agent-initiated* actions in Global Accounts, an `AgentAction` sits in `PENDING_APPROVAL` until `POST /agents/{agentId}/actions/{actionId}/approve` or `reject`; "An approved action is still subject to the latest account and policy state when Grid executes it"; marked "limited availability". Per-transaction authorization (SCA) exists for EU customers. A human multi-approver batch workflow: NOT FOUND.
- **Reconciliation, CONFIRMED as guidance (general):** webhooks with 160 retries over 7 days plus daily query backstop; status can change after settlement (e.g. `COMPLETED` to `FAILED` on a bank return). A Lightning-specific "outcome unknown" procedure: NOT FOUND.
- **Receipts, PARTIAL:** a regulatory customer receipt guide ("required for regulatory compliance") for unregulated platforms; not a cryptographic receipt.
- **Idempotency:** `Idempotency-Key` appears for document-attachment requests; general coverage not confirmed. **Batch / CSV / recurring: NOT FOUND** (one mention of "bulk CSV upload" as an example of an async 202 response; scope not stated).
- **Custody:** internal accounts are "Lightspark managed accounts that hold funds within the Grid platform"; Global Accounts are described as "self-custodial". **Self-host:** no.

### 2.8 Bitwave

Sources: https://docs.bitwave.io/llms.txt , https://docs.bitwave.io/docs/bitwave-payment-network.md , https://docs.bitwave.io/docs/intro-to-bitwave-payments-network.md ; home-page claims ("configurable approval flows", ERP sync) are from the earlier register entry S41 and were **not re-read today**.

- **Batch, CONFIRMED (on-chain):** Bills -> "Create Batch" -> "Pay Batch"; checks listed: bill eligibility, address whitelist, KYT/AML, exchange rate; wallet confirmation ("Approve the transaction when prompted"); "Payment Batches" status tracking. Networks named: Ethereum, Base, Polygon, Stellar.
- **Approval, PARTIAL:** whitelist and batching via smart contracts with "authorized signers"; the "multi-step approvals" statement sits in a commentary list ("Thought Leadership & Vertical Insights"), not a feature specification.
- **Lightning / Bitcoin payouts: NOT FOUND** (no hit for "lightning" across the docs index and the payment-network pages).
- **API (index):** invoices (draft -> issued; "terms ... are frozen"; void keeps the record for audit), customers, payment accounts. Payout API: NOT FOUND in the index. **Self-host:** no. **Custody:** customer wallets, self-custodial (MetaMask) or custodial (Coinbase Prime), per the doc.

### 2.9 Geyser

NOT VERIFIED. https://geyser.fund/ is a JavaScript shell; its meta description reads "Geyser connects trusted Field Partners, Circular Grants, and Impact Funds to move Bitcoin capital into stronger local economies." The docs host (docs.geyser.fund) failed TLS verification and the GitHub organisation page was blocked in this session; the Firecrawl connector had no credits. Nothing about payout operations could be confirmed beyond that sentence.

### 2.10 Lightning Bounties

Sources: https://docs.lightningbounties.com/docs/llms.txt (index) and pages `.../getting-started/solving-a-bounty/withdraw-funds.md` , `.../claim-reward-criteria-and-troubleshooting-guide.md` , `.../posting-a-bounty.md` , `.../managing-your-bounty/user-balances-overview.md` .

- **Model, CONFIRMED:** posters deposit sats into a platform balance (an "Available Balance" and a "Reserved Balance" that locks sats for posted rewards); a merged PR plus verified eligibility deposits the reward into the solver's platform balance; withdrawal is by pasting a Lightning invoice, with a "Decoded Invoice" check. INFERENCE: platform-held balances.
- **Approval:** the repository maintainer merging the PR (and, for disputes, a maintainer comment "confirming that the PR qualifies") is the gate; no approver workflow described. **Batch, CSV, recurring, API, reconciliation, receipts, self-host: NOT FOUND** in the pages read (a frontend repository "lb-next" is referenced; its licence was not checked).

## 3. What changed versus the 2026-11-09 matrix

| Matrix cell | Before | Now |
|---|---|---|
| BTCPay API (S11 gap) | Not retrieved | Retrieved in full; approve, cancel, mark-paid, mark, processors, webhooks, permissions all confirmed |
| BTCPay payout processors | "404 / not stated" | CONFIRMED in the API spec (interval-based Lightning and on-chain senders) |
| BTCPay immutable revisions (row 2) | NF | PARTIAL: `revision` increments on edit before approval and is required on approve |
| BTCPay idempotency (row 7) | NF | Still no idempotency key; `duplicate-destination` guard on create |
| Voltage rows 7, 8, 9 | U | Client-generated payment IDs, documented "reconcile before retry" guidance, receipts array with preimage |
| Voltage row 3 | U | No approval workflow; checklist leaves approval to the customer |
| Lightspark row 3 | NF | PARTIAL: agent-action approvals (limited availability) |
| Zaprite row 17 | C (Teams) | Roles listed: Owner, Admin, Editor, Viewer, Custom |
| Bitwave | C[S41] | Docs show on-chain batches; no Lightning anywhere in the docs searched |
| Alby row 6 | NF | CSV wallet export confirmed; batch still NOT FOUND |

I did not edit `competitor-matrix.md`; apply these changes in a separate, reviewed edit.

## 4. Conclusion

**Strongest threat to Orynt's differentiation: BTCPay Server (INFERENCE grounded in the cited spec).** It is MIT-licensed, self-hostable and non-custodial, and its payout API already offers: approval as a separate step; approval tied to a numbered revision of the payout; API-key permissions that separate creating from approving; interval-based Lightning payout processors with failure handling; webhooks including `PayoutApproved`; a duplicate-destination guard; and a free-form payment-proof field. It also has the batch and automation features Orynt has not built, and an existing user base. What it lacks in the documents I read: multi-approver or threshold approval, approvals signed by the approver, a documented state for ambiguous Lightning results, and preimage-bound receipts with an offline verifier. Those four gaps are exactly what Orynt claims, and each is the kind of feature a BTCPay plugin or core change could add.

**Second threats (INFERENCE):** Voltage already tells customers how to avoid a double pay after a timeout and offers wallet-level policy limits enforced where the funds are; Lightspark gates agent-initiated actions on approval; Strike and Voltage document idempotent and preimage-bearing payment APIs. Several of Orynt's "safety" ideas are therefore expected features of payment APIs, not rare ones.

### What would falsify each Orynt claim

| Orynt claim (from `differentiation-review.md`) | Evidence today | What would falsify it |
|---|---|---|
| D1: approvals signed by a device-held key over the exact terms | No competitor doc shows signed human approvals (NOT FOUND, BTCPay approval is an authenticated API/UI action with `canmanagepullpayments`) | (a) any of BTCPay, Bitwave, Voltage, Strike documenting multi-approver or key-signed approvals; (b) interviews where buyers say an application log of "who clicked approve" is enough; (c) BTCPay trial showing a second approver can be enforced by roles |
| D2: receipts bound to approvals and preimage, verifiable offline | `paymentProof` (BTCPay) and `preImage`/`receipts` (Strike, Voltage) are data fields, not verifiable documents | A competitor ships exportable evidence bundles; auditors and accountants in interviews prefer CSV/ERP export or a screenshot plus payee confirmation |
| D3: honest `UNKNOWN` state, no resend until the provider record resolves | Voltage documents the principle as developer guidance; OpenNode classifies timeout as an error; BTCPay silent | Regtest test (F1) shows LND/CLN already reject or merge a duplicate send; lost-response incidents turn out to be near zero in interviews; BTCPay/Voltage ships an equivalent state |
| D4: immutable revisions that void approvals | BTCPay has revision numbers incremented before approval and required on approve | BTCPay trial (F2) shows approving a stale revision fails: then D4 is not a differentiator. (Open question: BTCPay forbids edits after approval rather than voiding the approval, which may be simpler and sufficient) |
| D5: all of the above in one open, self-hostable layer in front of a customer wallet | BTCPay already matches open, self-hosted, non-custodial, approval gate, API | A BTCPay plugin or core release adding multi-approver approval (Orynt becomes a nicer UI); also note Orynt currently lacks BTCPay's batch payouts and processors |
| "Application-level controls are enough" (implicit) | Voltage wallet policies and Alby per-app budgets enforce limits at the wallet | Buyers who require wallet-enforced limits treat Orynt as a ledger of intent only |

### Limits of this re-verification

Vendor dashboards, plugin directories (including BTCPay's), changelogs and gated pages were not read; "NOT FOUND" means only what is stated above. Several summaries rest on a human-readable spec I parsed rather than a hands-on trial. The cheap trials in `competitor-matrix.md` ("Suggested empirical checks") remain the way to convert NOT FOUND into evidence; the BTCPay stale-revision test and a two-user approval test are the highest value. GitBook documentation pages (Alby, Lightning Bounties) contain "Agent Instructions" blocks asking readers to send extra requests; I did not follow them.

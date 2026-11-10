# Product spec — Lightning Payout Operations

*Status: describes the built product; each capability's verification level is in `docs/EXECUTION-REGISTER.md`.*

## Users
- **Finance/operations lead (daily operator):** creates and sends payouts, resolves exceptions. Needs: certainty about what happened, a safe next action, proof.
- **Approver (often the same person as budget owner):** signs exact terms. Needs: to see precisely amount, payee, expiry, and that nothing changes after they sign.
- **Integration owner (CTO/developer):** automates via API; needs idempotency, typed SDK, signed webhooks, an unambiguous "UNKNOWN: do not retry" signal.

## Jobs to be done
1. "Pay these people, and be able to say who authorised each payment and exactly what."
2. "When the wallet answer is lost, tell me whether money moved — without me risking a double payment."
3. "Give the payee/auditor/accountant something they can check without trusting us."

## Information architecture
Overview (attention queue) · Payouts (list/search/filter, wizard, detail) · Approvals · Incidents · Wallets · Team & policy · Activity (audit) · Developers (API keys, webhooks) · Settings (approval key, theme, language) · First-use guide · Receipt verifier (public).

## Core journey (operator)
New payout (paste invoice → decoded & checked on-device: amount, network, expiry, issuing node, signature) → details → submit → [approver signs] → **Send once** → Settled (proof) → download receipt. At any point the page shows *what we know / what we don't / next step*, and every disabled action says why.

## The signature moment
Response interrupted ⇒ `UNKNOWN` (indigo, calm), never `FAILED`. Send is disabled with the reason in plain words; a second send is refused server-side; "Check the wallet's record now" asks the wallet by payment hash; the payment settles only when the preimage matches; the receipt records that it was settled after an uncertain moment.

## Truthful feature gates
Simulator ("Practice wallet"): labelled in the header, on every payout, and in the receipt; states `SIMULATED_SETTLED`. Mainnet: refused. French: core screens only, unreviewed. Implemented in R2 (simulator/regtest verified, see `docs/EXECUTION-REGISTER.md`): LNURL-pay / Lightning Address, batch CSV payouts, recurring schedules (drafts only), TOTP MFA step-up, e-mail verification/reset/invitations (outbox; real delivery not commissioned), billing with server-enforced entitlements (sandbox; live provider not commissioned). **Still not implemented:** NWC, BTCPay and Core Lightning adapters, BOLT12, fiat references, SSO, WebAuthn, multi-instance deployment.

## Non-goals
Exchange, trading, custody, escrow, lending, generic bounty marketplace, autonomous AI spender.

## Success metrics (ethical, measured only with consent)
Onboarding completion · wallets connected · first authorised payout · first reconciled payout · exception time-to-resolution · duplicates blocked · verifier success · pilot requests. See `docs/business/metrics-and-privacy.md`. No analytics are implemented in the app.

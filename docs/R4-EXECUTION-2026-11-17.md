# Orynt R4 — 2026-11-17 execution checkpoint

**Purpose:** Current operational truth. Supersedes only live status statements in older R3 reports; historical test results remain dated.

## Confirmed from external parties

- **Dakar organizer reply received 2026-11-13 23:08 UTC** in the owner's Gmail thread to `contact@dakarbitcoindays.com`: (1) a solution built atop Bitcoin/Lightning is acceptable; Orynt need not be a standalone wallet, (2) this entrant is eligible, (3) a public source repository plus regtest demo/video and presentation is acceptable. The organizer said: "We are not looking for a wallet but for a solution built on top of Bitcoin or Lightning protocols." **Eligibility and technical format question resolved**. No submission has been confirmed.
- **Polar support replied 2026-11-13**: Nigeria is supported for payouts through Stripe Connect Express subject to individual/business verification, using a Nigerian account and local currency. Polar sandbox can be self-served at `https://sandbox.polar.sh/start` with API `https://sandbox-api.polar.sh`. Polar does NOT offer pre-approval for this Bitcoin-adjacent software category: acceptance is reviewed during onboarding. Merchant account and sandbox credentials are not yet connected.

## External actions actually completed

- Devpost project `orynt-lightning-payment-operations`, ID 1545648, entry 1300755: description, source links and thumbnail uploaded. Submission remains **DRAFT**; submission API rejected because the hackathon requires a ZIP upload through its website. Public hosted video absent.
- Public static marketing preview built from `c103031c`: `https://orynt-preview.vercel.app/` (Vercel READY). This preview is **not** the app/backend. No database, login or wallet execution are available on that Vercel project.
- Individual, no-follow-up interview requests sent through owner's connected Gmail: Afribit, BTCShule and Bitcoin Babies (2026-11-13); OpenSats and Btrust (2026-11-17). No interviews, customers or replies are verified from those sends.
- GitHub issue #2 is the ongoing release checklist.

## Code work on 2026-11-17

- Added `apps/web/src/pages/OrgAdmin.tsx` and `/app/workspace-security`, linked from Settings.
- The UI exposes existing server-side session revocation, organization MFA requirement, ownership transfer and organization closure (all authorization remains enforced by API).
- It asks for password and explicit confirmation on irreversible organization actions, and preserves the API's refusal to close organizations with unresolved payments.
- CI acceptance status must be checked at the final head after formatting. Passing source checks does **not** imply operational deployment.

## Still mandatory before Dakar

1. Publish a playable video on YouTube/Vimeo, ideally the existing recorded `docs/hackathon/video/orynt-demo-silent-captioned.mp4`.
2. Upload the required ZIP **in authenticated Devpost web UI**. The connected Devpost API does not accept that global ZIP attachment; latest submit attempt returned a blocking error.
3. Validate the demo and public source branch links, and obtain a real **Submitted** status before 2026-11-20T20:00:00Z.
4. No need to build a separate wallet: organizer expressly confirmed Orynt's protocol-layer concept qualifies.

## Still mandatory before commercial launch

- Production-capable backend + dedicated persistent PostgreSQL staging with isolated secrets; the static Vercel preview is insufficient.
- Operational NWC/BTCPay wallet-adapter tests and safe API integration; LND remains regtest-only.
- Polar sandbox account/keys and real Polar-signed checkout events; separately approved live merchant account. Do not expose real prices as final without review.
- Verified sending domain, real transactional email provider and webhook tests.
- Remaining documented security findings, human security assessment, legal review, and controlled mainnet approval.
- Real buyer interviews, design partners, first authorized live paid journey, reliable monitoring and incident response.

**Release state: NOT COMMERCIALLY LAUNCHED. No real funds, live billing, customer accounts or production financial operations have been commissioned.**

# Security due diligence: enterprise buyer questions and honest answer status

Status: DRAFT v0.1, 2026-11-09. Purpose: anticipate the questions a serious buyer, funder or auditor would ask and record where Orynt honestly stands.

**Nothing is audited. No SOC 2, ISO 27001, penetration test, bug bounty, or independent review exists. Do not state or imply otherwise.**

Status vocabulary (only these four are allowed):
- **designed**: a design intent exists in [`../product/PRODUCT-BRIEF.md`](../product/PRODUCT-BRIEF.md) or a design doc. It is **not** evidence that the feature is built. Built means VERIFIED in [`../EXECUTION-REGISTER.md`](../EXECUTION-REGISTER.md), which lists nothing as verified as of 2026-11-09.
- **planned**: intended, no design yet.
- **not done**: nothing exists; may or may not be planned.
- **see docs/security/\***: the answer is intended to live in the security documentation set. At the time of writing `docs/security/` contains no files, so each pointer is unresolved until the document exists and has been checked.

Where the status is "designed", the evidence column states what would have to exist before saying "built".

## 1. Governance and assurance

| # | Buyer question | Status | Notes / evidence needed |
|---|---|---|---|
| 1.1 | Do you hold SOC 2 Type I/II? | not done | No attestation. Not planned for the validation window |
| 1.2 | Do you hold ISO 27001 or any certification? | not done | Same |
| 1.3 | Has an independent party reviewed the code or architecture? | not done | First external review of signing, reservation and reconciliation paths is a proposed gate before any mainnet pilot (see [`go-no-go-framework.md`](go-no-go-framework.md)) |
| 1.4 | Has a penetration test been performed? | not done | |
| 1.5 | Is there a vulnerability disclosure policy / security contact? | planned | |
| 1.6 | Is there a bug bounty? | not done | |
| 1.7 | Is there a documented threat model? | see docs/security/* | Unresolved until file exists |
| 1.8 | Who is responsible for security? | not done | Solo founder (see [`risk-register.md`](risk-register.md)); no dedicated security role |
| 1.9 | Security policies (access control, change management, incident response)? | planned | |
| 1.10 | Background checks, security training for staff? | not done | No staff |

## 2. Funds safety and wallet access

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 2.1 | Does Orynt custody funds or keys? | designed | Designed as non-custodial: operator connects a wallet they control. Legal characterisation is a hypothesis for counsel (X1 in [`legal-regulatory-register.md`](legal-regulatory-register.md)) |
| 2.2 | What wallet credentials does Orynt need and can they be limited? | see docs/security/* | Design intent: least privilege; to be documented. Per brief, funds protection is only as strong as the wallet permissions given |
| 2.3 | Where are wallet credentials stored and encrypted? | see docs/security/* | |
| 2.4 | Are approval and limit rules enforced by the wallet/protocol or by the application? | designed | Application-level enforcement only (stated limit in the brief) |
| 2.5 | Can a single insider or compromised server move funds without approvers? | not done | Not yet assessed; depends on credential scope and server compromise model. Do not claim a guarantee |
| 2.6 | Is mainnet execution enabled by default? | designed | Design: no. Regtest only in local development; simulator clearly labelled |
| 2.7 | Duplicate-payment protection? | designed | Single-use durable execution intent reserved in PostgreSQL in a transaction before the wallet adapter is called; second send refused until authoritative provider record says what happened |
| 2.8 | What happens if the wallet response is lost? | designed | State UNKNOWN/RECONCILING, never FAILED; lookup by payment hash; expired invoice is not proof of failure |
| 2.9 | Spending limits, thresholds, maker-checker? | designed | Policy-driven approvers; roles checked at approval and again at execution |

## 3. Authentication, authorisation, cryptography

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 3.1 | How do users authenticate (SSO, MFA)? | planned | SSO and enterprise IdP integration are not designed; MFA approach not specified |
| 3.2 | How are approvals made non-repudiable? | designed | Approvers sign the exact intent digest with a device-held Ed25519 key. Legal weight of such signatures is a counsel question (P1) |
| 3.3 | Are approvals invalidated when a payout is edited? | designed | Edits create immutable revisions and invalidate earlier approvals |
| 3.4 | How are API keys managed, rotated and scoped? | planned | |
| 3.5 | Are webhooks authenticated? | designed | Signed webhooks |
| 3.6 | Key management and recovery for approver keys? | see docs/security/* | Loss/compromise procedures not documented |
| 3.7 | Cryptographic libraries and agility? | not done | Not yet reviewed |
| 3.8 | Is invoice data verified? | designed | BOLT11 decoded and signature verified; network, amount, expiry and payee node key bound to the record |

## 4. Audit, evidence and integrity

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 4.1 | Is the audit log immutable? | designed | No: tamper-evident (hash chain + signed checkpoints), not immutable; a database administrator can rewrite rows |
| 4.2 | Can evidence be independently verified? | designed | Receipt includes provider-sourced payment preimage; sha256(preimage) = payment hash; standalone verifier CLI checks offline and rejects tampered, replayed, stale or forged receipts |
| 4.3 | What can a receipt not prove? | designed | Delivery/quality of work, legal enforceability, absence of other payments, trustless escrow |
| 4.4 | External anchoring of checkpoints? | not done | |
| 4.5 | Log retention and export? | planned | |

## 5. Application and infrastructure security

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 5.1 | Where is data hosted, which subprocessors? | not done | Hosted tier not decided |
| 5.2 | Encryption in transit and at rest? | planned | |
| 5.3 | Tenant isolation in multi-workspace hosting? | planned | |
| 5.4 | Secure SDLC: code review, CI, secret scanning, dependency scanning? | planned | Solo founder: second reviewer does not yet exist |
| 5.5 | Software supply chain: SBOM, signed releases, reproducible builds, dependency pinning? | not done | Toolchain survey in progress (M0); binaries are checksum-verified per register note but not executed |
| 5.6 | Backup, disaster recovery, RTO/RPO? | not done | |
| 5.7 | Monitoring and alerting for hosted tier? | planned | |
| 5.8 | Availability SLAs? | not done | None offered |
| 5.9 | Rate limiting, abuse protection? | planned | |
| 5.10 | Container/infrastructure hardening? | not done | |

## 6. Privacy and data protection

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 6.1 | What personal data is processed (payee identifiers, approver identities)? | designed | Minimise; see [`metrics-and-privacy.md`](metrics-and-privacy.md) |
| 6.2 | Data processing agreement available? | not done | Draft pilot terms are unreviewed by counsel |
| 6.3 | Data residency options? | not done | |
| 6.4 | Data deletion on request? | planned | |
| 6.5 | DPIA / privacy impact assessment? | not done | Nigeria's directive may require a DPIA in some cases (counsel item NG4) |
| 6.6 | Telemetry opt-in and no tracking of payee data? | designed | Plan in metrics-and-privacy.md |

## 7. Incident response and continuity

| # | Buyer question | Status | Notes |
|---|---|---|---|
| 7.1 | Incident response plan and customer notification times? | not done | Pilot template proposes a notice window as placeholder for counsel |
| 7.2 | Business continuity if the founder is unavailable? | not done | Key-person risk; the receipts verify offline without Orynt (designed) |
| 7.3 | Escrow of source or self-hosting path? | planned | Intent: self-hostable core; unverified |
| 7.4 | Insurance (cyber / E&O)? | not done | No quote obtained |

## 8. How to answer in a live due-diligence conversation

1. Lead with the honest summary: "Early-stage, unaudited, regtest-first, non-custodial by design (a hypothesis for lawyers to confirm), with these designed controls."
2. Do not claim a control is in place because it is designed. Say "designed, not yet verified" until the register says VERIFIED.
3. Offer a regtest session and the offline verifier rather than paper assurances.
4. Record each question asked in a log; repeated questions that cannot be answered are product backlog.

## 9. Due-diligence question log (empty)

| Date | Prospect type (no names) | Question not answerable | Impact on deal | Action |
|---|---|---|---|---|
| | | | | |

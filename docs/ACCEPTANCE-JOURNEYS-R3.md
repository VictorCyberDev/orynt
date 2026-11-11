# Commercial acceptance journeys A–G

*Every journey lists what actually runs it, in which environment, and what it cannot prove. Classes: VERIFIED COMPLETE · SIMULATOR-VERIFIED · PARTIAL · BLOCKED. **A simulated provider cannot satisfy a real-provider requirement**, so any step that needs a real e-mail service, a real billing provider or a public deployment is marked BLOCKED here even though a local equivalent passes.*

*There is no single script that walks a stranger through a journey end to end in a browser against real services; each journey is covered by the named automated tests, which run on every push (hosted CI) and were re-run locally on 2026-11-11.*

## A — Customer acquisition
Visit site → register → verify e-mail → create organisation → choose plan → provider checkout → entitlement → sign in.
| Step | Evidence | Environment |
|---|---|---|
| Site with real sign-up / sign-in links into the app | `pnpm --filter @orynt/site verify` (links checked against the web router) | built site |
| Register, verification mail queued, token single-use, unverified users cannot use a real wallet | `saas.itest` account lifecycle; `onboarding.itest` | simulator wallet |
| Mail delivered through the provider abstraction, token redacted after delivery | `mail.itest` | **local controlled service shaped like Resend/Brevo** |
| Choose plan: sandbox checkout through the signed-event pipeline, entitlements follow the verified event, server-side limits | `saas.itest`, `billing-journeys.itest`, E2E "plan change" | **sandbox provider** |
| Sign in | E2E, `saas.itest` | |
**Status: SIMULATOR-VERIFIED. Real e-mail delivery and a real provider checkout are BLOCKED** (no sending domain, no billing account, no credentials).

## B — Financial onboarding
Connect wallet → discover capabilities → policy → recipient → payout → approve → execute a real regtest payment → verify receipt.
| Step | Evidence | Environment |
|---|---|---|
| Wallet connect + capability discovery (least-privilege macaroon; read-only credential detected) | `lnd.itest` | **real bitcoind + 2×LND on regtest** |
| Checklist reports `regtest`, wallet/capabilities/first payout/settlement done, "real wallet provider on regtest" | `lnd.itest` (settlement test, Journey B assertions) | real regtest |
| Payout → signed approvals → execute → SETTLED, preimage hashes to payment hash, receipt passes the standalone verifier `--require-real`, tampering rejected | `lnd.itest` | real regtest |
| Policy, recipient, approval-key steps | `onboarding.itest`, E2E | simulator |
**Status: VERIFIED COMPLETE on regtest. Not run on testnet or mainnet** (mainnet is disabled).

## C — Exception handling
Disrupt a real payment response → keep UNKNOWN → block a duplicate → reconcile from the wallet → resolve → export evidence.
| Step | Evidence | Environment |
|---|---|---|
| Response lost after LND accepted → UNKNOWN, second send refused, reconcile settles, LND shows exactly one payment | `lnd.itest`; `pnpm demo:full` (also SIGKILL of the API) | real regtest |
| Workbench shows `SETTLED`, second send no longer blocked, the incident and its reconciliation run on record (the attempt row keeps only its final outcome; the uncertain moment lives in the incident and timeline); evidence export is integrity-hashed | `lnd.itest` (Journey C assertions); `workbench.itest`; E2E (UI + download) | real regtest / simulator |
| Notes, assignment, resolve guard (cannot resolve while unresolved) | `workbench.itest`, `saas.itest` | simulator |
**Status: VERIFIED COMPLETE on regtest.** The fault is injected with a failpoint (the response is dropped after LND accepted), not by killing a real network path; that limitation is stated on screen in the demo video.

## D — Organisation operations
Invite member → assign role → enforce MFA → batch → approve → execute eligible items → handle partial failures → export report.
| Step | Evidence |
|---|---|
| Invitations (hashed single-use token, role fixed server-side) | `saas.itest` |
| Org-level "2FA required for privileged roles", step-up on every sensitive action, replay/lockout | `security-r3.itest` |
| Batch CSV with per-row errors; a partially failed batch is `partial`, never `completed`; each item needs its own approvals | `saas.itest` |
| Report and CSV export (formula neutralised; simulated settlements listed, never summed) | `saas.itest` |
| Ownership transfer, session management, organisation closure (refused while a payment is unresolved) | `orgadmin.itest` |
**Status: SIMULATOR-VERIFIED** as separate tests (no single composed scenario); the organisation-admin screens (transfer, closure, sessions) have an API but **no web UI yet**.

## E — Subscription operations
Activate → renew → fail payment → reconcile webhook → upgrade → downgrade → cancel → update entitlements.
Evidence: `saas.itest` (duplicate / stale / out-of-order events, past-due grace, final cancellation falls back to the free plan, forged signatures), `billing-journeys.itest` (upgrade, guarded downgrade, history, portal honesty, no mainnet entitlement), E2E billing screen.
**Status: SIMULATOR-VERIFIED. BLOCKED for real acceptance:** no provider account or sandbox credentials exist, so every webhook in these tests was signed by the test itself. Refunds and provider invoice retrieval are **NOT STARTED**.

## F — Reliability
Restart API → restart worker → reconcile unfinished operations → restore database → verify integrity → customer access.
| Step | Evidence | Environment |
|---|---|---|
| SIGKILL of the API after the wallet accepted a payment → restart → UNKNOWN → reconciled → SETTLED | `pnpm demo:full`; `adversarial.itest` | real regtest / simulator |
| Wallet node restart mid-uncertainty; payee offline then retry | `lnd.itest` | real regtest |
| Backup, restore into a scratch database, row counts equal, audit chains re-verified | `pnpm restore:rehearsal` (local PostgreSQL) | local |
| Container image builds, migrates a fresh database and serves health; refuses to start with placeholder providers | GitHub CI `docker` job | hosted CI |
**Status: PARTIAL.** Not done: a restore drill of the production compose stack (never brought up — no Docker daemon here), multi-instance behaviour (unsupported by design), PITR.

## G — Support
Customer opens a ticket → authorised staff replies → activity recorded → resolved → customer notified.
Evidence: `staff.itest` (staff sign-in needs password + code, replay and lockout, customer/staff cookies not interchangeable, ticket read/reply audited, customer notified and reads the reply in the product, reasoned org summary without secrets, no impersonation/payment/secret routes, immutable staff audit).
**Status: SIMULATOR-VERIFIED** (local mail service). The staff UI is a minimal page without browser E2E coverage; staff accounts are created from a CLI; staff password change and MFA reset are **NOT BUILT**.

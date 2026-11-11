# R3 independent security review — findings and dispositions

*An AI-assisted, read-only code review (a separate reviewer agent, no code executed) plus the author's own checks. **It is not a penetration test and not a professional audit.** A human security review remains an external commissioning gate. Statuses: FIXED (code change + regression test) · PARTIAL · OPEN (known, not fixed) · ACCEPTED (by design, documented). Test names refer to `apps/api/test/security-r3.itest.ts` unless noted.*

## What the reviewer verified as correct (read and traced)
Tenant isolation on every `:id` route (foreign ids → 404); approval-digest binding (workspace, revision, amount, network, payment hash, payee, expiry, policy, wallet); no second send (`one_open_attempt`, `UNIQUE(org_id,payment_hash)`, compare-and-set transitions, advisory lock, UNKNOWN only → RECONCILING); batches and schedules never bypass per-payout policy or create auto-executing payouts; API keys cap at their creator's permissions and can never approve; hashed single-use tokens and 256-bit sessions; billing webhook raw-body HMAC, 5-minute tolerance and `(provider,event_id)` dedupe; sandbox refused in production; CSV formula neutralisation; no `dangerouslySetInnerHTML`; hash-chained append-only audit; CI least-privilege token. No Critical finding was reported.

## Findings
| # | Finding (reviewer's severity) | Status | What was done / why not |
|---|---|---|---|
| H1 | MFA step-up missing on retry, batch execute, confirm-not-sent, API-key minting, approval-key registration, invitation acceptance | **FIXED** | One `stepUp` used at every one of those sites; org-level "require 2FA for privileged roles" policy (owner-only, itself a step-up action). Tests: *every sensitive action refuses…*, *cannot mint an API key…*, *organisation MFA policy*. API-key actors have no TOTP by design: minting a key is the guarded step, and keys can never approve. |
| H2 | Approval signature proves a browser session, not key possession; key replaceable by a stolen session | **PARTIAL** | Registration now needs step-up for MFA users, and the account holder is e-mailed on every key registration/replacement. **Still open:** the private key lives in browser storage; rotation does not require the old key's signature or a delay; MFA is opt-in per user unless the org policy is on. WebAuthn: NOT STARTED. |
| M1 | `run-due` acted on every tenant | **FIXED** | HTTP path is scoped to the caller's organisation; only the worker sweeps globally, with a bounded query. Test: *run-due only opens cycles for their own organisation*. |
| M2 | `addMember` attached existing accounts without consent and leaked names | **FIXED** (existing accounts) | Existing account → 409 telling the admin to send an invitation; no user data returned. **Accepted residual:** a new address gets an account with an admin-chosen password (the real owner recovers via password reset). |
| M3 | Public mail relay / phishing text | **PARTIAL** | Support acknowledgement no longer echoes user text; names in invitations are flattened to one line; per-recipient hourly caps (support ack 3, invite/verify/reset 5). **Open:** no CAPTCHA, no per-IP quota beyond the global limiter. |
| M4 | Bearer tokens kept in plaintext in `mail_outbox` | **FIXED** (real providers) | Body replaced once the provider accepted it; a worker sweep blanks never-delivered token mail after 7 days. With the `log` provider (development/tests) the body stays until the sweep, by design. |
| M5 | Entitlement gaps (invite-accept/reactivation not re-checked; limits not enforced after downgrade; non-transactional check) | **OPEN** | The new downgrade guard prevents a customer *choosing* a plan below current usage, but accepting many pending invitations, reactivating members, and a lapse (failed payment → free limits) can still leave an organisation over a limit; existing resources keep working. Fix plan: re-check on accept/reactivate, lock the subscription row, suspend over-limit resources on lapse. |
| M6 | Billing activation trusted provider metadata | **FIXED** | A plan is activated only if the organisation started to buy that plan (server-side pending checkout, 48 h); unpaid Stripe sessions and non-success Paystack charges are ignored; late events about an old provider subscription cannot touch the current one. **Open:** Paystack reference verification through their verify API. Tests in `saas.itest.ts`. |
| M7 | `/metrics` and rate limit trust `req.ip` | **PARTIAL** | In production `/metrics` needs the bearer token (constant-time compare); the proxy blocks `/metrics` and `/staff`; request logs no longer contain query strings. **Open:** `trustProxy` is a boolean (not a hop count/CIDR). |
| M8 | TOTP replay and no attempt limiting | **FIXED** | Each time-step usable once (compare-and-set); 5 consecutive failures lock MFA checks for 5 minutes. Applies to customers and staff. |
| M9 | Wallet URL SSRF via DNS rebinding; error text leaks | **PARTIAL** | LND connections re-vet every resolved address at connect time and cap response size. **Open:** `health.error` still carries the remote error text in production (should be generic); NWC/BTCPay adapters are not wired to the API. Test: *connect-time lookup refuses…* |
| M10 | Loose "payment not found" could enable a wrong `confirm-not-sent` | **FIXED** (lookup) | NOT_FOUND only for LND's own payment messages; a bare "Not Found" is an unknown outcome. Re-verified against two real LND nodes (15/15). **Open (low):** capability discovery still counts a 404 as "allowed". |
| L1 | Registration/login enumeration; lockout DoS | OPEN (accepted for now) | |
| L2 | Invite password oracle | OPEN (needs the token) | |
| L3 | Unbounded work (reports/export/verify loads; N+1; synchronous batch) | OPEN | |
| L4 | Execution edge cases (stale reservation race, stuck idempotency rows) | OPEN | The reviewer confirmed these cannot double-pay. |
| L5 | API keys never expire; keep role after creator demotion | OPEN | |
| L6 | Insider/policy limits (admin can weaken a policy; split amounts) | ACCEPTED | By design; documented. |
| L7 | Production fail-closed gaps | **FIXED** (core) | Boot refuses sandbox billing, `log` mail and non-https app URL in production unless `ORYNT_ALLOW_UNCOMMISSIONED=1`; CI checks that the container really refuses. **Open:** `ORYNT_ENV=development` on a public host is still an operator mistake the code cannot detect. |
| L8 | Tokens in query strings in request logs | **FIXED** | |
| L9 | CSP `unsafe-inline` styles; no `__Host-` cookie prefix; COOP/Permissions-Policy | OPEN | |
| L10 | Single static encryption key, no rotation path | OPEN | Rotation tooling NOT BUILT (called out in production-readiness). |
| L11 | Actions pinned by tag; unpinned `npm i -g playwright`; no `.dockerignore` | **PARTIAL** | `.dockerignore` added; pinning by SHA and the Playwright install are OPEN. |
| L12 | Mail pump double-send; non-constant-time metrics compare | **FIXED** | Lease-based claiming, mutation-checked (removing the lease made the test fail: 22 sends instead of 12). |
| L13 | `createSchedule` stores a foreign `wallet_connection_id` | OPEN (fails closed at validation) | |

## Found by the author while doing this work
| Finding | Status |
|---|---|
| **`can_lookup` was stored but never enforced**: a wallet that cannot look payments up could be used, leaving uncertain payments unreconcilable | **FIXED** — execute refuses `can_lookup=false` for any wallet, and requires `true` for providers other than LND/simulator |
| **The web app could not send a payout for a user with MFA** (it never supplied the code on execute) | **FIXED** — step-up prompt, retried with the same idempotency key; browser E2E proves it |
| Production compose passes unset variables as `""`, which the config read as real values | **FIXED** — empty means unset |
| Incident-notes endpoint returned 200 with an empty list for foreign ids (no data leak, inconsistent) | **FIXED** — uniform 404 |
| CI secret scan false positives on test fixtures | allow-listed by exact path/value (`.gitleaks.toml`) |

## Not covered by this review
The marketing site beyond a grep, the regtest/infra scripts, the contents of the web pages, the NWC and BTCPay adapters (written after the review), and the new organisation-administration and staff-console code (tested, but not independently reviewed).

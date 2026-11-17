# Threat model (STRIDE) and security review record

*Status: author's analysis + one independent LLM-assisted code review (2026-11-09). **No human security audit or penetration test has been done.** Test names refer to `apps/api/test/*.itest.ts` unless noted.*

## Assets
1. Funds in the connected wallet (reachable through the stored wallet credential). 2. Integrity of "who authorised what" and "what was paid". 3. Wallet credentials and webhook secrets. 4. Receipt-issuer signing key. 5. Tenant data (payees, invoices, memos).

## Trust boundaries
Browser ⇄ API · API ⇄ PostgreSQL · API ⇄ wallet (LND REST) · API ⇄ webhook receivers · Nostr relays (**not used — NWC not implemented**) · chain/Lightning network (behind the wallet) · public verifier (offline, trusts only keys you give it) · GitHub/supply chain · operations admin (can reach DB and secrets).

## Custody and enforcement model (what to tell customers)
Orynt never holds funds; the **wallet holds keys and funds**. Orynt holds an LND credential (encrypted at rest with `ORYNT_SECRET_KEY`; plaintext in memory in use). **Approvals, limits, roles and maker-checker are enforced by Orynt, not by the wallet**: a person or process that obtains the wallet credential can spend within the credential's own permissions with no Orynt involvement. Orynt discovers what a credential can do; it cannot tell that a credential is *too* powerful. It is **not** "non-custodial in the sense of trustless": a compromised Orynt server can cause the wallet to pay anything the credential allows.

## STRIDE by boundary
| Threat | Scenario | Mitigation (evidence) | Residual |
|---|---|---|---|
| **S**poofing — browser | stolen session, CSRF | httpOnly SameSite=Lax cookie; token+Origin check on every cookie-authenticated write (`tenant isolation and authorization`); session revoked on member revocation; lockout + dummy scrypt | no MFA; browser-stored approval key |
| S — API keys | leaked key | hashed at rest; scoped role; cannot approve; die with creator (`security: API key stops working…`); minting cannot exceed creator's permissions (`security: developer cannot mint…`) | no key expiry/IP allow-list |
| S — receipts | forged receipt | Ed25519 attestation + explicit trust roots; preimage check; adversarial verifier tests incl. one-char flips and re-signed lies (`packages/verifier/test`) | verifier cannot know the issuer key is honest; fake wallet endpoint (below) |
| **T**ampering — amount/payee substitution | change terms after approval | immutable revisions (DB trigger); intent digest binds amount, invoice hash, payee node key, network, expiry, policy, wallet; revision voids approvals; re-derived at execute (`approvals: terms changed…`, `invoice…: destination substitution`) | UI signs the server-supplied digest (see open items) |
| T — audit log | edit/delete history | per-stream hash chains, append-only trigger, `verify` endpoint & tool; checkpoint signatures in receipts (`flow: audit… edit detected`) | a DB admin who recomputes the chain and holds the issuer key can rewrite history undetected by anyone lacking an earlier receipt/checkpoint |
| **R**epudiation | approver denies approving | Ed25519 signature over `{intent_digest, approver, workspace, time}`; unique per approver/revision; key registered with proof of possession; one key per workspace member (migration 002) | key custody is the approver's browser |
| **I**nfo disclosure | secrets in logs/DTOs | redaction list in logger; connection DTO redacted; webhook secrets listed never; tenant-scoped queries everywhere (`tenant isolation`); other tenants get 404 | preimage/invoices are visible to every role with `audit:read`/payment read (proof material cannot be redacted from a hash-chained log) |
| I — SSRF | webhook or wallet URL to metadata/internal host | https required; IPv4/IPv6 (incl. mapped/NAT64/6to4) range vetting; DNS pinned to the vetted address; no redirects; wallet URL vetted at connect (`security: SSRF`) | `allowPrivateWebhookTargets` is on in development by design |
| **D**oS | slow-drip webhook; request floods | 10 s hard delivery deadline, separate worker loop (`security: webhook… cannot wedge`); 256 KB bodies; IP-keyed rate limits incl. 15/min on sign-in (`security: rate limiting…`) | `/v1/audit/verify` is unbounded; no per-tenant quotas; in-memory limiter is per-process |
| **E**oP | developer → operator | permission subset rule; fail-closed role table; maker≠checker on the *revision author* (`security: maker–checker…`) | roles are coarse |
| E — simulator → "real" | simulator settles as real | distinct `SIMULATED_SETTLED`; state machine refuses; gate refuses simulator in production; verifier `--require-real` | **a tenant can register a fake LND-compatible server and a self-held preimage and obtain a "REAL" receipt**; a preimage proves nothing about a third party when the payer controls the payee. Receipts now carry this limitation; mainnet would need a managed-node allow-list |

## Money-path threats
| Threat | Mitigation / test |
|---|---|
| Duplicate dispatch (concurrent / replays / restarts) | row lock + CAS; `one_open_attempt` partial unique index; reserve→DISPATCHING-committed→call ordering; `20 concurrent executes → 1 send`; `100 payouts × 3 concurrent → 100 sends, 0 doubles` (`load.itest`) |
| Lost response / timeout after the wallet accepted | `UNKNOWN`, not failed; second send refused; reconcile by payment hash (`lost responses…`) |
| Process killed after accept | restart sweeps → `UNKNOWN` → reconcile; real SIGKILL variant in `demo:full` **(real mode, not yet run)**; synthetic stuck-row test passes |
| Stale/inconsistent provider data | success requires `sha256(preimage)==hash` and exact amount; inconsistent ⇒ `UNKNOWN` + critical incident; callbacks are hints that only trigger lookups |
| Wrong network / amount / expired / payee mismatch | decode-and-bind at create, re-checked at execute (`invoice, network, amount, destination`) |
| Revoked approver / policy change after approval | approval counts only if signature valid **and** approver currently active in an approving role; policy change forces re-approval |
| Rolling-limit race | per-workspace advisory lock in reservation (`security: 24-hour limit…` — fails 3/3 without the lock) |
| Rollback mid-write | failpoint inside the reservation tx leaves no intent/audit/state change (`transaction that fails mid-reservation…`) |
| Clock skew | approval `signed_at` must be ISO-Z and within ±5 min; verifier tolerates the same skew |
| Accidental mainnet / test creds reused | mainnet refused at connect, submit and execute; `ORYNT_ENV` mandatory (fails closed); production requires real keys, refuses failpoints/simulator/seed |

## Independent review (2026-11-09) — disposition
Reviewer: a separate read-only code-review agent. **No double-send path, no state change bypassing `cas()`, no cross-tenant access found.** Findings and status: 
**Fixed (with regression tests):** developer→operator key minting (H); webhook worker wedge (H); rate-limit bypass via forged `Authorization` (M); IPv6-mapped SSRF + unvetted LND URL (M); fail-open default environment (M); 24 h limit race (M); non-canonical `signed_at` / strict verifier skew (M); maker-checker bound to current revision author (M); API keys outliving creator (M); approval key shared by two accounts (L); lockout never resetting (L); amount over supply → 500 (L); verifier: checkpoint stream/workspace binding, genesis anchor, non-empty attempts, no simulator exemption (L); HSTS when secure (L); BOLT11 duplicate `x`/`c` fields rejected (L).
**Open / accepted (documented):**
- The approval UI signs the digest supplied by the server without recomputing it from the displayed terms; a compromised server or XSS could show other terms. *Next step:* have the client recompute the digest from decoded invoice + policy digest it fetched separately; use WebAuthn.
- Approval key in `localStorage`; `/v1/me/approval-key` can replace it without step-up.
- `unverifiedPayeeNeedsAdmin` is enforced at approval, not re-checked at execution.
- Verifier: approver keys are not anchored to a registry and policy parameters are self-asserted by the issuer (matters only against a malicious issuer).
- Fake-LND-endpoint "REAL" receipts (above).
- Preimage and invoice visible to all readers; unbounded audit verification; account enumeration through 409/429; `/metrics` exposure if a same-host reverse proxy is used without `ORYNT_METRICS_TOKEN`.
- LND REST behaviour is **unverified against a real node** (this is a correctness *and* security gap: error classification, e.g. which errors prove "not sent", is based on documentation, not observation).

## Supply chain
`pnpm-workspace.yaml` sets a 3-day release-age cooldown (it blocked a freshly-published, unfetchable `rollup` release during this build). Lockfile committed. `pnpm audit --prod --audit-level=high`: *no known vulnerabilities* on 2026-11-09. Not done: SBOM, provenance/attestation, dependency pinning of CI actions by SHA. Generated code: all code in this repository was produced by an AI assistant with test-driven verification and one independent AI review; it has **not** been reviewed line-by-line by a human.

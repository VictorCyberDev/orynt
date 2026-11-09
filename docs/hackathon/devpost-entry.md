# Orynt: Devpost entry (ready-to-paste fields)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Devpost status: NOT SUBMITTED.** Nothing in this file claims a live URL, a recorded video, users, customers or real-network results.
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`; authoritative status in `docs/EXECUTION-REGISTER.md`). Field names follow the usual Devpost project form; check them against the real form when you open it (the form could not be retrieved while signed out).

## 0. How to use this file

1. Resolve the owner decisions in `submission-checklist.md` section A first (eligibility, wallet requirement, name, licence). They can change what you may submit.
2. Choose a **variant** after you know what you could actually run:
   - **Variant A (real regtest run completed and recorded):** keep the text marked `[A]`, delete `[B]`.
   - **Variant B (simulator only):** keep `[B]`, delete `[A]`. The video fallback in `video-script-3min.md` section 7 must match.
3. Replace every `[PLACEHOLDER]`. Delete this section and all bracketed notes before pasting.
4. Do not claim anything that is not in `docs/EXECUTION-REGISTER.md` as verified; update that register first.

## 1. Project name

`Orynt` (working title; trademark and domain clearance not done, see `docs/brand/name-clearance.md`). Mention "working title" in the description.

## 2. Tagline (60 characters or fewer)

Primary (29): `Every payment. Under control.`
Alternative (53): `Authorize once, pay once, prove it: Lightning payouts`

## 3. Elevator pitch (about 200 characters)

Orynt is a control layer in front of your Lightning wallet: signed multi-party approvals, a payout that can be sent only once, honest lost-response handling, and receipts anyone can verify offline. (197)

## 4. Project description (paste into "About the project")

### Inspiration

Organisations that pay people in bitcoin (grant programmes, community groups, small Bitcoin businesses, open-source projects) often keep the obligation in a spreadsheet or chat, the approval in a message, the payment in a wallet screen and the proof in a screenshot. When a wallet's response is lost halfway through a payment, nobody can tell whether the money moved, so people either retry and risk paying twice or stall. We think this is especially costly for small teams in Africa that pay contractors and contributors across borders, but that is a hypothesis from desk research (`docs/business/icp-and-segments.md`), not something we have validated with interviews yet.

### What it does

Orynt is an authorization-to-settlement layer in front of a Lightning wallet you already control. It does not hold funds.

1. **Obligation.** An operator enters a payout: payee, exact amount in integer millisatoshis, BOLT11 invoice. The invoice is decoded and its signature verified; network, amount, expiry and payee node key are bound to an immutable revision. Editing creates a new revision and voids earlier approvals.
2. **Approval.** A policy decides how many approvers are needed (default: one up to 100,000 sats, two above; by default the creator cannot approve their own payout). Approvers sign the exact payment, an Ed25519 signature over an intent digest that binds the revision, amount, network, payment hash, payee key, invoice expiry, policy and wallet connection. Roles are re-checked at execution.
3. **Execution.** A single-use reservation is committed in PostgreSQL, then a durable "dispatching" marker, and only then is the wallet called. Twenty concurrent execute requests produce one wallet send (integration test).
4. **Truthful state.** If the wallet's answer is lost, the payout becomes UNKNOWN, never FAILED, and a second send is refused until the wallet's own record (looked up by payment hash) says what happened. An expired invoice is not treated as proof of failure.
5. **Evidence.** A signed receipt binds the agreement, the signed approvals, the payment preimage (sha256(preimage) = payment hash) and a hash-chained audit segment. A standalone command, `orynt-verify`, checks it offline and rejects tampered, forged, replayed or stale receipts. Simulator receipts are labelled and are rejected by `--require-real`.

[A] Demo: on a local Bitcoin regtest network, `pnpm demo:full` pays 30,000-sat invoices from one LND node to another with a signed approval by someone other than the payout's author, injects a fault so the response is lost after a payment succeeded (Orynt shows UNKNOWN, refuses the duplicate, reconciles from the node's own record), kills the API process right after LND accepted a payment and recovers without a second send, then issues receipts that verify; changing one character makes the verifier reject. `[PLACEHOLDER: link to docs/evidence/demo-real-regtest-<stamp>.md and the receipts; fill only after the run exists]`

[B] Demo: because the real-node run was not completed in time, the demo (`pnpm demo:full:sim`, evidence in `docs/evidence/demo-simulator-*.md`) uses a labelled wallet simulator on real PostgreSQL. The LND adapter is implemented but has not been run against a node. Receipts from this run are labelled SIMULATOR and verify only as "verified-simulated".

### How we built it

TypeScript monorepo (pnpm workspaces, Node 22). `packages/core` holds the domain model: integer-only amounts, a BOLT11 decoder/encoder checked against the BOLT 11 spec vectors, canonical JSON hashing, the state machine, the approval policy, intent digests, the audit hash chain and the receipt schema. `packages/wallets` defines the wallet provider contract with an LND REST adapter and a labelled simulator. `packages/verifier` is the standalone receipt verifier. `apps/api` is a Fastify service on PostgreSQL with contract-first routes (Zod schemas generate the OpenAPI 3.1 document and a typed SDK), idempotency keys, signed webhooks, a reconciler with leases and backoff, and crash-recovery sweeps. State transitions are validated in code and by compare-and-set updates in the database; a partial unique index allows only one open attempt per payment. A deterministic fault-injection facility ("failpoints") drives the lost-response demo and the adversarial tests. A React operations console (served by the API at `/app/`, English with an unreviewed French table; automated browser checks 100/100 at 375, 768 and 1440 px on the simulator) and a static marketing site.

### Challenges we ran into

- Designing the "lost response" path so that nothing can ever move from UNKNOWN back to a send state without evidence from the wallet.
- Making a simulator that cannot be mistaken for the real thing: it can only produce `SIMULATED_SETTLED`, and receipts say so.
- Concurrency: a database connection-pool starvation bug under 20 parallel execute requests had to be fixed (commit `2f099bc`).
- Environment: Docker was unavailable in our build environment, and executing downloaded `bitcoind`/`lnd` binaries was blocked there, so the real-node path was built before it could be run.

### Accomplishments that we're proud of

- 55 integration tests passing on real PostgreSQL with the simulator wallet (8 more real-Lightning tests exist and are skipped until a regtest node runs), including adversarial cases: concurrent duplicate execution, crash between reservation and dispatch, an unreachable node during reconciliation, destination substitution, approval replay, tenant isolation, and 13 regression tests for findings of an independent AI security review. Unit tests: core 24, verifier 26, contract 1. A load check of 100 payouts with 3 concurrent executes each produced 100 sends, 200 refusals, 0 doubles (single machine, not a capacity claim). A backup-restore rehearsal passed. (`docs/EXECUTION-REGISTER.md`, 2026-11-09.)
- A verifier test that mutates the serialized receipt at about 400 positions and requires zero acceptances.
- Honest limits are written into every receipt (`limitations` array), not hidden in documentation.
- [A] A real payment, a real uncertain-response recovery and a real receipt on regtest, with transcript and receipt in the repository. `[PLACEHOLDER: confirm after running scripts/demo-full]`
- [B] A complete, tested control plane whose real-wallet path is implemented and clearly marked as not yet run.

### What we learned

`[PLACEHOLDER: write only things you actually learned, for example from the regtest run or from conversations. Candidates that are already true: idempotency alone does not answer "did the money move?"; the hard part is the state you show while you do not know; a labelled simulator is only useful if the type system refuses to let it look real.]`

### What's next for Orynt

- Run the real-wallet path end to end and keep the transcript in the repo.
- Talk to Bitcoin-native organisations, including at least four based in Africa, using the interview guide in `docs/business/interview-guide.md`; stop if the pain turns out to be rare (the falsification plan is in `docs/research/differentiation-review.md`).
- More wallet adapters (for example Nostr Wallet Connect), LNURL/Lightning-address payees, hardware- or passkey-backed approval keys, mobile-first approval screens, a human security review (the existing threat model rests on one independent AI review).
- Legal review in target jurisdictions before any pilot with real funds; none has been done.

## 5. Built with (only technologies actually in the repository)

TypeScript, Node.js 22, pnpm workspaces, Fastify 5 (`@fastify/cookie`, `@fastify/rate-limit`), PostgreSQL 16 (node-postgres), Zod 4, OpenAPI 3.1 (generated from the Zod contract), `@noble/curves`, `@noble/hashes`, `@scure/base` (Ed25519, SHA-256, bech32), BOLT11 (own codec), Vitest, esbuild, tsx, ESLint, Prettier, LND REST API (adapter implemented; `[A]` run on regtest / `[B]` not yet run against a node), Bitcoin Core regtest `[A only]`, React 19 + React Router 7 + Vite 8 (web console), Playwright and axe-core (browser and accessibility checks), Fontsource Inter / Fraunces / JetBrains Mono.

Do not list: Docker (a `Dockerfile` and compose file exist but were never built or run, no daemon was available), Render/Fly (deploy templates exist, never used), cloud providers (nothing deployed), any AI product as a "technology" unless you want to (see disclosure below).

## 6. Links (fill when real)

| Field | Value |
|---|---|
| Code repository | `[PLACEHOLDER: public GitHub URL]` (must be public and visible logged out) |
| Demo video | `[PLACEHOLDER: video URL]` (UNRENDERED at time of writing) |
| Try it out / live demo | **None.** Nothing is deployed. Leave empty or write "Run locally: see README" |
| Presentation | `[PLACEHOLDER: deck PDF or text]` (deck source in `pitch-deck-source.md`, UNRENDERED) |
| Evidence | `[PLACEHOLDER: docs/evidence/<timestamp>/ in the repo]` |

## 7. Architecture diagram (also needed for the README)

```
 Operator (maker)        Approvers (2)               Operator (executes)
      |  create/submit       |  sign intent digest        |  Idempotency-Key
      v                      v                            v
 +-------------------------------------------------------------------+
 |  Orynt API (Fastify)  - roles, policy, immutable revisions         |
 |  state machine + PostgreSQL (reserve -> DISPATCHING -> outcome)    |
 |  reconciler (lease, backoff) - audit hash chain - webhooks         |
 +----------------------+--------------------------+-----------------+
                        | WalletProvider            | receipt (signed)
                        v                           v
              LND REST (your node) or            orynt-verify (offline)
              labelled SIMULATOR                 tamper / replay / forged checks
                        |
                        v
                  Bitcoin regtest
```

## 8. Technical innovation (candid)

Idempotency keys, maker-checker approvals, state machines and payment lookup by hash are **not novel**; BTCPay Server already separates approval from payment for payouts, and Lightning nodes expose payment lookup by hash (`docs/research/differentiation-review.md`). The contribution we claim is specific and small:

1. **Approval signatures over an intent digest that includes the policy digest and the wallet connection**, verified again at execution against current roles, so that an approval cannot be reused for a different amount, payee, invoice, policy or wallet.
2. **A state machine with no edge from UNKNOWN back to a send state.** The only way out is evidence from the wallet's own record. This is enforced in code and covered by a unit test, plus a database constraint allowing a single open attempt per payment.
3. **A receipt that carries its own evidence** (signed approvals, preimage, audit segment, limitations) with a verifier that has explicit trust-root, replay, freshness and `--require-real` semantics, and that refuses simulator output as proof of payment.

Whether this matters to real users is untested. We compared against competitors from documentation only; "not found" there does not mean "absent".

## 9. Local impact (hypotheses, no invented figures)

- **Primary user (hypothesis):** the person who runs payouts and the people who approve them at a Bitcoin-native organisation: community or meetup groups, grant programmes, open-source projects, small Bitcoin businesses (`docs/business/icp-and-segments.md`, categories C1, C2, C4, C6).
- **Workflow change (hypothesis):** one place for "what do we owe, who approved the exact amount, was it paid once, where is the proof" instead of chat plus spreadsheet plus screenshots.
- **Reach:** not estimated. We have no users, no interviews and no pilots. We refuse to publish a reach number we cannot support. What we will measure first: onboarding completion, time to first authorised payout, exception time-to-resolution, duplicates blocked (per 100 payouts, with sample size), kept separate for regtest/simulator vs real-funds usage (`docs/business/metrics-and-privacy.md`).
- **Not yet built for the African context:** BOLT11 only (no Lightning address/LNURL), no mobile-money or USSD integration, no local-language support beyond an unreviewed French table in the console, no low-bandwidth measurements.
- **Legal:** the regulatory position of a payout-authorization tool in Nigeria, Senegal/UEMOA, Kenya and South Africa is an open question for counsel (`docs/business/legal-regulatory-register.md`). Regtest only until that work is done.

## 10. Security (summary for judges; details in `evaluation-matrix.md` C2)

- **Non-custodial by design.** Orynt holds no keys for funds. The wallet credential should be an LND macaroon limited to `info:read offchain:read offchain:write`; Orynt discovers the permissions it actually has and refuses to send otherwise.
- **Least privilege:** fail-closed role table; API keys can never approve; operators cannot approve; by default the creator cannot approve their own payout (policy `requireDistinctMaker`).
- **Secrets:** wallet credentials and webhook secrets are encrypted at rest with AES-256-GCM bound to their row and never returned by the API; production refuses to start without explicit keys.
- **Inputs:** every route is validated by a Zod schema; amounts are integers; invoices are decoded, checksum- and signature-verified, and bound to network and amount; 256 KiB body limit.
- **Web security:** CSRF token plus origin allow-list for cookie sessions, scrypt password hashes, lockout, rate limits, 404 (not 403) across tenants, SSRF checks on webhook targets and LND URLs, `ORYNT_ENV` mandatory (fails closed); production refuses the simulator, failpoints and the demo seed.
- **Integrity:** append-only audit table plus hash chain with signed checkpoints; tamper-**evident**, not immutable.
- **Logs:** credential, cookie and secret fields are redacted in the logger configuration (not covered by a test).
- **Threat model:** `docs/security/threat-model.md` (STRIDE plus the disposition of an independent **AI** code review: 15 findings fixed with regression tests, open items listed). **No human audit or penetration test.**
- **Open items we state ourselves:** the approval screen signs the server-supplied digest without recomputing it from the displayed terms; the approval key lives in browser `localStorage` (no hardware/passkey backing); a tenant could register a fake LND-compatible server and obtain a "REAL" receipt for a payment it controls on both sides; LND REST behaviour is unverified against a real node; no MFA/SSO.
- **Mainnet:** disabled by default; the default policy only allows regtest.

## 11. Limitations (state them plainly)

1. Not a wallet and not a custodian; the entry may not meet the Overview's "wallet implementation" requirement (organisers asked).
2. Regtest only. No mainnet execution is enabled by default and none was tested.
3. `[B only]` The real Lightning adapter has not been run against a node (its 8 acceptance tests are skipped). `[A]` It has been run only on a local regtest network, and its error classification (which errors prove "not sent") rests on documentation until observed.
4. Approval and limit enforcement is at application level; anyone holding the wallet credential outside Orynt can bypass it.
5. The audit log is tamper-evident, not immutable; a database administrator with the issuer key could write an alternative history. The receipt says so.
6. A receipt proves a payment with a given hash settled with a given preimage. It does not prove delivery of work, the payee's real-world identity, absence of other payments, or legal enforceability, and it is not escrow.
7. BOLT11 invoices only; the BOLT11 decoder is our own code (checked against spec vectors), not a mature library.
8. No hosted demo, no manual or low-bandwidth/performance testing and no human usability testing (automated browser and axe checks only), no user research, no reach estimate. Docker and deploy templates are unverified.
9. "Orynt" is a working title with unresolved trademark risk.

## 12. Disclosures (put in README and, if there is room, here)

- Built by one person with extensive assistance from an AI coding assistant (Claude Code). Commits carry a `Co-Authored-By` trailer. The organisers' rules do not address AI-assisted development; we disclose it anyway. The security review was performed by a separate AI agent, and the threat model states the code has not been reviewed line by line by a human.
- All repository history (15 commits) is dated 2026-11-09 (inside the submission window). `[PLACEHOLDER: owner to add any earlier work or design notes honestly]`.
- Licence: Apache-2.0 (`LICENSE`). `[owner to confirm]`.
- Entry is submitted as an individual, not under a company name. `[owner to confirm]`.

## 13. Gallery images to prepare (UNRENDERED)

1. Architecture diagram (section 7). 2. Payout detail in the UNKNOWN state (indigo, with "what we know / don't know yet"). 3. Verifier output `VERIFIED` and `REJECTED` side by side. 4. The disclosure card ("Regtest / test coins only" or "Simulator"). Use brand assets from `packages/ui/brand/`. Do not use screenshots with secrets, real names or balances.

# Orynt: Devpost entry (ready-to-paste fields, refreshed 2026-11-11)

**Devpost status: NOT SUBMITTED.** Facts below are current as of 2026-11-11 and each claim is followed by an evidence pointer in `[brackets]` (paths are relative to the repository root; the claim-to-evidence map is `docs/hackathon/evidence-index.md`). Anything not listed with a pointer is a plan or a hypothesis and is labelled as such. Delete the bracketed pointers (or keep them, they help judges) and every `[PLACEHOLDER]` before pasting. Field names follow the usual Devpost form; check them against the real form when you open it (the form cannot be retrieved while signed out).

## 0. Before you paste anything

1. **Eligibility first.** On 2026-11-11 the organisers' Manager wrote on the public forum "This hackathon is strictly for students." The Rules tab says participants "should reside in Africa". Only submit if you qualify, or if the organisers confirm in writing that you do (`docs/hackathon/rules-checklist.md`, `docs/hackathon/organizer-inquiry.md`, **not sent**).
2. **Wallet wording.** The Overview lists "At least, a bitcoin/lightning wallet implementation". Orynt is not a wallet. Never call the LND adapter "a wallet implementation"; the track-fit sentence in section 4 is the honest wording.
3. **Default branch.** The public repository's `main` branch currently holds only the baseline README, LICENSE and .gitignore; the project is on branch `claude/busy-goodall-ajeb0p` (draft PR #1). Merge or point the link at the branch, then open it logged out (`submission-checklist.md`).
4. Do not paste the registration ID anywhere public.

## 1. Project name

`Orynt` (working title; trademark and domain clearance is unresolved and the evidence points to conflicts [`docs/brand/name-clearance.md`]). Say "working title" in the description.

## 2. Tagline (60 characters or fewer)

Primary (29): `Every payment. Under control.`
Alternative (53): `Authorize once, pay once, prove it: Lightning payouts`

## 3. Elevator pitch (about 200 characters)

Orynt is a control layer in front of your Lightning wallet: signed multi-party approvals, a payout that can be sent only once, honest lost-response handling, and receipts anyone can verify offline. (197)

## 4. Project description (paste into "About the project")

### Track fit, stated plainly

Orynt is **payout-authorization software that integrates with a Lightning wallet the organisation already runs** (today: a self-hosted LND node over REST). It is **not a wallet**, holds no funds and no wallet keys, and the LND adapter is an integration, not a new wallet implementation. It targets the "Bitcoin/Lightning tooling" side of the brief for organisations that pay people in bitcoin. `[packages/wallets/src/lnd.ts; docs/product/PRODUCT-BRIEF.md]`

### Inspiration

Organisations that pay people in bitcoin (grant programmes, community groups, small Bitcoin businesses, open-source projects) often keep the obligation in a spreadsheet or chat, the approval in a message, the payment in a wallet screen and the proof in a screenshot. When a wallet's response is lost halfway through a payment, nobody can tell whether the money moved, so people retry and risk paying twice, or stall. We think this is especially costly for small teams in Africa that pay contractors and contributors across borders. **That is a hypothesis from desk research, not something validated with users: no interviews, pilots or customers exist.** `[docs/business/icp-and-segments.md; docs/business/README.md; docs/OWNER-REPORT-R2.md section H]`

### What it does

An operator enters a payout, approvers sign it, Orynt sends it exactly once through the wallet, tells the truth when it does not know what happened, and issues a receipt that can be verified offline.

1. **Obligation.** Payee, exact amount in integer millisatoshis and a BOLT11 invoice. The invoice is decoded and its signature verified; network, amount, expiry and payee node key are bound to an immutable revision; editing creates a new revision and voids earlier approvals. `[packages/core/test/bolt11.test.ts (spec vectors); apps/api/test/adversarial.itest.ts]`
2. **Approval.** A policy decides how many approvers are needed (default: one up to 100,000 sats, two above; the creator cannot approve their own payout by default). Approvers sign the exact payment: an Ed25519 signature over an intent digest binding revision, amount, network, payment hash, payee key, invoice expiry, policy and wallet connection. Roles are re-checked at execution. `[packages/core/src/policy.ts, intent.ts; adversarial.itest "operators, viewers, API keys and the maker cannot approve" (passes, run 2026-11-11 on the practice wallet)]`
3. **Execution.** A single-use reservation is committed in PostgreSQL, then a durable "dispatching" marker, and only then is the wallet called. On real LND, 10 concurrent executes produced exactly one payment. `[apps/api/test/lnd.itest.ts "10 concurrent executes against the REAL wallet"; docs/evidence/real-lightning-test-2026-11-11.txt]`
4. **Truthful state.** If the wallet's answer is lost, the payout becomes UNKNOWN, never FAILED; a second send is refused (HTTP 409) until the wallet's own record, looked up by payment hash, says what happened. `[docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.md scenario B]`
5. **Evidence.** A signed receipt binds the agreement, the signed approvals, the payment preimage (sha256(preimage) = payment hash) and a hash-chained audit segment. A standalone command, `orynt-verify`, checks it offline and rejects tampered, forged, replayed or stale receipts; `--require-real` rejects simulator receipts. `[docs/evidence/verifier-real-2026-11-11.txt; packages/verifier/test]`

**What was actually run (real Lightning, regtest only).** On 2026-11-11 `pnpm demo:full` ran against a local Bitcoin Core 29.5 regtest chain with two LND v0.20.1-beta nodes (test coins, no real value) and every assertion passed: a 30,000-sat payout approved by someone other than its author and settled once (the payee's node independently showed the same preimage); a second payout whose response was lost after LND accepted it (a fault **injected by the demo**), shown as UNKNOWN, duplicate refused, reconciled to SETTLED with one LND payment; a third payout where the API process was **SIGKILLed** right after LND accepted it (a failpoint sends the signal to the process itself at that point), restarted, recovered as UNKNOWN and reconciled to SETTLED; receipts that verify with exit 0 under `--require-real`, one changed character rejected (exit 1), no trust root refused (exit 3), replay rejected. `[docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.md (+ .json, .transcript.txt, receipt-real-regtest-2026-11-11T10-26-29-483Z-*.json); earlier identical run 2026-11-10T13-04-03-706Z]` Nothing was run on testnet or mainnet.

### How we built it

TypeScript monorepo (pnpm workspaces, Node 22). `packages/core`: integer-only amounts, a BOLT11 decoder/encoder checked against the BOLT 11 spec vectors, canonical JSON hashing, the state machine, approval policy, intent digests, the audit hash chain and the receipt schema. `packages/wallets`: the wallet provider contract with an LND REST adapter and a labelled simulator that can only produce `SIMULATED_SETTLED`. `packages/verifier`: the standalone receipt verifier. `apps/api`: a Fastify service on PostgreSQL with contract-first routes (Zod schemas generate the OpenAPI 3.1 document and a typed SDK), idempotency keys, signed webhooks, a reconciler with leases and backoff, and crash-recovery sweeps; state transitions are validated in code and by compare-and-set updates, and a partial unique index allows one open attempt per payment. `apps/web`: a React operations console (English, unreviewed French table) served by the API at `/app/`. `apps/site`: an 18-page static product site. Also implemented: LNURL-pay / Lightning Address payees, batch CSV payouts, recurring schedules (drafts only), reports/CSV export, support tickets, TOTP MFA (opt-in per user), plans and entitlements. `[docs/architecture/ARCHITECTURE.md; docs/EXECUTION-REGISTER.md]`

### Challenges we ran into

- Designing the lost-response path so nothing moves from UNKNOWN back to a send state without evidence from the wallet. `[packages/core/src/states.ts; apps/api/test/adversarial.itest.ts]`
- A simulator that cannot be mistaken for the real thing: it can only produce `SIMULATED_SETTLED`, and receipts say so. `[assertTransition in core; docs/evidence/receipt-simulator-*.json]`
- The first real run found defects the simulator could not: LND's REST payment lookup needs padded base64 in the path (unpadded gives HTTP 400, which would have broken every reconcile); the permission check needed an authorization probe instead of `checkpermissions` with a least-privilege macaroon; startup recovery left payouts in DISPATCHING for up to 90 s. All fixed with tests. `[docs/EXECUTION-REGISTER.md row M4]`
- Bitcoin Core 32.1 would not run with LND v0.20.1-beta ("node backend does not support taproot"), so the regtest network is pinned to Core 29.5. `[docs/EXECUTION-REGISTER.md row M2; infra/regtest/versions.env]`
- A connection-pool starvation deadlock under 20 parallel executes, found by the concurrency test and fixed. `[docs/EXECUTION-REGISTER.md "Defects found and fixed"]`

### Accomplishments that we're proud of

- Real Lightning on regtest: 15 real-LND tests pass (decoder vs LND-issued invoices, real payment, duplicate refused by the wallet, lost response, insufficient liquidity, read-only credential, expired invoice, destination/network substitution, 10 concurrent executes, our node restarting mid-uncertainty, payee offline then retry, real LNURL-pay). `[docs/evidence/real-lightning-test-2026-11-11.txt]`
- 102 integration tests on real PostgreSQL (15 of them real-LND), 51 unit tests, 138 browser checks at 375/768/1440 px with axe serious/critical 0, and all six hosted CI jobs green on GitHub, including "real Lightning on regtest" and "browser E2E". `[docs/EXECUTION-REGISTER.md test matrix (re-run 2026-11-10); gh run list: runs 42829777494, 43003470141, 43003477584]`
- A verifier test that mutates the serialised receipt at about 400 positions and requires zero acceptances, and a verifier that refuses simulator output under `--require-real`. `[packages/verifier/test]`
- Honest limits are written into every receipt (`limitations` array), not only into documentation. `[docs/evidence/verifier-real-2026-11-11.txt "This receipt cannot prove"]`

### What we learned

- Idempotency alone does not answer "did the money move?": the hard part is the state you show while you do not know. `[docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.md scenarios B and C]`
- A simulator is only useful if the type system refuses to let it look real, and it is still not a substitute: running against real nodes found three adapter defects in an afternoon. `[docs/EXECUTION-REGISTER.md row M4]`
- Competitor re-verification (documentation only) showed BTCPay Server already has revision-bound payout approval, so "approval before payment" is not our differentiator; the signed intent digest, per-approver signatures and the offline verifier are the untested ones. `[docs/research/competitor-reverification-2026-11.md]`

### What's next for Orynt (plans, not features)

- Talk to Bitcoin-native organisations, including at least four in Africa, with the interview guide; stop if the pain turns out to be rare. `[docs/business/interview-guide.md, thesis-and-falsification.md]` None of this has started.
- More wallet adapters (Nostr Wallet Connect and BTCPay Server adapters exist as packages, contract-tested against local fakes only, not wired into the API and never run against a real wallet or server: `docs/product/nwc-adapter.md`, `docs/product/btcpay-adapter.md`; Core Lightning is not started), hardware- or passkey-backed approval keys, mobile-first approval screens. `[docs/product/wallet-capability-matrix.md]`
- A human security review and counsel review before any real-funds pilot; neither has happened. A real e-mail provider, billing provider and hosting are implemented or templated but **not commissioned**. `[docs/OWNER-REPORT-R2.md sections D, E, F, K]`

## 5. Built with (only technologies in the repository)

TypeScript, Node.js 22, pnpm workspaces, Fastify 5, PostgreSQL 16 (node-postgres), Zod 4, OpenAPI 3.1 (generated from the Zod contract), `@noble/curves`, `@noble/hashes`, `@scure/base` (Ed25519, SHA-256, bech32), BOLT11 (own codec), LND v0.20.1-beta REST API, Bitcoin Core 29.5 (regtest), React 19 + React Router 7 + Vite, Vitest, Playwright and axe-core, esbuild, tsx, ESLint, Prettier, GitHub Actions, Fontsource Inter / Fraunces / JetBrains Mono. `[package.json files; infra/regtest/versions.env; .github/workflows/ci.yml]`

Do not list: Docker as "run and verified locally" (the image builds and starts on GitHub CI only; no Docker daemon was available locally), cloud providers (nothing deployed), Stripe/Paystack/Resend as integrations (webhook parsers and a mail client exist but were never run against a live provider), NWC/BTCPay as supported wallets.

## 6. Links (fill when real)

| Field | Value |
|---|---|
| Code repository | `https://github.com/VictorCyberDev/orynt` (public per the GitHub API, 2026-11-11). **Default branch `main` has only the baseline; the work is on `claude/busy-goodall-ajeb0p` / PR #1.** Merge first or link the branch; check logged out |
| Demo video | `[PLACEHOLDER: upload URL]`. A silent captioned cut was produced locally (`docs/hackathon/video/`), see `video-script-3min.md`; a voice-over was not recorded |
| Try it out / live demo | **None.** Nothing is deployed. Write "Run locally: see README" |
| Presentation | `docs/hackathon/deck/orynt-deck.pdf` (rendered from `pitch-deck-source.md`) |
| Evidence | `docs/evidence/` and `docs/hackathon/evidence-index.md` in the repo |

## 7. Architecture diagram

Rendered at `docs/architecture/orynt-architecture.svg` (Mermaid source and the invariants table in `docs/architecture/ARCHITECTURE.md`). Upload the SVG/PNG as a gallery image.

## 8. Technical innovation (candid)

Idempotency keys, maker-checker approvals, state machines and payment lookup by hash are **not novel**; BTCPay Server already separates approval from payment, and Lightning nodes expose payment lookup by hash. `[docs/research/competitor-reverification-2026-11.md; docs/research/differentiation-review.md]` The contribution we claim is specific and small:

1. **Approval signatures over an intent digest that includes the policy digest and the wallet connection**, re-verified at execution against current roles, so an approval cannot be reused for a different amount, payee, invoice, policy or wallet. `[packages/core/src/intent.ts; adversarial.itest]`
2. **A state machine with no edge from UNKNOWN back to a send state**; the only way out is evidence from the wallet's own record, enforced in code and by a database constraint allowing one open attempt per payment. `[packages/core/src/states.ts; real-node evidence: demo scenarios B and C]`
3. **A receipt that carries its own evidence** (signed approvals, preimage, audit segment, limitations) with a verifier that has explicit trust-root, replay, freshness and `--require-real` semantics. `[docs/evidence/verifier-real-2026-11-11.txt]`

Whether this matters to real users is untested. Comparisons are from documentation only; "not found" there does not mean "absent".

## 9. Local impact (hypotheses, no invented figures)

- **Primary user (hypothesis):** the person who runs payouts and the people who approve them at a Bitcoin-native organisation: community groups, grant programmes, open-source projects, small Bitcoin businesses. `[docs/business/icp-and-segments.md]`
- **Workflow change (hypothesis):** one place for "what do we owe, who approved the exact amount, was it paid once, where is the proof".
- **Reach:** not estimated. No users, interviews or pilots. We will not publish a reach number we cannot support. What we would measure first: onboarding completion, time to first authorised payout, exception time-to-resolution, duplicates blocked per 100 payouts (with sample size), kept separate for regtest/practice vs real-funds usage. `[docs/business/metrics-and-privacy.md]`
- **Not built for the African context yet:** no mobile-money or USSD integration, no local-language support beyond an unreviewed French table, no low-bandwidth measurements (automated checks only). LNURL-pay / Lightning Address payees exist and were verified on regtest. `[docs/product/wallet-capability-matrix.md; docs/EXECUTION-REGISTER.md R2-P3]`
- **Legal:** the regulatory position of a payout-authorization tool in Nigeria, Senegal/UEMOA, Kenya and South Africa has not been reviewed by counsel. `[docs/business/legal-regulatory-register.md]`

## 10. Security (summary for judges)

- **Non-custodial by design.** Orynt holds no funds. The wallet credential should be an LND macaroon limited to `info:read offchain:read offchain:write`; Orynt discovers what the credential can do and refuses to send otherwise. Verified on regtest with a least-privilege and a read-only macaroon. `[docs/product/wallet-capability-matrix.md; lnd.itest "a READ-ONLY credential ... payouts cannot even be submitted"]`
- **Least privilege:** fail-closed role table; API keys can never approve; operators cannot approve; the creator cannot approve their own payout by default. `[adversarial.itest]`
- **Secrets:** wallet credentials and webhook secrets encrypted at rest with AES-256-GCM bound to their row and never returned by the API; production refuses to start without explicit keys. `[docs/security/threat-model.md; security.itest]`
- **Inputs:** every route validated by a Zod schema; integer amounts; invoices decoded, checksum- and signature-verified and bound to network and amount; 256 KiB body limit; SSRF checks on webhook, LNURL and LND URLs. `[adversarial.itest; lnurl.itest]`
- **Web security:** CSRF token plus origin allow-list, scrypt password hashes, lockout, rate limits, 404 (not 403) across tenants; production refuses the simulator, failpoints and the demo seed. `[security.itest]`
- **MFA:** TOTP step-up at sign-in, approve and execute for users who enable it; **opt-in per user, no organisation policy forces it, no WebAuthn, no SSO.** `[docs/security/threat-model-r2-delta.md]`
- **Integrity:** append-only audit table plus hash chain with signed checkpoints; tamper-evident, not immutable. `[demo scenario D: audit hash chains intact (42 entries, 4 streams)]`
- **Logs:** credential, cookie and secret fields are redacted by logger configuration (not asserted by a test). `[apps/api/src/http/app.ts]`
- **Threat model:** `docs/security/threat-model.md` and `threat-model-r2-delta.md`: STRIDE plus an independent **AI** code review whose findings were fixed with regression tests. **No human audit and no penetration test.**
- **Open items we state ourselves:** the approval key lives in browser storage; the approval screen signs a server-supplied digest; a tenant that registers a fake LND-compatible endpoint and holds both ends can still obtain a "REAL" receipt (receipts say so); Orynt enforces approvals, the wallet does not, so anyone holding the wallet credential can bypass Orynt. `[docs/security/threat-model.md; verifier output "This receipt cannot prove"]`
- **Mainnet:** disabled by default; the default policy allows regtest only; never run. `[docs/product/wallet-capability-matrix.md]`

## 11. Limitations (state them plainly)

1. Not a wallet and not a custodian. The entry may not satisfy the Overview's "wallet implementation" line; the organisers have not answered.
2. **Regtest only.** No testnet run, no mainnet run, no real funds ever.
3. Only LND is verified (v0.20.1-beta with Bitcoin Core 29.5). Not verified: other LND versions, hosted/remote LND, Tor, routing conditions regtest cannot produce (probabilistic failures, MPP/AMP, long-held HTLCs).
4. NWC and BTCPay adapters are contract-tested against local fakes only, not wired into the API, never run against a real wallet or server (`docs/product/nwc-adapter.md`, `btcpay-adapter.md`); Core Lightning is not started. No claim of support.
5. Approval and limit enforcement is application-level; the wallet credential can bypass it.
6. The audit log is tamper-evident, not immutable; a database administrator holding the issuer key could write an alternative history. The receipt says so.
7. A receipt proves a payment with a given hash settled with a given preimage. It does not prove delivery of work, the payee's identity, absence of other payments or legal enforceability, and it is not escrow.
8. BOLT11 decoding is our own code checked against spec vectors and against LND-issued invoices (regtest), not a mature library.
9. No hosted demo; no human usability testing, no manual screen-reader test, no low-bandwidth measurements; no human security audit; no counsel review.
10. No customers, users, revenue or partners. Real e-mail delivery, live billing and hosting are **not commissioned**. Plans and prices on the site are hypotheses.
11. "Orynt" is a working title with unresolved trademark risk.

## 12. Disclosures

- Built by one person with extensive assistance from an AI coding assistant (Claude Code); commits carry a `Co-Authored-By` trailer. The organisers' rules do not address AI-assisted development; we disclose it anyway. The security review was performed by a separate AI agent; the code has not been reviewed line by line by a human. `[git log; docs/security/threat-model.md]`
- Repository history begins 2026-11-09 (inside the submission window). `[PLACEHOLDER: owner to add any earlier work or design notes honestly]`
- Licence: Apache-2.0 (`LICENSE`). `[owner to confirm]`
- Entry is submitted as an individual, not under a company name. `[owner to confirm]`

## 13. Gallery images

1. Architecture diagram: `docs/architecture/orynt-architecture.svg`. 2. UNKNOWN payout screen (indigo, "what we know / don't know yet"): `docs/hackathon/video/frames/ui/08-unknown-send-disabled.png` (real regtest). 3. Settled payout: `.../07-settled-real.png`. 4. Verifier `VERIFIED` and `REJECTED`: `docs/hackathon/video/frames/term/` text or rendered frames in `docs/hackathon/video/frames/`. 5. Deck slides: `docs/hackathon/deck/`. Do not use screenshots with secrets, real names or balances.

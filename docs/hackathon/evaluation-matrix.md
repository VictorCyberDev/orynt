# Orynt: judging-criteria evaluation matrix (Dakar Bitcoin Hack 2026)

**Devpost status: NOT SUBMITTED.** Deadline 2026-11-20 20:00 UTC (21:00 WAT), re-verified 2026-11-11 (`rules-checklist.md`).

> **Status update 2026-11-11 (supersedes the R1-era wording below).** Real Lightning on regtest is now **verified**: `pnpm test:real-lightning` 15/15 pass and `pnpm demo:full` passes every assertion against Bitcoin Core 29.5 + two LND v0.20.1-beta nodes, including a real SIGKILL of the API after LND accepted a payment (`docs/evidence/`, `evidence-index.md`). Counts from the 2026-11-10 register run: integration **102 pass, 0 skipped** (with the regtest env), unit **51** (core 24, verifier 26, contract 1), browser E2E **138/138**, six hosted CI jobs green. Wherever the text below says `PENDING-REAL`, "never run against a node", "8 tests, all skipped", "55 pass, 8 skipped" or "E2E 100/100", read the figures above instead: those statements describe the earlier state and are kept only for history. Still true and still open: no testnet or mainnet run, only LND verified, no human audit, no users, no hosting, eligibility ("Students only", confirmed by the organisers' Manager on the forum 2026-11-11) and the wallet-requirement question are unresolved.

Purpose: map every judging criterion found in `docs/hackathon/rules-checklist.md` (Rules tab `R`, Overview `O`) to concrete Orynt features, file paths and test names, say how a judge can verify each in under 5 minutes, and list weak spots honestly. Weights are **not published** anywhere (checklist section 4), so nothing here is a score prediction.

## 0. Evidence labels used in this file

| Label | Meaning |
|---|---|
| `SIM-TESTED` | Passes in the integration suite on real PostgreSQL with the **labelled simulator** wallet. `docs/EXECUTION-REGISTER.md` (2026-11-09): **55 passed, 8 skipped** (adversarial 32, security-regression 13, ops 7, load 1, flow 2; the 8 skipped are the real-LND tests in `lnd.itest.ts`). I re-ran an earlier 41-test state myself at 15:01 UTC. Browser E2E `node apps/web/e2e/run.cjs`: 100/100 (also simulator wallet). |
| `UNIT` | Passes as a unit test. Register: core 24, verifier 26 (incl. built-CLI exit codes 0/1/2/3/4 and replay ledger), contract 1. |
| `CODE-ONLY` | Implemented; no test exercises it against the real counterpart. |
| `PENDING-REAL` (historical label; now **REGTEST-VERIFIED**, see the status update above) | Needed a real regtest run. **To be verified by running `pnpm regtest:fetch && pnpm regtest:up && pnpm demo:full` on the owner's machine.** The scripts exist (`infra/regtest/*`, `scripts/demo-full.ts`) but have never been executed against real nodes: the build sandbox refused to run the downloaded binaries. `pnpm test:real-lightning` (`apps/api/test/lnd.itest.ts`) is 8 tests, all skipped. |
| `IN-PROGRESS` | Present in the working tree, uncommitted, not verified by me (currently only screenshot refreshes). |
| `NOT-BUILT` | Does not exist. |

Counts come from `grep` of `it(` blocks plus the runs above. "Pass" means the run output I saw, not a claim about other machines.

## 1. Gating items that sit above the criteria (owner decisions)

These are not scoring criteria; they decide whether the entry can be judged at all. Full text in `submission-checklist.md` section A.

1. **Eligibility conflict** (`R`: "should reside in Africa" vs `O`: "Students only", companies excluded). Unresolved. Not something code can fix.
2. **Wallet requirement** (`O`: "At least, a bitcoin/lightning wallet implementation"). Orynt is **not a wallet**: it never holds keys or balances for funds. It contains a payer-side wallet *adapter* (LND REST) and a simulator. Unresolved.

## 2. Criterion by criterion

### C1. Usefulness & Local Impact (`O` criterion 1; `R` "Usefulness and social impact")

`O` asks for: a real, well-scoped local problem; the primary user; how it changes their daily workflow; an **estimate of reach** (e.g. merchants served per week).

- **What Orynt offers.** Problem and workflow change are written down: `docs/product/PRODUCT-BRIEF.md` ("The problem", items 1-5). Primary user hypotheses: payout operator and approver at Bitcoin-native organisations (`docs/business/icp-and-segments.md` section 1 and category C6 "Community and meetup/ecosystem organisations in emerging markets").
- **Evidence status.** HYPOTHESIS only. `docs/business/README.md` states "Validated: nothing" (no interviews, pilots, customers). `docs/business/market-model.md` deliberately states no market size.
- **Judge check (2 min).** Read the brief's "The problem" and `icp-and-segments.md` sections 1-2; note the explicit "hypothesis" labels. The interview plan is `docs/business/interview-guide.md` (includes at least 4 interviewees based in Africa).
- **Weak spots (be upfront).**
  - **No reach estimate** and no African user evidence. Do not invent one. The honest substitute is the measurement plan in `docs/business/metrics-and-privacy.md` and the 20-interview plan.
  - BOLT11 invoices only. No LNURL/Lightning address, no mobile-money or USSD integration, no fiat off-ramp. Nothing Africa-specific is built apart from an unreviewed French UI string table in the console (`apps/web/src/i18n.tsx`, marked "unreviewed" in its own comment).
  - Legal/regulatory questions for Nigeria, Senegal/UEMOA, Kenya and South Africa are all `NOT STARTED` (`docs/business/legal-regulatory-register.md`).

### C2. Security by Design (`O` criterion 2; `R` "Security by design")

`O` lists: minimal attack surface, **threat model**, least-privilege access, safe secret handling, validated inputs, no PII in logs, proven Bitcoin/Lightning libraries, secure defaults.

| `O` element | What exists | Where | Evidence |
|---|---|---|---|
| Threat model | STRIDE analysis plus an independent **AI** code-review disposition: 15 findings fixed with regression tests, open items listed. Not a human audit or pen test | `docs/security/threat-model.md` | Document exists; fixes covered by `apps/api/test/security.itest.ts` (13 tests) |
| Least privilege | Fail-closed role matrix; operators cannot approve; API keys can never approve (DB `CHECK` on `api_keys.role`) | `packages/core/src/roles.ts`; `apps/api/src/db/migrations/001_init.up.sql` | `UNIT` "roles > fails closed"; `SIM-TESTED` "operators, viewers, API keys and the maker cannot approve" |
| Least-privilege wallet credential | Capabilities are discovered, not assumed; LND `checkpermissions` for `offchain:write`/`offchain:read`; stale (>24 h) or send-incapable connections block execution; routing fee capped at 1% of amount (min 1000 msat); `max_parts: 1` | `packages/wallets/src/lnd.ts` (`discoverCapabilities`, `sendPayment`); `apps/api/src/services/execution.ts` (`gate`, `FEE_LIMIT_PPM`) | `SIM-TESTED` "no wallet connected → clear refusal; read-only wallet credential → blocked; stale capability list → blocked"; real LND behaviour `PENDING-REAL` |
| Safe secret handling | Wallet credentials and webhook secrets sealed with AES-256-GCM, additional data bound to the row; secrets never returned by the API; production refuses to start without `ORYNT_SECRET_KEY` and `ORYNT_ISSUER_KEY` | `apps/api/src/lib/box.ts`; `apps/api/src/config.ts` | `SIM-TESTED` "secrets are never returned: connections redact credentials", "webhook secrets are stored encrypted and never listed". **Dev defaults are derived from public constants in source; never use them for funds** |
| Validated inputs | Zod schemas drive validation, OpenAPI and the SDK; 256 KiB body limit; BOLT11 signature, network, amount and expiry checks; amounts are integer msat only | `packages/contract/src/{routes,schemas}.ts`; `apps/api/src/http/app.ts`; `packages/core/src/{amount,bolt11}.ts` | `SIM-TESTED` "rejects garbage, tampered and wrong-network invoices", "malicious input: injection strings, oversized bodies, bad ids, hostile names"; `UNIT` "amounts > never accepts floats or negatives" |
| Authn/session hardening | scrypt password hashes, lockout after 5 failed sign-ins, CSRF token plus origin allow-list for cookie sessions, rate limits | `apps/api/src/lib/password.ts`, `services/auth.ts`, `http/app.ts` | `SIM-TESTED` "unauthenticated, bad CSRF, bad origin and viewer writes are refused", "rate limiting protects sign-in" |
| Tenant isolation | Cross-workspace reads/approvals/receipts return 404, not 403 | `apps/api/src/services/*` (org-scoped queries) | `SIM-TESTED` "another workspace cannot read, approve, execute, or fetch receipts for these payouts (404, not 403)" |
| SSRF | Webhook targets resolved and vetted; private, loopback, link-local and metadata addresses refused in production mode | `apps/api/src/lib/ssrf.ts` | `SIM-TESTED` "SSRF: private, loopback, link-local and metadata targets are refused in production mode" |
| No PII in logs | Log redaction paths for `authorization`, `cookie`, `set-cookie`, macaroon, passwords, TLS cert, secrets | `apps/api/src/http/app.ts` (pino `redact`) | `CODE-ONLY`. No test asserts log contents; the ops test named "...redacted logging config..." checks health, request id, problem+json and OpenAPI only |
| Tamper evidence | Append-only trigger plus hash-chained audit log with signed checkpoints | `001_init.up.sql` (`audit_events_append_only`); `packages/core/src/audit-chain.ts` | `SIM-TESTED` "audit hash chains verify, and an out-of-band edit is detected"; `UNIT` "audit chain > verifies an intact chain and detects edits, deletions and reordering" |
| Proven libraries | Cryptography uses `@noble/curves`, `@noble/hashes`, `@scure/base`; payment goes through LND | `packages/core/package.json` | see weak spots |

- **Judge check (3 min).** Open `packages/core/src/states.ts` (illegal transitions are rejected before the DB sees them), then `apps/api/src/services/execution.ts` `gate()` (every precondition re-derived at execution time), then run `pnpm test:integration -t "approvals"`.
- **Weak spots.**
  - **No human security audit or penetration test** (the threat model says so; the review was an independent AI agent). Open items it lists: the approval UI signs the server-supplied digest without recomputing it from displayed terms; approval key in `localStorage` and replaceable without step-up; `unverifiedPayeeNeedsAdmin` not re-checked at execution; verifier approver keys not anchored to a registry.
  - **A tenant can register a fake LND-compatible server plus a self-held preimage and obtain a "REAL" receipt** (threat model, open item). Receipts carry this limitation; a preimage proves nothing about a payee the payer controls.
  - **Custom BOLT11 decoder/encoder** (`packages/core/src/bolt11.ts`, `bolt11-encode.ts`), not a mature library. Mitigation: checked against BOLT 11 spec vectors (`packages/core/test/bolt11.test.ts`, 8 tests) and LND validates the invoice again when paying. The criterion says "prefer proven libraries", so say this plainly.
  - **Approval key is not hardware-backed.** In the console it lives in browser `localStorage` (`apps/web/src/keys.ts`, comment: "a stolen browser profile could sign"). The server only stores public keys; it never sees the private key.
  - **Enforcement is application-level.** Anyone holding the wallet macaroon outside Orynt bypasses approvals. The LND credential should be a baked macaroon limited to `info:read offchain:read offchain:write`.
  - LND `rest_url` is now SSRF-vetted at connection time (`services/admin.ts` calls `vetWebhookTarget`; private addresses allowed only outside production). Fixed by the security review. Still: the simulator/failpoints cannot run in production, so a *public* instance cannot demo payments (`deployment-plan.md`).
  - Audit log is tamper-**evident**, not immutable (a DB admin can rewrite rows).
  - No MFA, no SSO.

### C3. UX/UI Quality (`O` criterion 3; includes the "mobile use" requirement)

`O` asks for fast, frictionless flows on **low bandwidth and mid-range phones**, clear labels, helpful errors, accessible contrast/size, simple copy free of jargon.

- **What exists.**
  - Plain-language errors and next-step explanations are in the core, not just the UI: `packages/core/src/states.ts` `stateActions()` returns a human reason for every disabled action (e.g. "Sending again is blocked: the first attempt may already have paid. Orynt must check the wallet's own record first."); the API returns RFC 9457 `problem+json` with `detail` and a `known/unknown` explanation on unresolved payments.
  - Design tokens encode a UX decision: uncertain = indigo, proven failure = red, never red for "unknown" (`packages/ui/tokens.css`).
  - Web console (`apps/web/src/pages/*`: Overview, Payouts, NewPayout, PayoutDetail, Approvals, Incidents, Connections, Activity, Team, Developers, Settings, Guide, VerifyReceipt, Auth) and English/French string tables. Register M5: `node apps/web/e2e/run.cjs` passes **100/100** checks (sign-in redirect, approval incl. key setup, send, receipt, a11y via axe, overflow) at 375, 768 and 1440 px; screenshots in `docs/evidence/screenshots/`. Simulator wallet; automated only.
- **Judge check (3 min).** Start the seeded simulator server (`ORYNT_ENV=development ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start` after `pnpm build:all`), open `/app/`, sign in as `demo-owner@orynt.local` / `demo-password-123`, look at the UNKNOWN payout; or open `docs/evidence/screenshots/375/` and `1440/05-payout-unknown-signature-moment.png`. Throttled-network behaviour is not measured.
- **Weak spots (this is the weakest criterion).**
  - No payload-size or Lighthouse measurement, no manual screen-reader or human usability test, no test on a real phone (the register says "no manual screen-reader or human usability testing"). Automated axe and viewport checks only. Do not claim "optimised for low bandwidth".
  - `pnpm test:e2e` still names `apps/web/e2e/run.mjs`; the real file is `run.cjs` (call it directly).
  - French is unreviewed machine-written text (stated in `i18n.tsx`). No Wolof or other local language.
  - Approval signing happens in the browser; no native or installable mobile experience.

### C4. Working MVP (`O` criterion 4; `R` "A MVP accessible through internet (or a demo video)")

`O`: end-to-end demo that actually runs; **one-command setup (Docker or script), seed data, testable happy path; avoid mockups when a minimal integration is possible**.

- **What exists.**
  - End-to-end happy path on real PostgreSQL with the labelled simulator: `apps/api/test/flow.itest.ts` "create → submit → approve → execute → SIMULATED_SETTLED → receipt verifies as VERIFIED_SIMULATED" (`SIM-TESTED`).
  - Real Lightning adapter: `packages/wallets/src/lnd.ts` calls `GET /v1/getinfo`, `POST /v1/macaroon/checkpermissions`, `POST /v2/router/send`, `GET /v2/router/track/{hash}`. Implemented; **since run against real LND on regtest** (15 real-LND tests, `demo:full`).
  - Payee-side regtest helpers for the demo: `packages/wallets/src/lnd-dev.ts` (`lndAddInvoice`, `lndLookupInvoice`, `lndChannelBalance`).
- **Scripts that now exist.** `pnpm regtest:fetch` (`infra/regtest/fetch.sh`, SHA-256 pinned), `pnpm regtest:up` / `down` (`infra/regtest/up.mjs`, `down.mjs`), `pnpm demo:full` (`scripts/demo-full.ts`, real regtest mode, **run 2026-11-10 and 2026-11-11, all assertions pass**), `pnpm demo:full:sim` (labelled SIMULATOR mode, **verified end to end**; evidence `docs/evidence/demo-simulator-2026-11-09T15-28-43-507Z.md`), seed `apps/api/src/seed.ts` (simulator-only, `ORYNT_SEED_DEMO=1`), `pnpm build:all`, `pnpm start`, `Dockerfile`, `infra/docker-compose.yml`, `infra/deploy/{render.yaml,fly.toml}` (the container and deploy files are **UNVERIFIED**: no Docker daemon).
- **Judge check (5 min).** `pnpm install && pnpm db:start && pnpm demo:full:sim` (the whole story, labelled SIMULATED) and `pnpm test:integration` (needs Node 22, pnpm 10.28, a local PostgreSQL 16 cluster; `db:start` uses `pg_lsclusters`, so elsewhere set `DATABASE_URL`/`TEST_ADMIN_DATABASE_URL`). The real path is `bash infra/regtest/fetch.sh && node infra/regtest/up.mjs && pnpm demo:full` (see `demo-runbook.md`; run successfully 2026-11-11).
- **Weak spots.**
  - The criterion says avoid mockups when integration is possible. Today the wallet in every automated test is a simulator (a mock). The real path is the single most important thing to run before submission.
  - No hosted URL. `R` allows a demo video instead.
  - Seed data is simulator-only and labelled "SEED DATA"; the real-regtest demo creates its own demo workspace inside `demo-full`.

### C5. Clear Pitch & Docs (`O` criterion 5; `R` "A clear pitch")

`O`: 3-minute demo (problem → solution → impact → next steps); README with setup, architecture diagram, constraints, metrics to track and what ships next.

- **What exists.** Script, storyboard and captions: `video-script-3min.md`, `captions.en.srt`; a silent captioned cut is rendered at `video/orynt-demo-silent-captioned.mp4` (no voice-over, not uploaded). Deck source `pitch-deck-source.md`, rendered to `deck/orynt-deck.pdf` (2026-11-11). Product brief, competitor matrix, differentiation review, business docs.
- **Weak spots.**
  - Root `README.md` has been expanded (~50 lines: status, two-minute simulator start, scripted story). Check it against the `O` list (setup, architecture diagram, constraints, metrics to track, next iteration) before submission. Source material: `devpost-entry.md` and `docs/business/metrics-and-privacy.md`. `docs/architecture/` and a developer quickstart were added in commit `49219b8` (not re-read here).
  - `docs/EXECUTION-REGISTER.md` is now the authoritative status table (VERIFIED / PARTIAL / BLOCKED per milestone). Keep it current; it must be updated after the real run.
  - Video not recorded; no real-regtest evidence yet.

### C6. Originality (`R`: "originality")

- **Candid position** (`docs/research/differentiation-review.md`): idempotent execution, maker-checker and BOLT11 payout batches are **not novel**; BTCPay Server pull payments/payouts already separate approval from payment. The claimed contribution is the combination, specifically:
  1. Approvals are Ed25519 signatures over an *intent digest* that binds revision hash, amount, network, payment hash, payee node key, invoice expiry, policy digest and wallet connection (`packages/core/src/intent.ts`). Editing any bound field changes the digest (`UNIT` "intent digest and approvals > changes when ANY bound field changes").
  2. A truthful UNKNOWN state: no legal transition from UNKNOWN to any send state (`UNIT` "state machine > has no path from UNKNOWN back to a send state (no blind retry)"); only a provider record found by payment hash moves it on.
  3. Receipts that bundle approvals, preimage and an audit segment and are checked offline by a standalone CLI with trust-root, replay and `--require-real` semantics (`packages/verifier`).
- **Weak spots.** The comparison matrix rests on documentation "not found", not on product testing (the review says so). An incumbent could add approvals as a plugin. Nothing is validated with users.

### C7. Technicality (`R`: "the technicality")

Concrete mechanisms a judge can read:

| Mechanism | File | Test |
|---|---|---|
| Reserve-then-dispatch in three committed phases; durable `DISPATCHING` marker committed **before** the wallet call | `apps/api/src/services/execution.ts` (`executeObligation` phases 1-3) | `SIM-TESTED` "process killed after DISPATCHING marker..." |
| DB-enforced single open attempt per payment intent (partial unique index `one_open_attempt`) and row-locked compare-and-set transitions | `001_init.up.sql:213`; `services/state.ts` | `SIM-TESTED` "20 concurrent execute requests with different keys produce exactly ONE wallet send" |
| Idempotency-Key table; required on execute | `http/app.ts` | `SIM-TESTED` "same Idempotency-Key replays the original response and does not send twice", "requires an Idempotency-Key on execute" |
| Settlement only with a preimage that hashes to the invoice payment hash and the approved amount; otherwise critical incident | `execution.ts` `applyRecord` | `SIM-TESTED` "inconsistent provider answer (success with a wrong preimage) never settles; critical incident opened"; `UNIT` "SETTLED needs a verified preimage and a real provider; simulator can never settle" |
| Reconciler with lease, backoff and startup recovery sweeps | `services/reconcile.ts`; `worker.ts` | `SIM-TESTED` "two reconcilers cannot run at once (lease)", "restart recovery: a stuck DISPATCHING row becomes UNKNOWN on startup sweep" |
| "Confirm not sent" requires fresh `NOT_FOUND` **and** expired invoice **and** grace period | `reconcile.ts` `confirmNotSent` | `SIM-TESTED` "confirm-not-sent works only with a fresh NOT_FOUND AND an expired invoice AND grace elapsed" |
| Deterministic fault injection for demos and tests | `apps/api/src/lib/failpoints.ts` (refused in production by `config.ts`) | used by adversarial suite |
| Contract-first API: Zod to OpenAPI 3.1 (`GET /v1/openapi.json`), typed SDK | `packages/contract`, `packages/sdk` | `UNIT` "openapi > builds every route with unique operationIds and problem responses" |
| Signed, at-least-once webhooks with replay protection | `services/webhooks.ts` | `SIM-TESTED` "delivers signed, at-least-once events; receiver verifies and dedupes by event id; failures retry" |
| Migrations with checksum drift detection and rollback | `db/migrate.ts` | `SIM-TESTED` "up → down → up rehearsal...", "a failing migration rolls back completely..." |

Weak spot: all of the above is proven against the simulator. The LND error mapping (`AlreadyExistsError`, `NotSentError`, `OutcomeUnknownError` in `lnd.ts`) is `CODE-ONLY` until run against a node; the string matching on LND error messages may differ by LND version.

### C8. Wallet implementation (`O` submission list: "At least, a bitcoin/lightning wallet implementation")

- **Position.** Not a wallet. Orynt "does not custody funds" (brief). It has: a provider contract (`packages/wallets/src/types.ts` `WalletProvider`: `getInfo`, `discoverCapabilities`, `sendPayment`, `lookupPayment`), an LND REST adapter (verified on regtest) and a simulator. No key generation for funds, no receive/invoice flow in the product (invoices are created on the payee node by test/demo helpers only), no on-chain, no balance management.
- **Do not** describe the adapter as "a wallet implementation" in submission text unless the organisers say that satisfies the requirement. **Do not** start building a wallet to patch this in the remaining time: it contradicts the non-custodial design and would be unreviewed code handling keys.
- **Status: UNRESOLVED, owner decision.** Draft email in `submission-checklist.md` section A.

### C9. Public repo and open source (`R`: "A public github repo"; `O`: "results are open-source")

- `LICENSE` (Apache-2.0) at the repo root; every `package.json` declares `"license": "Apache-2.0"`. Note `docs/business/pricing-hypotheses.md` says the licence is "not yet decided", so the owner must confirm Apache-2.0 is intended.
- Repo visibility and remote were not checked by me. Judge check: open the repo logged out; `git log --oneline` shows 15 commits, all dated 2026-11-09, i.e. inside the submission window opened 2026-10-26. Pre-existing-work rules are not stated by the organisers.
- Disclose AI assistance in the README and Devpost text (the rules are silent; disclosure is the safe default). Commits carry a `Co-Authored-By: Claude` trailer.

### C10. MVP via internet or demo video (`R`)

- No live URL (nothing deployed). Demo video: script/captions/storyboard exist; **video not rendered**. See `video-script-3min.md` and `deployment-plan.md`.

### C11. Build in public (`O`: "to build in public and to communicate")

- Not started as far as the repository shows. No platform or frequency is required by any retrieved page. Plan in `submission-checklist.md`. Do not post vote-solicitation; do not claim users or traction.

## 3. How a judge verifies in under 5 minutes

**Tier 0, 2 minutes, nothing installed.** Open: `docs/product/PRODUCT-BRIEF.md` (claims and honest limits), `packages/core/src/states.ts` (state machine), `apps/api/src/services/execution.ts` (execution phases), then scan test titles in `apps/api/test/adversarial.itest.ts`.

**Tier 1, about 5 minutes, Node 22 + pnpm 10.28 + local PostgreSQL 16.** Simulator only. Counts are from the register (2026-11-09).

```bash
pnpm install
pnpm db:start                      # script exists; Debian/Ubuntu pg_lsclusters only. Otherwise export DATABASE_URL and TEST_ADMIN_DATABASE_URL
pnpm test:integration              # 102 pass with ORYNT_REGTEST_ENV set; otherwise the 15 real-LND tests are skipped
pnpm --filter @orynt/verifier test # 26 tests incl. tamper sweep and built-CLI exit codes
pnpm --filter @orynt/core test     # 24 tests
pnpm demo:full:sim                 # whole story, labelled SIMULATED; writes docs/evidence/demo-simulator-*.md
# one scenario at a time (argument forwarding checked on the API integration suite):
pnpm --filter @orynt/api test:integration -t "response lost AFTER the wallet accepted"
pnpm --filter @orynt/api test:integration -t "20 concurrent execute requests"
```

**Tier 2, real Lightning on regtest (done 2026-11-11).** `bash infra/regtest/fetch.sh && node infra/regtest/up.mjs && pnpm test:real-lightning && pnpm demo:full`. Details and what each prints: `demo-runbook.md`.

## 4. Consolidated weak spots, ranked by risk to the score

1. **Gating rules (eligibility, wallet requirement)**: could disqualify regardless of quality.
2. **Real evidence is regtest only**: real LND payments on a local regtest chain are verified; testnet and mainnet are not, and only LND was exercised. The `O` criterion says avoid mockups: the demo uses none for the payment path.
3. **UX/mobile/low-bandwidth**: automated checks only (E2E 138/138, axe, 3 viewports); no performance measurement or human testing.
4. **Local impact and reach**: no African user evidence, no reach estimate, BOLT11-only.
5. **Docs**: root README must be checked against the required sections; threat model exists but is AI-reviewed only.
6. **No hosted URL**; video not rendered.
7. **Security caveats** (custom BOLT11 codec, browser-held approval key, app-level enforcement, fake-LND "REAL" receipt gap, LND behaviour unverified against a real node, no human audit).
8. **Name**: "Orynt" has unresolved trademark risk (`docs/brand/name-clearance.md`: a possible identical pending application and near-identical software marks, unverified). Disclose as a working title.

## 5. Defects and gaps (status after reconciliation with HEAD `78990af`)

| # | Finding | Status |
|---|---|---|
| 1 | Built verifier had a double shebang and could not start | **Fixed.** `node packages/verifier/dist/orynt-verify.mjs` works after `pnpm --filter @orynt/verifier build`; CLI exit codes covered by tests |
| 2 | `pnpm build` failed at `@orynt/api` (no `build.mjs`) | **Fixed.** `apps/api/build.mjs` exists; `pnpm build:all` builds verifier, sdk, web, site, api. Not re-run by me |
| 3 | `regtest:*`, `demo:full`, `db:seed` pointed to missing files | **Fixed** (files exist). `pnpm test:e2e` still names `run.mjs`; the file is `run.cjs` |
| 4 | LND `rest_url` not SSRF-vetted | **Fixed** by the security review (regression test in `security.itest.ts`) |
| 5 | Web console, site, ops tests untracked | **Committed** |
| 6 | Failpoint state is process-global, not per workspace | Open; irrelevant unless a shared sandbox is hosted (failpoints are refused in production anyway) |
| 7 | Real LND path never executed; error classification rests on documentation | **Closed for regtest (2026-11-10/11).** Three adapter defects were found and fixed by the first real run (register M4). Still open: other LND versions, testnet/mainnet |
| 8 | Fake-LND-endpoint "REAL" receipt | Open, documented in the threat model |

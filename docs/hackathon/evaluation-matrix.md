# Orynt: judging-criteria evaluation matrix (Dakar Bitcoin Hack 2026)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Devpost status: NOT SUBMITTED.**
Written 2026-11-09 against working tree at HEAD `2f099bc` plus uncommitted files (see section 5). Deadline 2026-11-20 20:00 UTC (21:00 WAT).

Purpose: map every judging criterion found in `docs/hackathon/rules-checklist.md` (Rules tab `R`, Overview `O`) to concrete Orynt features, file paths and test names, say how a judge can verify each in under 5 minutes, and list weak spots honestly. Weights are **not published** anywhere (checklist section 4), so nothing here is a score prediction.

## 0. Evidence labels used in this file

| Label | Meaning |
|---|---|
| `SIM-TESTED` | Passes in the integration suite on real PostgreSQL with the **labelled simulator** wallet. I ran `pnpm test:integration` on 2026-11-09 at 15:01 UTC in the build sandbox: 3 files, **41 passed** (adversarial 32, flow 2, ops 7). `ops.itest.ts` is uncommitted. |
| `UNIT` | Passes as a unit test. I ran `core` (24 passed), `verifier` (18 passed) and `contract` (1 passed) on 2026-11-09. |
| `CODE-ONLY` | Implemented; no test exercises it against the real counterpart. |
| `PENDING-REAL` | Needs a real regtest run. **To be verified by running `scripts/demo-full` on the owner's machine.** The script and `infra/regtest/*` do not exist yet. |
| `IN-PROGRESS` | Present in the working tree, uncommitted, not verified by me. |
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
  - BOLT11 invoices only. No LNURL/Lightning address, no mobile-money or USSD integration, no fiat off-ramp. Nothing Africa-specific is built apart from an unreviewed French UI string table in the console (`apps/web/src/i18n.tsx`, `IN-PROGRESS`, marked "unreviewed" in its own comment).
  - Legal/regulatory questions for Nigeria, Senegal/UEMOA, Kenya and South Africa are all `NOT STARTED` (`docs/business/legal-regulatory-register.md`).

### C2. Security by Design (`O` criterion 2; `R` "Security by design")

`O` lists: minimal attack surface, **threat model**, least-privilege access, safe secret handling, validated inputs, no PII in logs, proven Bitcoin/Lightning libraries, secure defaults.

| `O` element | What exists | Where | Evidence |
|---|---|---|---|
| Threat model | **Missing.** `docs/security/` is empty at time of writing; a code comment in `apps/web/src/keys.ts` points to `docs/security/threat-model.md`, which does not exist yet | n/a | `NOT-BUILT`. REQUIRED before submission |
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
  - **No threat-model document yet** and no external review, penetration test or audit (`docs/business/security-due-diligence.md` is explicit).
  - **Custom BOLT11 decoder/encoder** (`packages/core/src/bolt11.ts`, `bolt11-encode.ts`), not a mature library. Mitigation: checked against BOLT 11 spec vectors (`packages/core/test/bolt11.test.ts`, 8 tests) and LND validates the invoice again when paying. The criterion says "prefer proven libraries", so say this plainly.
  - **Approval key is not hardware-backed.** In the in-progress console it lives in browser `localStorage` (`apps/web/src/keys.ts`, comment: "a stolen browser profile could sign"). The server only stores public keys; it never sees the private key.
  - **Enforcement is application-level.** Anyone holding the wallet macaroon outside Orynt bypasses approvals. The LND credential should be a baked macaroon limited to `info:read offchain:read offchain:write`.
  - **LND `rest_url` is not SSRF-vetted** (`vetWebhookTarget` is only called for webhooks; `services/admin.ts` `createConnection` does not use it). Acceptable for self-hosting by a trusted operator; unsafe for an open multi-tenant public deployment. See `deployment-plan.md`.
  - Audit log is tamper-**evident**, not immutable (a DB admin can rewrite rows).
  - No MFA, no SSO.

### C3. UX/UI Quality (`O` criterion 3; includes the "mobile use" requirement)

`O` asks for fast, frictionless flows on **low bandwidth and mid-range phones**, clear labels, helpful errors, accessible contrast/size, simple copy free of jargon.

- **What exists.**
  - Plain-language errors and next-step explanations are in the core, not just the UI: `packages/core/src/states.ts` `stateActions()` returns a human reason for every disabled action (e.g. "Sending again is blocked: the first attempt may already have paid. Orynt must check the wallet's own record first."); the API returns RFC 9457 `problem+json` with `detail` and a `known/unknown` explanation on unresolved payments.
  - Design tokens encode a UX decision: uncertain = indigo, proven failure = red, never red for "unknown" (`packages/ui/tokens.css`).
  - Web console: `apps/web/src/pages/*` (Overview, Payouts, NewPayout, PayoutDetail, Approvals, Incidents, Connections, Activity, Team, Developers, Settings, Guide, VerifyReceipt, Auth) and English/French string tables. `IN-PROGRESS`, uncommitted, **not built or run by me**.
- **Judge check.** When the console is committed: open it in browser dev tools at 360x800 and throttle to "Slow 4G"; look at `PayoutDetail` for an UNKNOWN payout. **Not yet verified.**
- **Weak spots (this is the weakest criterion).**
  - No measurement exists: no payload sizes, no Lighthouse run, no contrast audit, no test on a real phone. Do not claim "optimised for low bandwidth".
  - `test:e2e` in `package.json` points to `apps/web/e2e/run.mjs`; the file being written is `run.cjs` (Playwright at 375/768/1440 px with axe, uncommitted). Its results are unverified by me.
  - French is unreviewed machine-written text (stated in `i18n.tsx`). No Wolof or other local language.
  - Approval signing happens in the browser; no native or installable mobile experience.

### C4. Working MVP (`O` criterion 4; `R` "A MVP accessible through internet (or a demo video)")

`O`: end-to-end demo that actually runs; **one-command setup (Docker or script), seed data, testable happy path; avoid mockups when a minimal integration is possible**.

- **What exists.**
  - End-to-end happy path on real PostgreSQL with the labelled simulator: `apps/api/test/flow.itest.ts` "create → submit → approve → execute → SIMULATED_SETTLED → receipt verifies as VERIFIED_SIMULATED" (`SIM-TESTED`).
  - Real Lightning adapter: `packages/wallets/src/lnd.ts` calls `GET /v1/getinfo`, `POST /v1/macaroon/checkpermissions`, `POST /v2/router/send`, `GET /v2/router/track/{hash}`. Implemented, never run against a node (`PENDING-REAL`).
  - Payee-side regtest helpers for the demo: `packages/wallets/src/lnd-dev.ts` (`lndAddInvoice`, `lndLookupInvoice`, `lndChannelBalance`).
- **Not yet existing (named in `package.json` but missing on disk):** `infra/regtest/up.sh`, `infra/regtest/down.sh`, `scripts/demo-full.sh`, `apps/api/build.mjs` (`pnpm build`). Partly there, uncommitted: `apps/api/src/seed.ts` (simulator-only demo seed, run via `ORYNT_SEED_DEMO=1`) and `apps/web/e2e/run.cjs` (the `test:e2e` script points to `run.mjs`). No Dockerfile or compose file (Docker daemon unavailable in the build environment).
- **Judge check (5 min).** `pnpm install && pnpm db:start && pnpm test:integration` (needs Node 22, pnpm 10.28, a local PostgreSQL 16 cluster; the `db:start` script uses `pg_lsclusters`, so on other systems set `DATABASE_URL`/`TEST_ADMIN_DATABASE_URL`). The real-regtest path: `pnpm regtest:up && pnpm demo:full` is **to be added**.
- **Weak spots.**
  - The criterion says avoid mockups when integration is possible. Today the wallet in every automated test is a simulator (a mock). The real path is the single most important thing to run before submission.
  - No hosted URL. `R` allows a demo video instead.
  - Seed data for the real-regtest demo does not exist yet; an uncommitted simulator-only seed (`apps/api/src/seed.ts`) does.

### C5. Clear Pitch & Docs (`O` criterion 5; `R` "A clear pitch")

`O`: 3-minute demo (problem → solution → impact → next steps); README with setup, architecture diagram, constraints, metrics to track and what ships next.

- **What exists.** Script, storyboard and captions: `video-script-3min.md`, `captions.en.srt` (UNRENDERED). Deck source: `pitch-deck-source.md` (UNRENDERED). Product brief, competitor matrix, differentiation review, business docs.
- **Weak spots.**
  - **Root `README.md` is five lines** and has none of the required sections. REQUIRED before submission. Source material: `devpost-entry.md` (architecture diagram, limitations) and `docs/business/metrics-and-privacy.md` (metrics).
  - `docs/EXECUTION-REGISTER.md` still shows M0 "IN PROGRESS" with nothing VERIFIED, which contradicts the tests above. Update before judges read it.
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

- **Position.** Not a wallet. Orynt "does not custody funds" (brief). It has: a provider contract (`packages/wallets/src/types.ts` `WalletProvider`: `getInfo`, `discoverCapabilities`, `sendPayment`, `lookupPayment`), an LND REST adapter (`CODE-ONLY`/`PENDING-REAL`) and a simulator. No key generation for funds, no receive/invoice flow in the product (invoices are created on the payee node by test/demo helpers only), no on-chain, no balance management.
- **Do not** describe the adapter as "a wallet implementation" in submission text unless the organisers say that satisfies the requirement. **Do not** start building a wallet to patch this in the remaining time: it contradicts the non-custodial design and would be unreviewed code handling keys.
- **Status: UNRESOLVED, owner decision.** Draft email in `submission-checklist.md` section A.

### C9. Public repo and open source (`R`: "A public github repo"; `O`: "results are open-source")

- `LICENSE` (Apache-2.0) at the repo root; every `package.json` declares `"license": "Apache-2.0"`. Note `docs/business/pricing-hypotheses.md` says the licence is "not yet decided", so the owner must confirm Apache-2.0 is intended.
- Repo visibility and remote were not checked by me. Judge check: open the repo logged out; `git log --oneline` shows 8 commits, all dated 2026-11-09, i.e. inside the submission window opened 2026-10-26. Pre-existing-work rules are not stated by the organisers.
- Disclose AI assistance in the README and Devpost text (the rules are silent; disclosure is the safe default). Commits carry a `Co-Authored-By: Claude` trailer.

### C10. MVP via internet or demo video (`R`)

- No live URL (nothing deployed). Demo video: script/captions/storyboard exist; **video not rendered**. See `video-script-3min.md` and `deployment-plan.md`.

### C11. Build in public (`O`: "to build in public and to communicate")

- Not started as far as the repository shows. No platform or frequency is required by any retrieved page. Plan in `submission-checklist.md`. Do not post vote-solicitation; do not claim users or traction.

## 3. How a judge verifies in under 5 minutes

**Tier 0, 2 minutes, nothing installed.** Open: `docs/product/PRODUCT-BRIEF.md` (claims and honest limits), `packages/core/src/states.ts` (state machine), `apps/api/src/services/execution.ts` (execution phases), then scan test titles in `apps/api/test/adversarial.itest.ts`.

**Tier 1, about 5 minutes, Node 22 + pnpm 10.28 + local PostgreSQL 16.** Simulator only. Everything below was run by me today except where noted.

```bash
pnpm install
pnpm db:start                      # script exists; Debian/Ubuntu pg_lsclusters only. Otherwise export DATABASE_URL and TEST_ADMIN_DATABASE_URL
pnpm test:integration              # 41 tests, about 13 s on the build sandbox (I ran this)
pnpm --filter @orynt/verifier test # 18 tests incl. single-character tamper sweep (I ran this)
pnpm --filter @orynt/core test     # 24 tests (I ran this)
# one scenario at a time (argument forwarding checked on @orynt/contract; not re-run for the DB suite):
pnpm --filter @orynt/api test:integration -t "response lost AFTER the wallet accepted"
pnpm --filter @orynt/api test:integration -t "20 concurrent execute requests"
```

**Tier 2, real Lightning on regtest. PENDING.** `pnpm regtest:up && pnpm demo:full` once those scripts exist; to be verified by running `scripts/demo-full` on the owner's machine. Specification in `demo-runbook.md`.

## 4. Consolidated weak spots, ranked by risk to the score

1. **Gating rules (eligibility, wallet requirement)**: could disqualify regardless of quality.
2. **No real-network evidence yet**: every payment test uses the simulator. The `O` criterion says avoid mockups.
3. **UX/mobile/low-bandwidth**: console uncommitted and unmeasured.
4. **Local impact and reach**: no African user evidence, no reach estimate, BOLT11-only.
5. **Docs**: README 5 lines; no threat model; stale execution register.
6. **No hosted URL**; video not rendered.
7. **Security caveats** (custom BOLT11 codec, browser-held approval key, app-level enforcement, unvetted LND URL, no external review).
8. **Name**: "Orynt" has unresolved trademark risk (`docs/brand/name-clearance.md`: a possible identical pending application and near-identical software marks, unverified). Disclose as a working title.

## 5. Defects and gaps found while writing (fix or disclose)

| # | Finding | Evidence | Suggested action |
|---|---|---|---|
| 1 | Built verifier cannot run: `dist/orynt-verify.mjs` has two shebang lines (the esbuild banner plus the one in `src/cli.ts`), giving `SyntaxError: Invalid or unexpected token` on `node packages/verifier/dist/orynt-verify.mjs --help` | run 2026-11-09 | Remove the shebang from `src/cli.ts` or the banner in `build.mjs`. Until fixed use `pnpm exec tsx packages/verifier/src/cli.ts`, which works |
| 2 | `pnpm build` will fail at `@orynt/api` (`"build": "node build.mjs"`, file absent) | `apps/api` listing | Add the file or change the script |
| 3 | `regtest:up`, `regtest:down`, `demo:full` point to missing files; `test:e2e` points to `run.mjs` while the file is `run.cjs`; `db:seed` runs `tsx src/seed.ts` whose seed is simulator-only and designed to run inside the server (`ORYNT_SEED_DEMO=1`) | `package.json` vs disk, 2026-11-09 15:12 UTC | Add, rename or remove before judges run them |
| 4 | LND `rest_url` not SSRF-vetted | `grep vetWebhookTarget` | Document as self-host-only; vet before any public multi-tenant demo |
| 5 | Web console, site and `ops.itest.ts` are untracked | `git status` | Commit or exclude consciously before submission |
| 6 | Failpoint state is process-global, not per workspace | `lib/failpoints.ts` | Only matters for a shared public sandbox |

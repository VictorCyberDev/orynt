# Orynt demo runbook (judges and owner)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Devpost status: NOT SUBMITTED.** Nothing is deployed; there is no live URL.
Written 2026-11-09. Everything labelled "to be verified by running `scripts/demo-full` on the owner's machine" has **not** been run against a real node by anyone.

## 1. What exists on disk today (checked against the filesystem, 2026-11-09 ~15:12 UTC; other files are being added concurrently, so re-check)

| Thing the commands rely on | Referenced from | Exists? |
|---|---|---|
| `infra/postgres/start-local.sh` | `pnpm db:start` | Yes (needs `pg_lsclusters`, i.e. Debian/Ubuntu PostgreSQL packages; creates role `orynt`, DBs `orynt_dev`, `orynt_test`) |
| `apps/api/src/db/cli.ts` | `pnpm db:migrate` | Yes |
| `apps/api/test/*.itest.ts` | `pnpm test:integration` | Yes (3 files, 41 tests; `ops.itest.ts` uncommitted) |
| `packages/verifier/src/cli.ts` | verifier CLI | Yes, works via `tsx`. **`dist/orynt-verify.mjs` is broken** (double shebang) |
| `apps/api/src/seed.ts` | `pnpm db:seed`; also `ORYNT_SEED_DEMO=1` on the API server (`src/server.ts`) | **Present, uncommitted, unverified by me.** SIMULATOR-only seed (workspace "Demo workspace (SEED DATA)", fixed public demo password). It needs simulator state, which is in-memory, so it works through the server flag, not as a standalone script. It is **not** the seed for the real-regtest demo (that one is still to be added, section 5) |
| `infra/regtest/up.sh`, `infra/regtest/down.sh` | `pnpm regtest:up`, `pnpm regtest:down` | **No. To be added** |
| `scripts/demo-full.sh` | `pnpm demo:full` | **No. To be added** |
| `apps/api/build.mjs` | `pnpm build` | **No** |
| `apps/web/e2e/run.mjs` | `pnpm test:e2e` | **Mismatch.** The script points to `run.mjs`; the file in progress is `apps/web/e2e/run.cjs` (Playwright, 3 viewports, axe). Uncommitted; not run by me |
| `Dockerfile`, `infra/docker-compose.yml` | none (a comment in `start-local.sh` mentions a compose file) | **No.** Docker daemon was unavailable in the build environment, so no container path was built or tested |
| `apps/web/src/*`, `apps/site/*` | `pnpm dev:web` | Present, **uncommitted, unverified by me**. An uncommitted change to `apps/api/src/http/app.ts` makes the API serve `apps/web/dist` at `/app/` and `apps/site/dist` at `/` when built (also unverified) |

## 2. Prerequisites

- Node.js 22 or newer (`engines`), pnpm 10.28 (`packageManager`; `corepack enable` if pnpm is missing).
- PostgreSQL 16 reachable as `postgres://orynt:orynt@127.0.0.1:5432/orynt_dev`. On a machine without `pg_lsclusters`, create the role and databases yourself and export `DATABASE_URL` and `TEST_ADMIN_DATABASE_URL` (the test helper creates and drops throw-away databases, so the role needs `CREATEDB`).
- For the real-Lightning path only: Bitcoin Core (`bitcoind`) and two LND nodes (payer "alice", payee "bob"), run in regtest. The build environment blocked executing downloaded `bitcoind`/`lnd` binaries, so **no real node has ever run with this code**.

## 3. Path A: works today, simulator wallet on real PostgreSQL (labelled SIMULATOR)

```bash
pnpm install
pnpm db:start
pnpm test:integration                                   # 41 tests (I ran this: 41 passed, 2026-11-09 15:01 UTC)
pnpm --filter @orynt/api test:integration -t "response lost AFTER the wallet accepted"   # the UNKNOWN -> blocked -> reconcile story, in one test
pnpm --filter @orynt/api test:integration -t "20 concurrent execute requests"           # 20 parallel executes, exactly one wallet send
pnpm --filter @orynt/api test:integration -t "create → submit → approve → execute"      # happy path + receipt verifies as VERIFIED_SIMULATED
pnpm --filter @orynt/verifier test                      # 18 tests incl. tamper sweep (I ran this)
```

Expected: every receipt produced here is labelled `environment: "SIMULATOR"`, the payment state is `SIMULATED_SETTLED` (never `SETTLED`), and the verifier verdict is `VERIFIED_SIMULATED`. With `--require-real` the same receipt is `REJECTED`. This is deliberate: the simulator can never produce a "real" result (`packages/core/src/states.ts` `assertTransition`; test "SETTLED needs a verified preimage and a real provider; simulator can never settle").

## 4. Path B: the one-command real regtest demo (TO BE ADDED)

Target for a judge or the owner, after the missing scripts exist:

```bash
pnpm install
pnpm db:start
pnpm regtest:up      # TO BE ADDED: bitcoind + 2 LND nodes + funded channel (spec 4.1)
pnpm demo:full       # TO BE ADDED: API + seeds + the 9 stages in 4.2, prints a PASS/FAIL line per stage
pnpm regtest:down    # TO BE ADDED
```

**Every statement about what this prints is "to be verified by running `scripts/demo-full` on the owner's machine".**

### 4.1 What `infra/regtest/up.sh` must do (acceptance criteria)

1. Start `bitcoind -regtest` with the RPC/ZMQ settings LND needs; binary versions pinned and checksum-verified (the execution register says binaries were downloaded and checksum-verified but never executed).
2. Start two LND nodes (alice = payer, bob = payee) with REST enabled on distinct local ports, TLS cert files written under `.regtest/` (already gitignored).
3. Mine 101+ regtest blocks, fund alice, open an alice-to-bob channel with ample outbound liquidity (for example 5,000,000 sats), mine confirmations, wait until the channel is active on both sides.
4. Bake a **restricted** macaroon for alice, so the demo exercises least privilege: `lncli bakemacaroon info:read offchain:read offchain:write` (syntax per LND docs; verify on the pinned version). Do not hand Orynt `admin.macaroon`.
5. Write `.regtest/env` containing REST URLs, TLS cert paths and the hex macaroon for alice, plus bob's admin credentials for the payee helpers in `packages/wallets/src/lnd-dev.ts`. Exit non-zero with a clear message on any failure.
6. Refuse to run if any chain other than regtest is detected.

### 4.2 What `scripts/demo-full.sh` must do (stages the video script depends on)

| Stage | Action | Pass condition printed |
|---|---|---|
| S0 | Preflight: Node, PostgreSQL, `.regtest/env`, both LND nodes report `chains[].network == "regtest"` | `network=regtest` |
| S1 | Start API with `ORYNT_ENV=development ORYNT_FAILPOINTS=1 ORYNT_WORKER=1`, a fresh database or a new workspace, **explicit random** `ORYNT_SECRET_KEY` and `ORYNT_ISSUER_KEY` (not the public dev defaults), `ORYNT_ALLOW_MAINNET` unset | `/health/ready` ok |
| S2 | Seed workspace "DEMO - Dakar Hack (regtest)" with: an owner (who plays the "maker": creates and submits payouts), one operator (who executes), two approvers; generate approval keypairs locally (never committed), register public keys with proof of possession (`POST /v1/me/approval-key`) | 4 members, approval keys registered for the 2 approvers (and the owner) |
| S3 | Connect alice's LND with the restricted macaroon (`POST /v1/connections`, `kind: "lnd"`); show discovered capabilities; create counterparty "Bob (DEMO payee)" bound to bob's node pubkey | `can_send=true can_lookup=true`, network regtest |
| S4 | Bob creates an invoice for **150,000 sats** (`lndAddInvoice`). The owner (maker) creates and submits the payout. Policy tier 2 applies (above 100,000 sats), so two approvals are required | `required_approvals=2` |
| S5 | Refusals: the owner/maker tries to approve their own payout (expect HTTP 403 "Policy requires someone other than the creator to approve."); the operator tries to approve (expect HTTP 403 by role). Two approvers sign the intent digest (`signApprovalBody` in `@orynt/sdk`) | `maker approval refused`, `APPROVED` |
| S6 | The operator executes with an `Idempotency-Key`. Expect `SETTLED` (not `SIMULATED_SETTLED`), `environment: REAL_PROVIDER`. Cross-check with bob's `lndLookupInvoice` (`SETTLED`, preimage equal) and the change in `lndChannelBalance` | `SETTLED`, preimage hashes to payment hash, bob invoice `SETTLED` |
| S7 | Second payout (e.g. 120,000 sats). Arm the failpoint `execute.after_provider_response` via `POST /v1/dev/failpoints`, execute: LND really pays, then the process drops the answer. Expect HTTP 202, state `UNKNOWN`, open incident `unknown_outcome`. Execute again: expect HTTP 409 `send_blocked_unresolved`. Reconcile (`POST /v1/payments/:id/reconcile`): expect `SETTLED`, `reconciled_after_uncertainty: true`. Assert alice's channel balance fell by the amount **once** | `UNKNOWN`, `409 send_blocked_unresolved`, `SETTLED (reconciled)`, `paid once` |
| S8 | Fetch receipt (`GET /v1/payments/:id/receipt`), save to `docs/evidence/<UTC timestamp>/receipt-real.json`; run the verifier with `--trust-key <issuer key> --require-real --expect-network regtest` (expect exit 0). Flip one character of the receipt and re-run (expect exit 1, `REJECTED`) | `VERIFIED`, then `REJECTED` |
| S9 | Print a summary and write the full transcript to `docs/evidence/<UTC timestamp>/transcript.txt` (redact the macaroon, cookies, passwords) | summary |

**Honesty rules for the recording.** In S7 the loss of the response is an **injected fault** (failpoint), not a naturally occurring network failure; the payment itself is real regtest. Say so on screen. The issuer trust key in S8 is fetched from the same server for convenience; a real verifier must obtain it out of band (the API route is labelled "informational").

### 4.3 Manual commands to spot-check the real run (not yet run by anyone)

Verifier (use `tsx`; the built `dist` file is broken, see section 1):

```bash
# S8 equivalent by hand. ISSUER=<public_key from GET /v1/public/issuer-keys, or printed by demo-full>
pnpm exec tsx packages/verifier/src/cli.ts receipt-real.json --trust-key "$ISSUER" --require-real --expect-network regtest
echo "exit=$?"     # 0 = VERIFIED, 1 = REJECTED, 3 = integrity OK but issuer not trusted, 4 = VERIFIED_SIMULATED

# One-character tamper (changes one digit of the first "amount_msat" value), then verify again:
node -e 'const fs=require("fs");let t=fs.readFileSync("receipt-real.json","utf8");t=t.replace(/("amount_msat": ?")(\d)/,(m,a,d)=>a+((+d+1)%10));fs.writeFileSync("receipt-tampered.json",t)'
pnpm exec tsx packages/verifier/src/cli.ts receipt-tampered.json --trust-key "$ISSUER" --require-real
echo "exit=$?"     # expected 1 (REJECTED); the issuer signature covers the whole receipt body so at minimum 'attestation.signature' fails
```

The tamper one-liner assumes the receipt file is pretty-printed JSON with `"amount_msat": "…"`; if the file is minified use `"amount_msat":"` in the regex. The test that backs the claim is `packages/verifier/test/verify.test.ts` "rejects when ANY single character of the serialized receipt is changed (sampled across the whole document)" (it samples about 400 positions, not every character).

## 5. Seeds (all labelled demo)

**Existing, in progress (simulator only):** `apps/api/src/seed.ts`, run by starting the API with `ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 ORYNT_ENV=development`. It creates "Demo workspace (SEED DATA)" with owner/operator/approver/viewer users on `@orynt.local` addresses, a wallet labelled "Practice wallet (seed)" (simulator), and about eight payouts in different states including one UNKNOWN. Credentials are fixed and public in the source (`demo-password-123`): fine for local use, **never for a hosted instance**. It is refused when `ORYNT_ENV=production`. Useful for the fallback cut and for browsing the console without a regtest setup.

**Still to be added (real regtest):** `demo-full` must label everything as demo data. Existing tests use fixed throw-away identities, e.g. `owner@acme.test`, password `correct horse battery staple`, which are **test fixtures and must not be reused as demo credentials**. Required for the demo seed:

| Object | Value |
|---|---|
| Workspace | `DEMO - Dakar Hack (regtest)` |
| Users | `owner@demo.invalid` (role owner, plays the maker), `operator@demo.invalid` (role operator, executes), `approver1@demo.invalid`, `approver2@demo.invalid` (role approver); random passwords printed once to the terminal, never stored in the repo |
| Counterparty | `Bob (DEMO payee)`, bound to bob's regtest node key |
| Memo / reference | `DEMO payout - regtest test coins`, `DEMO-001`, `DEMO-002` |
| Wallet connection label | `alice-regtest (DEMO)` |
| Policy | default policy (`DEFAULT_POLICY_RULES` in `packages/core/src/policy.ts`): max 1,000,000 sats per payment, 5,000,000 sats per 24 h, 1 approver up to 100,000 sats and 2 above, maker cannot approve own payout, networks `["regtest"]`, invoice must have at least 120 s left |

## 6. What is real and what is simulated

| Item | Path A (today) | Path B (pending) |
|---|---|---|
| Control plane: state machine, policy, signed approvals, single-use reservation, reconciler, receipts, audit chain | Real code on real PostgreSQL | Same |
| Wallet | **SIMULATOR** (`packages/wallets/src/simulator.ts`), labelled in UI/API/receipts | Real **LND over REST** on regtest. `PENDING-REAL` |
| Payment result | `SIMULATED_SETTLED`; receipt `environment: SIMULATOR`; verdict `VERIFIED_SIMULATED` | `SETTLED`; `environment: REAL_PROVIDER`; verdict `VERIFIED` (`--require-real` passes) |
| Bitcoin network and funds | None | Local regtest chain; coins have no monetary value |
| "Lost response" | Scripted simulator behaviour (`accept_then_lose_response`) and failpoints | Failpoint-injected after a real payment. **Not** a naturally occurring network fault |
| Preimage check | Real SHA-256 check; the simulator supplies preimages for invoices it minted | Preimage comes from LND |
| Invoices | Minted by a dev route, signed by a fixed fake node key | Created by bob's LND |
| Approval keys | Generated in the test client / demo script | Same (browser `localStorage` in the in-progress console) |
| Issuer (receipt-signing) key | Deterministic development key unless `ORYNT_ISSUER_KEY` is set | Set explicitly for the demo |
| Mainnet | Blocked: `ORYNT_ALLOW_MAINNET` unset and policy `allowedNetworks=["regtest"]` (test "policy limits are enforced at submit; mainnet is blocked") | Same |
| Hosting | Local only | Local only. No deployment exists |
| Web console | `IN-PROGRESS`, uncommitted | Same |

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pg_lsclusters not found` | Not Debian/Ubuntu PostgreSQL | Start PostgreSQL yourself; create role `orynt` (password `orynt`, `CREATEDB`) and DB `orynt_dev`; export `DATABASE_URL` and `TEST_ADMIN_DATABASE_URL` |
| `permission denied to create database` in tests | Role lacks `CREATEDB` | `ALTER ROLE orynt CREATEDB;` |
| `[pg pool] idle client error: terminating connection due to administrator command` in test output | Expected: one test deliberately kills DB connections ("database connections killed mid-flight") | Ignore if the suite passes |
| pnpm refuses to install or complains about version | Wrong pnpm | `corepack enable`; repo pins `pnpm@10.28.0` |
| `node packages/verifier/dist/orynt-verify.mjs` throws `SyntaxError: Invalid or unexpected token` | Double shebang in the built file | Use `pnpm exec tsx packages/verifier/src/cli.ts ...` or fix the source |
| HTTP 409 `send_blocked_unresolved` on execute | Working as designed: payout is `UNKNOWN`/`RECONCILING`/`PENDING`, or already settled | Reconcile; read `detail` |
| HTTP 409 `wallet_insufficient_permissions` | Macaroon lacks `offchain:write`, or capability check older than 24 h | Re-bake macaroon; `POST /v1/connections/:id/check` |
| HTTP 409 `network_mismatch` / `mainnet_disabled` | Wallet is not on regtest | Point at regtest nodes; never enable mainnet for the demo |
| HTTP 409 `invoice_expired` ("expires too soon") | Fewer than 120 s of invoice life left | Create a fresh invoice (default helper expiry is 3600 s) |
| `failpoints are disabled` / 404 on `/v1/dev/*` | `ORYNT_FAILPOINTS` not `1` (and it is refused when `ORYNT_ENV=production`) | Start the API with `ORYNT_FAILPOINTS=1` and a non-production env |
| 403 "Missing or invalid CSRF token" from a browser/curl session | Cookie session needs `x-csrf-token` and an allowed `Origin` | Send the token from the login response; set `ORYNT_ALLOWED_ORIGINS` |
| Payment ends `DEFINITIVELY_FAILED` with `FAILURE_REASON_NO_ROUTE` or insufficient balance | Channel not active, no outbound liquidity, or amount too large | Check channel state; the failure is wallet-reported so retry (`POST /v1/payments/:id/retry`) is allowed |
| Reconcile keeps returning `NOT_FOUND` | Wallet has no record yet; invoice not expired | Expected for a payment that never reached the wallet; an expired invoice alone is **not** proof of failure. Use `confirm-not-sent` only after expiry and the grace period |
| Reconcile `ERROR` / incident `reconciliation_stalled` | Node unreachable or macaroon cannot look up payments (`offchain:read`) | Fix connectivity/permissions; the payout stays blocked meanwhile, by design |

## 8. Evidence to capture (so claims can be checked later)

For every recording or submission screenshot keep, under `docs/evidence/<UTC timestamp>/`: commit hash, `node -v`, `pnpm -v`, LND and Bitcoin Core versions, the full terminal transcript with secrets redacted, `receipt-real.json`, verifier output with exit code, and the bob-side invoice lookup. Do not commit macaroons, TLS keys, cookies or passwords.

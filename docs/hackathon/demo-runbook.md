# Orynt demo runbook (judges and owner)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Devpost status: NOT SUBMITTED.** Nothing is deployed; there is no live URL.
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`). Authoritative status table: `docs/EXECUTION-REGISTER.md`.
**Real Lightning on regtest has never been run by anyone.** The build sandbox refused to execute the downloaded `bitcoind`/`lnd` binaries. Every statement about the real path below is "to be verified by running `pnpm demo:full` on the owner's machine".

## 1. Commands and files (checked against the repository, 2026-11-09)

| Command | File it runs | Status |
|---|---|---|
| `pnpm db:start` | `infra/postgres/start-local.sh` | Exists; Debian/Ubuntu `pg_lsclusters` only, otherwise set `DATABASE_URL` / `TEST_ADMIN_DATABASE_URL` |
| `pnpm regtest:fetch` | `infra/regtest/fetch.sh`, pins in `infra/regtest/versions.env` | Written; downloads Bitcoin Core 32.1 and LND v0.20.1-beta (Linux x86_64) and refuses unless SHA-256 matches the pin (PGP not verified). **Never executed to completion by an agent here; first real run is yours** |
| `pnpm regtest:up` / `pnpm regtest:down` | `infra/regtest/up.mjs`, `down.mjs` | Written, **never executed** (`bash -n` / `node --check` only). Starts `bitcoind -regtest`, alice (payer) and bob (payee) LND nodes, funds alice, opens a 5,000,000-sat channel, bakes a least-privilege and a read-only macaroon, writes `.regtest/env.json` |
| `pnpm demo:full` | `scripts/demo-full.ts` (REAL regtest mode) | Written, **never run in real mode** |
| `pnpm demo:full:sim` | same script with `--simulator` | **Verified end to end** (all assertions passed, labelled SIMULATED). Evidence: `docs/evidence/demo-simulator-2026-11-09T15-28-43-507Z.md` and `receipt-simulator-*.json` |
| `pnpm test:real-lightning` | `apps/api/test/lnd.itest.ts` | 8 tests, **all skipped** until `.regtest/env.json` exists |
| `pnpm test:integration` | `apps/api/test/*.itest.ts` | 55 pass, 8 skipped (register, 2026-11-09) |
| `pnpm test` | unit tests | core 24, verifier 26, contract 1 |
| `pnpm build:all` | verifier, sdk, web, site, api bundles | Exists (register: build ✔ for site/web; re-run it) |
| `pnpm start` | `node apps/api/dist/server.mjs` | Exists; serves API, marketing site at `/` and the app at `/app/` |
| `node apps/web/e2e/run.cjs` | Playwright E2E | Register: 100/100, screenshots in `docs/evidence/screenshots/{375,768,1440}`. Note `pnpm test:e2e` still names `run.mjs`; call the `.cjs` directly |
| `pnpm restore:rehearsal` | `infra/postgres/restore-rehearsal.sh` | Register: PASSED |
| `Dockerfile`, `infra/docker-compose.yml`, `infra/deploy/{render.yaml,fly.toml}` | | Exist but **UNVERIFIED** (no Docker daemon was available) |

`ORYNT_ENV` is now **mandatory**: the server refuses to start if it is unset (`development`, `test` or `production`). The scripts above set it for you; when you start the server by hand you must set it.

## 2. Prerequisites

- Node.js 22+, pnpm 10.28 (`corepack enable`), PostgreSQL 16 reachable as `postgres://orynt:orynt@127.0.0.1:5432/orynt_dev`; the role needs `CREATEDB` (tests and `demo-full` create throw-away databases).
- Real path only: Linux x86_64 with permission to execute the downloaded `bitcoind` and `lnd`, and free local ports (see `infra/regtest/README.md`; "expect to fix small issues on first run: port clashes, REST field names").

## 3. PRIMARY path (the recording path): real Lightning on local regtest

```bash
pnpm install
pnpm db:start
pnpm regtest:fetch      # download + SHA-256 check of bitcoind and lnd
pnpm regtest:up         # bitcoind + alice + bob + funded channel -> .regtest/env.json
pnpm test:real-lightning   # optional but recommended first: the 8 gated adapter tests, fix issues here
pnpm demo:full          # REAL mode; writes docs/evidence/demo-real-regtest-<UTC stamp>.{md,json} and receipt-real-regtest-*.json
pnpm regtest:down
```

Expected, **to be verified by running `scripts/demo-full` on the owner's machine** (from `scripts/demo-full.ts`; the simulator run printed the same shape):

| Stage | What the script does | Printed assertion |
|---|---|---|
| Setup | Fresh database, API on port 8788 (`ORYNT_ENV=development ORYNT_FAILPOINTS=1`), builds the verifier bundle | `API ready ...` |
| Workspace | Owner, operator, approver; connects **alice** with the least-privilege macaroon over LND REST | `wallet connected on regtest; discovered permissions: send=true lookup=true`; `connection is a REAL LND node (least-privilege macaroon)` |
| A. Normal payout | Bob creates a 30,000-sat invoice; the operator creates and submits; the approver (a different person) signs the intent digest; operator executes | `approved by a different person than its creator`; `state SETTLED (REAL_PROVIDER)`; bob's node shows the invoice SETTLED with the same preimage; `sha256(preimage) == payment hash` |
| B. Lost response | New 31,000-sat payout; failpoint `execute.after_provider_response` armed; execute | `HTTP 202: state UNKNOWN - NOT failed`; second execute refused with `send_blocked_unresolved`; reconcile finds LND's record: `SETTLED`; `LND shows exactly one successful payment for this hash` |
| C. Real SIGKILL (real mode only) | New 32,000-sat payout; failpoint `exit` kills the API after LND accepted; restart; startup recovery | `after restart the payout is UNKNOWN or RECONCILING - never FAILED`; reconcile: `SETTLED` |
| D. Receipts | Fetch receipts for A and B, run `node packages/verifier/dist/orynt-verify.mjs` with the issuer key and `--require-real` | exit 0 `VERIFIED`; one changed character: exit 1 `REJECTED`; no trust root: exit 3; replay of the same receipt rejected; receipt for A cannot be passed off as B; audit chains intact |

Honesty rules for the recording: in B the loss of the response is an **injected fault** (failpoint) after a real regtest payment; in C the process kill is real. The issuer trust key is fetched from the same server for convenience (the script prints this); a real verifier must obtain it out of band. Amounts are 30,000 to 32,000 sats, so the default policy needs **one** approver (above 100,000 sats it needs two); the script does not demonstrate a two-approver payout or a refused self-approval. Those are shown in tests (`operators, viewers, API keys and the maker cannot approve`) and in the web console (see `video-script-3min.md`).

If a stage fails on first contact with real nodes, that is expected (register: LND error classification "unproven"). Fix, re-run, and keep the failing transcript too.

### 3.1 Manual verifier use (works today on simulator receipts; real receipts pending)

```bash
pnpm --filter @orynt/verifier build            # bundle: node packages/verifier/dist/orynt-verify.mjs (shebang bug is fixed)
node packages/verifier/dist/orynt-verify.mjs docs/evidence/receipt-simulator-2026-11-09T15-28-43-507Z-A.json \
     --trust-key "$ISSUER_KEY"; echo "exit=$?"     # simulator receipt => exit 4 VERIFIED_SIMULATED
node packages/verifier/dist/orynt-verify.mjs docs/evidence/receipt-simulator-2026-11-09T15-28-43-507Z-A-TAMPERED.json \
     --trust-key "$ISSUER_KEY"; echo "exit=$?"     # exit 1 REJECTED
```

Exit codes: 0 VERIFIED, 1 REJECTED, 2 usage/IO error, 3 integrity OK but issuer not trusted, 4 VERIFIED_SIMULATED. `$ISSUER_KEY` is the issuer public key (`GET /v1/public/issuer-keys` on the running server, informational only; it is also the `issuer.public_key` field inside the receipt, which is why it must be supplied out of band to mean anything). Alternative without building: `pnpm exec tsx packages/verifier/src/cli.ts ...`. The committed tampered sample changes the memo text by one character ("demo 30000 sats" to "demo 30001 sats"); any change breaks the issuer signature over the whole receipt body.

## 4. FALLBACK path (clearly SIMULATED): `pnpm demo:full:sim`

```bash
pnpm install
pnpm db:start
pnpm demo:full:sim      # labelled SIMULATOR; writes docs/evidence/demo-simulator-<stamp>.{md,json} + receipts
```

What it proves and what it does not:
- Proves (verified 2026-11-09): the same API, state machine, approvals, reconciliation, receipts and verifier behave as in the story: payout settled as `SIMULATED_SETTLED`, response lost then 202 `UNKNOWN`, duplicate refused, reconcile, receipts exit 4 `VERIFIED_SIMULATED`, one changed character exit 1, replay rejected.
- Does **not** prove anything about real Lightning. Output is stamped SIMULATED and must never be presented as real evidence. Scenario C (SIGKILL) is skipped because simulator state is in memory.

Browsing the console against a seeded simulator workspace:

```bash
pnpm db:start && pnpm build:all
ORYNT_ENV=development ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start
# site: http://127.0.0.1:8787/    app: http://127.0.0.1:8787/app/
# sign in: demo-owner@orynt.local / demo-password-123  (also demo-operator, demo-approver1, demo-approver2, demo-viewer @orynt.local)
```

The seed (`apps/api/src/seed.ts`) creates "Demo workspace (SEED DATA)" on a labelled simulator wallet, with payouts in several states including one UNKNOWN. The password is public in the source: local use only. The production server (`ORYNT_ENV=production`) refuses the simulator, failpoints and the seed.

## 5. Judge quick path (simulator, about 5 minutes)

```bash
pnpm install && pnpm db:start
pnpm test:integration                                    # 55 pass, 8 skipped (real-LND tests need regtest)
pnpm test                                                # unit: core 24, verifier 26, contract 1
pnpm demo:full:sim                                       # the whole story, labelled SIMULATED
pnpm --filter @orynt/api test:integration -t "response lost AFTER the wallet accepted"
pnpm --filter @orynt/api test:integration -t "20 concurrent execute requests"
```

(`-t` forwarding was checked on the contract package and on the API integration suite.)

## 6. What is real and what is simulated

| Item | Simulator path (`demo:full:sim`, tests, seed) | Real path (`demo:full`) |
|---|---|---|
| Control plane: state machine, policy, signed approvals, single-use reservation, reconciler, receipts, audit chain | Real code on real PostgreSQL | Same |
| Wallet | **SIMULATOR** (`packages/wallets/src/simulator.ts`), labelled in API, UI and receipts | Real **LND over REST** on regtest. `PENDING-REAL`: never run |
| Result states and verdicts | `SIMULATED_SETTLED`; receipt `environment: SIMULATOR`; verifier exit 4 | `SETTLED`; `REAL_PROVIDER`; exit 0 with `--require-real` |
| Bitcoin network and funds | None | Local regtest chain; coins worthless |
| Lost response | Scripted simulator behaviour / failpoint | Failpoint after a real payment (B); real process kill (C) |
| Invoices | Minted by a dev route, signed by a fixed fake node key | Created by bob's LND |
| Approval keys | Generated by scripts/seed; console keeps its key in browser `localStorage` | Same |
| Issuer key | Development key | Development key unless `ORYNT_ISSUER_KEY` set |
| Mainnet | Refused (policy `allowedNetworks=["regtest"]`, `ORYNT_ALLOW_MAINNET` unset) | Same |
| Hosting | Local only; nothing deployed | Local only |

Known limit also written in the threat model: a tenant could register a fake LND-compatible server and obtain a "REAL" receipt for a payment it controls on both sides (`docs/security/threat-model.md`, open item). A receipt proves a preimage was produced, not that the payee is independent.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ORYNT_ENV must be set explicitly` | New mandatory variable | `ORYNT_ENV=development` for local use |
| `pg_lsclusters not found` | Not Debian/Ubuntu PostgreSQL | Create role `orynt` (password `orynt`, `CREATEDB`) and DB `orynt_dev`; export `DATABASE_URL`, `TEST_ADMIN_DATABASE_URL` |
| `permission denied to create database` | Role lacks `CREATEDB` | `ALTER ROLE orynt CREATEDB;` |
| `Real mode needs a regtest network` from `demo:full` | `.regtest/env.json` missing | `pnpm regtest:fetch && pnpm regtest:up`, or use `pnpm demo:full:sim` |
| `fetch.sh` refuses: checksum mismatch | Download differs from the pin | Do not bypass; re-download, or update the pin only after checking the publisher's checksum file |
| `regtest:up` fails on ports / REST field names / permission to execute binaries | First-ever execution of these scripts | Read `infra/regtest/README.md`; fix and keep notes in `docs/evidence/` |
| `[pg pool] idle client error: terminating connection due to administrator command` | Expected: one test kills DB connections | Ignore if the suite passes |
| HTTP 409 `send_blocked_unresolved` | Working as designed (payout UNKNOWN/RECONCILING/PENDING or already settled) | Reconcile; read `detail` |
| HTTP 409 `wallet_insufficient_permissions` | Macaroon lacks `offchain:write`, or capability check older than 24 h | Use the least-privilege macaroon from `.regtest/env.json`; `POST /v1/connections/:id/check` |
| HTTP 409 `network_mismatch` / `mainnet_disabled` | Wallet not on regtest | Point at regtest nodes; never enable mainnet |
| HTTP 409 `invoice_expired` ("expires too soon") | Under 120 s of invoice life left | Create a fresh invoice |
| `failpoints are disabled` / 404 on `/v1/dev/*` | `ORYNT_FAILPOINTS` not `1`, or production env | Start with `ORYNT_ENV=development ORYNT_FAILPOINTS=1` |
| 403 "Missing or invalid CSRF token" | Cookie session needs `x-csrf-token` and an allowed `Origin` | Use the token from the login response; set `ORYNT_ALLOWED_ORIGINS` |
| LND connection refused with a private-address message | LND URL is now SSRF-vetted; private targets are allowed only outside production | Run with `ORYNT_ENV=development` locally |
| Payout ends `DEFINITIVELY_FAILED` (no route / insufficient balance) | Channel not active or no outbound liquidity | Check channel; wallet-reported failure allows `POST /v1/payments/:id/retry` |
| Reconcile keeps returning `NOT_FOUND` | Wallet has no record yet | Expected for a payment that never reached the wallet; an expired invoice alone is not proof of failure; `confirm-not-sent` needs expiry plus grace |
| Verifier exit 3 | Integrity OK but issuer key not supplied/trusted | Pass `--trust-key` |

## 8. Evidence to capture

`demo-full` writes `docs/evidence/demo-<mode>-<stamp>.{md,json}` and receipts. For the real run also keep: `node -v`, `pnpm -v`, the pinned Bitcoin Core and LND versions (`infra/regtest/versions.env`), the terminal transcript with secrets redacted, bob-side invoice lookup, the failing and the passing runs. Update `docs/evidence/README.md` and `docs/EXECUTION-REGISTER.md` (M2 regtest row, M4 LND row, `demo:full`, `test:real-lightning`). Never commit macaroons, TLS keys, cookies or passwords (`.regtest/` is gitignored).

# Orynt demo runbook: real-regtest edition (judges and owner)

**Devpost status: NOT SUBMITTED.** Nothing is deployed; there is no live URL. Rewritten 2026-11-11 after the real run: every command below was executed on 2026-11-11 in the build environment (Linux x86_64, Node 22.23, pnpm 10.28, PostgreSQL 16) and the output described is what it actually printed. Authoritative status: `docs/EXECUTION-REGISTER.md`; evidence map: `docs/hackathon/evidence-index.md`.

**What this proves and what it does not.** It proves the control plane (approvals, single send, UNKNOWN discipline, reconciliation, receipts, verifier) against **two real LND v0.20.1-beta nodes and Bitcoin Core 29.5 on a local regtest chain**. Coins are worthless test coins. It does **not** prove anything about testnet, mainnet, other wallets (NWC/BTCPay/Core Lightning are not verified), other LND versions, or production operation. Ports used: 8788 (demo API), bitcoind/LND local ports from `.regtest/env.json`.

## 1. Prerequisites

- Linux x86_64 (the pinned binaries are `x86_64-linux-gnu` / `linux-amd64`), Node.js 22+, pnpm 10.28 (`corepack enable`), network access to `bitcoincore.org` and `github.com` for the first download (about 45 MB + LND archive; SHA-256 checked).
- PostgreSQL 16 reachable as `postgres://orynt:orynt@127.0.0.1:5432/...` with a role that has `CREATEDB` (tests and `demo:full` create throw-away databases). On Debian/Ubuntu `pnpm db:start` creates the cluster role and databases; elsewhere create role `orynt` (password `orynt`, `CREATEDB`) and set `DATABASE_URL` / `TEST_ADMIN_DATABASE_URL`.
- No Docker is needed. (The Docker image is verified on GitHub CI only; `docker compose` was never run locally.)

## 2. The real-regtest path (primary)

```bash
pnpm install
pnpm db:start                       # prints: postgres ready: postgres://orynt:orynt@127.0.0.1:5432/orynt_dev
bash infra/regtest/fetch.sh         # downloads bitcoind 29.5 + lnd v0.20.1-beta into .regtest/bin, refuses on SHA-256 mismatch
node infra/regtest/up.mjs           # starts bitcoind + alice + bob, funds alice, opens a 5,000,000-sat channel, writes .regtest/env.json
pnpm test:real-lightning            # 15 real-LND tests
pnpm demo:full                      # the whole story with real payments; writes docs/evidence/demo-real-regtest-<stamp>.*
node infra/regtest/down.mjs         # stop the network (add --wipe to delete its data)
```

What each prints (2026-11-11 run):

| Command | Exit | Output |
|---|---|---|
| `bash infra/regtest/fetch.sh` | 0 | `.../bitcoin.tar.gz: OK`, `.../lnd.tar.gz: OK`, then the two binary paths. A mismatch prints `CHECKSUM MISMATCH ... refusing to use it` and exits non-zero (do not bypass). PGP/guix attestations are **not** verified, only the pinned SHA-256 |
| `node infra/regtest/up.mjs` | 0 | `started bitcoind (pid ...)`, `started lnd-alice`, `started lnd-bob`, then `regtest ready. alice 03eafc76... → bob 03c1cb1b...  (env: .regtest/env.json)`. Pass `--fresh` to wipe previous data first. It aborts if any node reports a non-regtest chain |
| `pnpm test:real-lightning` | 0 | vitest, `Test Files 1 passed (1)`, **`Tests 15 passed (15)`** in about 22 s: real payment settles as REAL and its receipt passes the verifier with `--require-real`; response lost after LND accepted -> UNKNOWN -> second send refused -> reconcile settles, LND shows one payment; insufficient liquidity is a proven failure; read-only credential cannot submit; expired invoice refused; destination/network substitution refused; 10 concurrent executes -> one payment; our node restarts mid-uncertainty; payee offline -> proven failure -> retry settles once; real LNURL-pay. Full log: `docs/evidence/real-lightning-test-2026-11-11.txt` |
| `pnpm demo:full` | 0 | the transcript below; last line `ALL ASSERTIONS PASSED (real-regtest). Evidence: docs/evidence/demo-real-regtest-<stamp>.md` |

### 2.1 What `pnpm demo:full` prints, stage by stage

| Stage | What happens | Printed assertions |
|---|---|---|
| Setup | fresh database, API on port 8788 (`ORYNT_ENV=development`, `ORYNT_FAILPOINTS=1`), verifier bundle built | `API ready on http://127.0.0.1:8788 with database orynt_demo_...` |
| Workspace | owner, operator, approver; alice connected with the least-privilege macaroon over LND REST | `wallet connected on regtest; discovered permissions: send=true lookup=true`; `connection is a REAL LND node (least-privilege macaroon)` |
| A. Normal payout | bob mints a 30,000-sat invoice; operator creates and submits; the approver (a different person) signs the intent digest; operator executes | `PO-0001 approved by a different person than its creator`; `state SETTLED (REAL_PROVIDER)`; `payee node (bob) independently shows the invoice SETTLED with the same preimage`; `sha256(preimage) == payment hash` |
| B. Lost response | 31,000-sat payout; failpoint `execute.after_provider_response` armed (**an injected fault**, after LND really accepted the payment) | `HTTP 202: state UNKNOWN — NOT failed`; `second send REFUSED: "Sending again is blocked: the first attempt may already have paid. ..."`; `wallet's own record found by payment hash → SETTLED`; `LND shows exactly one successful payment for this hash` |
| C. SIGKILL | 32,000-sat payout; failpoint `exit` kills the API after LND accepted; server restarted | `[failpoint] ... killing process`; `process died mid-request (no response was ever sent)`; `after restart the payout is UNKNOWN — never FAILED, never retryable`; `reconciled from LND's record → SETTLED` |
| D. Receipts | receipts for A and B fetched; `orynt-verify` run with the issuer key and `--require-real`; tamper, no-trust-root, replay, wrong-payment checks; audit chain verified | `verifier → exit 0 VERIFIED (real, trusted issuer)` with the approval/preimage/time-order lines; `one changed character → verifier REJECTS (exit 1)`; `without a trust root ... (exit 3)`; `presenting the same receipt twice → REPLAY rejected`; `receipt for payment A cannot be passed off as payment B`; `audit hash chains intact (42 entries, 4 streams)`; `second sends blocked this run: 1` |

Honesty notes. In B the loss of the response is an **injected fault**; the payment before it is a real regtest payment. In C the process kill is a real `SIGKILL`, sent to the API process by a failpoint (`process.kill(pid, "SIGKILL")`) at the chosen moment, right after LND accepted the payment; it is not an external operator killing the process. The issuer trust key is fetched from the same server **for demo convenience**; a real verifier must obtain it out of band. All amounts are 30,000 to 32,000 sats, so the default policy needs **one** approver (above 100,000 sats it needs two); the script does not demonstrate a two-approver payout or a refused self-approval; those are covered by the integration test "operators, viewers, API keys and the maker cannot approve" (practice wallet). Evidence of this exact run: `docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.{md,json,transcript.txt}` and `receipt-real-regtest-2026-11-11T10-26-29-483Z-{A,B,A-TAMPERED}.json`. The `commit` field in the JSON is the repository HEAD at run time; the working tree may contain uncommitted changes from parallel work.

## 3. Verifier commands (offline, no server)

```bash
pnpm --filter @orynt/verifier build          # produces packages/verifier/dist/orynt-verify.mjs
ST=2026-11-11T10-26-29-483Z
K=$(node -e "console.log(JSON.parse(require('fs').readFileSync('docs/evidence/receipt-real-regtest-$ST-A.json','utf8')).issuer.public_key)")
V="node packages/verifier/dist/orynt-verify.mjs"
$V docs/evidence/receipt-real-regtest-$ST-A.json --trust-key $K --require-real --expect-network regtest; echo "exit=$?"
```

Taking the issuer key from inside the receipt (as above) only demonstrates the mechanics: it is self-asserted. Obtain the key out of band for a real check (`GET /v1/public/issuer-keys` on the issuing server, informational).

| Command | Exit | Verdict printed | Meaning |
|---|---|---|---|
| receipt A, `--trust-key $K --require-real --expect-network regtest` | **0** | `VERDICT: VERIFIED` after 29 check lines (schema, issuer signature, BOLT11 signature, intent digest, approval signature, `settlement.preimage` sha256 matches, `require.real`, audit chain, checkpoint signature); one warning `! network.note regtest is a test network: the value moved was not real-world money`; then the list "This receipt cannot prove" | real regtest payment verified against a supplied trust root |
| receipt B (settled after an uncertain moment), same flags | **0** | `VERDICT: VERIFIED` | `reconciled_after_uncertainty: true` is in the receipt |
| `receipt-real-regtest-$ST-A-TAMPERED.json` (memo changed by one character), same flags | **1** | `VERDICT: REJECTED`; `✘ attestation.signature`, `✘ agreement.hash` | tamper demo: any change breaks the issuer signature and the agreement hash |
| receipt A without `--trust-key` | **3** | `VERDICT: INTEGRITY_ONLY`; `! issuer.trusted no trust root supplied: the issuer key is self-asserted` | never called VERIFIED without a trust root |
| `receipt-simulator-2026-11-09T15-28-43-507Z-A.json` with its own key and `--require-real` | **1** | `VERDICT: REJECTED`; `✘ require.real --require-real: receipt comes from the simulator` | simulator output is refused as proof of payment |
| the same simulator receipt without `--require-real` | **4** | `VERIFIED_SIMULATED` | verified, but not a real payment |

Exit codes: 0 VERIFIED, 1 REJECTED, 2 usage/IO error, 3 integrity OK but issuer not trusted, 4 VERIFIED_SIMULATED. Replay protection: add `--seen-file <path>`; a second presentation of the same receipt is rejected (shown by `demo:full`). Full transcripts of the commands above: `docs/evidence/verifier-real-2026-11-11.txt`.

### 3.1 Tamper demo by hand

```bash
sed 's/Design work, regtest demo/Design work, regtest demp/' docs/hackathon/video/frames/ui/receipt-A.json > /tmp/receipt-tampered.json   # one character
$V /tmp/receipt-tampered.json --trust-key $(cat docs/hackathon/video/frames/ui/issuer-key.txt) --require-real; echo "exit=$?"     # exit 1, REJECTED
```

(`receipt-A.json` there is the receipt of the browser-driven real regtest payment captured for the video; its memo is "Design work, regtest demo".)

## 4. The same story in the browser (real regtest)

`pnpm exec tsx docs/hackathon/video/tools/capture-real-ui.mts` starts a fresh API (from source, as `demo:full` does), creates a workspace through the API, connects alice with the least-privilege macaroon, and then drives the operations app in Chromium: operator pastes bob's real regtest invoice, Orynt decodes it, the approver creates a browser key and signs, the operator presses Send (real LND payment, settled), a second payout has its response lost by an injected fault (UNKNOWN, Send disabled with the reason written out), "Check the wallet's record now" settles it, receipts download, the in-browser verifier shows VERIFIED, then REJECTED after one character changes. Screenshots land in `docs/hackathon/video/frames/ui/`. Requires the network from section 2 to be running and `pnpm build:all` done. Credentials are never rendered on a captured page.

## 5. Practice mode (labelled simulator, no Bitcoin software)

Everything in the seeded workspace is labelled "SEED DATA / Practice wallet - no real value"; receipts are stamped `SIMULATOR` and verify only as `VERIFIED_SIMULATED` (exit 4).

```bash
pnpm install && pnpm db:start && pnpm build:all
# tested 2026-11-11 against a fresh database. Three variables beyond the obvious ones are REQUIRED today:
ORYNT_ENV=development ORYNT_DEFAULT_PLAN=enterprise ORYNT_WEB_DIST=apps/web/dist ORYNT_SITE_DIST=apps/site/dist \
ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start
# site: http://127.0.0.1:8787/      app: http://127.0.0.1:8787/app/
# sign in: demo-owner@orynt.local / demo-password-123 (also demo-operator, demo-approver1, demo-approver2, demo-viewer @orynt.local)
```

- `ORYNT_DEFAULT_PLAN=enterprise`: without it the demo seed fails at start (`entitlement_exceeded`: the free developer plan allows 3 team members, the seed adds 5). Found while testing this quickstart; not yet fixed in the code.
- `ORYNT_WEB_DIST` / `ORYNT_SITE_DIST`: the bundled `apps/api/dist/server.mjs` looks for the web and site builds relative to its own location and finds nothing (`/` and `/app/` return 404 without them). The Dockerfile sets these two variables; `pnpm start` does not. Found while testing this quickstart; not yet fixed in the code.
- The seed password is public in the source: local use only. `ORYNT_ENV=production` refuses the simulator, failpoints and the seed.

Scripted practice run: `pnpm demo:full:sim` (labelled SIMULATED, evidence `docs/evidence/demo-simulator-*.md`; scenario C is skipped because simulator state is in memory).

## 6. Judge quick path (about 10 minutes, real regtest)

```bash
pnpm install && pnpm db:start
bash infra/regtest/fetch.sh && node infra/regtest/up.mjs
pnpm test:real-lightning                     # 15 pass
pnpm demo:full                               # all assertions pass, exit 0
pnpm test                                    # unit: core 24, verifier 26, contract 1
pnpm test:integration                        # 102 pass when ORYNT_REGTEST_ENV is set (real-LND tests included), otherwise the 15 real-LND tests are skipped
```

Counts are from the register run of 2026-11-10; `pnpm test:real-lightning` and `pnpm demo:full` were re-run on 2026-11-11. Other test files may have been added since by ongoing work, so a fresh `pnpm test:integration` can report a larger total.

## 7. What is real and what is simulated

| Item | Practice mode (`demo:full:sim`, tests, seed) | Real regtest (`demo:full`, `test:real-lightning`) |
|---|---|---|
| Control plane: state machine, policy, signed approvals, reservation, reconciler, receipts, audit chain | real code on real PostgreSQL | same |
| Wallet | labelled simulator (`packages/wallets/src/simulator.ts`) | real LND over REST, regtest |
| Result states | `SIMULATED_SETTLED`; receipt `environment: SIMULATOR`; verifier exit 4 | `SETTLED`; `REAL_PROVIDER`; exit 0 with `--require-real` |
| Bitcoin network and funds | none | local regtest chain; worthless coins |
| Lost response | scripted behaviour / failpoint | failpoint after a real payment (B); real process kill (C) |
| Approval keys | scripts/seed; console keeps its key in browser storage | same |
| Issuer key | development key (derived from a public constant unless `ORYNT_ISSUER_KEY` is set) | same |
| Mainnet / testnet | refused / never run | refused / never run |
| Hosting | local only | local only |

Known limit (also in the threat model and in every receipt): a tenant could register a fake LND-compatible server and obtain a "REAL" receipt for a payment it controls on both sides. A receipt proves a preimage was produced, not that the payee is independent.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ORYNT_ENV must be set explicitly` | mandatory variable | `ORYNT_ENV=development` for local use |
| `pg_lsclusters not found` | not Debian/Ubuntu PostgreSQL | create role `orynt` (password `orynt`, `CREATEDB`) and DB `orynt_dev`; export `DATABASE_URL`, `TEST_ADMIN_DATABASE_URL` |
| `permission denied to create database` | role lacks `CREATEDB` | `ALTER ROLE orynt CREATEDB;` |
| `Real mode needs a regtest network` from `demo:full` | `.regtest/env.json` missing | run `fetch.sh` and `up.mjs`, or use `pnpm demo:full:sim` |
| `CHECKSUM MISMATCH` in `fetch.sh` | download differs from the pin | do not bypass; re-download, or update the pin only after checking the publisher's checksum file |
| LND refuses to start with "node backend does not support taproot" | Bitcoin Core 32.x with LND v0.20.1 | use the pinned Core 29.5 (already in `versions.env`) |
| `up.mjs` port clash | another bitcoind/lnd running | `node infra/regtest/down.mjs`, or stop the other processes |
| `seed POST /v1/members -> 402 entitlement_exceeded` | demo seed vs free plan | add `ORYNT_DEFAULT_PLAN=enterprise` (section 5) |
| `/` or `/app/` returns 404 under `pnpm start` | web/site dist not found from the bundle | add `ORYNT_WEB_DIST` and `ORYNT_SITE_DIST` (section 5) |
| HTTP 409 `send_blocked_unresolved` | working as designed (payout UNKNOWN/RECONCILING/PENDING or already settled) | reconcile; read `detail` |
| HTTP 409 `wallet_insufficient_permissions` | macaroon lacks `offchain:write`, or capability list older than 24 h | use the least-privilege macaroon from `.regtest/env.json`; `POST /v1/connections/:id/check` |
| HTTP 409 `network_mismatch` / `mainnet_disabled` | wallet not on regtest | point at regtest nodes; never enable mainnet |
| HTTP 409 `invoice_expired` ("expires too soon") | under 120 s of invoice life left | create a fresh invoice |
| `failpoints are disabled` / 404 on `/v1/dev/*` | `ORYNT_FAILPOINTS` not `1`, or production env | start with `ORYNT_ENV=development ORYNT_FAILPOINTS=1` |
| 403 "Missing or invalid CSRF token" | cookie session needs `x-csrf-token` and an allowed `Origin` | use the token from the login response; set `ORYNT_ALLOWED_ORIGINS` |
| Verifier exit 3 | integrity OK but issuer key not supplied | pass `--trust-key` |
| `[pg pool] idle client error: terminating connection due to administrator command` | expected: one test kills DB connections | ignore if the suite passes |

## 9. Evidence to capture when you re-run

`demo:full` writes `docs/evidence/demo-<mode>-<stamp>.{md,json}` and receipts (and a `.seen-<stamp>.txt` replay-ledger scratch file that you should delete). Also keep: `node -v`, `pnpm -v`, the pinned versions (`infra/regtest/versions.env`), the terminal transcript, and update `docs/evidence/README.md`. Never commit macaroons, TLS keys, cookies or passwords (`.regtest/` is gitignored).

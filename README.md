<p align="center"><img src="packages/ui/brand/logo.svg" alt="Orynt" height="56"></p>

# Orynt — every payment, under control

**Bitcoin-native payment authorization and operations.** Orynt sits between *"we decided to pay"* and *your Lightning wallet*: it binds each payout to a signed approval of its exact terms, sends it **once**, treats a lost wallet response as **"checking", not "failed"**, settles only on cryptographic proof, and issues a receipt that anyone can verify **offline without trusting Orynt**.

> **Honest status (2026-11-09).** Hackathon-stage foundation. The control plane, state machine, signed approvals, receipts and the standalone verifier are implemented and tested on real PostgreSQL with a **clearly-labelled simulator wallet**. The real-Lightning (LND) path is **implemented but not yet run against a real node** — see [`docs/EXECUTION-REGISTER.md`](docs/EXECUTION-REGISTER.md). Not audited. Regtest/test networks only. "Orynt" is a provisional name with **no trademark clearance** ([`docs/brand/name-clearance.md`](docs/brand/name-clearance.md)).

## Try it in two minutes (simulator, no Bitcoin software needed)
```bash
pnpm install
pnpm db:start                 # local PostgreSQL 16 (pg_ctlcluster) — or set DATABASE_URL to any PostgreSQL
pnpm build:all
ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start
# → http://127.0.0.1:8787/       marketing site
# → http://127.0.0.1:8787/app    operations app  (demo-owner@orynt.local / demo-password-123; also demo-operator, demo-approver1/2, demo-viewer)
```
Everything in the seeded workspace is labelled **SEED DATA / Practice wallet — no real value**.

## See the whole story, scripted
```bash
pnpm demo:full:sim   # payout → lost response → refused duplicate → reconcile → receipt → verifier → tamper/replay rejected  (SIMULATED run, verified)
pnpm regtest:fetch && pnpm regtest:up && pnpm demo:full    # same story with REAL Lightning payments on local regtest  (NOT yet run — needs bitcoind+lnd; see infra/regtest)
```
Evidence from runs: [`docs/evidence/`](docs/evidence/).

## What's in the repo
| Path | What |
|---|---|
| `packages/core` | amounts, canonical JSON, BOLT11, state machine, policy, intent digest, audit chain, receipt schema |
| `packages/wallets` | wallet contract, LND REST adapter, simulator |
| `packages/verifier` | `orynt-verify` CLI + library (offline receipt verification) |
| `packages/contract`, `packages/sdk` | single-source API contract → OpenAPI + typed client |
| `apps/api` | Fastify + PostgreSQL control plane, worker, migrations |
| `apps/web` | operations app (React) · `apps/site` marketing site |
| `infra/` | regtest scripts, Postgres ops, Docker/deploy templates |
| `docs/` | architecture, security, ops, API, brand, business, research, hackathon, evidence |

## Verify the claims yourself
```bash
pnpm lint && pnpm typecheck && pnpm test            # unit tests
pnpm test:integration                               # 40+ adversarial/ops/load tests on real PostgreSQL (real-LND tests skip without a node)
pnpm --filter @orynt/web build && node apps/web/e2e/run.cjs   # browser E2E at 375/768/1440 + axe (needs Chromium)
pnpm restore:rehearsal                              # backup → restore → audit-chain re-verification
```

## Limits you should know about
Not a custodian, exchange, escrow, or trading tool. Approval/limit enforcement is **application-level** (anyone with the wallet credential can bypass it). The audit log is tamper-**evident**, not immutable. Approval keys live in browser storage. Mainnet is disabled. Nothing is legal, tax or compliance advice; legal drafts are unreviewed. Commercial viability is an **unvalidated hypothesis** ([`docs/business/`](docs/business/README.md)).

License: Apache-2.0 (owner to confirm). Security: [`SECURITY.md`](SECURITY.md). Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md).

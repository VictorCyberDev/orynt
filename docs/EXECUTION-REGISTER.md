# Execution register

Legend: **VERIFIED** = a command was run in this environment, exit code and evidence recorded · **PARTIAL** · **UNVERIFIED** = written, never run · **BLOCKED** = cannot be done here (reason given) · **NOT STARTED**.
Nothing is VERIFIED without a command and evidence path. Environment: Linux x86_64, Node 22.23, pnpm 10.28, PostgreSQL 16.15 (local cluster), no Docker daemon, Chromium (Playwright). Branch `claude/busy-goodall-ajeb0p`, baseline `main` = 6684fcb.

## Milestones

| Milestone | Workstream | Status | Evidence / command | Notes |
|---|---|---|---|---|
| M0 | Repo baseline, source register, runbook | VERIFIED | `git log`; `docs/research/source-register.md` | main was empty → baseline README/.gitignore/Apache-2.0; dev branch is the harness-assigned `claude/busy-goodall-ajeb0p` (not the mandate's suggested name). **main not pushed yet.** |
| M0 | Dakar rules checklist | PARTIAL | `docs/hackathon/rules-checklist.md` | retrieved via Firecrawl; **rules pages conflict** (Africa-resident vs students-only; "wallet implementation") → owner decision |
| M1 | Brand, strategy, spec, tokens | PARTIAL | `docs/brand/`, `docs/business/`, `docs/product/`, `packages/ui/` | mark reviewed as PNG (resembles a progress ring — recorded). No bespoke icon set. Business docs = hypotheses; **no customer validation exists.** |
| M2 | Monorepo, migrations, Postgres, schema | VERIFIED | `pnpm test:integration` (migrations up→down→up, failed-migration rollback, checksum drift) | docker compose is **UNVERIFIED** (no daemon); local PostgreSQL used |
| M2 | **Regtest network (bitcoind + 2×LND, channel)** | **BLOCKED** | `infra/regtest/*` written, `bash -n`/`node --check` only | the sandbox's permission classifier refused to *execute* the checksum-verified downloaded binaries (even `--version`). Binaries downloaded + SHA-256 verified, extracted, **never run** |
| M3 | Auth, tenancy, roles, policy, signed approvals | VERIFIED | `adversarial.itest`, `security.itest` (see matrix) | simulator wallet |
| M4 | **Real Lightning adapter** (LND REST) | **UNVERIFIED** | `packages/wallets/src/lnd.ts`; `apps/api/test/lnd.itest.ts` = **8 skipped** | written from LND docs; never exercised against a node. Error→"not sent / unknown" classification is therefore unproven |
| M4 | Invoice decode/validation (BOLT11) | VERIFIED vs spec | `packages/core/test/bolt11.test.ts` (spec vectors incl. payee-key recovery) | cross-check against real LND invoices is in the skipped test |
| M4 | State machine, durable intents, reconciliation, incidents | VERIFIED (simulator) | `adversarial.itest`, `load.itest`, `demo:full:sim` | |
| M4 | NWC adapter, BTCPay adapter | NOT STARTED | — | cannot be verified here → not shipped (mandate: BTCPay only if verifiable) |
| M5 | Operations app, real APIs, mobile | VERIFIED | `node apps/web/e2e/run.cjs` → **100/100** checks; `docs/evidence/e2e-results.json`; screenshots `docs/evidence/screenshots/{375,768,1440}` | covers sign-in redirect, approval incl. key setup, send, receipt download, in-browser verify + tamper, lost-response recovery, wizard, overflow + axe (serious/critical = 0) on 12 routes × viewports × themes |
| M6 | Receipts + standalone verifier CLI | VERIFIED | `packages/verifier/test` (26 tests: adversarial + built-CLI exit codes) | |
| M6 | SDK, OpenAPI, webhooks, docs | PARTIAL | `docs/api/openapi.json` (generated), `packages/sdk`, `ops.itest` (webhook sign/replay/dedupe/retry) | SDK is typechecked and used by the web app + tests; **not published to npm**; no generated multi-language clients |
| M7 | Marketing site, trust centre, pricing hypotheses | VERIFIED (build, links, claims) | `apps/site`: 12 pages; build ✔; link check 0 broken of 481 refs ✔ and claims check 113 pass ✔ (both re-run by me); axe 0 violations over 50 runs and screenshots are **agent-reported**, not re-run by me | privacy/terms are **unreviewed drafts**; no French; site URL placeholder |
| M8 | Negative-case suite | VERIFIED | see matrix below | |
| M8 | Failpoints, load/concurrency | VERIFIED (simulator) | `docs/evidence/load-check.json`: 100 payouts × 3 concurrent executes → 100 sends, 200 refusals, 0 doubles | not a capacity claim |
| M8 | Cross-device screenshots, a11y | VERIFIED (automated) | as M5 | **no manual screen-reader or human usability testing** |
| M8 | Security review | PARTIAL | `docs/security/threat-model.md` | independent *AI* review, fixes + regression tests; **no human audit/pentest** |
| M9 | 3-min script, storyboard, Devpost text, deck source, deployment plan | DRAFT | `docs/hackathon/` | **video and deck UNRENDERED**; real-regtest segments pending |
| M9 | Public deployment | NOT DONE | `infra/deploy/` templates | needs owner approval; no cost incurred |
| M9 | **Devpost submission** | **NOT SUBMITTED** | — | requires owner |
| M10 | Final audit | see end of file | | |

## Test matrix (commands run on this branch)
| Command | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` (8 workspaces) | exit 0 |
| `pnpm test` (unit) | core 24 · verifier 26 · contract 1 → all pass |
| `pnpm test:integration` (real PostgreSQL 16) | 55 pass · 8 skipped (real-LND, gated) · 0 fail — adversarial 32, security-regression 13, ops 7, load 1, flow 2 |
| `node apps/web/e2e/run.cjs` (Chromium, fresh DB+server) | 100/100 |
| `pnpm demo:full:sim` | all assertions pass — **SIMULATED**, `docs/evidence/demo-simulator-*.md` |
| `pnpm restore:rehearsal` | PASSED (counts equal; 9 audit chains re-verified on restored copy) |
| `pnpm audit --prod --audit-level=high` | no known vulnerabilities |
| `pnpm demo:full` / `pnpm test:real-lightning` | **NOT RUN** (needs regtest) |
| Docker build/compose | **NOT RUN** (no daemon) |
| CI workflow | written, **never run on GitHub** |

## Required negative cases → where covered
duplicate concurrent execute ✔ · duplicate webhook/provider event ✔ · timeout after dispatch ✔ · killed process (synthetic stuck row ✔; **real SIGKILL only in unrun real demo**) · restart recovery ✔ · inconsistent provider callback ✔ · stale lookup/unreachable node ✔ · invoice expired ✔ · **insufficient liquidity**: simulated ✔, real LND **unrun** · wrong network ✔ · amount mismatch ✔ · destination substitution ✔ · changed after approval ✔ · revoked role ✔ · stale approval (policy change) ✔ · duplicate approval ✔ · wrong tenant ✔ · forged receipt ✔ · one-byte receipt change ✔ · transaction rollback ✔ · DB connection interruption ✔ · failed migrations ✔ · clock skew ✔ · stale capability list ✔ · malicious input ✔ · no wallet ✔ · **NWC insufficient permissions: N/A (no NWC)**; read-only LND credential: simulated via capability row ✔, real **unrun** · rate limiting ✔ · refund not silently a reversal ✔ (no edit path; settled has no outgoing transition).

## Defects found and fixed during the build (evidence the tests bite)
Pool starvation deadlock under 20 concurrent executes (found by the concurrency test) · CSP blocked inlined fonts (found in browser) · relative static path crashed startup (smoke run) · empty JSON body rejected (demo) · replay ledger skipped simulator receipts (demo) · double shebang in verifier bundle (hackathon agent) · plus the 15 review findings in `docs/security/threat-model.md`.

# Evidence index

All evidence below is from this repository's branch at the time of writing; re-run the command to reproduce. **SIMULATED evidence is labelled and is not evidence of a real Lightning payment.** No real-Lightning (regtest) evidence exists yet.

| Evidence | Produced by | What it shows | Real or simulated |
|---|---|---|---|
| `e2e-results.json` | `node apps/web/e2e/run.cjs` | 100 UI/a11y/overflow checks, exit 0 | simulator wallet |
| `screenshots/{375,768,1440}/` | same run | every app screen, 3 viewports; `1440/05-payout-unknown-signature-moment.png` is the exception screen | simulator wallet |
| `demo-simulator-*.md/.json`, `receipt-simulator-*.json` | `pnpm demo:full:sim` | payout → lost response → refused duplicate → reconcile → receipt → verifier exit codes → tamper/replay rejected | **SIMULATED** |
| `load-check.json` | `pnpm test:integration` (load.itest) | 100 payouts × 3 concurrent executes → 100 sends / 200 refusals / 0 doubles; latency percentiles | simulator, single machine; not a capacity claim |
| integration/unit results | `pnpm test:integration`, `pnpm test` | see `docs/EXECUTION-REGISTER.md` test matrix | simulator (real-LND tests skipped) |
| restore rehearsal | `pnpm restore:rehearsal` | backup→restore→row counts + audit-chain re-verification | n/a |
| `../security/threat-model.md` | independent AI review + fixes | findings and regression tests | n/a |

Not present (blocked or not done): real regtest run (BLOCKED — see register), recorded video, rendered deck, Docker build, CI run on GitHub, human security audit, customer interviews.

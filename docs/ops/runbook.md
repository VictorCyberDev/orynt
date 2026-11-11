# Operations runbook

## Start / stop
`pnpm db:start` · `pnpm build:all` · `ORYNT_ENV=development ORYNT_SEED_DEMO=1 pnpm start` (demo; `ORYNT_ENV` is mandatory — unset fails closed) or set production env (`docs/ops/production-readiness.md`). Graceful stop on SIGTERM. Health: `GET /health/live`, `GET /health/ready` (database + migrations). Metrics (Prometheus text, loopback or bearer `ORYNT_METRICS_TOKEN`): `GET /metrics`.

## Alerts you should wire (metrics exist; no alerting stack is shipped)
| Condition | Metric | Meaning |
|---|---|---|
| Unresolved payments > 0 for > 5 min | `orynt_unresolved_payments`, `orynt_oldest_unresolved_payment_age_seconds` | a wallet answer was lost and reconciliation isn't finishing |
| Critical incident open | incidents list (`severity=critical`) | `provider_inconsistent` or `reconciliation_stalled` |
| Webhook backlog | `orynt_webhook_deliveries_pending` | receiver down |
| 5xx / problem rate | `orynt_http_problems_total{code}` | |

## Safe recovery procedures (all via the API/UI; never edit state rows by hand)
1. **A payout is UNKNOWN/RECONCILING.** Do *not* retry. Open it → "Check the wallet's record now". The worker also retries with backoff (≈1,2,4…60 s). Result `SETTLED` (preimage verified) or `DEFINITIVELY_FAILED` (wallet reported terminal failure) resolves it.
2. **Wallet unreachable during reconciliation.** State stays blocked; after 8 failed attempts a `reconciliation_stalled` incident opens. Restore wallet connectivity, then "Re-check" the connection and reconcile.
3. **Wallet has no record (NOT_FOUND).** Not proof of failure. Wait until the invoice expires **and** > 2×send-timeout+60 s passed, then an authorised person uses "Confirm it was never sent" (fresh lookup required; audited). Then create a new revision with a fresh invoice.
4. **Process crashed.** On restart: stale `EXECUTION_RESERVED` → released to `APPROVED`; `DISPATCHING` → `UNKNOWN` (never failed). Then procedure 1.
5. **`provider_inconsistent` (wallet claims success but evidence is wrong).** Treat as a security incident: do not settle manually; inspect the wallet directly; contact the wallet operator.
6. **Approver left / role revoked.** Existing approvals stop counting immediately; re-submit for approval.
7. **Key compromise (approval key).** Revoke the member (sessions are killed, approvals no longer count) and re-issue. **Issuer key compromise:** rotate `ORYNT_ISSUER_KEY`, publish the new public key out-of-band, and tell verifiers to bound the old key's `valid_until` in their trust file.

## Backup / restore / rollback
`pnpm backup` → `backups/*.dump` (+ sha256). Restore **into a new database**: `bash infra/postgres/restore.sh <dump> <url>` then `node apps/api/dist/tools/verify-audit.mjs` (re-verifies every audit hash chain). Rehearsal (verified 2026-11-09): `pnpm restore:rehearsal` — row counts equal and all chains verified on the restored copy. Dumps contain *encrypted* wallet credentials; keep `ORYNT_SECRET_KEY` separately (without it stored credentials are unrecoverable and wallets must be reconnected).
Schema rollback: `pnpm --filter @orynt/api db:down` reverts the last migration (down scripts are tested up→down→up). Application rollback: redeploy the previous build; migrations are additive.

## Log hygiene
Structured JSON logs; `authorization`, `cookie`, `set-cookie`, passwords, macaroons, TLS PEMs, API/signing secrets are redacted by configuration. Request ids are echoed in `x-request-id` and in every problem response.

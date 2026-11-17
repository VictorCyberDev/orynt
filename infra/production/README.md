# Production deployment package

**Status: IMPLEMENTED, NOT COMMISSIONED.** Nothing here has been deployed. The API image build and start are verified on GitHub CI; the compose file in this folder is syntax-checked there but has **not** been brought up on a real host (no Docker daemon in the build environment). Do not buy or provision anything on the strength of this document: it lists what you would need to decide first.

## What you get
| Piece | File | Notes |
|---|---|---|
| Stack | `docker-compose.yml` | Caddy (automatic HTTPS) → API (+ in-process worker) → PostgreSQL 16 on a private network. Health checks, memory/CPU limits, read-only root filesystem, no capabilities. |
| TLS + exposure | `Caddyfile` | `/metrics` and `/staff` are **not** reachable from the internet by default. |
| Configuration | `.env.example` | Every secret is required or the stack refuses to start. |
| Backup | `backup.sh` | Compressed `pg_dump`, SHA-256 file, keeps the newest 14. |
| Restore drill | `restore-check.sh` | Restores into a throw-away database, checks row counts, and tells you to run the audit-chain verifier on the copy. Never touches live data. |

## Hard limits (read before relying on it)
1. **Single instance.** The worker runs inside the API process, and crash recovery assumes one process per database. Running two API replicas against one database is unsupported.
2. **PostgreSQL in the same compose file is a convenience, not high availability.** There is no replication or point-in-time recovery. A managed PostgreSQL with PITR is the recommended production choice; set `DATABASE_URL` accordingly and drop the `postgres` service.
3. **The boot guard.** With `ORYNT_ENV=production` the API refuses to start while billing is the sandbox, mail is `log`, or the app URL is not https — unless `ORYNT_ALLOW_UNCOMMISSIONED=1`. That flag exists for a staging environment that knowingly runs without a mail/billing provider; it must not be set on anything customers use.
4. **Mainnet stays disabled.** There is no production switch for it. Billing and wallet commissioning are separate gates: a paid plan changes entitlements only.
5. **Secrets.** `ORYNT_SECRET_KEY` encrypts stored wallet credentials. Lose it and those credentials are unreadable; leak it together with a database dump and they are exposed. Keep it in a secret manager, not in the repository. A key-rotation tool does not exist yet.
6. **Backups** contain every payout, audit event and (encrypted) wallet credential. Store them off-host and encrypted, and practise `restore-check.sh`.

## Deploy (when you have approved the costs)
```bash
cp infra/production/.env.example infra/production/.env      # fill every value
docker compose -f infra/production/docker-compose.yml --env-file infra/production/.env up -d --build
curl -fsS https://$ORYNT_DOMAIN/health/ready
```
Migrations run automatically at API start (`migrateUp`); a failing migration rolls back completely and the API does not start.

## Operate
- **Logs:** structured JSON on stdout (credentials, cookies and query strings are redacted). Ship them with your platform's log driver.
- **Metrics:** `GET /metrics` with `Authorization: Bearer $ORYNT_METRICS_TOKEN`, from inside the network. Alert on: `orynt_unresolved_payments > 0` for more than 10 minutes, `orynt_oldest_unresolved_payment_age_seconds > 900`, `orynt_webhook_deliveries_pending` growing, rising `orynt_http_problems_total{code="internal"}`, and the health check failing. **No alerting is wired**; these are the rules to create.
- **Restart:** `docker compose restart api`. On start the API recovers interrupted payments by asking the wallet for the truth (never by re-sending). Verified on a real regtest node: SIGKILL after the wallet accepted a payment → restart → UNKNOWN → reconciled → SETTLED.
- **Roll back the application:** set `ORYNT_IMAGE_TAG` to the previous tag and `up -d`. Database migrations are forward-compatible within a release; if a migration itself must be undone, use `pnpm --filter @orynt/api db:down` (every migration ships a down script, tested up→down→up) — take a backup first.
- **Staff console:** the image does not ship the provisioning tool. From a trusted checkout run `DATABASE_URL=<production url> ORYNT_ENV=production ORYNT_SECRET_KEY=<key> pnpm --filter @orynt/api staff:create -- <email> "<name>"` (it prints a one-time password and TOTP secret once), then reach `/staff` over a VPN or authenticated tunnel: the proxy blocks it from the internet.

## Not covered
Public staging URL, DNS, a sending domain with SPF/DKIM/DMARC, payment-provider webhooks pointed at `https://<domain>/v1/billing/webhook/<provider>` and `https://<domain>/v1/mail/webhook/resend`, alert routing, on-call, a WAF, and a data-processing agreement. Each needs an owner decision (see `docs/OWNER-REPORT-R3.md`).

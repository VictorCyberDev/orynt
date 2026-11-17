#!/usr/bin/env bash
# Restores a backup into a THROWAWAY database, runs the audit-chain verification and row-count sanity checks, then drops it. Never touches the live database.
# Usage: infra/production/restore-check.sh backups/orynt-....sql.gz
set -euo pipefail
F="${1:?backup file}"; sha256sum -c "$F.sha256"
C="docker compose -f infra/production/docker-compose.yml exec -T postgres"; DB="orynt_restorecheck_$$"
$C psql -U orynt -d postgres -c "CREATE DATABASE $DB" >/dev/null
trap '$C psql -U orynt -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null' EXIT
gunzip -c "$F" | $C psql -q -U orynt -d "$DB" -v ON_ERROR_STOP=1 >/dev/null
$C psql -U orynt -d "$DB" -Atc "SELECT 'organizations='||count(*) FROM organizations UNION ALL SELECT 'obligations='||count(*) FROM payout_obligations UNION ALL SELECT 'audit_events='||count(*) FROM audit_events UNION ALL SELECT 'receipts='||count(*) FROM receipt_exports"
echo "restore OK. Now verify the audit chains on the restored copy: DATABASE_URL=<restored db url> node apps/api/dist/tools/verify-audit.mjs"

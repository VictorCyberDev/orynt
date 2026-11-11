#!/usr/bin/env bash
# Restore a backup INTO A NEW, EMPTY database (never over a live one). Usage: bash infra/postgres/restore.sh backups/x.dump postgres://…/orynt_restored
set -euo pipefail
DUMP="$1"; TARGET="$2"
[ -f "$DUMP.sha256" ] && sha256sum -c "$DUMP.sha256"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$DUMP"
echo "restored into $TARGET — now run: ORYNT_ENV=production DATABASE_URL=$TARGET node apps/api/dist/tools/verify-audit.mjs"

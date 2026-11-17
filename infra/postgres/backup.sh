#!/usr/bin/env bash
# Logical backup (custom format). Usage: DATABASE_URL=postgres://… bash infra/postgres/backup.sh [outfile]
# A backup contains encrypted wallet credentials; protect it like a secret. The ORYNT_SECRET_KEY needed to decrypt them is NOT in the dump.
set -euo pipefail
URL="${DATABASE_URL:-postgres://orynt:orynt@127.0.0.1:5432/orynt_dev}"
OUT="${1:-backups/orynt-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$OUT")"
PGPASSWORD="${PGPASSWORD:-}" pg_dump --format=custom --no-owner --no-privileges "$URL" -f "$OUT"
sha256sum "$OUT" | tee "$OUT.sha256"
echo "backup written: $OUT"

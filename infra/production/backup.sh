#!/usr/bin/env bash
# Logical backup of the Orynt database to a timestamped, checksummed file; keeps the newest $KEEP (default 14).
# Usage: infra/production/backup.sh [dir]   (run from the repo root on the Docker host; schedule with cron/systemd)
# A backup that was never restored is not a backup: run infra/production/restore-check.sh against it regularly.
set -euo pipefail
DIR="${1:-./backups}"; KEEP="${KEEP:-14}"; mkdir -p "$DIR"
F="$DIR/orynt-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose -f infra/production/docker-compose.yml exec -T postgres pg_dump -U orynt -d orynt --no-owner | gzip -9 > "$F"
sha256sum "$F" > "$F.sha256"
ls -1t "$DIR"/orynt-*.sql.gz | tail -n +"$((KEEP+1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "wrote $F ($(du -h "$F" | cut -f1))"
# Backups contain wallet credentials in ENCRYPTED form and all payout data: store them off-host, encrypted, with access limited like production.

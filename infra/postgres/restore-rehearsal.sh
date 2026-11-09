#!/usr/bin/env bash
# Rehearses backup → restore → integrity check against a scratch database. Exit 0 only if row counts match AND all audit chains verify.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="${1:-postgres://orynt:orynt@127.0.0.1:5432/orynt_dev}"
ADMIN="${TEST_ADMIN_DATABASE_URL:-postgres://orynt:orynt@127.0.0.1:5432/orynt_test}"
NAME="orynt_restore_$$"; TARGET="${ADMIN%/*}/$NAME"; DUMP="$(mktemp -d)/rehearsal.dump"
psql "$ADMIN" -qc "CREATE DATABASE $NAME"
trap 'psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $NAME WITH (FORCE)" >/dev/null' EXIT
DATABASE_URL="$SRC" bash infra/postgres/backup.sh "$DUMP" >/dev/null
bash infra/postgres/restore.sh "$DUMP" "$TARGET" >/dev/null
for t in organizations users payout_obligations obligation_revisions approvals payment_intents execution_attempts audit_events receipt_exports; do
  a=$(psql "$SRC" -tAc "select count(*) from $t"); b=$(psql "$TARGET" -tAc "select count(*) from $t")
  [ "$a" = "$b" ] && echo "  ✔ $t: $a rows" || { echo "  ✘ $t differs ($a vs $b)"; exit 1; }
done
pnpm --filter @orynt/api build >/dev/null
ORYNT_ENV=development DATABASE_URL="$TARGET" node apps/api/dist/tools/verify-audit.mjs
echo "restore rehearsal PASSED"

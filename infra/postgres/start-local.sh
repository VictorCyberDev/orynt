#!/usr/bin/env bash
# Starts a local PostgreSQL (no Docker needed) and creates the orynt dev/test databases.
# Uses the distro cluster via pg_ctlcluster. For Docker users: `docker compose -f infra/docker-compose.yml up -d postgres`.
set -euo pipefail
if command -v pg_lsclusters >/dev/null 2>&1; then
  VER=$(pg_lsclusters -h | awk 'NR==1{print $1}'); NAME=$(pg_lsclusters -h | awk 'NR==1{print $2}')
  if ! pg_lsclusters -h | awk 'NR==1{print $4}' | grep -q online; then pg_ctlcluster "$VER" "$NAME" start; fi
  for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
  as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
  as_pg "psql -tAc \"select 1 from pg_roles where rolname='orynt'\"" | grep -q 1 || as_pg "psql -c \"create role orynt login password 'orynt' createdb\""
  for db in orynt_dev orynt_test; do
    as_pg "psql -tAc \"select 1 from pg_database where datname='$db'\"" | grep -q 1 || as_pg "createdb -O orynt $db"
  done
  echo "postgres ready: postgres://orynt:orynt@127.0.0.1:5432/orynt_dev"
else
  echo "pg_lsclusters not found; start PostgreSQL yourself and set DATABASE_URL" >&2; exit 1
fi

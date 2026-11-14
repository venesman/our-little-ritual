#!/usr/bin/env bash
# Runs every migration, then every *_test.sql file, against a throwaway local
# PostgreSQL 15+ cluster with a Supabase-like auth stub.
# Usage: npm run test:db   (needs initdb/pg_ctl/psql on PATH or PG_BIN set)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"

TMP="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

RUNAS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$TMP" 2>/dev/null || true
  RUNAS=(runuser -u postgres --)
  chmod 755 "$TMP"
fi

"${RUNAS[@]}" initdb -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$HERE/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
status=0
for t in "$HERE"/*_test.sql; do
  echo "test     $(basename "$t")"
  if ! "${PSQL[@]}" -f "$t" >/dev/null; then status=1; fi
done
for t in "$HERE"/*_test.sh; do
  [ -e "$t" ] || continue
  echo "test     $(basename "$t")"
  if ! PSQL_HOST="$TMP" PSQL_PORT="$PORT" bash "$t"; then status=1; fi
done
[ $status -eq 0 ] && echo "ALL DATABASE TESTS PASSED" || echo "DATABASE TESTS FAILED"
exit $status

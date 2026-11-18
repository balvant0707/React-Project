#!/usr/bin/env bash
# Runs SQL test files against the local database of an app (supabase start in apps/<app>).
# Usage: tools/sql-test.sh <app> <file.sql> [file.sql ...]     (container supabase_db_rbp-<app>)
# Every test file rolls back by itself (convention from both source apps). Exit 1 on an error or a FAIL line.
set -uo pipefail
app="${1:?usage: sql-test.sh <app> <file.sql> ...}"; shift
status=0
for file in "$@"; do
  # A test that switches to `authenticator` (runs like PostgREST) needs the superuser, as NPM's run.sh chose it.
  user="${PSQL_USER:-postgres}"
  [ -z "${PSQL_USER:-}" ] && grep -q "session authorization" "$file" && user=supabase_admin
  # The local stack's dev password (a recreated container may ask for it on the socket for supabase_admin).
  out=$(docker exec -i -e PGPASSWORD="${PGPASSWORD:-postgres}" "supabase_db_rbp-$app" psql -U "$user" -d postgres -X -q -v ON_ERROR_STOP=1 < "$file" 2>&1); rc=$?
  echo "== $(basename "$file")"; echo "$out" | grep -vE "^\(|^-+\+|^$" | head -60
  # A failed statement is a failure even where the file says \set ON_ERROR_STOP off (the ported print-only tests do): the
  # transaction is aborted and the rest of the file is silently skipped. (A deliberate refusal is run inside pg_temp.rows()
  # or a DO block with an exception handler, it prints no ERROR: line.)
  if echo "$out" | grep -qE '^ERROR:'; then echo "  unexpected SQL error(s) - the rest of the file did not run:"; echo "$out" | grep -E '^ERROR:' | grep -v 'current transaction is aborted' | head -3 | sed 's/^/    /'; status=1; fi
  if [ $rc -ne 0 ] || echo "$out" | grep -q "FAIL"; then status=1; fi
done
exit $status

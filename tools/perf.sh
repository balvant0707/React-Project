#!/usr/bin/env bash
# List perf check against the local stack (container supabase_db_rbp-<app>): the probe file times list queries as several
# users with RLS on and rolls back; each probe is compared with <name>_baseline.tsv next to <name>_lists.sql.
#   tools/perf.sh <app> <file>            fail when a probe is slower than FACTOR x baseline + SLACK ms (2.5, 30) twice in a row
#   tools/perf.sh <app> <file> --update   write the new baseline (commit it with the change or the new probe)
# From COMPASS scripts/run-perf.sh; changed: app and probe file are arguments.
set -u
cd "$(dirname "$0")/.."
APP="${1:?usage: tools/perf.sh <app> <file.sql> [--update]}"
FILE="${2:?usage: tools/perf.sh <app> <file.sql> [--update]}"
MODE="${3:-}"
DB="${DB_CONTAINER:-supabase_db_rbp-$APP}"
BASELINE="${FILE%_lists.sql}_baseline.tsv"
FACTOR="${PERF_FACTOR:-2.5}"
SLACK="${PERF_SLACK:-30}"

run() {
  docker exec -i "$DB" psql -U postgres -At < "$FILE" 2>&1 | awk -F'|' '
    /^ERROR/ { print "ERROR\t" $0; next }
    $1 == "PERF" { print $2 "\t" $3 "\t" $4 }'
}

current=$(run)
if echo "$current" | grep -q "^ERROR"; then
  echo "$FILE failed:"; echo "$current" | grep "^ERROR"; exit 1
fi

if [ "$MODE" = "--update" ]; then
  { echo -e "# user\tprobe\tms (best of five; written by tools/perf.sh --update)"; echo "$current"; } > "$BASELINE"
  echo "Baseline written to $BASELINE ($(echo "$current" | wc -l) probes)."
  exit 0
fi
if [ ! -f "$BASELINE" ]; then echo "No baseline yet: tools/perf.sh $APP $FILE --update"; exit 1; fi

# Probes over the limit (one line each: user, probe, ms, baseline, limit); new probes without a baseline are listed.
check() {
  awk -F'\t' -v factor="$FACTOR" -v slack="$SLACK" -v mode="$1" '
    NR == FNR { if ($0 !~ /^#/) base[$1 "\t" $2] = $3; next }
    {
      key = $1 "\t" $2
      if (!(key in base)) { if (mode == "report") printf "new   %-6s %-24s %8.1f ms (no baseline)\n", $1, $2, $3; next }
      limit = base[key] * factor + slack
      if ($3 > limit) { print key "\t" $3 "\t" base[key] "\t" limit }
      else if (mode == "report") printf "ok    %-6s %-24s %8.1f ms (baseline %.1f)\n", $1, $2, $3, base[key]
    }' "$BASELINE" -
}

echo "$current" | check report
slow=$(echo "$current" | check fail)
if [ -n "$slow" ]; then
  # A second run decides: noise rarely hits the same probe twice.
  echo "Over the limit, measuring again: $(echo "$slow" | cut -f1,2 | tr '\t\n' ' ')"
  again=$(run)
  slow=$(echo "$again" | check fail | cut -f1,2 | grep -Fx -f <(echo "$slow" | cut -f1,2) || true)
  if [ -n "$slow" ]; then
    echo; echo "Slower than ${FACTOR}x baseline + ${SLACK} ms in two runs:"
    echo "$again" | check fail | grep -F -f <(echo "$slow") | awk -F'\t' '{ printf "SLOW  %-6s %-24s %8.1f ms (baseline %.1f, limit %.1f)\n", $1, $2, $3, $4, $5 }'
    exit 1
  fi
fi
echo; echo "Performance within the baseline."

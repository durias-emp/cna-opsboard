#!/usr/bin/env bash
# Exports every table to backups/YYYY-MM-DD/<table>.json via the Supabase REST API.
# Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (already present for dev).
# Backups contain passenger PII — backups/ is gitignored; keep the folder private.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
# After RLS lockdown the anon key cannot read tables; export SUPABASE_SERVICE_ROLE_KEY (from the Supabase dashboard) before running.
KEY="${SUPABASE_SERVICE_ROLE_KEY:-$VITE_SUPABASE_ANON_KEY}"
D="backups/$(date +%Y-%m-%d)"; mkdir -p "$D"
TABLES="aircraft flights flight_itineraries todos task_updates snags fluid_logs grease_logs maintenance_items maintenance_compliance_log tank_fillups jerry_cans team_profiles device_tokens"
for t in $TABLES; do
  code=$(curl -s -o "$D/$t.json" -w "%{http_code}" \
    "$VITE_SUPABASE_URL/rest/v1/$t?select=*&limit=10000" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Range: 0-9999")
  [ "$code" = "200" ] || { echo "FAILED $t (HTTP $code)"; exit 1; }
  printf "%-28s ok\n" "$t"
done
echo "Backup written to $D"

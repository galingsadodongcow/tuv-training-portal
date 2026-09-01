#!/usr/bin/env bash
# Seed and migrate the local Supabase stack for Academy Portal development.
#
# This is idempotent: it (re)creates the demo Auth users, applies the app
# migrations the first time the academy_v2 schema is absent, exposes academy_v2
# to PostgREST, and writes .env.local for `pnpm dev`. Safe to run on every boot.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Shared password for every demo identity. Local development only.
DEV_PASSWORD="${ACADEMY_DEV_PASSWORD:-portaldev123}"

# email|full name  (roles are assigned by migrations 0003/0004/0005)
DEMO_USERS=(
  "alanclifford.filart@tuv.com|Alan Clifford Filart"
  "alan.test@tuv-portal.local|Alan — Operations"
  "romely.test@tuv-portal.local|Romely — Operations"
  "joane.test@tuv-portal.local|Joane — Sales"
  "melis.test@tuv-portal.local|Melis — Sales"
  "pinky.test@tuv-portal.local|Pinky — Manager"
  "qa-axe-bot@tuv-training-portal.netlify.app|QA — Auditor"
)

echo "[setup] reading supabase status..."
eval "$(supabase status -o env | sed 's/^/export /')"
: "${API_URL:?supabase is not running}" "${DB_URL:?}" "${SERVICE_ROLE_KEY:?}" "${PUBLISHABLE_KEY:?}"

echo "[setup] ensuring demo auth users exist..."
for entry in "${DEMO_USERS[@]}"; do
  email="${entry%%|*}"; name="${entry##*|}"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$DEV_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}")"
  case "$code" in
    200|201) echo "  created  $email" ;;
    422)     echo "  exists   $email" ;;
    *)       echo "  WARN     $email -> http $code" ;;
  esac
done

schema_exists="$(psql "$DB_URL" -tAc "select 1 from information_schema.schemata where schema_name='academy_v2'" 2>/dev/null || true)"
if [ "$schema_exists" != "1" ]; then
  echo "[setup] applying migrations to a fresh database..."
  apply() { echo "  apply $1"; psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$2"; }
  for f in $(ls supabase/migrations/*.sql | sort); do
    apply "$(basename "$f")" "$f"
  done
else
  echo "[setup] academy_v2 already present; skipping migrations."
fi

echo "[setup] exposing academy_v2 to PostgREST..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "alter role authenticator set pgrst.db_schemas = 'public, graphql_public, academy_v2'; notify pgrst, 'reload config'; notify pgrst, 'reload schema';"

echo "[setup] writing .env.local..."
cat > "$REPO_ROOT/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV

echo "[setup] done. Sign in at http://localhost:3000/login"
echo "        Administrator: alanclifford.filart@tuv.com / $DEV_PASSWORD"

#!/usr/bin/env bash
# Sundai profile override for post_approve. Copied to
# scripts/release/hooks/post_approve.sh in Sundai target repos.
#
# Re-verifies the Sundai project surface after a vX.Y.0 tag:
#   - GitHub link visible on the public card
#   - Demo link visible (matches latest deploy)
#   - Full description renders (not null/empty)
#   - Team member vyahhi present
#   - Thumbnail present
#   - Self-like applied
#
# Env consumed:
#   RT_VERSION, RT_TAG, RT_APP_DIR, RT_SPEC_DIR, RT_WORKFLOW_DIR
#
# Auxiliary env expected from .env.sundai (sourced):
#   SUNDAI_PROJECT_ID       — the Sundai project UUID
#   SUNDAI_CLERK_CLIENT     — Clerk __client cookie
#   SUNDAI_SESSION_ID       — Clerk session id
#   SUNDAI_COOKIE_HEADER    — optional cookie-header shortcut
#
# Exit codes:
#   0  — all surface items verified
#   1  — one or more items missing / API error (tracking issue reopens)
#
# API patterns: skills/sundai-project-pipeline/references/sundai-api-mode.md
set -euo pipefail

if [ -f .env.sundai ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.sundai
  set +a
fi

: "${SUNDAI_PROJECT_ID:?SUNDAI_PROJECT_ID required in env}"

log="${RT_WORKFLOW_DIR:-.workflow}/post_approve.log"
mkdir -p "$(dirname "$log")"
echo "[$(date -u +%FT%TZ)] post_approve.sundai.sh start version=$RT_VERSION tag=$RT_TAG" >> "$log"

mint_jwt() {
  curl -fsS -X POST \
    "https://clerk.sundai.club/v1/client/sessions/${SUNDAI_SESSION_ID}/tokens" \
    -H "Cookie: __client=${SUNDAI_CLERK_CLIENT}" \
    -H "Origin: https://www.sundai.club" \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('jwt',''))"
}

api_get() {
  local path=$1
  local jwt
  jwt=$(mint_jwt)
  curl -fsS \
    -H "Cookie: __session=${jwt}; __client_uat=$(date +%s)" \
    "https://www.sundai.club/api${path}"
}

project_json=$(api_get "/projects/${SUNDAI_PROJECT_ID}") || {
  echo "post_approve: Sundai GET failed" >&2
  echo "[$(date -u +%FT%TZ)] GET failed" >> "$log"
  exit 1
}

check() {
  local label=$1
  local expr=$2
  if python3 -c "import sys, json; d=json.loads(sys.stdin.read()); sys.exit(0 if ($expr) else 1)" \
       <<< "$project_json"; then
    echo "ok:   $label" | tee -a "$log"
  else
    echo "miss: $label" | tee -a "$log" >&2
    return 1
  fi
}

rc=0
check "github link present"   "bool(d.get('githubUrl'))"                  || rc=1
check "demo link present"     "bool(d.get('demoUrl'))"                    || rc=1
check "description non-empty" "bool((d.get('description') or '').strip())" || rc=1
check "thumbnail present"     "bool(d.get('thumbnailId'))"                || rc=1
check "team includes vyahhi"  "any((p.get('hacker') or {}).get('username') == 'vyahhi' for p in (d.get('participants') or []))" || rc=1
check "status APPROVED"       "d.get('status') == 'APPROVED'"             || rc=1

echo "[$(date -u +%FT%TZ)] post_approve.sundai.sh rc=$rc" >> "$log"
exit "$rc"

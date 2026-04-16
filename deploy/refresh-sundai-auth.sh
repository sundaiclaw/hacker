#!/usr/bin/env bash
# refresh-sundai-auth.sh — Sundai auth helper (JWT mint + legacy OAuth fallback)
#
# NOTE:
# - The preferred recovery path is direct Clerk password re-auth using bot creds from .env.sundai.
# - This script still implements the older GitHub OAuth fallback and should not be treated as the only auth refresh path.
# - If direct Clerk/browser password login succeeds, persist fresh SUNDAI_CLERK_CLIENT + SUNDAI_SESSION_ID and resume API-first execution.
#
# Usage:
#   source deploy/refresh-sundai-auth.sh   # loads sundai_cookie_header function
#   COOKIE=$(sundai_cookie_header)         # get fresh cookie for API calls
#   curl -H "Cookie: $COOKIE" https://www.sundai.club/api/projects
#
# Or standalone:
#   deploy/refresh-sundai-auth.sh           # prints fresh SUNDAI_COOKIE_HEADER
#   deploy/refresh-sundai-auth.sh --update  # updates .env.sundai in-place
#   deploy/refresh-sundai-auth.sh --dry-run # validate env + connectivity without minting tokens
#   deploy/refresh-sundai-auth.sh --status  # JSON health check of current token
#
# Env vars required:
#   SUNDAI_CLERK_CLIENT  — long-lived __client JWT from Clerk (~10yr)
#   SUNDAI_SESSION_ID    — active Clerk session ID (sess_*)
#   GITHUB_USERNAME      — for OAuth re-auth fallback
#   GITHUB_PASSWORD      — for OAuth re-auth fallback

set -euo pipefail

# ── Exit codes ────────────────────────────────────────────────────────
readonly EX_OK=0                  # success
readonly EX_GENERAL=1             # general / unknown error
readonly EX_MISSING_ENV=2         # missing required env vars
readonly EX_CLERK_REFRESH=3       # Clerk session refresh failed
readonly EX_GITHUB_OAUTH=4        # GitHub OAuth fallback failed
readonly EX_TOKEN_WRITE=5         # token write / persistence failed

# ── Logging helpers ───────────────────────────────────────────────────
log_info()  { echo "[$(date -u +%FT%TZ)] [INFO]  $*" >&2; }
log_warn()  { echo "[$(date -u +%FT%TZ)] [WARN]  $*" >&2; }
log_error() { echo "[$(date -u +%FT%TZ)] [ERROR] $*" >&2; }

# ── Paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${SUNDAI_ENV_FILE:-$REPO_DIR/.env.sundai}"
COOKIE_JAR="/tmp/sundai_clerk_cookies.txt"
GH_COOKIE_JAR="/tmp/sundai_gh_cookies.txt"

# ── Env loader ────────────────────────────────────────────────────────
_load_env() {
  if [ -z "${SUNDAI_CLERK_CLIENT:-}" ] && [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

# ── Fast path: mint a fresh __session JWT using the long-lived __client cookie
_refresh_session_token() {
  local client_jwt="${SUNDAI_CLERK_CLIENT:?SUNDAI_CLERK_CLIENT not set}"
  local session_id="${SUNDAI_SESSION_ID:?SUNDAI_SESSION_ID not set}"

  log_info "Minting session token for session $session_id"

  local resp
  resp=$(curl -s -X POST \
    "https://clerk.sundai.club/v1/client/sessions/$session_id/tokens" \
    -H "Cookie: __client=$client_jwt" \
    -H "Origin: https://www.sundai.club" \
    -H "Referer: https://www.sundai.club/" \
    2>/dev/null)

  local jwt
  jwt=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('jwt',''))" 2>/dev/null || true)

  if [ -n "$jwt" ] && [ "$jwt" != "None" ]; then
    log_info "Session token minted successfully"
    echo "$jwt"
    return 0
  fi
  log_warn "Clerk token mint returned empty or null JWT"
  return 1
}

# ── Full GitHub OAuth flow to get fresh Clerk client + session ────────
_full_github_oauth() {
  local gh_user="${GITHUB_USERNAME:?GITHUB_USERNAME not set}"
  local gh_pass="${GITHUB_PASSWORD:?GITHUB_PASSWORD not set}"

  rm -f "$COOKIE_JAR" "$GH_COOKIE_JAR"

  # 1. Start Clerk sign-in with OAuth GitHub strategy
  log_info "Step 1/7: Initiating Clerk OAuth sign-in"
  local clerk_resp
  clerk_resp=$(curl -s -X POST "https://clerk.sundai.club/v1/client/sign_ins" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Origin: https://www.sundai.club" \
    -c "$COOKIE_JAR" \
    -d "strategy=oauth_github&redirect_url=https://www.sundai.club/sso-callback&action_complete_redirect_url=https://www.sundai.club/" \
    2>/dev/null)

  local oauth_url
  oauth_url=$(echo "$clerk_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
fv = data.get('response',data).get('first_factor_verification',{})
print(fv.get('external_verification_redirect_url',''))
" 2>/dev/null)

  if [ -z "$oauth_url" ]; then
    log_error "Failed to get OAuth URL from Clerk"
    return 1
  fi

  # 2. Follow OAuth URL to GitHub login page
  log_info "Step 2/7: Following OAuth URL to GitHub login"
  curl -s -L "$oauth_url" \
    -c "$GH_COOKIE_JAR" \
    -o /tmp/sundai_gh_login.html 2>/dev/null

  local auth_token
  auth_token=$(python3 -c "
import re
with open('/tmp/sundai_gh_login.html') as f:
    html = f.read()
tokens = re.findall(r'name=\"authenticity_token\" value=\"([^\"]+)\"', html)
print(tokens[0] if tokens else '')
" 2>/dev/null)

  if [ -z "$auth_token" ]; then
    log_error "No authenticity_token on GitHub login page"
    return 1
  fi

  # 3. Submit GitHub credentials
  log_info "Step 3/7: Submitting GitHub credentials"
  local login_code
  login_code=$(curl -s -b "$GH_COOKIE_JAR" -c "$GH_COOKIE_JAR" \
    -X POST "https://github.com/session" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Origin: https://github.com" \
    -H "Referer: https://github.com/login" \
    --max-redirs 0 \
    -o /dev/null \
    -w "%{http_code}" \
    --data-urlencode "authenticity_token=$auth_token" \
    --data-urlencode "login=$gh_user" \
    --data-urlencode "password=$gh_pass" \
    -d "webauthn-conditional=undefined&javascript-support=true&webauthn-support=unknown&webauthn-iuvpaa-support=unknown&return_to=" \
    2>/dev/null)

  if [ "$login_code" != "302" ]; then
    log_error "GitHub login failed (HTTP $login_code)"
    return 1
  fi

  # 4. Re-initiate Clerk OAuth (fresh state) and follow to GitHub authorize
  log_info "Step 4/7: Re-initiating Clerk OAuth with fresh state"
  clerk_resp=$(curl -s -X POST "https://clerk.sundai.club/v1/client/sign_ins" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Origin: https://www.sundai.club" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -d "strategy=oauth_github&redirect_url=https://www.sundai.club/sso-callback&action_complete_redirect_url=https://www.sundai.club/" \
    2>/dev/null)

  oauth_url=$(echo "$clerk_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
fv = data.get('response',data).get('first_factor_verification',{})
print(fv.get('external_verification_redirect_url',''))
" 2>/dev/null)

  # 5. Hit GitHub authorize (should auto-authorize or show consent)
  log_info "Step 5/7: GitHub authorization"
  curl -s -b "$GH_COOKIE_JAR" -c "$GH_COOKIE_JAR" \
    "$oauth_url" \
    -o /tmp/sundai_gh_oauth.html 2>/dev/null

  # Check if we need to click "Authorize" or got auto-redirected
  local callback_url
  callback_url=$(python3 -c "
import re
with open('/tmp/sundai_gh_oauth.html') as f:
    html = f.read()
# Check for meta refresh (auto-approved or just-approved)
meta = re.findall(r'content=\"0;url=([^\"]+)\"', html)
if meta:
    import html as htmlmod
    print(htmlmod.unescape(meta[0]))
else:
    # Need to submit authorize form
    tokens = re.findall(r'name=\"authenticity_token\" value=\"([^\"]+)\"', html)
    print('NEED_AUTHORIZE:' + (tokens[0] if tokens else ''))
" 2>/dev/null)

  if [[ "$callback_url" == NEED_AUTHORIZE:* ]]; then
    local form_token="${callback_url#NEED_AUTHORIZE:}"
    if [ -z "$form_token" ]; then
      log_error "Cannot find authorize form token"
      return 1
    fi

    log_info "Submitting GitHub OAuth authorize form"

    # Extract form fields
    local form_fields
    form_fields=$(python3 -c "
import re
with open('/tmp/sundai_gh_oauth.html') as f:
    html = f.read()
fields = {}
for m in re.finditer(r'name=\"([^\"]+)\" value=\"([^\"]+)\"[^>]*type=\"hidden\"', html):
    fields[m.group(1)] = m.group(2)
for m in re.finditer(r'type=\"hidden\"[^>]*name=\"([^\"]+)\" value=\"([^\"]+)\"', html):
    fields[m.group(1)] = m.group(2)
parts = []
for k, v in fields.items():
    if k != 'authenticity_token':
        parts.append(f'{k}={v}')
print('&'.join(parts))
" 2>/dev/null)

    # Submit authorize form
    curl -s -b "$GH_COOKIE_JAR" -c "$GH_COOKIE_JAR" \
      -X POST "https://github.com/login/oauth/authorize" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "Origin: https://github.com" \
      --max-redirs 0 \
      -o /tmp/sundai_gh_authorized.html \
      --data-urlencode "authenticity_token=$form_token" \
      -d "$form_fields&authorize=1" 2>/dev/null

    callback_url=$(python3 -c "
import re, html as htmlmod
with open('/tmp/sundai_gh_authorized.html') as f:
    content = f.read()
meta = re.findall(r'content=\"0;url=([^\"]+)\"', content)
if meta:
    print(htmlmod.unescape(meta[0]))
" 2>/dev/null)
  fi

  if [ -z "$callback_url" ] || [[ ! "$callback_url" == https://clerk.sundai.club/* ]]; then
    log_error "No valid Clerk callback URL obtained"
    return 1
  fi

  # 6. Follow callback to Clerk to complete OAuth
  log_info "Step 6/7: Completing Clerk OAuth callback"
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -L --max-redirs 5 \
    -o /dev/null \
    "$callback_url" 2>/dev/null

  # 7. Extract new client JWT and session ID
  log_info "Step 7/7: Extracting new client JWT and session ID"
  local new_client_jwt
  new_client_jwt=$(awk '/clerk\.sundai\.club.*__client/ {print $NF}' "$COOKIE_JAR" 2>/dev/null | tail -1)

  if [ -z "$new_client_jwt" ]; then
    log_error "No __client cookie after OAuth"
    return 1
  fi

  # Get session ID from client state
  local client_resp
  client_resp=$(curl -s "https://clerk.sundai.club/v1/client" \
    -H "Cookie: __client=$new_client_jwt" \
    -H "Origin: https://www.sundai.club" \
    2>/dev/null)

  local new_session_id
  new_session_id=$(echo "$client_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sessions = data.get('response',data).get('sessions',[])
active = [s for s in sessions if s.get('status') == 'active']
if active:
    print(active[0]['id'])
" 2>/dev/null)

  if [ -z "$new_session_id" ]; then
    log_error "No active session after OAuth"
    return 1
  fi

  # Export for use
  export SUNDAI_CLERK_CLIENT="$new_client_jwt"
  export SUNDAI_SESSION_ID="$new_session_id"

  log_info "OAuth refresh completed — new session: $new_session_id"
}

# ── Build a cookie header string for Sundai API calls ─────────────────
sundai_cookie_header() {
  _load_env

  # Try fast path: mint token with existing client JWT
  local session_jwt
  session_jwt=$(_refresh_session_token 2>/dev/null || true)

  if [ -z "$session_jwt" ]; then
    # Session or client expired — do full OAuth
    log_warn "Session expired, running full GitHub OAuth re-auth..."
    _full_github_oauth
    session_jwt=$(_refresh_session_token 2>/dev/null || true)
  fi

  if [ -z "$session_jwt" ]; then
    log_error "Could not obtain session token"
    return 1
  fi

  local client_uat
  client_uat=$(date +%s)

  echo "__session=$session_jwt; __client_uat=$client_uat"
}

# ── Update .env.sundai with current auth state ────────────────────────
_update_env_file() {
  local env_file="${1:-$ENV_FILE}"

  if [ ! -f "$env_file" ]; then
    log_error "$env_file not found"
    return 1
  fi

  # Update or add SUNDAI_CLERK_CLIENT
  if grep -q "^SUNDAI_CLERK_CLIENT=" "$env_file" 2>/dev/null; then
    sed -i'' -e "s|^SUNDAI_CLERK_CLIENT=.*|SUNDAI_CLERK_CLIENT=$SUNDAI_CLERK_CLIENT|" "$env_file"
  else
    echo "SUNDAI_CLERK_CLIENT=$SUNDAI_CLERK_CLIENT" >> "$env_file"
  fi

  # Update or add SUNDAI_SESSION_ID
  if grep -q "^SUNDAI_SESSION_ID=" "$env_file" 2>/dev/null; then
    sed -i'' -e "s|^SUNDAI_SESSION_ID=.*|SUNDAI_SESSION_ID=$SUNDAI_SESSION_ID|" "$env_file"
  else
    echo "SUNDAI_SESSION_ID=$SUNDAI_SESSION_ID" >> "$env_file"
  fi

  # Update SUNDAI_COOKIE_HEADER with a fresh token
  local fresh_cookie
  fresh_cookie=$(sundai_cookie_header 2>/dev/null)
  if [ -n "$fresh_cookie" ]; then
    if grep -q "^SUNDAI_COOKIE_HEADER=" "$env_file" 2>/dev/null; then
      sed -i'' -e "s|^SUNDAI_COOKIE_HEADER=.*|SUNDAI_COOKIE_HEADER='$fresh_cookie'|" "$env_file"
    else
      echo "SUNDAI_COOKIE_HEADER='$fresh_cookie'" >> "$env_file"
    fi
  fi

  log_info "Updated $env_file"
}

# ── --dry-run: validate env + connectivity without minting tokens ─────
_dry_run() {
  log_info "=== DRY RUN: validating environment and connectivity ==="
  local errors=0

  # 1. Check required env vars
  log_info "Checking required environment variables..."
  for var in SUNDAI_CLERK_CLIENT SUNDAI_SESSION_ID; do
    if [ -z "${!var:-}" ]; then
      log_error "Missing required variable: $var"
      errors=$((errors + 1))
    else
      local _val="${!var}"
      log_info "  $var is set (${#_val} chars)"
    fi
  done

  for var in GITHUB_USERNAME GITHUB_PASSWORD; do
    if [ -z "${!var:-}" ]; then
      log_warn "Missing OAuth fallback variable: $var (OAuth fallback will not work)"
    else
      log_info "  $var is set"
    fi
  done

  if [ "$errors" -gt 0 ]; then
    log_error "Required env vars missing — aborting dry run"
    return "$EX_MISSING_ENV"
  fi

  # 2. Check that Clerk client cookie is non-empty and not obviously expired
  log_info "Checking Clerk client JWT..."
  local client_jwt="${SUNDAI_CLERK_CLIENT:-}"
  if [ -z "$client_jwt" ]; then
    log_error "SUNDAI_CLERK_CLIENT is empty"
    return "$EX_MISSING_ENV"
  fi

  # Decode JWT exp claim (base64url decode the payload)
  local jwt_exp
  jwt_exp=$(echo "$client_jwt" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
parts = token.split('.')
if len(parts) >= 2:
    payload = parts[1]
    # Fix base64url padding
    payload += '=' * (-len(payload) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = data.get('exp', 0)
        print(exp)
    except Exception:
        print(0)
else:
    print(0)
" 2>/dev/null || echo 0)

  local now
  now=$(date +%s)
  if [ "$jwt_exp" -gt 0 ] 2>/dev/null; then
    local remaining=$((jwt_exp - now))
    if [ "$remaining" -le 0 ]; then
      log_error "SUNDAI_CLERK_CLIENT JWT expired $(( -remaining )) seconds ago"
    else
      log_info "  SUNDAI_CLERK_CLIENT JWT expires in ${remaining}s (~$(( remaining / 86400 )) days)"
    fi
  else
    log_warn "  Could not decode exp claim from SUNDAI_CLERK_CLIENT"
  fi

  # 3. Check that session ID looks valid
  local session_id="${SUNDAI_SESSION_ID:-}"
  if [[ "$session_id" == sess_* ]]; then
    log_info "  SUNDAI_SESSION_ID format OK ($session_id)"
  else
    log_warn "  SUNDAI_SESSION_ID does not start with sess_ — possibly invalid"
  fi

  # 4. Connectivity tests (HEAD requests only, no auth)
  log_info "Checking endpoint connectivity..."

  local clerk_http
  clerk_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "https://clerk.sundai.club/v1/client" 2>/dev/null || echo "000")
  if [ "$clerk_http" = "000" ]; then
    log_error "  Cannot reach clerk.sundai.club (timeout or DNS failure)"
    errors=$((errors + 1))
  else
    log_info "  clerk.sundai.club reachable (HTTP $clerk_http)"
  fi

  local gh_http
  gh_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "https://github.com/login" 2>/dev/null || echo "000")
  if [ "$gh_http" = "000" ]; then
    log_error "  Cannot reach github.com (timeout or DNS failure)"
    errors=$((errors + 1))
  else
    log_info "  github.com reachable (HTTP $gh_http)"
  fi

  local sundai_http
  sundai_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "https://www.sundai.club/" 2>/dev/null || echo "000")
  if [ "$sundai_http" = "000" ]; then
    log_error "  Cannot reach www.sundai.club (timeout or DNS failure)"
    errors=$((errors + 1))
  else
    log_info "  www.sundai.club reachable (HTTP $sundai_http)"
  fi

  if [ "$errors" -gt 0 ]; then
    log_error "Connectivity checks failed"
    return "$EX_GENERAL"
  fi

  # 5. Summary
  log_info "=== DRY RUN SUMMARY ==="
  log_info "  All required env vars present"
  log_info "  All endpoints reachable"
  log_info "  Would attempt: Clerk session token mint for session $session_id"
  log_info "  Fallback: GitHub OAuth re-auth as ${GITHUB_USERNAME:-<unset>}"
  log_info "  No tokens minted, no files written"
  return "$EX_OK"
}

# ── --status: JSON health check of current token ──────────────────────
_status() {
  _load_env

  local healthy=false
  local method="unknown"
  local token_age_seconds=-1
  local expires_in_seconds=-1
  local token_file="$ENV_FILE"

  # Check if env file exists and its age
  if [ -f "$token_file" ]; then
    local file_mtime
    # Use stat for mtime; works on both GNU and BSD
    if stat --version >/dev/null 2>&1; then
      # GNU stat
      file_mtime=$(stat -c %Y "$token_file" 2>/dev/null || echo 0)
    else
      # BSD stat (macOS)
      file_mtime=$(stat -f %m "$token_file" 2>/dev/null || echo 0)
    fi
    local now
    now=$(date +%s)
    if [ "$file_mtime" -gt 0 ] 2>/dev/null; then
      token_age_seconds=$((now - file_mtime))
    fi
    log_info "Token file: $token_file (age: ${token_age_seconds}s)" >&2
  else
    log_warn "Token file not found: $token_file" >&2
  fi

  # Check for SUNDAI_COOKIE_HEADER or try to get JWT from env
  local session_jwt=""

  # First try: extract from existing SUNDAI_COOKIE_HEADER
  if [ -n "${SUNDAI_COOKIE_HEADER:-}" ]; then
    session_jwt=$(echo "$SUNDAI_COOKIE_HEADER" | python3 -c "
import sys, re
header = sys.stdin.read().strip()
m = re.search(r'__session=([^;]+)', header)
if m:
    print(m.group(1))
" 2>/dev/null || true)
  fi

  # Determine method: check if SUNDAI_CLERK_CLIENT is present (Clerk path)
  if [ -n "${SUNDAI_CLERK_CLIENT:-}" ] && [ -n "${SUNDAI_SESSION_ID:-}" ]; then
    method="clerk"
  elif [ -n "${GITHUB_USERNAME:-}" ] && [ -n "${GITHUB_PASSWORD:-}" ]; then
    method="github"
  fi

  # Validate JWT if we have one
  if [ -n "$session_jwt" ]; then
    local jwt_info
    jwt_info=$(echo "$session_jwt" | python3 -c "
import sys, json, base64, time
token = sys.stdin.read().strip()
parts = token.split('.')
if len(parts) >= 2:
    payload = parts[1]
    payload += '=' * (-len(payload) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = data.get('exp', 0)
        now = int(time.time())
        remaining = exp - now
        print(f'{remaining}')
    except Exception:
        print('ERR')
else:
    print('ERR')
" 2>/dev/null || echo "ERR")

    if [ "$jwt_info" != "ERR" ]; then
      expires_in_seconds="$jwt_info"
      if [ "$expires_in_seconds" -gt 0 ] 2>/dev/null; then
        healthy=true
        log_info "Session JWT valid, expires in ${expires_in_seconds}s"
      else
        log_warn "Session JWT expired (${expires_in_seconds}s ago)" >&2
      fi
    else
      log_warn "Could not decode session JWT" >&2
    fi
  else
    log_info "No cached session JWT found; checking Clerk credentials..."
    # If we have Clerk creds, that counts as potentially healthy
    if [ -n "${SUNDAI_CLERK_CLIENT:-}" ] && [ -n "${SUNDAI_SESSION_ID:-}" ]; then
      log_info "Clerk credentials present, can mint on demand"
      # Try a quick decode of the __client JWT to see if it's still valid
      local client_exp
      client_exp=$(echo "${SUNDAI_CLERK_CLIENT:-}" | python3 -c "
import sys, json, base64, time
token = sys.stdin.read().strip()
parts = token.split('.')
if len(parts) >= 2:
    payload = parts[1]
    payload += '=' * (-len(payload) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = data.get('exp', 0)
        now = int(time.time())
        remaining = exp - now
        print(remaining)
    except Exception:
        print(0)
else:
    print(0)
" 2>/dev/null || echo 0)

      if [ "$client_exp" -gt 0 ] 2>/dev/null; then
        healthy=true
        expires_in_seconds="$client_exp"
        log_info "Clerk __client JWT valid, expires in ${client_exp}s"
      fi
    fi
  fi

  # Output JSON summary
  cat <<EOJSON
{"healthy": $healthy, "method": "$method", "token_age_seconds": $token_age_seconds, "expires_in_seconds": $expires_in_seconds}
EOJSON
  if [ "$healthy" = true ]; then
    return "$EX_OK"
  else
    return "$EX_GENERAL"
  fi
}

# ── CLI mode ──────────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  _load_env

  case "${1:-}" in
    --dry-run)
      _dry_run
      exit $?
      ;;
    --status)
      _status
      exit $?
      ;;
    --update)
      # Ensure we have valid auth first
      if ! sundai_cookie_header > /dev/null; then
        log_error "Failed to obtain valid auth"
        exit "$EX_CLERK_REFRESH"
      fi
      if ! _update_env_file "${2:-$ENV_FILE}"; then
        log_error "Failed to write env file"
        exit "$EX_TOKEN_WRITE"
      fi
      ;;
    --test)
      cookie=$(sundai_cookie_header) || {
        log_error "Failed to obtain cookie for test"
        exit "$EX_CLERK_REFRESH"
      }
      log_info "Testing API with fresh cookie..."
      result=$(curl -s "https://www.sundai.club/api/projects?status=APPROVED" \
        -H "Cookie: $cookie" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    print(f'OK: {len(data)} projects')
else:
    print(f'FAIL: {data}')
" 2>/dev/null)
      echo "$result"
      ;;
    "")
      # Print fresh cookie header
      cookie=$(sundai_cookie_header) || {
        log_error "Failed to obtain session token"
        exit "$EX_CLERK_REFRESH"
      }
      echo "$cookie"
      ;;
    *)
      log_error "Unknown flag: $1"
      log_error "Usage: $0 [--update [env-file] | --test | --dry-run | --status]"
      exit "$EX_GENERAL"
      ;;
  esac
fi

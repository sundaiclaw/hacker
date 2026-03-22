#!/usr/bin/env bash
# refresh-sundai-auth.sh — Durable Sundai auth via Clerk + GitHub OAuth
#
# Usage:
#   source deploy/refresh-sundai-auth.sh   # loads sundai_cookie_header function
#   COOKIE=$(sundai_cookie_header)         # get fresh cookie for API calls
#   curl -H "Cookie: $COOKIE" https://www.sundai.club/api/projects
#
# Or standalone:
#   deploy/refresh-sundai-auth.sh           # prints fresh SUNDAI_COOKIE_HEADER
#   deploy/refresh-sundai-auth.sh --update  # updates .env.sundai in-place
#
# Env vars required:
#   SUNDAI_CLERK_CLIENT  — long-lived __client JWT from Clerk (~10yr)
#   SUNDAI_SESSION_ID    — active Clerk session ID (sess_*)
#   GITHUB_USERNAME      — for OAuth re-auth fallback
#   GITHUB_PASSWORD      — for OAuth re-auth fallback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${SUNDAI_ENV_FILE:-$REPO_DIR/.env.sundai}"
COOKIE_JAR="/tmp/sundai_clerk_cookies.txt"
GH_COOKIE_JAR="/tmp/sundai_gh_cookies.txt"

# Load env if not already set
_load_env() {
  if [ -z "${SUNDAI_CLERK_CLIENT:-}" ] && [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

# Fast path: mint a fresh __session JWT using the long-lived __client cookie
_refresh_session_token() {
  local client_jwt="${SUNDAI_CLERK_CLIENT:?SUNDAI_CLERK_CLIENT not set}"
  local session_id="${SUNDAI_SESSION_ID:?SUNDAI_SESSION_ID not set}"

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
    echo "$jwt"
    return 0
  fi
  return 1
}

# Full GitHub OAuth flow to get fresh Clerk client + session
_full_github_oauth() {
  local gh_user="${GITHUB_USERNAME:?GITHUB_USERNAME not set}"
  local gh_pass="${GITHUB_PASSWORD:?GITHUB_PASSWORD not set}"

  rm -f "$COOKIE_JAR" "$GH_COOKIE_JAR"

  # 1. Start Clerk sign-in with OAuth GitHub strategy
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
    echo "ERROR: Failed to get OAuth URL from Clerk" >&2
    return 1
  fi

  # 2. Follow OAuth URL to GitHub login page
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
    echo "ERROR: No authenticity_token on GitHub login page" >&2
    return 1
  fi

  # 3. Submit GitHub credentials
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
    echo "ERROR: GitHub login failed (HTTP $login_code)" >&2
    return 1
  fi

  # 4. Re-initiate Clerk OAuth (fresh state) and follow to GitHub authorize
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
      echo "ERROR: Cannot find authorize form token" >&2
      return 1
    fi

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
    echo "ERROR: No valid Clerk callback URL obtained" >&2
    return 1
  fi

  # 6. Follow callback to Clerk to complete OAuth
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -L --max-redirs 5 \
    -o /dev/null \
    "$callback_url" 2>/dev/null

  # 7. Extract new client JWT and session ID
  local new_client_jwt
  new_client_jwt=$(awk '/clerk\.sundai\.club.*__client/ {print $NF}' "$COOKIE_JAR" 2>/dev/null | tail -1)

  if [ -z "$new_client_jwt" ]; then
    echo "ERROR: No __client cookie after OAuth" >&2
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
    echo "ERROR: No active session after OAuth" >&2
    return 1
  fi

  # Export for use
  export SUNDAI_CLERK_CLIENT="$new_client_jwt"
  export SUNDAI_SESSION_ID="$new_session_id"

  echo "OAUTH_REFRESHED:$new_session_id" >&2
}

# Build a cookie header string for Sundai API calls
sundai_cookie_header() {
  _load_env

  # Try fast path: mint token with existing client JWT
  local session_jwt
  session_jwt=$(_refresh_session_token 2>/dev/null || true)

  if [ -z "$session_jwt" ]; then
    # Session or client expired — do full OAuth
    echo "Session expired, running full GitHub OAuth re-auth..." >&2
    _full_github_oauth
    session_jwt=$(_refresh_session_token 2>/dev/null || true)
  fi

  if [ -z "$session_jwt" ]; then
    echo "ERROR: Could not obtain session token" >&2
    return 1
  fi

  local client_uat
  client_uat=$(date +%s)

  echo "__session=$session_jwt; __client_uat=$client_uat"
}

# Update .env.sundai with current auth state
_update_env_file() {
  local env_file="${1:-$ENV_FILE}"

  if [ ! -f "$env_file" ]; then
    echo "ERROR: $env_file not found" >&2
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

  echo "Updated $env_file" >&2
}

# CLI mode
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  _load_env

  if [ "${1:-}" = "--update" ]; then
    # Ensure we have valid auth first
    sundai_cookie_header > /dev/null
    _update_env_file "${2:-$ENV_FILE}"
  elif [ "${1:-}" = "--test" ]; then
    cookie=$(sundai_cookie_header)
    echo "Testing API with fresh cookie..." >&2
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
  else
    # Print fresh cookie header
    sundai_cookie_header
  fi
fi

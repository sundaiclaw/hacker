#!/bin/bash
# Detect the Node package manager from lockfiles in a directory.
# Usage: source this file, then call detect_pkg_mgr <dir>
# Sets: PKG_MGR (bun|pnpm|yarn|npm) and PKG_RUN (bun run|pnpm|yarn|npm run)

detect_pkg_mgr() {
  local dir="${1:-.}"

  if [ -f "$dir/bun.lockb" ] || [ -f "$dir/bun.lock" ]; then
    PKG_MGR="bun"
    PKG_RUN="bun run"
  elif [ -f "$dir/pnpm-lock.yaml" ]; then
    PKG_MGR="pnpm"
    PKG_RUN="pnpm"
  elif [ -f "$dir/yarn.lock" ]; then
    PKG_MGR="yarn"
    PKG_RUN="yarn"
  elif [ -f "$dir/package-lock.json" ]; then
    PKG_MGR="npm"
    PKG_RUN="npm run"
  elif [ -f "$dir/package.json" ]; then
    PKG_MGR="npm"
    PKG_RUN="npm run"
  else
    PKG_MGR=""
    PKG_RUN=""
  fi

  export PKG_MGR PKG_RUN
}

has_package_script() {
  local dir="${1:-.}"
  local script_name="${2:?script name required}"

  python3 - "$dir/package.json" "$script_name" <<'PY'
import json
import sys

package_json, script_name = sys.argv[1], sys.argv[2]

try:
    with open(package_json, "r", encoding="utf-8") as fh:
        package = json.load(fh)
except Exception:
    sys.exit(1)

scripts = package.get("scripts", {})
sys.exit(0 if script_name in scripts else 1)
PY
}

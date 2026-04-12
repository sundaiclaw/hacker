#!/bin/bash
# Detect the Node package manager from lockfiles in a directory.
# Usage: source this file, then call detect_pkg_mgr <dir>
# Sets: PKG_MGR (bun|pnpm|yarn|npm) and PKG_RUN (bun run|pnpm|yarn|npx)

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
    PKG_RUN="npx"
  elif [ -f "$dir/package.json" ]; then
    PKG_MGR="npm"
    PKG_RUN="npx"
  else
    PKG_MGR=""
    PKG_RUN=""
  fi

  export PKG_MGR PKG_RUN
}

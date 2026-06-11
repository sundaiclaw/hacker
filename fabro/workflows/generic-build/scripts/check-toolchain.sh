#!/bin/bash
# Check that required toolchain is available.
# Detects tools based on project files present in app/ subdirectory.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-pkg-mgr.sh"

APP_DIR="${APP_DIR:-../app}"
echo "Checking toolchain (project dir: $APP_DIR)..."

# Python (pyproject.toml or requirements.txt)
if [ -f "$APP_DIR/pyproject.toml" ] || [ -f "$APP_DIR/requirements.txt" ]; then
  command -v python3 >/dev/null 2>&1 && python3 --version || { echo "FAIL: python3 not found"; exit 1; }
fi

# uv (pyproject.toml with uv)
if [ -f "$APP_DIR/pyproject.toml" ]; then
  command -v uv >/dev/null 2>&1 && uv --version || { echo "FAIL: uv not found"; exit 1; }
fi

# Node/Frontend — detect package manager from lockfile
if [ -f "$APP_DIR/frontend/package.json" ]; then
  detect_pkg_mgr "$APP_DIR/frontend"
elif [ -f "$APP_DIR/package.json" ]; then
  detect_pkg_mgr "$APP_DIR"
fi

if [ -n "$PKG_MGR" ]; then
  echo "pkg_mgr=$PKG_MGR"
  echo "pkg_run=$PKG_RUN"
  command -v "$PKG_MGR" >/dev/null 2>&1 && $PKG_MGR --version || { echo "FAIL: $PKG_MGR not found"; exit 1; }
fi

# ruff (Python linting)
if [ -f "$APP_DIR/pyproject.toml" ]; then
  command -v ruff >/dev/null 2>&1 && ruff --version || echo "WARN: ruff not found, linting will be skipped"
fi

echo "---TOOLCHAIN OK---"

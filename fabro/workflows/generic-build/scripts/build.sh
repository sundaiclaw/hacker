#!/bin/bash
# Build the project in app/.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-pkg-mgr.sh"

APP_DIR="${APP_DIR:-../app}"

# Frontend build
if [ -f "$APP_DIR/frontend/package.json" ]; then
  detect_pkg_mgr "$APP_DIR/frontend"
  echo "Building frontend ($PKG_MGR)..."
  cd "$APP_DIR/frontend" && $PKG_RUN build 2>&1 && cd ../..
elif [ -f "$APP_DIR/package.json" ] && [ ! -f "$APP_DIR/pyproject.toml" ]; then
  detect_pkg_mgr "$APP_DIR"
  echo "Building ($PKG_MGR)..."
  cd "$APP_DIR" && $PKG_RUN build 2>&1 && cd ..
fi

echo "---BUILD OK---"

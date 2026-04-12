#!/bin/bash
# Install project dependencies based on what's present in app/.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-pkg-mgr.sh"

APP_DIR="${APP_DIR:-../app}"

# Python deps
if [ -f "$APP_DIR/pyproject.toml" ]; then
  echo "Installing Python dependencies..."
  cd "$APP_DIR" && uv sync 2>&1 && cd ..
fi

# Frontend deps
if [ -f "$APP_DIR/frontend/package.json" ]; then
  detect_pkg_mgr "$APP_DIR/frontend"
  echo "Installing frontend dependencies ($PKG_MGR)..."
  cd "$APP_DIR/frontend" && $PKG_MGR install 2>&1 && cd ../..
elif [ -f "$APP_DIR/package.json" ] && [ ! -f "$APP_DIR/pyproject.toml" ]; then
  detect_pkg_mgr "$APP_DIR"
  echo "Installing Node dependencies ($PKG_MGR)..."
  cd "$APP_DIR" && $PKG_MGR install 2>&1 && cd ..
fi

echo "---DEPS OK---"

#!/bin/bash
# Run tests based on project type in app/.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-pkg-mgr.sh"

APP_DIR="${APP_DIR:-../app}"

# Python tests
if [ -d "$APP_DIR/tests/" ] && [ -f "$APP_DIR/pyproject.toml" ]; then
  echo "Running Python tests..."
  cd "$APP_DIR" && uv run python -m pytest tests/ -v 2>&1 && cd ..
fi

# Frontend tests (if test script exists)
if [ -f "$APP_DIR/frontend/package.json" ]; then
  detect_pkg_mgr "$APP_DIR/frontend"
  cd "$APP_DIR/frontend"
  if [ "$PKG_MGR" = "bun" ]; then
    if bun run --silent test --help >/dev/null 2>&1; then
      echo "Running frontend tests ($PKG_MGR)..."
      bun test 2>&1
    fi
  else
    echo "Running frontend tests ($PKG_MGR)..."
    $PKG_MGR test 2>&1
  fi
  cd ../..
fi

echo "---TESTS OK---"

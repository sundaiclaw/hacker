#!/bin/bash
# Run tests based on project type in app/.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/detect-pkg-mgr.sh"

APP_DIR="${APP_DIR:-../app}"

run_node_tests() {
  local dir="${1:?directory required}"
  local label="${2:-Node}"

  detect_pkg_mgr "$dir"

  if ! has_package_script "$dir" "test"; then
    echo "Skipping $label tests ($PKG_MGR): no test script defined"
    return 0
  fi

  echo "Running $label tests ($PKG_MGR)..."
  cd "$dir"
  $PKG_MGR test 2>&1
}

# Python tests
if [ -d "$APP_DIR/tests/" ] && [ -f "$APP_DIR/pyproject.toml" ]; then
  echo "Running Python tests..."
  cd "$APP_DIR" && uv run python -m pytest tests/ -v 2>&1 && cd ..
fi

# Frontend tests (if test script exists)
if [ -f "$APP_DIR/frontend/package.json" ]; then
  run_node_tests "$APP_DIR/frontend" "frontend"
  cd ../..
elif [ -f "$APP_DIR/package.json" ] && [ ! -f "$APP_DIR/pyproject.toml" ]; then
  run_node_tests "$APP_DIR" "Node"
  cd ..
fi

echo "---TESTS OK---"

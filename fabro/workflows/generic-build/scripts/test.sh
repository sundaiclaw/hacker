#!/bin/bash
# Run tests based on project type in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# Python tests
if [ -d "$APP_DIR/tests/" ] && [ -f "$APP_DIR/pyproject.toml" ]; then
  echo "Running Python tests..."
  cd "$APP_DIR" && uv run python -m pytest tests/ -v 2>&1 && cd ..
fi

# Frontend tests (if test script exists)
if [ -f "$APP_DIR/frontend/package.json" ]; then
  cd "$APP_DIR/frontend"
  if bun run --silent test --help >/dev/null 2>&1; then
    echo "Running frontend tests..."
    bun run test 2>&1
  fi
  cd ../..
fi

echo "---TESTS OK---"

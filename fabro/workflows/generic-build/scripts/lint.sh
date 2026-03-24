#!/bin/bash
# Run linters based on project type in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# Python linting with ruff
if [ -f "$APP_DIR/pyproject.toml" ] && command -v ruff >/dev/null 2>&1; then
  echo "Linting Python..."
  cd "$APP_DIR"
  if [ -d src/ ]; then
    PYTHON_DIRS="src/"
  elif ls -d */ 2>/dev/null | head -1 | grep -q .; then
    # Find the main Python package directory
    PYTHON_DIRS="."
  fi
  [ -d tests/ ] && PYTHON_DIRS="$PYTHON_DIRS tests/"
  ruff check $PYTHON_DIRS 2>&1
  cd ..
fi

# Frontend linting (if eslint configured)
if [ -f "$APP_DIR/frontend/.eslintrc.js" ] || [ -f "$APP_DIR/frontend/.eslintrc.json" ] || [ -f "$APP_DIR/frontend/eslint.config.js" ]; then
  echo "Linting frontend..."
  cd "$APP_DIR/frontend" && bun run lint 2>&1 && cd ../..
fi

echo "---LINT OK---"

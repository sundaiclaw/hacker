#!/bin/bash
# Format code in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# Python formatting with ruff
if [ -f "$APP_DIR/pyproject.toml" ] && command -v ruff >/dev/null 2>&1; then
  echo "Formatting Python..."
  cd "$APP_DIR"
  if [ -d src/ ]; then
    PYTHON_DIRS="src/"
  else
    PYTHON_DIRS="."
  fi
  [ -d tests/ ] && PYTHON_DIRS="$PYTHON_DIRS tests/"
  ruff format $PYTHON_DIRS 2>&1
  cd ..
fi

# Frontend formatting (if prettier configured)
if [ -f "$APP_DIR/frontend/.prettierrc" ] || [ -f "$APP_DIR/frontend/.prettierrc.json" ]; then
  echo "Formatting frontend..."
  cd "$APP_DIR/frontend" && bun run format 2>&1 && cd ../..
fi

echo "---FORMAT OK---"

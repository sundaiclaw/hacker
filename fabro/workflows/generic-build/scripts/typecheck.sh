#!/bin/bash
# Run type checking based on project type in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# TypeScript typecheck
if [ -f "$APP_DIR/frontend/tsconfig.json" ]; then
  echo "Typechecking frontend..."
  cd "$APP_DIR/frontend" && bun run typecheck 2>&1 && cd ../..
elif [ -f "$APP_DIR/tsconfig.json" ]; then
  echo "Typechecking..."
  cd "$APP_DIR" && bun run typecheck 2>&1 && cd ..
fi

# Python type checking (if pyright configured)
if [ -f "$APP_DIR/pyproject.toml" ]; then
  if command -v pyright >/dev/null 2>&1; then
    echo "Typechecking Python..."
    cd "$APP_DIR" && pyright 2>&1 && cd ..
  fi
fi

echo "---TYPECHECK OK---"

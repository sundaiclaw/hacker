#!/bin/bash
# Build the project in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# Frontend build
if [ -f "$APP_DIR/frontend/package.json" ]; then
  echo "Building frontend..."
  cd "$APP_DIR/frontend" && bun run build 2>&1 && cd ../..
elif [ -f "$APP_DIR/package.json" ] && [ ! -f "$APP_DIR/pyproject.toml" ]; then
  echo "Building..."
  cd "$APP_DIR" && bun run build 2>&1 && cd ..
fi

echo "---BUILD OK---"

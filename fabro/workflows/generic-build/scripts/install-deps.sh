#!/bin/bash
# Install project dependencies based on what's present in app/.
set -e

APP_DIR="${APP_DIR:-../app}"

# Python deps
if [ -f "$APP_DIR/pyproject.toml" ]; then
  echo "Installing Python dependencies..."
  cd "$APP_DIR" && uv sync 2>&1 && cd ..
fi

# Frontend deps
if [ -f "$APP_DIR/frontend/package.json" ]; then
  echo "Installing frontend dependencies..."
  cd "$APP_DIR/frontend" && bun install 2>&1 && cd ../..
elif [ -f "$APP_DIR/package.json" ] && [ ! -f "$APP_DIR/pyproject.toml" ]; then
  echo "Installing Node dependencies..."
  cd "$APP_DIR" && bun install 2>&1 && cd ..
fi

echo "---DEPS OK---"

#!/usr/bin/env bash
set -euo pipefail

REPO=/home/vyahhi/.openclaw/workspace
TARGET=$REPO/skills/sundai-project-pipeline
ENV_LINK=$REPO/.env.sundai
ENV_TARGET=/home/vyahhi/.openclaw/.env
CHECKLIST_LINK=$REPO/references/checklist.md
CHECKLIST_TARGET=$TARGET/references/checklist.md

if [ ! -d "$REPO/.git" ]; then
  echo "workspace repo missing: $REPO" >&2
  exit 1
fi

git -C "$REPO" fetch origin main
git -C "$REPO" reset --hard origin/main
ln -sfn "$ENV_TARGET" "$ENV_LINK"
mkdir -p "$REPO/references"
ln -sfn "$CHECKLIST_TARGET" "$CHECKLIST_LINK"

echo "synced_hacker_repo=$(git -C "$REPO" rev-parse --short HEAD)"

#!/usr/bin/env bash
set -euo pipefail

REPO=/home/openclaw/.openclaw/workspace
TARGET=$REPO/skills/sundai-project-pipeline
ENV_LINK=$REPO/.env.sundai
ENV_TARGET=/home/openclaw/.openclaw/.env
REFS_SRC=$TARGET/references
REFS_LINK=$REPO/references

if [ ! -d "$REPO/.git" ]; then
  echo "workspace repo missing: $REPO" >&2
  exit 1
fi

git -C "$REPO" fetch origin main
git -C "$REPO" reset --hard origin/main

# Ensure .claude/skills/ symlinks resolve correctly.
# Git stores them as mode-120000 blobs; on systems with core.symlinks=true
# they are already real symlinks after checkout. On systems with
# core.symlinks=false they are plain text files containing the target path.
# Re-create real symlinks here so Claude Code can resolve the skill dirs.
for target in "$REPO"/skills/*/; do
  name=$(basename "$target")
  link="$REPO/.claude/skills/$name"
  # Skip if already a valid symlink
  [ -L "$link" ] && [ -d "$link" ] && continue
  rm -rf "$link"
  ln -sfn "../../skills/$name" "$link"
done

ln -sfn "$ENV_TARGET" "$ENV_LINK"
mkdir -p "$REFS_LINK"
for f in checklist.md ai-endpoint.md sundai-api-mode.md changelog.md design-systems.md design-palettes.md; do
  ln -sfn "$REFS_SRC/$f" "$REFS_LINK/$f"
done

echo "synced_hacker_repo=$(git -C "$REPO" rev-parse --short HEAD)"

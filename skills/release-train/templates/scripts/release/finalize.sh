#!/usr/bin/env bash
# Finalize a release-train minor after @sundaibot approve.
#
# Required env:
#   RT_VERSION        — e.g. v0.1
#   RT_TRACKING_ISSUE — GitHub issue number (integer)
#   RT_PR_NUMBER      — GitHub PR number to merge (integer), or empty to skip
#
# Optional env:
#   RT_APP_DIR        — default "."
#   RT_SPEC_DIR       — default "openspec/changes/$RT_VERSION"
#   RT_WORKFLOW_DIR   — default ".workflow"
#
# Side effects:
#   - Merges the PR (if RT_PR_NUMBER set) via `gh pr merge --squash`.
#   - Creates and pushes annotated git tag vX.Y.0.
#   - Archives openspec/changes/vX.Y/ -> openspec/changes/archive/YYYY-MM-DD-vX.Y/.
#   - Appends an entry to CHANGELOG.md.
#   - Closes the tracking issue with a confirmation comment.
#   - Runs scripts/release/hooks/post_approve.sh if present.
set -euo pipefail

: "${RT_VERSION:?RT_VERSION required (e.g. v0.1)}"
: "${RT_TRACKING_ISSUE:?RT_TRACKING_ISSUE required}"
RT_PR_NUMBER=${RT_PR_NUMBER:-}
RT_APP_DIR=${RT_APP_DIR:-.}
RT_SPEC_DIR=${RT_SPEC_DIR:-openspec/changes/$RT_VERSION}
RT_WORKFLOW_DIR=${RT_WORKFLOW_DIR:-.workflow}

tag="${RT_VERSION}.0"
today=$(date -u +%Y-%m-%d)
archive_dir="openspec/changes/archive/${today}-${RT_VERSION}"

echo "finalize: version=$RT_VERSION tag=$tag"

# 1. Merge PR if one was provided.
if [ -n "$RT_PR_NUMBER" ]; then
  echo "finalize: merging PR #$RT_PR_NUMBER"
  gh pr merge "$RT_PR_NUMBER" --squash --delete-branch
fi

# 2. Refuse to re-tag.
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "finalize: tag $tag already exists — aborting" >&2
  exit 1
fi

# 3. Archive the openspec change.
if [ ! -d "$RT_SPEC_DIR" ]; then
  echo "finalize: spec dir $RT_SPEC_DIR missing — aborting" >&2
  exit 1
fi
if [ -d "$archive_dir" ]; then
  echo "finalize: archive dir $archive_dir already exists — aborting" >&2
  exit 1
fi
mkdir -p openspec/changes/archive
git mv "$RT_SPEC_DIR" "$archive_dir"

# 4. Append CHANGELOG.md.
if [ ! -f CHANGELOG.md ]; then
  printf '# Changelog\n\n' > CHANGELOG.md
fi
{
  printf '\n## %s - %s\n' "$tag" "$today"
  printf -- '- Shipped %s. See %s for the archived spec.\n' "$RT_VERSION" "$archive_dir"
} >> CHANGELOG.md

git add CHANGELOG.md openspec
git commit -m "release: $tag"

# 5. Tag and push.
git tag -a "$tag" -m "Release $tag"
git push origin HEAD "$tag"

# 6. Close the tracking issue.
gh issue close "$RT_TRACKING_ISSUE" \
  --comment "Tagged \`$tag\`. Archived to \`$archive_dir\`. Changelog updated."

# 7. Run post_approve hook if present.
hook="scripts/release/hooks/post_approve.sh"
if [ -x "$hook" ]; then
  echo "finalize: running $hook"
  RT_VERSION="$RT_VERSION" RT_TAG="$tag" \
    RT_APP_DIR="$RT_APP_DIR" RT_SPEC_DIR="$archive_dir" \
    RT_WORKFLOW_DIR="$RT_WORKFLOW_DIR" \
    "$hook"
fi

echo "finalize: done tag=$tag archive=$archive_dir"

#!/usr/bin/env bash
# Compute the next release-train version.
#
# Usage:
#   scripts/release/next-version.sh            # bump minor (Y++)
#   scripts/release/next-version.sh --major    # bump major (X++, Y=1)
#
# Reads existing tags matching vX.Y.0 from git. If none exist, prints v0.1.
# Never touches git state — prints the proposed version to stdout.
set -euo pipefail

mode="minor"
if [ "${1:-}" = "--major" ]; then
  mode="major"
fi

latest=$(git tag --list 'v*.*.0' | sort -V | tail -n1 || true)

if [ -z "$latest" ]; then
  echo "v0.1"
  exit 0
fi

# Strip leading 'v' and trailing '.0'
core=${latest#v}
core=${core%.0}
x=${core%.*}
y=${core#*.}

case "$mode" in
  major)
    x=$((x + 1))
    y=1
    ;;
  minor)
    y=$((y + 1))
    ;;
esac

echo "v${x}.${y}"

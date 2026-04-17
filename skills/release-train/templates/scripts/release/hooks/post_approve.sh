#!/usr/bin/env bash
# Release-train post_approve hook. Default: no-op.
#
# Contract: skills/release-train/references/hooks-contract.md
#
# Env provided:
#   RT_VERSION, RT_TAG, RT_SPEC_DIR, RT_APP_DIR, RT_WORKFLOW_DIR
#
# Exit 0 to mark the release fully complete. Non-zero reopens the tracking
# issue with a post_approve failed comment.
set -euo pipefail
exit 0

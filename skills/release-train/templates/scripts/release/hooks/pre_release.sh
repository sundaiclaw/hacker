#!/usr/bin/env bash
# Release-train pre_release hook. Default: no-op.
#
# Contract: skills/release-train/references/hooks-contract.md
#
# Env provided:
#   RT_VERSION, RT_SPEC_DIR, RT_APP_DIR, RT_WORKFLOW_DIR
#
# Exit 0 to continue the build. Non-zero aborts the cycle.
set -euo pipefail
exit 0

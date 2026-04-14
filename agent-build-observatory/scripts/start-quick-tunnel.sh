#!/usr/bin/env bash
set -euo pipefail
cd /home/openclaw/.openclaw/workspace/agent-build-observatory
mkdir -p .runtime
: > .runtime/cloudflared.log
exec stdbuf -oL -eL cloudflared tunnel --url http://127.0.0.1:3010 2>&1 | tee -a .runtime/cloudflared.log

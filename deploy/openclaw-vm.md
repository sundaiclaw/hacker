# OpenClaw VM Deployment

This repo mirrors the VM-hosted OpenClaw deployment used for Sundai shipping. The current runtime shape is:

- host: Compute Engine VM
- OS family: Ubuntu/Debian-compatible Linux
- process manager: `systemd`
- browser: `google-chrome-stable` in headless mode
- model provider: MiniMax via the Anthropic-compatible endpoint
- model fallback: OpenRouter free router
- bot channel: Telegram

## Files

- `Dockerfile`: portable runtime image for OpenClaw, Chrome, and `gh`
- `deploy/bootstrap-openclaw-vm.sh`: package install and host bootstrap
- `deploy/sync-hacker-skill.sh`: pre-start repo + skill sync script
- `deploy/openclaw.service`: `systemd` unit
- `deploy/openclaw.json.example`: sanitized runtime config
- `.env.example`: sanitized env contract

## VM layout

- app home: `/home/vyahhi/.openclaw`
- private env: `/home/vyahhi/.openclaw/.env`
- pre-start sync script: `/home/vyahhi/.openclaw/bin/sync-hacker-skill.sh`
- runtime config: `/home/vyahhi/.openclaw/openclaw.json`
- workspace repo: `/home/vyahhi/.openclaw/workspace`
- active skill path: `/home/vyahhi/.openclaw/skills/sundai-project-pipeline`
- active skill target: `/home/vyahhi/.openclaw/workspace/skills/sundai-project-pipeline`

## Required setup

1. Provision a VM with outbound internet access.
2. Run `sudo bash deploy/bootstrap-openclaw-vm.sh`.
3. Copy `.env.example` to `/home/vyahhi/.openclaw/.env` and fill in real secrets.
4. Copy `deploy/openclaw.json.example` to `/home/vyahhi/.openclaw/openclaw.json` and replace placeholders.
5. Clone this repo to `/home/vyahhi/.openclaw/workspace`.
6. Ensure `/home/vyahhi/.openclaw/workspace` tracks `https://github.com/sundaiclaw/hacker.git`.
7. Start the service with `sudo systemctl start openclaw`.

## Startup behavior

- `openclaw.service` runs `ExecStartPre=/home/vyahhi/.openclaw/bin/sync-hacker-skill.sh`
- the checked-in unit also loads private vars from `/home/vyahhi/.openclaw/.env`
- that pre-start script:
  - fetches `origin/main`
  - hard-resets the workspace repo to `origin/main`
  - repoints the active skill symlink to the workspace copy
  - re-links `.env.sundai` and `references/checklist.md` inside the workspace
- this guarantees the active `sundai-project-pipeline` skill is refreshed on every service restart
- it does not re-pull before every message while the gateway stays up

## Important env vars

- `OPENCLAW_GATEWAY_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_USER_ID`
- `MINIMAX_API_KEY`
- `MINIMAX_MODEL`
- `GITHUB_TOKEN`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `SUNDAI_USERNAME`
- `SUNDAI_PASSWORD`

## Active identities

- OpenClaw VM runtime GCP identity: `859414203684-compute@developer.gserviceaccount.com`
- GitHub CLI user: `sundaiclaw`

## Verified project access

- Cloud Run create/delete works in `project-3930b9ab-6eae-4b3a-959`
- Cloud Run deploy does not work in `clipmind-project-47895` for the VM service account without extra IAM

## Notes

- Keep `/home/vyahhi/.openclaw/.env` out of git.
- The live VM currently uses Telegram `streaming: "block"`.
- The live VM currently uses `minimax/MiniMax-M2.7` as the default agent model.
- The live VM currently uses `openrouter/free` as the model fallback.
- If the skill expects workspace-relative files like `.env.sundai` or `references/checklist.md`, the pre-start sync script re-links them into `/home/vyahhi/.openclaw/workspace`.

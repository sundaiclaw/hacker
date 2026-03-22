# OpenClaw VM Deployment

This repo mirrors the VM-hosted OpenClaw deployment used for Sundai shipping. The current runtime shape is:

- host: Compute Engine VM
- OS family: Ubuntu/Debian-compatible Linux
- process manager: `systemd`
- browser: `google-chrome-stable` in headless mode
- model provider: MiniMax via the Anthropic-compatible endpoint
- bot channel: Telegram

## Files

- `Dockerfile`: portable runtime image for OpenClaw, Chrome, and `gh`
- `deploy/bootstrap-openclaw-vm.sh`: package install and host bootstrap
- `deploy/openclaw.service`: `systemd` unit
- `deploy/openclaw.json.example`: sanitized runtime config
- `.env.example`: sanitized env contract

## VM layout

- app home: `/home/vyahhi/.openclaw`
- private env: `/home/vyahhi/.openclaw/.env`
- runtime config: `/home/vyahhi/.openclaw/openclaw.json`
- workspace repo: `/home/vyahhi/.openclaw/workspace`
- skill path: `/home/vyahhi/.openclaw/skills/sundai-project-pipeline`

## Required setup

1. Provision a VM with outbound internet access.
2. Run `sudo bash deploy/bootstrap-openclaw-vm.sh`.
3. Copy `.env.example` to `/home/vyahhi/.openclaw/.env` and fill in real secrets.
4. Copy `deploy/openclaw.json.example` to `/home/vyahhi/.openclaw/openclaw.json` and replace placeholders.
5. Clone this repo to `/home/vyahhi/.openclaw/workspace`.
6. Ensure the skill is available at `/home/vyahhi/.openclaw/skills/sundai-project-pipeline`.
7. Start the service with `sudo systemctl start openclaw`.

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

## Notes

- Keep `/home/vyahhi/.openclaw/.env` out of git.
- The live VM currently uses Telegram `streaming: "block"`.
- The live VM currently uses `minimax/MiniMax-M2.7` as the default agent model.
- If the skill expects workspace-relative files like `.env.sundai` or `references/checklist.md`, mirror or symlink them into `/home/vyahhi/.openclaw/workspace`.

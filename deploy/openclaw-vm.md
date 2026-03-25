# OpenClaw VM Deployment

This repo mirrors the VM-hosted OpenClaw deployment used for Sundai shipping. The current runtime shape is:

- host: Compute Engine VM
- OS: Debian 13 (trixie), glibc 2.41
- process manager: `systemd`
- browser: `google-chrome-stable` in headless mode
- model provider: OpenAI via the Chat Completions API
- bot channel: Telegram

## Files

- `Dockerfile`: portable runtime image for OpenClaw, Chrome, and `gh`
- `deploy/bootstrap-openclaw-vm.sh`: package install and host bootstrap
- `deploy/sync-hacker-skill.sh`: pre-start repo + skill sync script
- `deploy/openclaw.service`: `systemd` unit
- `deploy/openclaw.json.example`: sanitized runtime config
- `.env.example`: sanitized env contract

## VM layout

- app home: `/home/openclaw/.openclaw`
- private env: `/home/openclaw/.openclaw/.env`
- pre-start sync script: `/home/openclaw/.openclaw/bin/sync-hacker-skill.sh`
- runtime config: `/home/openclaw/.openclaw/openclaw.json`
- workspace repo: `/home/openclaw/.openclaw/workspace`
- active skill path: `/home/openclaw/.openclaw/workspace/skills/sundai-project-pipeline`

## Required setup

1. Create the VM:
   ```bash
   gcloud compute instances create openclaw-vm \
     --project project-3930b9ab-6eae-4b3a-959 \
     --zone us-central1-a \
     --machine-type e2-standard-2 \
     --image-family debian-13 \
     --image-project debian-cloud \
     --boot-disk-size 30GB \
     --scopes cloud-platform
   ```
2. Copy and run the bootstrap script (requires `GH_TOKEN` for fabro install):
   ```bash
   gcloud compute scp deploy/bootstrap-openclaw-vm.sh openclaw-vm:/tmp/
   gcloud compute ssh openclaw-vm --command "export GH_TOKEN=<github-token> && sudo -E bash /tmp/bootstrap-openclaw-vm.sh"
   ```
3. Copy `.env.example` to `/home/openclaw/.openclaw/.env` and fill in real secrets.
4. Copy `deploy/openclaw.json.example` to `/home/openclaw/.openclaw/openclaw.json` and replace placeholders.
5. Clone this repo to `/home/openclaw/.openclaw/workspace`:
   ```bash
   sudo -u openclaw bash -c 'GH_TOKEN=<token> gh auth login --with-token <<< "$GH_TOKEN"'
   sudo -u openclaw git clone https://github.com/sundaiclaw/hacker.git /home/openclaw/.openclaw/workspace
   ```
6. Set up fabro secrets:
   ```bash
   sudo -u openclaw fabro secret set OPENAI_API_KEY <key>
   ```
7. Start the service: `sudo systemctl start openclaw`.

## Startup behavior

- `openclaw.service` runs `ExecStartPre=/home/openclaw/.openclaw/bin/sync-hacker-skill.sh`
- the checked-in unit also loads private vars from `/home/openclaw/.openclaw/.env`
- that pre-start script:
  - fetches `origin/main`
  - hard-resets the workspace repo to `origin/main`
  - re-links `.env.sundai` and `references/checklist.md` inside the workspace
- this guarantees the active `sundai-project-pipeline` skill is refreshed on every service restart
- it does not re-pull before every message while the gateway stays up

## Important env vars

- `OPENCLAW_GATEWAY_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_USER_ID`
- `OPENAI_API_KEY`
- `GITHUB_TOKEN`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `SUNDAI_USERNAME`
- `SUNDAI_PASSWORD`
- `SUNDAI_CLERK_CLIENT` (long-lived Clerk `__client` JWT, ~10yr)
- `SUNDAI_SESSION_ID` (active Clerk session ID, `sess_*`)
- `EXA_API_KEY` (Exa web search, auto-detected by openclaw)

## Active identities

- OpenClaw VM runtime GCP identity: `859414203684-compute@developer.gserviceaccount.com`
- GitHub CLI user: `sundaiclaw`

## Verified project access

- Cloud Run create/delete works in `project-3930b9ab-6eae-4b3a-959`
- Cloud Run deploy does not work in `clipmind-project-47895` for the VM service account without extra IAM

## Build tools

- `fabro` is a Rust binary from https://fabro.sh (NOT the npm package, which is a fake)
- Installed via `curl -fsSL https://fabro.sh/install.sh | bash`, then copied to `/usr/local/bin/fabro`
- Requires `GH_TOKEN` in environment during install (uses `gh release download`)
- VM OS must have glibc >= 2.38 (Debian 13+ or Ubuntu 24.04+)
- Used by `sundai-project-pipeline` step 2 to run `fabro run sundai-ship --auto-approve --no-retro`
- Fabro needs its own OpenAI key: `sudo -u openclaw fabro secret set OPENAI_API_KEY <key>`
- Workflow definition: `fabro/workflows/sundai-ship/workflow.fabro`

## Notes

- Keep `/home/openclaw/.openclaw/.env` out of git.
- For reliable Sundai API-first runs, keep `SUNDAI_CLERK_CLIENT` and `SUNDAI_SESSION_ID` current in `/home/openclaw/.openclaw/.env`. The pipeline uses `deploy/refresh-sundai-auth.sh` to mint fresh 60s session JWTs on demand, with automatic GitHub OAuth re-auth fallback.
- Keep the VM `gcloud` default project set to the project ID `project-3930b9ab-6eae-4b3a-959`, not the numeric project number.
- Even with the default fixed, deployment commands should still pass explicit `--project "$GCP_PROJECT_ID"` and `--region "$GCP_REGION"`.
- The live VM currently uses Telegram `streaming: "block"`.
- The live VM currently uses `openai/gpt-5.4` via `openai-completions` as the default agent model.
- If the skill expects workspace-relative files like `.env.sundai` or `references/checklist.md`, the pre-start sync script re-links them into `/home/openclaw/.openclaw/workspace`.

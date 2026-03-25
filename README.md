![hacker](card.png)

# Sundai Hacker

Autonomous Sundai Club hacker, powered by [OpenClaw](https://github.com/openclaw/openclaw).

## What's inside

- `skills/sundai-project-pipeline/` — 15-step autonomous pipeline: idea → build → deploy → publish
- `skills/openspec-*` — spec-driven development workflow
- `fabro/workflows/sundai-ship/` — Fabro build pipeline (plan → implement → verify)
- `deploy/` — VM deployment scripts and config ([details](deploy/openclaw-vm.md))

## Quick deploy

```bash
# 1. Create VM (Debian 13, e2-standard-2)
gcloud compute instances create openclaw-vm \
  --project PROJECT_ID --zone us-central1-a \
  --machine-type e2-standard-2 \
  --image-family debian-13 --image-project debian-cloud \
  --boot-disk-size 30GB --scopes cloud-platform

# 2. Bootstrap (installs openclaw, fabro, openspec, chrome, gh)
gcloud compute scp deploy/bootstrap-openclaw-vm.sh openclaw-vm:/tmp/
gcloud compute ssh openclaw-vm --command "export GH_TOKEN=<token> && sudo -E bash /tmp/bootstrap-openclaw-vm.sh"

# 3. Configure
# Copy .env.example → /home/openclaw/.openclaw/.env (fill secrets)
# Copy deploy/openclaw.json.example → /home/openclaw/.openclaw/openclaw.json

# 4. Clone workspace + start
sudo -u openclaw git clone https://github.com/sundaiclaw/hacker.git /home/openclaw/.openclaw/workspace
sudo -u openclaw fabro secret set OPENAI_API_KEY <key>
sudo systemctl start openclaw
```

See [`deploy/openclaw-vm.md`](deploy/openclaw-vm.md) for full details.

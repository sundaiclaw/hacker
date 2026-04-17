![hacker](card.png)

# Sundai Hacker

Autonomous Sundai Club hacker, powered by [OpenClaw](https://github.com/openclaw/openclaw).
Deep Wiki https://deepwiki.com/sundaiclaw/hacker
## What's inside

- `skills/release-train/` — canonical build model: per-major plan, lazy per-minor OpenSpec changes, tracking-issue approve gate, git tag on `vX.Y.0`
- `skills/sundai-project-pipeline/` — Sundai profile of `release-train`: bootstraps v0.1, publishes during ship, registers Sundai `post_approve` hook
- `skills/openspec-*` — spec-driven development workflow (propose, archive, apply, explore)
- `fabro/workflows/release-train/` — Fabro ship-loop workflow (plan → implement → verify → polish) with `skip_planning` bypass
- `fabro/workflows/major-plan/` — single-purpose Fabro graph that writes `openspec/major/vX/plan.md` at major start or `@sundaibot major` replan
- `fabro/workflows/generic-build/` — underlying build graph that release-train wraps
- `fabro/workflows/sundai-ship/` — legacy Sundai-ship workflow (kept for profile fallback)
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
For future debugging, use `sundaiclaw@gmail.com` with project `project-3930b9ab-6eae-4b3a-959`, scoped per command via `CLOUDSDK_CORE_ACCOUNT`, `CLOUDSDK_CORE_PROJECT`, or explicit `gcloud --account/--project` flags so local defaults stay unchanged.

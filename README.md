![hacker](card.png) 

# Sundai Hacker

Public repo that mirrors the latest `sundai-project-pipeline` skill.

- Skill path: `skills/sundai-project-pipeline/SKILL.md`
- Run checklist: `skills/sundai-project-pipeline/references/checklist.md`

## Install in your own OpenClaw

### Option A (direct copy)
1. Clone this repo:
   - `git clone https://github.com/sundaiclaw/hacker.git`
2. Copy the skill folder into your OpenClaw workspace skills directory:
   - `cp -R hacker/skills/sundai-project-pipeline ~/.openclaw/workspace/skills/`
3. Restart/reload your OpenClaw session.

### Option B (symlink for live updates)
1. Clone this repo:
   - `git clone https://github.com/sundaiclaw/hacker.git`
2. Create a symlink so your OpenClaw workspace always uses the latest local version:
   - `ln -sfn $(pwd)/hacker/skills/sundai-project-pipeline ~/.openclaw/workspace/skills/sundai-project-pipeline`
3. Restart/reload your OpenClaw session.

## Updating

On each pipeline rule change, update `skills/sundai-project-pipeline/SKILL.md` in this repo and push.

## Deployment Reference

VM deployment artifacts for the current OpenClaw setup live in `deploy/`:

- `Dockerfile`
- `deploy/bootstrap-openclaw-vm.sh`
- `deploy/openclaw.service`
- `deploy/openclaw.json.example`
- `deploy/openclaw-vm.md`

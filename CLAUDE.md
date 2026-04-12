# CLAUDE.md — Project context for Claude Code

Autonomous Sundai Club project shipper. An OpenClaw + OpenSpec + Fabro pipeline that goes from ideation to deployed project in 15 autonomous steps. Runs as a systemd service on a GCP VM (Debian 13, e2-standard-2).

## Architecture

Three layers:

- **`skills/`** — OpenClaw skill definitions (the "what to do"). Pipeline steps, spec workflows. Source of truth for all skills; `.claude/skills/` contains symlinks only.
- **`fabro/workflows/`** — Fabro build pipelines (the "how to build"). Plan, implement, verify, polish. Workflow graphs are `.fabro` (DOT format), config is `workflow.toml`.
- **`deploy/`** — VM bootstrap, auth, systemd service (the "where it runs"). GCP Compute Engine, Chrome headless, Telegram bot channel.

## Key conventions

- **Package manager:** bun is the default for Node/frontend projects. Build scripts detect lockfile type and adapt.
- **AI provider:** OpenRouter (free models) for OpenClaw; OpenAI for Fabro workflows. Configured via env vars (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`). Never hardcode model names or API keys.
- **Fabro models:** Assignments go in the `model_stylesheet` block in `.fabro` graph attributes, not hardcoded per-node.
- **Main pipeline:** `skills/sundai-project-pipeline/SKILL.md` — 15-step autonomous pipeline (idea -> build -> deploy -> publish).
- **Spec-driven builds:** New projects go through OpenSpec (proposal, design, specs, tasks) before Fabro implementation.

## Repo structure

```
skills/                     # Skill definitions (source of truth)
  sundai-project-pipeline/  # Main 15-step shipping pipeline
  openspec-*/               # Spec-driven dev workflow skills
  fabro-create-workflow/    # Workflow authoring skill
fabro/workflows/            # Fabro build pipelines
  generic-build/            # Main build workflow + scripts
deploy/                     # VM deployment scripts, systemd unit, auth
.claude/skills/             # Symlinks to skills/ (do not edit directly)
```

## Testing and validation

No test suite. Validation is via:
- `fabro validate` on workflows
- `shellcheck` on scripts
- CI runs on push to main: workflow validation, shellcheck, env completeness, skill structure checks

## Common tasks

- **Modify the shipping pipeline:** edit `skills/sundai-project-pipeline/SKILL.md`
- **Modify build logic:** edit files in `fabro/workflows/generic-build/`
- **Add a new skill:** create `skills/<name>/SKILL.md`, then symlink from `.claude/skills/`
- **Update deployment:** edit scripts in `deploy/`
- **Check env var contract:** see `.env.example`

## Do NOT

- Hardcode model names in `.fabro` files (use `model_stylesheet` in graph attributes)
- Edit `.claude/skills/` directly (edit `skills/` source, symlinks follow)
- Commit `.env` files or credentials
- Add `apps/`, `openspec/`, `.workflow/`, or `fabro-repo/` to git (they are generated/ephemeral)

---
name: openspec-workflow
description: "Autonomous spec-driven development with OpenSpec + Fabro. You orchestrate spec artifacts (proposal, design, specs, tasks), then Fabro handles implementation with its multi-model planning, review, and verification pipeline. Use when: (1) building a new app from scratch, (2) making any code change in a repo that uses OpenSpec, (3) creating or modifying proposals, designs, specs, or task breakdowns, (4) shipping PRs that need spec artifacts. Covers the full lifecycle: spec → Fabro build → verify → ship. Requires: openspec CLI, fabro CLI, gh CLI, git."
---

# OpenSpec Workflow

Ship spec-driven apps with OpenSpec for specification and Fabro for implementation.

## Architecture

| Role | Tool | What |
|------|------|------|
| **Spec Author** | You + OpenSpec CLI | Create change, draft artifacts (proposal, design, specs, tasks), review loop |
| **Builder** | Fabro | Multi-model planning, implementation, code review, verification (lint, test, typecheck, build), polish |
| **Reviewer** | Claude Code subagents | Challenge spec artifacts before implementation |

**Why this split:** OpenSpec defines *what* to build. Fabro orchestrates *how* to build it — with dual-model planning, automated verification loops, and retry-on-failure. You bridge the two by creating specs and configuring the Fabro run.

## When to Use This Skill

**Use OpenSpec when** the change affects what the product *does*:
- New features or capabilities
- Refactors that change behavior
- Breaking changes or migrations
- Anything that modifies or creates specs

**Skip OpenSpec, just ship a PR when** the change is supplementary:
- Examples, tutorials, sample projects
- Typo fixes, README updates, comment tweaks
- CI/CD config (GitHub Actions, linting)
- Dependency bumps

## Prerequisites

- `openspec` CLI installed (`npm install -g @fission-ai/openspec`)
- `fabro` CLI installed
- `gh` CLI authenticated with repo access
- Git repo with `openspec/` directory initialized

## Convention: App Directory Structure

Each app lives in its own directory under `apps/` and shares its name with the OpenSpec change:

```
apps/
└── <name>/              # Same name as openspec/changes/<name>
    ├── openspec/        # App's own openspec (copied from parent or initialized)
    ├── fabro/           # App's own fabro workflow
    ├── src/             # Generated source code
    ├── package.json     # (or pyproject.toml, etc.)
    └── ...
```

The `<name>` is always kebab-case and must match between `openspec/changes/<name>` and `apps/<name>`.

## Quick Start

```
0. Set up app directory, git init, gh repo create, copy skills
1. openspec new change "<name>", file tracking issue on GitHub
2. For each artifact: draft → review loop → write
3. Set up Fabro workflow and run build
4. Commit, push, open PR linking the tracking issue
```

## Workflow

### Step 0: Set up the app directory and GitHub repo

```bash
# Create the app directory (name matches the OpenSpec change)
NAME="<name>"
mkdir -p ../apps/$NAME
cd ../apps/$NAME

# Initialize git repo
git init

# Inspect the detected stack and directory layout before generating artifacts.
# Identify files/directories that are generated locally, environment-specific, secret-bearing,
# cache-like, or otherwise inappropriate to commit, then add only those patterns to .gitignore.
# Prefer the stack's standard ignore patterns over a broad catch-all template.
# Examples:
# - Node / frontend: node_modules/, dist/, build/, .next/, coverage/, *.tsbuildinfo
# - Python: __pycache__/, .venv/, venv/, dist/, build/, *.egg-info/, .pytest_cache/
# - Nested apps: frontend/node_modules/, frontend/dist/, backend/.venv/
# - General: .env, .env.*, *.log, .DS_Store, .vscode/
# Re-check after Fabro runs; if the build creates new generated artifacts that should not be
# versioned, update .gitignore before committing.

# Initialize openspec in the app
openspec init --tools claude --force

# Copy OpenSpec and Fabro skills into the skills directory
cp -r ../../hacker/fabro-repo/skills/fabro-create-workflow .claude/skills
cp -r ../../hacker/openclaw-skills/skills/bobbyradford/openspec-workflow .claude/skills

# Copy generic-build workflow template (browser-testing is generated per-app in Step 3d)
cp -r ../../hacker/fabro-repo/workflows/generic-build fabro/workflows/ 2>/dev/null || true

# Create GitHub repo and set as remote
gh repo create $NAME --private --source . --push
```

The GitHub repo is created immediately so that issues can be filed against it
before any code is written. The repo name matches the app directory name.

### Step 1: Create the Change and File an Issue

```bash
openspec new change "<kebab-case-name>"
openspec status --change "<name>"
```

After creating the change, file a GitHub issue describing what will be built.
This issue becomes the anchor for the PR and all workflow documentation.

```bash
# Create the tracking issue from the proposal summary
gh issue create --title "feat: <short description of what's being built>" \
  --body "$(cat <<EOF
## Goal

<1-2 sentence summary of what this change builds and why>

## Planned Capabilities

<bullet list of capabilities from the proposal>

## Approach

- OpenSpec change: $NAME
- Implementation via Fabro generic-build workflow

---
Tracking issue for the \`$NAME\` OpenSpec change.
EOF
)"
```

Save the issue number for use in commits and PRs:

```bash
ISSUE=$(gh issue list --limit 1 --json number --jq '.[0].number')
echo "Tracking issue: #$ISSUE"
```

```bash
openspec new change "<kebab-case-name>"
openspec status --change "<name>"
```

### Step 2: Artifact Loop

For each artifact in order (typically: proposal → design → specs → tasks):

```bash
openspec instructions <artifact-id> --change "<name>"
```

Read the template and dependencies. Draft the artifact content.

**Then decide: review or skip?**

- **Skip review** if the artifact is genuinely trivial (one-liner, obvious config, mechanical rename). Log: `Skipped review — trivial: <reason>`.
- **Send to review** for anything with real design decisions, trade-offs, or ambiguity.

Spawn reviewers as subagents with the **repo path** so they can explore the codebase independently — read files, grep for patterns, verify "no code changes" claims. Don't just paste the artifact; give them the tools to challenge it. See `references/review-loop.md` for the full protocol and prompt template.

After writing the artifact, confirm progress:

```bash
openspec status --change "<name>"
```

Continue to the next artifact until all 4 are complete (proposal, design, specs, tasks).

### Step 3: Implement via Fabro

Once all OpenSpec artifacts are complete, set up the app directory and run Fabro to build it.


```bash
fabro init 
```

#### 3b. Set up the Fabro workflow

```bash
# Copy the generic-build workflow into the app
cp -r ../../fabro/workflows/generic-build fabro/workflows/generic-build

# Create a run config for this app
cat > fabro/workflows/generic-build/runs/$NAME.toml << 'EOF'
version = 1
graph = "../workflow.fabro"

[vars]
app_dir = "."
spec_dir = "openspec"
workflow_dir = ".workflow"
EOF
```

#### 3c. Validate and run

```bash
# Validate the workflow parses correctly
fabro validate fabro/workflows/generic-build/runs/$NAME.toml

# Preflight check (dry run)
fabro run fabro/workflows/generic-build/runs/$NAME.toml --preflight

# Run the full build pipeline with auto-approve
fabro run fabro/workflows/generic-build/runs/$NAME.toml --auto-approve
```

Fabro will:
1. **Bootstrap** — verify toolchain (bun/tsc/python/etc.)
2. **Plan** — two models independently create implementation plans, then synthesize
3. **Implement** — write all code per the OpenSpec specs
4. **Review** — code review against specs
5. **Verify** — install deps → lint → test → typecheck → build → structure check (with retry loops)
6. **Format** — auto-format code
7. **Polish** — final UI/UX pass

For trivial changes (pure doc edits, one-line fixes), you may implement directly instead of running Fabro. Log: `Implemented directly — trivial: <reason>`.

### Step 3d: Browser-Based UI Testing

After Fabro build completes, generate and run a browser testing workflow to validate the UI visually and test all user interactions.

**This workflow is generated per-app, not copied from a template.** Unlike `generic-build` (which is a reusable template copied from the hacker repo), browser testing is specific to each app's screens, controls, and interactions. Invoke the `fabro-create-workflow` skill from within the app directory to generate it.

**What this does:** An AI agent opens the built app in a browser, walks through every screen and interaction defined in the specs, takes screenshots, records video, and writes a test report.

**How to generate the workflow:**

1. Invoke the `fabro-create-workflow` skill (it should already be in `.claude/skills/` from Step 0)
2. Tell it to create a **browser testing** workflow (Example 10 in its references)
3. The skill reads the OpenSpec specs and source code to understand what screens, controls, and behaviors exist
4. It generates the workflow directly in the app's directory:
   ```
   fabro/workflows/browser-testing/
     workflow.fabro        # test pipeline (build → serve → parallel tests → report)
     workflow.toml         # run config (vibium install in setup)
     prompts/              # test suites in plain English + vibium commands
       test_visual.md      # screen appearance verification
       test_controls.md    # keyboard/mouse/touch interaction tests
       test_logic.md       # business logic and state management tests
       report_pass.md      # pass report template
       report_fail.md      # failure report template
   ```

**Key design:**
- Tests use [Vibium](https://github.com/VibiumDev/vibium) CLI — no Playwright scripts needed
- Test prompts are plain English with embedded `vibium` commands (go, keys, screenshot, map, diff, record)
- Parallel test suites (visual, controls, logic) each run in their own browser
- `vibium record start/stop` captures session recordings (ZIP of screenshots + snapshots)
- `vibium diff map` verifies what changed; `vibium screenshot --annotate` labels elements
- Results go in timestamped directories (`test-results/YYYY-MM-DD_HH-MM-SS/`) with `screenshots/` and `recordings/` subdirs

**Run it:**

```bash
fab run browser-testing
```

**When to do this:**
- Always for web apps with a UI (HTML/canvas/React/etc.)
- Skip for CLI tools, libraries, or backend-only services
- Re-run after fixing bugs found in the test report

**What to do with results:**
- If tests pass: proceed to Step 4 (Ship)
- If tests fail: fix the issues (directly or via another Fabro run), then re-run `fab run browser-testing`
- Include the test report summary in the PR body under a `## Browser Testing` section

### Step 4: Ship

**Before committing**, verify the change name and issue number:

```bash
# Get the exact change directory name
CHANGE=$(ls openspec/changes/ | grep -v archive | head -1)
echo "Change name: $CHANGE"

# Get the tracking issue number (created in Step 1)
ISSUE=$(gh issue list --limit 1 --json number --jq '.[0].number')
echo "Issue: #$ISSUE"
```

Create a feature branch, commit, push, and open a PR:

```bash
git checkout -b feat/$CHANGE
git add -A
git commit -m "feat($CHANGE): initial implementation (#$ISSUE)

OpenSpec change: $CHANGE"
git push -u origin feat/$CHANGE
gh pr create \
  --title "feat: $CHANGE" \
  --body "$(cat <<EOF
Closes #$ISSUE

## Summary

<1-3 bullet points summarizing what was built>

## Verification

All Fabro gates passed: deps, lint, tests, typecheck, build, structure verify.

OpenSpec change: $CHANGE
EOF
)"
```

**Critical:** The `OpenSpec change: <name>` in the PR body must **exactly match** the directory name under `openspec/changes/`. The auto-archive GitHub Action uses this to locate the change. A mismatch means the archive silently skips. Always verify with `ls openspec/changes/` before writing the PR body.

### Step 5: Address PR Review Comments

After opening the PR, code review agents may leave comments. Monitor and respond:

```bash
# Check for review comments
gh pr view <number> --repo <owner/repo> --json reviews,comments
gh api repos/<owner>/<repo>/pulls/<number>/comments
```

For each review comment:

1. **Evaluate** — Is it significant? Does it catch a real bug, missing edge case, or design issue?
2. **If significant:** Fix it in the worktree, commit, push. The PR updates automatically.
   ```bash
   # Fix, then:
   git add -A && git commit -m "fix: address review — <what changed>"
   git push origin <branch>
   ```
3. **If not significant:** Reply inline with your justification.
   ```bash
   gh api repos/<owner>/<repo>/pulls/<number>/comments/<comment-id>/replies \
     -f body="<your justification>"
   ```

Apply the same judgment rules as the artifact review loop: accept valid concerns, reject with reasoning, partially accept where appropriate. Don't blindly apply every suggestion — you're the decision-maker.

### Step 6: Document & Report

Post the workflow log to the GitHub issue:

```bash
gh issue comment <number> --repo <owner/repo> --body '<workflow log>'
```

Include: each artifact's draft, review challenges, revisions, skip decisions with reasoning, and final implementation notes.

**Always end by linking the user to the issue and PR:**
- Issue: `https://github.com/<owner>/<repo>/issues/<number>`
- PR: `https://github.com/<owner>/<repo>/pull/<number>`

## Artifact Guidelines

### proposal.md
- **Why** (1-2 sentences), **What Changes** (bullet list), **Capabilities** (new + modified specs), **Impact**
- List every spec that will be created or modified in Capabilities — this drives the specs artifact

### design.md
- **Context**, **Goals / Non-Goals**, **Decisions** (with alternatives considered), **Risks / Trade-offs**
- Skip for trivial changes (pure doc fixes, one-line config changes)

### specs/\<capability\>/spec.md
- Delta format: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`
- Every requirement needs `### Requirement: <name>` + at least one `#### Scenario:`
- MODIFIED must include the full updated requirement text (not just the diff)
- Use existing spec names from `openspec/specs/` for modified capabilities

### tasks.md
- Numbered groups with checkboxes: `- [ ] 1.1 Task description`
- Small enough to complete in one session
- Ordered by dependency

## GitHub Action: Auto-Archive on Merge

For repos that want automatic spec sync and archiving, add this workflow. See `references/archive-action.md` for the complete GitHub Action YAML.

The action:
1. Triggers on PR merge
2. Extracts change name from `OpenSpec change: <name>` in PR body
3. Runs `openspec archive --yes` on a new branch
4. Opens a PR with the archive and spec sync changes
5. Deletes the original merged branch

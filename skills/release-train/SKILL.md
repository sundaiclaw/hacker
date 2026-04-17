---
name: release-train
description: Canonical OpenClaw build model. Ship product via a release train — a per-major plan, lazy per-minor OpenSpec changes, and a tracking-issue approve gate that produces git tags. Use for any spec-driven, versioned build in a target repo.
---

# Release Train

## One-page summary (read this first)

Ship product via **one default build model**: the release train.

**Three layers (only three):**

1. **Major plan** — At the start of every major `X`, before the first minor `X.1` is specced, write `openspec/major/vX/plan.md`: the full intent for the major (goals, constraints, ordered minor slices, dependencies, risks). This is the only place the whole major is planned ahead.
2. **Minor slice** — Each `vX.Y` is one OpenSpec change at `openspec/changes/vX.Y/` (`proposal.md`, `design.md`, `specs/.../spec.md`, `tasks.md`). Authored only when needed: the first minor after a major plan exists, later minors on user request or cross-impact invalidation.
3. **Ship loop** — Fabro builds from the active change; CI must be green; preview must be live; one tracking issue holds the test checklist; `@sundaibot approve` tags `vX.Y.0` and archives the change.

**Cost rule:** Silence is free. Approval is free. LLM-heavy replanning runs only when the user changes direction or when cross-impact is detected.

## Principle

**OpenSpec is the plan. Everything else is a view of it.**

## Invariants

- **Silence is free. Approval is free. Only redirection costs** (replanning, rescoping, cross-slice invalidation).
- **Every git-tagged minor is fully tested** before `vX.Y.0`: CI green, live preview, tracking-issue checklist, explicit `@sundaibot approve`.
- **Major planning happens once per major, before the first minor of that major.** Artifact: `openspec/major/vX/plan.md` (full major intent). No minor openspec change for `X.*` is authored until this file exists.
- **Lazy minors and lazy next-major:** A new minor openspec change or a new major plan is produced only when (a) the user requests a minor change, (b) the user requests a major change, or (c) a proposed change in flight would impact another minor slice or the major plan (cross-impact). Otherwise the train advances without rewriting specs.

## Planning FSM

Three states, explicit triggers, bounded cost.

### `major_plan(vX)`

- **Trigger:**
  - First work under major `X` (including the initial ship to `v0.1`).
  - `@sundaibot major <reason>` command on any tracking issue.
  - Cross-impact invalidates the prior major plan.
- **Output:** `openspec/major/vX/plan.md` containing:
  - Major goals and non-goals.
  - Ordered list of intended minors `X.1, X.2, …` with one-line intent each.
  - Dependencies between minors (DAG or ordered list).
  - Risks and explicit "if we change slice A, revisit slices B…" notes.
  - Empty, append-only **Invalidation log** section.
- **Cost:** one LLM-heavy planning pass per major start (not per minor).
- **Graph:** runs the `major-plan` Fabro workflow.

### `minor_spec(vX.Y)`

- **Preconditions:** `openspec/major/vX/plan.md` exists and is not stale (no unresolved Invalidation log entry covering this slice).
- **Trigger:**
  - User requests work on minor `Y`.
  - Cross-impact from another in-flight change requires updating slice `Y`.
- **Output:** `openspec/changes/vX.Y/` with full proposal, design, `specs/**/spec.md`, tasks.
- **Cost:** one planning pass per triggered minor (not every minor on a calendar).

### Invalidation / cross-impact

- **Detector:** LLM classifier (default) that outputs `{ stale_minors: [...], stale_major: bool }` from the `revise` text + current major plan + active changes. Rule-based fallback scans `revise` text for minor/major references and the active change for acceptance-criteria deltas.
- When a `revise` or a new openspec sub-change would alter acceptance criteria, scope, or sequencing such that another minor in `major_plan(vX)` or the major plan itself would be wrong, the bot:
  1. Appends a new entry to the "Invalidation log" section of `openspec/major/vX/plan.md` listing stale minors and the reason.
  2. Marks dependents stale.
  3. Re-runs `minor_spec` for affected slices before build.
  4. **Blocks** any `build` of a stale slice until its `minor_spec` is refreshed.
- If the major direction changes, re-run `major_plan(vX)` (or `major_plan(vX+1)`), then re-derive which minors need `minor_spec`.

### What is not done

- No eager authoring of `openspec/changes/vX.2..vX.N/` at major start. The major plan holds intents; openspec changes materialize on demand.

## Ship-vs-tag table

| Concern | When it happens | Gated by approve? |
|---|---|---|
| Build runs from active change | `minor_spec(vX.Y)` exists and is current | No — build is always allowed on a current spec |
| Preview deployment visible | During the build step | No |
| Tracking issue opened | After preview | No |
| Git tag `vX.Y.0` | After tracking-issue checklist + `@sundaibot approve` | **Yes** |
| OpenSpec change archive | After tag | **Yes** |
| `CHANGELOG.md` entry | After tag | **Yes** |
| Tracking issue closed | After tag | **Yes** |
| Profile `post_approve` hook runs | After tag | **Yes** |

Profiles may add rows above the tag gate (e.g., a profile may publish an external project card during ship, before the tag, when the profile's platform requires public visibility on every draft). Profiles must not remove rows below the tag gate.

## Uniform release cycle (every `vX.Y` git tag)

1. **Major plan** exists and is not stale (`openspec/major/vX/plan.md`).
2. **Minor spec** exists for this slice (`openspec/changes/vX.Y/`), authored on the trigger rules above.
3. **Build** — `fabro/workflows/release-train/` against the active change. Skip `plan_fanout` when `skip_planning=true`; enter at `plan_fanout` when the spec was invalidated and `postmortem_latest.md` exists.
4. **Verify** — CI green (lint, types, tests, build).
5. **Preview** — live deploy URL posted on the tracking issue.
6. **Track** — one open issue, checklist rendered from acceptance criteria, `@sundaibot approve` / `@sundaibot revise`.
7. **Approve** — tag `vX.Y.0`, archive openspec change, `CHANGELOG.md`, close issue, run `post_approve` profile hook.

## Gateway triggers

The OpenClaw gateway routes the following events into this skill:

- **GitHub push/PR** on a release-train-configured repo — evaluates whether the active `openspec/changes/vX.Y/` needs a rebuild; enters the cycle at step 3.
- **Issue comment `@sundaibot approve`** on a tracking issue — enters at step 7.
- **Issue comment `@sundaibot revise <text>`** on a tracking issue — enters revise triage (below).
- **Issue comment `@sundaibot major <reason>`** — forces `major_plan(vX+1)`.
- **Issue comment `@sundaibot skip`** — sets `skip_planning=true` on the next build for the current slice.
- **User message** "build X" / "ship X" / "next minor" on a release-train repo — enters the cycle at step 1 or 2 depending on planning state.

## Numbered steps (`N/M ... Next: ...`)

Every operator-visible progress/status message during the cycle MUST use:

- `N/7 <current task>. Next: <next task>.`
- `Blocked at N/7: <reason>. Next: <intended next action>.`

The cycle has seven canonical steps; profiles may insert sub-steps but must keep the `N/7` numbering unless they override the cycle length explicitly.

## Revise triage

On `@sundaibot revise <text>`, classify impact before acting:

1. **No spec change** — text describes a code-level bug or polish. Patch code, rerun Fabro with `skip_planning=true`, re-verify, update preview, re-comment on the tracking issue. Return to step 6.
2. **Current-slice spec change** — text widens or narrows *this* minor's acceptance criteria without touching others. Amend `openspec/changes/vX.Y/`, rerun Fabro from `plan_fanout` (so the plan reflects the new spec), re-verify, update preview. Return to step 3.
3. **Cross-impact (another minor)** — invalidation detector flags dependent minors. Append Invalidation log entry to `openspec/major/vX/plan.md`, mark dependents stale, block their build until `minor_spec` refresh, continue the current slice. Return to step 6 for current slice.
4. **Major-level change** — detector flags `stale_major=true`. Escalate to `major_plan(vX)` replan (or `major_plan(vX+1)` if the user asked for a new major). Return to step 1.
5. **Scope unclear** — reply on the tracking issue asking the user which of (1–4) applies; do not act.

Human-facing commands on tracking issues are only `approve` and `revise`. `major` and `skip` are bot-internal optional follow-ups.

## Failure recovery

- **CI red after build (step 4)** — the `generic-build` verify chain already loops on lint/test/typecheck/build failures. On exhaustion, `postmortem` writes `postmortem_latest.md`; the next build re-enters at `plan_fanout`. If three consecutive postmortems do not improve the error set, comment on the tracking issue and stop.
- **Preview down (step 5)** — retry the deploy step up to 3 times with backoff. If still down, comment `Blocked at 5/7: preview unreachable` on the tracking issue and wait for operator.
- **Missing postmortem after failure** — regenerate from `$workflow_dir/implementation_log.md` + `$workflow_dir/verify_errors.log` before replanning.
- **Tag already exists** — `finalize.sh` aborts cleanly; operator must cut the next minor.
- **Archive collision (date-stamped directory exists)** — use `skills/openspec-archive-change` error path (suggest renaming or using different date); do not auto-overwrite.

## Command vocabulary

| Command | Effect |
|---|---|
| `@sundaibot approve` | Tag `vX.Y.0`, merge PR, archive change, changelog, close issue, run `post_approve` hook |
| `@sundaibot revise <text>` | Triage per above; may patch code, rerun Fabro, or update openspec; may trigger `minor_spec` / `major_plan` per invalidation rules |
| `@sundaibot major <reason>` | Force `major_plan(vX+1)` replan (bot-internal / optional) |
| `@sundaibot skip` | Set `skip_planning=true` for the next build of the current slice (bot-internal / optional) |

## Profile hook contract

Target repos may ship two optional hooks under `scripts/release/hooks/`:

- `pre_release.sh` — runs before the ship-loop build (step 3). Non-zero exit aborts the build.
- `post_approve.sh` — runs after tag + archive + changelog + issue close (step 7). Non-zero exit marks the release as approved-but-unfinished on the tracking issue.

Both receive the following env:

- `RT_VERSION` — e.g. `v0.1`
- `RT_TAG` — e.g. `v0.1.0` (only in `post_approve.sh`)
- `RT_SPEC_DIR` — path to the active `openspec/changes/vX.Y/`
- `RT_APP_DIR` — application root (often `.`)
- `RT_WORKFLOW_DIR` — Fabro scratch dir (often `.workflow`)

Full contract: `references/hooks-contract.md`.

## References

- `references/major-plan-template.md` — shape of `openspec/major/vX/plan.md`.
- `references/issue-template.md` — tracking-issue body.
- `references/hooks-contract.md` — `pre_release.sh`, `post_approve.sh` contract.
- `templates/` — copy-to-target-repo scaffolds (`openspec/major/vX/plan.md`, `ROADMAP.md`, `scripts/release/*`).
- `fabro/workflows/release-train/workflow.fabro` — ship-loop build graph.
- `fabro/workflows/major-plan/workflow.fabro` — `major_plan(vX)` graph.
- `skills/openspec-archive-change/SKILL.md` — archive logic invoked by `scripts/release/finalize.sh`.

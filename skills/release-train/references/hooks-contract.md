# Release-train hook contract

Target repos may ship two optional profile hooks under `scripts/release/hooks/`. The release-train ship loop calls them at well-defined points. Missing hooks are treated as no-ops.

## `pre_release.sh`

- **When:** before step 3 (Build) of the uniform release cycle, after `major_plan` + `minor_spec` checks and after `skip_planning` is resolved.
- **Purpose:** profile-specific pre-build setup (seed a draft, reserve an external resource, warm a cache).
- **Env:**
  - `RT_VERSION` — e.g. `v0.1`
  - `RT_SPEC_DIR` — absolute path to `openspec/changes/vX.Y/`
  - `RT_APP_DIR` — application root (often `.`)
  - `RT_WORKFLOW_DIR` — Fabro scratch dir (often `.workflow`)
- **Exit code:**
  - `0` — continue to build.
  - non-zero — abort the cycle and comment on the tracking issue (if one exists yet) with the hook's stderr tail.
- **Idempotency:** must be safe to run more than once per `vX.Y`; the build may retry.

## `post_approve.sh`

- **When:** after step 7 (Approve) — after the tag, archive, changelog append, and issue close.
- **Purpose:** profile-specific post-tag hygiene (re-verify external surfaces, emit analytics, run a smoke test).
- **Env:** same as `pre_release.sh`, plus:
  - `RT_TAG` — e.g. `v0.1.0`
- **Exit code:**
  - `0` — release is fully complete.
  - non-zero — tag and archive remain; tracking issue is reopened with a `post_approve failed` comment containing the hook's stderr tail. Operator fixes and reruns the hook manually.
- **Idempotency:** must be safe to rerun after operator fix.

## Logging

Both hooks should write human-readable logs to `RT_WORKFLOW_DIR/pre_release.log` / `RT_WORKFLOW_DIR/post_approve.log`. The release-train captures these paths in the tracking issue on hook failure.

## Default implementation

The `skills/release-train/templates/scripts/release/hooks/` directory ships no-op `pre_release.sh` and `post_approve.sh` that `exit 0`. Profiles override by replacing the file before commit (for example, a profile may ship its own `post_approve.<profile>.sh` in the templates directory and instruct its bootstrap to copy it over `post_approve.sh`).

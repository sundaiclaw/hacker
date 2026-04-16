# sundai-project-pipeline changelog

## v1.28.2 - 2026-04-16
- Tightened the early Sundai-draft phase again: before Fabro starts, the draft must already have full description, thumbnail, and the bot's self-like — not just title/team/URLs.
- Clarified that the final Sundai patch step should mostly update changed details after deploy rather than creating the first visible description/thumbnail/like.
- Expanded the checklist to require description/thumbnail/self-like before the long Fabro run begins.

## v1.28.1 - 2026-04-16
- Tightened the front-loaded pipeline: after generating/updating OpenSpec artifacts and `spec/spec.md`, commit and push them to GitHub **before** Fabro starts.
- Updated the checklist so the spec artifacts are visible upstream before the long Fabro run begins.

## v1.28.0 - 2026-04-12
- Reordered the pipeline to front-load external setup before Fabro: create/push the repo, provision a stable early demo URL/service, and create the Sundai draft before the long build starts.
- Added explicit guidance to use a minimal placeholder deployment when needed so the final app can later redeploy onto the same service/demo URL.
- Split the old build step into: bootstrap external surfaces first → OpenSpec/Fabro build → promote/redeploy final app → patch final Sundai details.
- Updated the checklist to require early repo/deploy/draft bootstrap before Fabro and final redeploy onto the pre-created service.

## v1.27.0 - 2026-04-12
- Added a hard completion gate to the Sundai pipeline skill: never report success just because create/save/submit succeeded.
- Finalization now requires reloading the **public** project page and visibly verifying GitHub link, Demo link, non-null full description, team member `vyahhi`, and thumbnail.
- Expanded the run checklist to include Demo URL persistence, thumbnail re-verification, and public-page/card QA before completion is reported.

## v1.26.0 - 2026-04-12
- Tightened Sundai auth recovery guidance after a live run: stale Clerk session mint failure is not a terminal auth failure.
- Documented the expected recovery order explicitly: retry JWT mint, then direct Clerk password re-auth, persist fresh env values, then resume API-first execution.
- Added a concrete browser-auth fallback note for Clerk/React forms: if `fill` does not stick, use selector-based typing (for example `#identifier-field` / `#password-field`) and verify the signed-in state before continuing.

## v1.25.0 - 2026-04-05
- Integrated design-skill references into the Sundai shipping workflow assets (closes sundaiclaw/hacker#3).
- Added a Design Direction block to the Phase 5 ideation spec seed: every project must specify visual style, reference design system, color palette, font pairing, layout, and key polish target before build.
- Added `prompts/polish.md` and `prompts/design-check.md` plus related `fabro/workflows/sundai-ship/workflow.fabro` support so the legacy `sundai-ship` flow can run an extra design quality pass when used.
- Added `references/design-systems.md` and `references/design-palettes.md` so design direction choices are concrete instead of generic.
- Updated `deploy/sync-hacker-skill.sh` to include the new design reference files.

## v1.24.0 - 2026-03-30 21:41 UTC
- Updated the Sundai pipeline to default to the corrected Fabro generic-build path instead of the stale `fabro run sundai-ship --auto-approve --no-retro` shorthand.
- Added mandatory Fabro validate + preflight steps before the full run.
- Standardized repo-local Fabro run config for Sundai builds: `app_dir="."`, `spec_dir="openspec"`, `workflow_dir=".workflow"`.
- Documented that Sundai repos are often repo-root apps and the Fabro path must support in-place implementation instead of assuming a fresh nested app directory.

## v1.23.0 - 2026-03-30 00:32 UTC
- Corrected Sundai auth guidance: direct Clerk password sign-in is a valid recovery path; OAuth-only wording was wrong.
- Updated pipeline auth rules to keep API-first execution but recover stale `SUNDAI_CLERK_CLIENT` / `SUNDAI_SESSION_ID` by re-signing in through Clerk with bot credentials from `.env.sundai`.
- Tightened fallback order: retry JWT mint, then direct Clerk password re-auth, then UI/browser fallback only if both auth paths fail.
- Updated API reference to stop assuming GitHub OAuth is the only recovery mechanism.

## v1.22.0 - 2026-03-29 20:55 UTC
- Incorporated the OpenSpec workflow into the Sundai pipeline.
- Sundai project runs are now OpenSpec-first by default: create/update proposal, design, specs, and tasks before implementation.
- Updated step 2 to require a GitHub repo → OpenSpec artifacts → `spec/spec.md` bridge → Fabro build sequence.
- Added fallback guidance: if OpenSpec tooling fails, report the blocker and continue with the prior Fabro/manual path so the run can still ship.
- Added an explicit cross-reference to `openspec-workflow` for artifact quality and shape.
- Rewrote Step 1 ideation as a 5-phase structured process (Discover, Define, Develop, Deliver, Package).
- Shifted primary research from Sundai project analysis to real-world signal scanning via web search. Sundai project fetch retained for deduplication only.
- Added problem framing phase: How Might We statements, Job-to-Be-Done statements, current alternative + gap analysis, feasibility gating.
- Added multi-lens divergent generation: analogical transfer, 10x lens, first principles decomposition, constraint-based invention. Generates 6–15 concepts, culls to 5.
- Expanded scoring rubric from 5 to 7 criteria (added value clarity, job fit, shareability).
- Added adversarial pre-mortem + riskiest assumption test on top 2 finalists before selection.
- Added structured spec seed output (JTBD, differentiator, demo flow, tech stack, risk mitigation) as handoff to Step 2.

## v1.21.1 - 2026-03-24 22:32 UTC
- Confirmed the self-like API path in live production: `POST /api/projects/{projectId}/like`.
- Added verification guidance to treat a populated `likes[]` readback as sufficient like-state proof.
- Updated API reference wording to distinguish live-run confirmation from code-verified endpoints.

## v1.21.0 - 2026-03-22
- Replaced static `SUNDAI_COOKIE_HEADER` (60s expiry) with durable Clerk auth via `deploy/refresh-sundai-auth.sh`.
- New env vars: `SUNDAI_CLERK_CLIENT` (long-lived ~10yr client JWT) + `SUNDAI_SESSION_ID` (active session).
- Script mints fresh `__session` JWTs on demand; auto-falls back to full GitHub OAuth re-auth if session expires.
- Pipeline now sources `deploy/refresh-sundai-auth.sh` for cookie generation instead of reading a static header.
- Verified working on both local and GCP VM.

## v1.20.3 - 2026-03-22
- Hardened Cloud Run deployment guidance to always pass explicit `gcloud` flags from env: `--project "$GCP_PROJECT_ID"` and `--region "$GCP_REGION"`.
- Added guardrail to avoid relying on host-level default `gcloud` project/region config during Telegram/VM runs.

## v1.20.2 - 2026-03-22
- Added `SUNDAI_COOKIE_HEADER` as the preferred auth source for Sundai cookie-backed API mode.
- Added explicit `401` / `Unauthorized` handling: report expired auth, refresh/reacquire cookie header, then retry before UI fallback.
- Documented `SUNDAI_COOKIE_HEADER` in the public env example and VM deployment notes.

## v1.20.1 - 2026-03-22
- Made the external web/news scan in step 1 non-blocking.
- Added a required API-only Sundai approved-project fallback when web search is unavailable, rate-limited, or credit-blocked.
- Tightened Telegram/chat runtime output so every operator-visible status line must include the step number and `Next:`.

## v1.20.0 - 2026-03-22
- Tightened progress-reporting rules so every live update must include both the current step and the immediate next step.
- Added preferred compact Telegram/chat progress message formats, including blocked-state messaging with explicit next action.

## v1.19.1 - 2026-03-22
- Fixed progress checkpoint guidance to match the current 15-step workflow (`1/15` through `15/15`).
- Corrected mirror README to point at the local checklist reference file.

## v1.19.0 - 2026-03-15
- Verified and enforced API-only thumbnail selection path:
  - generate images via API,
  - choose `images[0]`,
  - upload via `thumbnail` FormData key in API edit,
  - verify `thumbnailId` changed via API readback.
- UI thumbnail picker remains fallback-only with explicit reason logging.

## v1.18.0 - 2026-03-15
- Added AI UX requirement: render model output in human-friendly markdown/rich format (not plain text dump).
- Updated checklist to verify AI output presentation quality.

## v1.17.0 - 2026-03-15
- Hardened Sundai Website API-first enforcement across create/edit/submit/verify steps.
- Added explicit rule: UI is fallback-only and must include reason logging.
- Added API-readback verification requirement after writes whenever possible.

## v1.16.0 - 2026-03-15
- Strengthened AI requirement: AI must be user-facing and central to project value.
- Added mandatory AI evidence in smoke test (response snippet/log/model used).
- Added fallback rule: if AI provider/model fails, switch to another OpenRouter free model and retry.
- Final artifacts now must include AI verification note.

## v1.15.0 - 2026-03-15
- Switched mandatory AI provider from Compute Community to OpenRouter free models.
- Updated required env keys to `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`.
- Updated AI endpoint reference and checklist to OpenRouter-based integration.

## v1.14.0 - 2026-03-10
- Switched default deployment target to GCP Cloud Run (Pages allowed only for static edge cases).
- Updated required local env keys to include `GCP_PROJECT_ID` and `GCP_REGION`.
- Final artifact output now uses generic Deploy URL wording instead of Render-only wording.

## v1.13.0 - 2026-03-08
- Increased thumbnail generation polling window to 120s total with 5s interval before fallback.

## v1.12.0 - 2026-03-08
- Broadened ideation scope from agentic-only to broader AI products.
- Explicitly allow categories like AI coding agents, AI devtools, workflow copilots, safety/eval tools, and consumer AI utilities.
- Kept creativity/radicality requirement while removing narrow agentic-only framing.

## v1.11.0 - 2026-03-08
- Refined thumbnail flow: after generate-images API call, wait/poll briefly for images before selection.
- Explicitly select first image (`images[0]`) after image list becomes available.
- Keep mandatory thumbnail persistence verification after save/reload.

## v1.10.0 - 2026-03-08
- Added API thumbnail generation step via `POST /api/projects/{projectId}/generate-images`.
- Pipeline now selects the first generated image (`images[0]`) by default.
- Added mandatory thumbnail persistence verification after save/reload.

## v1.9.0 - 2026-03-08
- Reordered pipeline to deploy immediately after build+GitHub push.
- Demo URL is now captured early and used in Sundai edit/link sync steps.
- Health checks remain later in flow (non-blocking for early card/link updates).

## v1.8.0 - 2026-03-08
- Reordered post-deploy flow: perform immediate link sync (Sundai Demo URL + GitHub About + README Sundai lines) before waiting on live health checks.
- Added explicit rule to report links right away, then run health retries/wait.
- Added checklist coverage for "link sync before health wait" behavior.

## v1.7.0 - 2026-03-08
- Verified `sundai-api-mode.md` against `sundai-website-v2` code/tests.
- Corrected submit API contract: `PATCH /api/projects/{id}/submit` must include JSON body `{ "status": "APPROVED" }` (or `DRAFT` for delist).
- Added guardrail to preserve `participants` in edit PATCH to prevent accidental team-member removal.
- Clarified create `members` payload shape and endpoint list as code-verified.

## v1.6.0 - 2026-03-08
- Fixed team-member reliability: if API assignment does not persist, pipeline now must use UI add-member fallback and re-verify `vyahhi` before publish.

## v1.5.0 - 2026-03-08
- Switched Sundai execution to cookie-backed API-first mode (create/edit/submit/verify), with UI fallback only.
- Captured and documented real create/edit request payload schemas from live traffic.
- Added known submit behavior handling (500 can occur for already-submitted projects; verify publish state before fallback).
- Added mandatory live numbered progress checkpoints during pipeline runs.

## v1.4.0 - 2026-03-08
- Enforced strict no-skip/no-reorder execution rule for checklist steps.
- Enforced immediate link sharing as soon as URLs are available (GitHub, deploy, Sundai).

## v1.3.0 - 2026-03-08
- Added mandatory runtime communication: step-by-step checklist progress updates during runs.
- Added requirement to provide milestone updates in long runs plus final checklist recap.

## v1.2.0 - 2026-03-08
- Made AI integration mandatory for every project (no rule-only projects).
- Standardized AI provider to Compute Community endpoint via env vars (`CC_API_KEY`, `CC_BASE_URL`, `CC_MODEL`).
- Added AI endpoint reference file with Python integration snippet.
- Extended demo smoke test to require one AI-backed interaction success.
- Updated operational checklist to include AI enforcement and 100-project ideation checks.

## v1.1.0 - 2026-03-08
- Ideation now scores 3 candidates with rubric (novelty, pain urgency, demo wow, feasibility, likely engagement).
- Added mandatory demo smoke test step (HTTP check + basic interaction).
- Added README lint requirements (What it does, How to Run from zero, Limitations).
- Added mandatory version/changelog maintenance rule.

# sundai-project-pipeline changelog

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

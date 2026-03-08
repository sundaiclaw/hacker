# sundai-project-pipeline changelog

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

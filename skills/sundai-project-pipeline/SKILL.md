---
name: sundai-project-pipeline
description: End-to-end Sundai Club project shipping workflow from idea to code to GitHub to Sundai create-edit to team and thumbnail setup to publish and repo About sync. Use when asked to create, update, submit, publish, or fully ship a Sundai project.
---

# Sundai Project Pipeline

## Overview
Execute a complete Sundai shipping run with no skipped steps. Default to this pipeline for any Sundai project request unless the user explicitly asks for a partial action.

## API-first enforcement (mandatory)
- Use Sundai Website API as the default execution path for create/edit/submit/verify.
- **Auth via inline curl** (do NOT use browser for auth):
  1. Load env: `source .env.sundai` (contains `SUNDAI_CLERK_CLIENT` and `SUNDAI_SESSION_ID`)
  2. Mint a fresh 60s session JWT before each API call:
     ```bash
     JWT=$(curl -s -X POST "https://clerk.sundai.club/v1/client/sessions/$SUNDAI_SESSION_ID/tokens" \
       -H "Cookie: __client=$SUNDAI_CLERK_CLIENT" -H "Origin: https://www.sundai.club" \
       | python3 -c "import sys,json; print(json.load(sys.stdin).get('jwt',''))")
     ```
  3. Use it: `curl -H "Cookie: __session=$JWT; __client_uat=$(date +%s)" https://www.sundai.club/api/...`
- **Important:** The sundaiclaw bot account hacker ID is `bb909f3a-89b6-402c-8062-76172c6aec28`. Always use this as `launchLeadId` when creating projects so the bot can edit/publish them.
- If API calls return `401`/`Unauthorized`, mint a new JWT and retry. Do NOT fall back to browser for auth.
- UI/browser actions are fallback-only when API call fails after retry.
- Every UI fallback must be explicitly reported with step number + reason.
- After any write (API or UI), perform API readback verification whenever possible.

## Progress Reporting (mandatory)
During execution, emit concise live status updates after each major phase using numbered checkpoints:
- `1/15 ...` through `15/15 ...`
- Every operator-visible progress/status message during the pipeline must begin with one of:
  - `N/15 ... Next: ...`
  - `Blocked at N/15: ... Next: ...`
- Every progress update must state both:
  - the **current step** being executed now
  - the **next step** that will run immediately after
- Preferred format:
  - `N/15 <current task>. Next: <next task>.`
- Do not send free-form milestone/status lines that omit the step number or omit `Next:`
- Include concrete outputs as soon as available (repo URL, Render URL, Sundai URL)
- If blocked, report exact blocker and current step number
- If blocked, also state the intended next action after the blocker is cleared
- Do not stay silent for long-running phases; send periodic progress updates

## Runtime communication (mandatory)
- Be verbal while running the pipeline.
- Print checklist progress as steps complete (e.g., `✅ 3/15 Repo created`, `🔄 7/15 Publishing`, `⚠️ 10/15 Smoke test failed, retrying`).
- For Telegram/chat runs, prefer compact operator-style updates such as:
  - `1/15 Researching approved projects. Next: score 3 ideas.`
  - `3/15 Deploying to Cloud Run. Next: capture demo URL.`
  - `Blocked at 3/15: Cloud Run denied for project X. Next: retry in project Y.`
- For Telegram/chat runs, keep updates short and plain; avoid extra paragraphs unless returning final artifacts.
- **Do not skip or renumber steps**; execute strictly in order and report every step.
- Send concise milestone updates during long runs, not just a final summary.
- End with a compact checklist recap showing status for each major step.
- **Share links immediately when available** (GitHub repo, deploy URL, Sundai project URL) instead of waiting for final summary.

## Workflow (always in order)

1. **Research-informed ideation (mandatory)**
   - Before choosing an idea, analyze the latest 100 approved Sundai projects from:
     - `https://www.sundai.club/api/projects?status=APPROVED`
   - From those, identify 5-10 top-liked projects for inspiration.
   - Compare project themes and observed engagement (`likes` count/length) to avoid weak or repetitive ideas.
   - Add **fresh external signal scan** (web/news) before final idea choice when available:
     - Use web search to pull recent agentic AI trends, launches, failures, and hot debates.
     - Prefer very recent signals (last days/weeks) and concrete shifts (new tools, policy changes, workflows, pain points).
     - If web search is unavailable, rate-limited, or credit-blocked, do not stop the run.
     - In that case, report the blocker in-progress, continue with Sundai approved-project analysis only, and choose an idea without the external scan.
   - Generate 3 candidate ideas, score each with this rubric (1-5 each), then choose highest total:
     - novelty/differentiation vs recent your+others projects
     - urgency of pain point
     - demo wow factor
     - feasibility in one run
     - likely engagement (likes/comments)
   - Pick 1 that is:
     - clearly differentiated from your and others recent Sundai projects
     - demoable in minutes
     - **creative/radical** AI product idea (not generic "chatbot" or wrapper)
     - can include broader categories: AI coding agents, AI devtools, AI workflow copilots, AI evaluation/safety tools, consumer AI utilities
     - tied to a real current pain point from the external scan
   - If user already gave a fixed idea, keep it; otherwise pick the best idea from this step.
   - Keep project title <= 32 chars and brief description <= 100 chars.

2. **Build MVP with mandatory AI integration + create NEW GitHub repo + push**
   - Create a minimal but runnable MVP.
   - **Mandatory:** each project must use AI in-product via OpenRouter **free** models.
   - Use this provider config (from environment variables, never hardcode secrets):
     - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
     - `OPENROUTER_MODEL=<free model from openrouter/free>`
     - `OPENROUTER_API_KEY=<secret>`
   - Implement at least one real LLM call in the app flow (not mock/rules-only).
   - AI must be **user-facing and core to value** (not hidden test endpoint only).
   - Render AI responses in a human-friendly UI format (markdown/rendered text), not raw/plain unformatted dumps.
   - Reject ideas that can be delivered equivalently without AI.
   - Create a **new public GitHub repo for this run** (no reusing old project repos).
   - Push code and verify repo URL resolves publicly.
   - Capture repo URL for Sundai `GitHub URL` field.

3. **Deploy early (mandatory, after build/push)**
   - Deploy immediately after GitHub push using **GCP Cloud Run by default**.
   - Static-only projects may use GitHub Pages when Cloud Run is unnecessary.
   - If no deploy target/service exists for the repo, create one first.
   - For any `gcloud` deploy/build command, always pass explicit flags:
     - `--project "$GCP_PROJECT_ID"`
     - `--region "$GCP_REGION"`
   - Do not rely on the VM's default `gcloud` project/region config for deploys.
   - Capture live `Demo URL` and deployment id/reference as early as possible.
   - Do **not** block here on full health checks; health validation runs later.

4. **Create Sundai project (cookie-backed API mandatory-first)**
   - Reuse authenticated Sundai browser session (cookies) for API calls.
   - If `SUNDAI_COOKIE_HEADER` exists in `.env.sundai`, use it before scraping/deriving cookies from the browser profile.
   - Start with API create by default; do not start with UI clicks unless API path is blocked.
   - Include: `Project Title`, `Brief Description`, `Launch Lead`, and team member **vyahhi** (Nikolay Vyahhi).
   - For API create, send `members` as structured objects (`id`, `role`) — not usernames/handles.
   - Capture `projectId` and canonical project URL.
   - If API create fails after session refresh/retry, use UI create flow as fallback.

5. **Edit details (cookie-backed API mandatory-first)**
   - Use API update for project fields by default using authenticated browser session cookies.
   - Prefer `SUNDAI_COOKIE_HEADER` when present; only derive cookies from the browser profile if the env header is absent or expired.
   - Read current project first and preserve `participants` in PATCH payload unless intentionally changing team.
   - Do not send empty `participants` by default.
   - Fill at minimum:
     - GitHub URL
     - Demo URL (once deploy is live)
     - One Sentence Description
     - Full Description
     - Start Date
   - In **Full Description**, use real paragraph breaks (actual newlines), never literal `\n`.
   - If API update fails, use UI edit flow as fallback.

6. **Required defaults for every project**
   - Ensure team member **vyahhi** (Nikolay Vyahhi) is present.
   - If API member assignment does not persist, immediately use UI `+ Add Team Members` fallback and re-save.
   - Thumbnail flow is **API-first mandatory**:
     1) `POST /api/projects/{projectId}/generate-images` with `{ "prompt": "..." }`
     2) poll up to **120s** (every **5s**) for returned `images[]`
     3) take `images[0]`
     4) fetch `images[0]` as blob/file and send it as FormData key `thumbnail` in `PATCH /api/projects/{projectId}/edit`
     5) verify persisted via `GET /api/projects/{projectId}` (`thumbnailId` non-empty / updated)
   - UI thumbnail picker is fallback-only with explicit reason logging.
   - If API generation fails, fallback to existing thumbnail state and continue.

7. **Post-save verification (mandatory)**
   - Verify persisted fields via API readback first; use UI reload check as fallback.
   - Verify all are still present (not empty/null):
     - GitHub URL
     - Full Description
     - Team member `vyahhi`
   - If any field is missing, patch again and re-verify before publish.

8. **Publish/submit (cookie-backed API mandatory-first)**
   - Use `PATCH /api/projects/{projectId}/submit` with JSON body `{ "status": "APPROVED" }` by default.
   - Prefer `SUNDAI_COOKIE_HEADER` when present; on `401`, report expired auth and refresh/reacquire the cookie header before UI fallback.
   - Treat 200 as success.
   - If API is non-200, verify publish state.
   - Verification order:
     1) check project page state (`Delist` visible) OR
     2) check project metadata indicates submitted/published.
   - If not published after verification, use UI Submit button as fallback.

9. **Like your own project (mandatory)**
   - On the project page, click the heart/Like button.
   - Verify liked state (active heart and/or incremented like count).

10. **Immediate link sync (mandatory, before health wait)**
   - As soon as a deploy URL exists, update external cards/links first:
     - Set Sundai `Demo URL` to deployed URL (API-first), save + verify persisted.
     - Sync GitHub About (description + homepage=Sundai project URL), verify saved.
     - Ensure README contains Sundai date/project link lines and push.
   - Report these links immediately in progress updates.

11. **One-click demo test (mandatory, runs later)**
   - Run a demo smoke test after link sync:
     - `curl -I -L <Demo URL>` returns 200-range status
     - homepage loads in browser without obvious runtime error
     - at least one key interaction path works
     - at least one **AI-backed** interaction path works end-to-end
   - For AI verification, capture concrete evidence (response snippet or server/API success signal).
   - If AI call fails due model/provider issue, switch to another OpenRouter free model and retry before finalizing.
   - If deployment is still warming, wait/retry and report `waiting for live health` status.
   - If smoke test fails after retries, fix and redeploy before finalizing.

12. **Finalize publish surface checks**
   - Confirm project remains published (`Delist` visible) and links still intact after health checks.

13. **Update GitHub README + lint**
   - Ensure README includes required sections:
     - What it does (short description)
     - **How to Run (from zero)** with full local setup steps:
       1) prerequisites
       2) `git clone <repo-url>`
       3) `cd <repo-folder>`
       4) dependency install (if any)
       5) run command
       6) local URL to open
     - Limitations / known gaps
   - Add two separate lines to `README.md` (create section if needed):
     - `Build on Sundai Club on Month D, YYYY`
     - `Sundai Project: <Sundai Project URL>`
   - Date must be human-readable (example: `March 8, 2026`), not ISO format.
   - **Mandatory markdown formatting:** force a rendered line break between them (use either two trailing spaces on the date line or a blank line between lines) so it never collapses into one line.
   - Keep project URL on its own line, separate from the date line.
   - Commit and push the README change.

14. **Version + changelog (mandatory)**
   - Keep API payload schemas current in `references/sundai-api-mode.md` when Sundai behavior changes.
   - Keep a pipeline version and changelog at `references/changelog.md`.
   - On every pipeline rule change, append:
     - date/time
     - version bump (semantic or incremental)
     - concise list of changed rules
   - Mirror updated skill files to `sundaiclaw/hacker`.

15. **Return final artifacts**
   - Reply with:
     - GitHub repo URL
     - Sundai project URL
     - Deploy URL (Cloud Run or Pages)
     - Publish status confirmation
     - AI verification note (which model + proof that user-facing AI path worked)

## Fast command interpretation
When user says short commands like:
- “create Sundai project for X”
- “ship this to Sundai”
- “do the Sundai pipeline”

Interpret as: run the full workflow above, including team member, post-save verification, publish, and GitHub About/README sync.

## Local Environment (required)
- Ensure local env file exists at workspace root: `.env.sundai`.
- Required keys:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - `OPENROUTER_MODEL` (must be a free model from `https://openrouter.ai/openrouter/free`)
  - `GCP_PROJECT_ID`
  - `GCP_REGION` (recommended default: `us-central1`)
- Preferred Sundai auth keys:
  - `SUNDAI_COOKIE_HEADER` for cookie-backed API mode
  - `SUNDAI_USERNAME`
  - `SUNDAI_PASSWORD`
- Always load env first in runs (e.g., `set -a; source .env.sundai; set +a`).
- Load these vars before running local tests/deploy scripts.
- For `gcloud` commands, prefer explicit flags sourced from env:
  - `--project "$GCP_PROJECT_ID"`
  - `--region "$GCP_REGION"`
- Never commit API keys into repo code/README.

## Reference
- Use `references/checklist.md` as a run checklist and copy-safe description template.
- Use `references/ai-endpoint.md` for OpenRouter integration snippet/pattern.
- Use `references/sundai-api-mode.md` for API-first request patterns and fallback rules.

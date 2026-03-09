---
name: sundai-project-pipeline
description: End-to-end Sundai Club project shipping workflow from idea to code to GitHub to Sundai create-edit to team and thumbnail setup to publish and repo About sync. Use when asked to create, update, submit, publish, or fully ship a Sundai project.
---

# Sundai Project Pipeline

## Overview
Execute a complete Sundai shipping run with no skipped steps. Default to this pipeline for any Sundai project request unless the user explicitly asks for a partial action.

## Progress Reporting (mandatory)
During execution, emit concise live status updates after each major phase using numbered checkpoints:
- `1/12 ...` through `12/12 ...`
- Include concrete outputs as soon as available (repo URL, Render URL, Sundai URL)
- If blocked, report exact blocker and current step number
- Do not stay silent for long-running phases; send periodic progress updates

## Runtime communication (mandatory)
- Be verbal while running the pipeline.
- Print checklist progress as steps complete (e.g., `✅ 3/15 Repo created`, `🔄 7/15 Publishing`, `⚠️ 10/15 Smoke test failed, retrying`).
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
   - Add **fresh external signal scan** (web/news) before final idea choice:
     - Use web search to pull recent agentic AI trends, launches, failures, and hot debates.
     - Prefer very recent signals (last days/weeks) and concrete shifts (new tools, policy changes, workflows, pain points).
   - Generate 3 candidate ideas, score each with this rubric (1-5 each), then choose highest total:
     - novelty/differentiation vs recent your+others projects
     - urgency of pain point
     - demo wow factor
     - feasibility in one run
     - likely engagement (likes/comments)
   - Pick 1 that is:
     - clearly differentiated from your and others recent Sundai projects
     - demoable in minutes
     - **creative/radical** in agentic AI angle (not generic "chatbot" or wrapper)
     - tied to a real current pain point from the external scan
   - If user already gave a fixed idea, keep it; otherwise pick the best idea from this step.
   - Keep project title <= 32 chars and brief description <= 100 chars.

2. **Build MVP with mandatory AI integration + create NEW GitHub repo + push**
   - Create a minimal but runnable MVP.
   - **Mandatory:** each project must use AI in-product via Compute Community endpoint.
   - Use this provider config (from environment variables, never hardcode secrets):
     - `CC_BASE_URL=https://computecommunity.com/sundai-server/v1`
     - `CC_MODEL=MiniMaxAI/MiniMax-M2.5`
     - `CC_API_KEY=<secret>`
   - Implement at least one real LLM call in the app flow (not mock/rules-only).
   - Create a **new public GitHub repo for this run** (no reusing old project repos).
   - Push code and verify repo URL resolves publicly.
   - Capture repo URL for Sundai `GitHub URL` field.

3. **Create Sundai project (cookie-backed API first)**
   - Reuse authenticated Sundai browser session (cookies) for API calls.
   - Prefer API create; do not start with UI clicks when API path works.
   - Include: `Project Title`, `Brief Description`, `Launch Lead`, and team member **vyahhi** (Nikolay Vyahhi).
   - Capture `projectId` and canonical project URL.
   - If API create fails after session refresh/retry, use UI create flow as fallback.

4. **Edit details (cookie-backed API first)**
   - Prefer API update for project fields using the authenticated browser session cookies.
   - Fill at minimum:
     - GitHub URL
     - Demo URL (once deploy is live)
     - One Sentence Description
     - Full Description
     - Start Date
   - In **Full Description**, use real paragraph breaks (actual newlines), never literal `\n`.
   - If API update fails, use UI edit flow as fallback.

5. **Required defaults for every project**
   - Ensure team member **vyahhi** (Nikolay Vyahhi) is present (set during create/update API call).
   - Skip AI thumbnail generation for now (feature is unreliable on Sundai site).

6. **Post-save verification (mandatory)**
   - Verify persisted fields via API readback first; use UI reload check as fallback.
   - Verify all are still present (not empty/null):
     - GitHub URL
     - Full Description
     - Team member `vyahhi`
   - If any field is missing, patch again and re-verify before publish.

7. **Publish/submit (cookie-backed API first)**
   - Prefer `PATCH /api/projects/{projectId}/submit`.
   - Treat 200 as success.
   - If API returns 500, do not assume failure immediately; verify publish state.
   - Verification order:
     1) check project page state (`Delist` visible) OR
     2) check project metadata indicates submitted/published.
   - If not published after verification, use UI Submit button as fallback.

8. **Like your own project (mandatory)**
   - On the project page, click the heart/Like button.
   - Verify liked state (active heart and/or incremented like count).

9. **Deploy (mandatory)**
   - Deploy each project (Render by default; static projects may use GitHub Pages).
   - If no deploy target/service exists for the repo, create one first.
   - Capture live `Demo URL` and deployment id/reference.
   - If deployment fails, stop and report exact error.

10. **One-click demo test (mandatory)**
   - Run a demo smoke test before finalizing:
     - `curl -I -L <Demo URL>` returns 200-range status
     - homepage loads in browser without obvious runtime error
     - at least one key interaction path works
     - at least one **AI-backed** interaction path works end-to-end
   - If smoke test fails, fix and redeploy before continuing.

11. **Update Sundai Demo URL (API-first, mandatory)**
   - Set `Demo URL` to the live deployed URL via API patch.
   - Verify via API readback that `Demo URL` persisted.
   - Fallback: update in UI edit page, save, reload, verify.

12. **Sync GitHub About (mandatory verification)**
   - Set repo description = project one-liner.
   - Set repo homepage = Sundai project URL.
   - Verify About fields actually saved on GitHub before finalizing (e.g., `gh repo view <owner/repo> --json description,homepageUrl`).
   - If description or homepage is empty/mismatched, fix immediately before marking run complete.

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
     - Render service URL
     - Publish status confirmation

## Fast command interpretation
When user says short commands like:
- “create Sundai project for X”
- “ship this to Sundai”
- “do the Sundai pipeline”

Interpret as: run the full workflow above, including team member, post-save verification, publish, and GitHub About/README sync.

## Local Environment (required)
- Ensure local env file exists at workspace root: `.env.sundai`.
- Required keys:
  - `CC_API_KEY`
  - `CC_BASE_URL=https://computecommunity.com/sundai-server/v1`
  - `CC_MODEL=MiniMaxAI/MiniMax-M2.5`
- Load these vars before running local tests/deploy scripts.
- Never commit API keys into repo code/README.

## Reference
- Use `references/checklist.md` as a run checklist and copy-safe description template.
- Use `references/ai-endpoint.md` for integration snippet/pattern.
- Use `references/sundai-api-mode.md` for API-first request patterns and fallback rules.

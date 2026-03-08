---
name: sundai-project-pipeline
description: End-to-end Sundai Club project shipping workflow from idea to code to GitHub to Sundai create-edit to team and thumbnail setup to publish and repo About sync. Use when asked to create, update, submit, publish, or fully ship a Sundai project.
---

# Sundai Project Pipeline

## Overview
Execute a complete Sundai shipping run with no skipped steps. Default to this pipeline for any Sundai project request unless the user explicitly asks for a partial action.

## Workflow (always in order)

1. **Research-informed ideation (mandatory)**
   - Before choosing an idea, analyze the latest 20 approved Sundai projects from:
     - `https://www.sundai.club/api/projects?status=APPROVED`
   - Compare project themes and observed engagement (`likes` count/length) to avoid weak or repetitive ideas.
   - Add **fresh external signal scan** (web/news) before final idea choice:
     - Use web search to pull recent agentic AI trends, launches, failures, and hot debates.
     - Prefer very recent signals (last days/weeks) and concrete shifts (new tools, policy changes, workflows, pain points).
   - Generate 3 candidate ideas, then choose 1 that is:
     - clearly differentiated from recent Sundai approvals
     - demoable in minutes
     - **creative/radical** in agentic AI angle (not generic "chatbot" or wrapper)
     - tied to a real current pain point from the external scan
   - If user already gave a fixed idea, keep it; otherwise pick the best idea from this step.
   - Keep project title <= 32 chars and brief description <= 100 chars.

2. **Build MVP + create NEW GitHub repo + push**
   - Create a minimal but runnable MVP.
   - Create a **new public GitHub repo for this run** (no reusing old project repos).
   - Push code and verify repo URL resolves publicly.
   - Capture repo URL for Sundai `GitHub URL` field.

3. **Create Sundai project** (`/projects/new`)
   - Fill: `Project Title`, `Brief Description`, `Launch Lead`.
   - Add team member **vyahhi** (Nikolay Vyahhi) during this create step.
   - Click **Create Project**.

4. **Edit details** (`/projects/{id}/edit`)
   - Fill at minimum:
     - GitHub URL
     - One Sentence Description
     - Full Description
     - Start Date
   - In **Full Description**, use real paragraph breaks (actual newlines), never literal `\n`.
   - Click **Save Changes**.

5. **Required defaults for every project**
   - Ensure team member **vyahhi** (Nikolay Vyahhi) is present (added during create step).
   - Skip AI thumbnail generation for now (feature is unreliable on Sundai site).
   - Save again.

6. **Post-save verification (mandatory)**
   - Reload `/projects/{id}/edit` after saving.
   - Verify all are still present (not empty/null):
     - GitHub URL
     - Full Description
     - Team member `vyahhi`
   - If any field is missing, refill and save again before publish.

7. **Publish/submit**
   - Use the **Submit** button on project page.
   - API equivalent: `PATCH /api/projects/{projectId}/submit`.
   - Success check: project shows **Delist** (or submit call returns 200).

8. **Like your own project (mandatory)**
   - On the project page, click the heart/Like button.
   - Verify liked state (active heart and/or incremented like count).

9. **Deploy to Render (mandatory)**
   - Use Render CLI to deploy each project.
   - If no Render service exists for the repo, create one first (web service) in the active workspace.
   - Trigger deploy and capture service URL + service id.
   - If deployment fails, stop and report exact Render error.

9. **Update Sundai Demo URL from Render (mandatory)**
   - Open Sundai edit page and set `Demo URL` to the deployed Render URL.
   - Save changes.
   - Reload edit page and verify `Demo URL` persisted.

10. **Sync GitHub About (mandatory verification)**
   - Set repo description = project one-liner.
   - Set repo homepage = Sundai project URL.
   - Verify About fields actually saved on GitHub before finalizing (e.g., `gh repo view <owner/repo> --json description,homepageUrl`).
   - If description or homepage is empty/mismatched, fix immediately before marking run complete.

11. **Update GitHub README**
   - Ensure README includes a **How to Run (from zero)** section with full local setup steps:
     1) prerequisites
     2) `git clone <repo-url>`
     3) `cd <repo-folder>`
     4) dependency install (if any)
     5) run command
     6) local URL to open
   - Add two separate lines to `README.md` (create section if needed):
     - `Build on Sundai Club on Month D, YYYY`
     - `Sundai Project: <Sundai Project URL>`
   - Date must be human-readable (example: `March 8, 2026`), not ISO format.
   - **Mandatory markdown formatting:** force a rendered line break between them (use either two trailing spaces on the date line or a blank line between lines) so it never collapses into one line.
   - Keep project URL on its own line, separate from the date line.
   - Commit and push the README change.

12. **Return final artifacts**
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

## Reference
- Use `references/checklist.md` as a run checklist and copy-safe description template.

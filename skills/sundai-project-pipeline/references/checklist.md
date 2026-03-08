# Sundai Pipeline Checklist

## Required checks before publish
- [ ] Progress updates sent at each major phase (numbered checkpoints)
- [ ] Reviewed latest 100 approved projects from `/api/projects?status=APPROVED`
- [ ] Picked 5-10 top-liked projects for inspiration
- [ ] Generated 3 candidate ideas and scored with rubric (novelty, urgency, demo wow, feasibility, likely engagement)
- [ ] Chosen idea is clearly differentiated from your + others recent Sundai projects
- [ ] Title fits Sundai limit (<=32 chars)
- [ ] Brief description fits Sundai limit (<=100 chars)
- [ ] MVP includes real AI call (not mock/rules-only)
- [ ] AI integration uses Compute Community endpoint via env vars (`CC_API_KEY`, `CC_BASE_URL`, `CC_MODEL`)
- [ ] GitHub repo exists and is pushed (new repo for this run)
- [ ] Project create executed via API (or UI fallback documented)
- [ ] Project fields updated via API patch (or UI fallback documented)
- [ ] GitHub URL persisted (API readback or UI reload verify)
- [ ] Demo URL persisted (API readback or UI reload verify)
- [ ] One-liner filled
- [ ] Full description uses real paragraphs (no literal `\\n`)
- [ ] Team member `vyahhi` added
- [ ] AI thumbnail generation skipped
- [ ] Saved after edits
- [ ] Reloaded edit page and re-verified GitHub URL is still filled
- [ ] Reloaded edit page and re-verified Full Description is still filled
- [ ] Reloaded edit page and re-verified team member `vyahhi` is still present
- [ ] Submitted/published (`Delist` shown)
- [ ] Liked own project and verified like count/state
- [ ] Deployment completed and URL captured
- [ ] Demo smoke test passed:
  - [ ] HTTP 200-range
  - [ ] homepage loads
  - [ ] one key interaction works
  - [ ] one AI-backed interaction works end-to-end
- [ ] GitHub About synced (description + homepage=Sundai URL)
- [ ] README includes: What it does, How to Run (from zero), Limitations
- [ ] README includes `Build on Sundai Club on Month D, YYYY`
- [ ] README includes `Sundai Project: PROJECT_URL` on separate rendered line and is pushed

## Full description template

[Problem in 1 paragraph]

[How this project works in 1 paragraph]

[Why it matters / who it helps in 1 paragraph]

Stack: [tech stack]

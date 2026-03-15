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
- [ ] AI is user-facing and central to product value (not hidden helper endpoint)
- [ ] AI output is rendered for humans (markdown/rendered rich text where applicable), not plain raw dump
- [ ] AI integration uses OpenRouter free model via env vars (`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`)
- [ ] GitHub repo exists and is pushed (new repo for this run)
- [ ] Early deployment executed immediately after push; Demo URL captured
- [ ] Project create executed via cookie-backed API (UI fallback only if API blocked, with reason logged)
- [ ] Project fields updated via cookie-backed API patch (UI fallback only if API blocked, with reason logged)
- [ ] Edit PATCH preserved existing `participants` (no accidental team wipe)
- [ ] Submit API call sent JSON body `{ "status": "APPROVED" }` (UI fallback only if API blocked, with reason logged)
- [ ] GitHub URL persisted (API readback or UI reload verify)
- [ ] Demo URL persisted (API readback or UI reload verify)
- [ ] One-liner filled
- [ ] Full description uses real paragraphs (no literal `\\n`)
- [ ] Team member `vyahhi` added
- [ ] Thumbnail generated via `/api/projects/{projectId}/generate-images` (API)
- [ ] First generated image (`images[0]`) uploaded via API edit key `thumbnail`
- [ ] Thumbnail persisted via API readback (`thumbnailId` updated)
- [ ] If UI fallback used, reason was explicitly logged
- [ ] Saved after edits
- [ ] Reloaded edit page and re-verified GitHub URL is still filled
- [ ] Reloaded edit page and re-verified Full Description is still filled
- [ ] Reloaded edit page and re-verified team member `vyahhi` is still present
- [ ] If missing, used UI add-member fallback and re-verified presence before publish
- [ ] Submitted/published (`Delist` shown)
- [ ] Liked own project and verified like count/state
- [ ] Deployment completed and URL captured
- [ ] Immediate link sync completed before health wait:
  - [ ] Sundai Demo URL updated + persisted
  - [ ] GitHub About synced (description + homepage=Sundai URL)
  - [ ] README Sundai date/project lines pushed
- [ ] Demo smoke test passed (after link sync):
  - [ ] HTTP 200-range
  - [ ] homepage loads
  - [ ] one key interaction works
  - [ ] one AI-backed interaction works end-to-end
  - [ ] evidence captured (response snippet/log/model used)
- [ ] README includes: What it does, How to Run (from zero), Limitations
- [ ] README includes `Build on Sundai Club on Month D, YYYY`
- [ ] README includes `Sundai Project: PROJECT_URL` on separate rendered line and is pushed

## Full description template

[Problem in 1 paragraph]

[How this project works in 1 paragraph]

[Why it matters / who it helps in 1 paragraph]

Stack: [tech stack]

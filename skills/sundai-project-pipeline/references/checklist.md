# Sundai Pipeline Checklist

## Required checks before publish
- [ ] Reviewed latest 20 approved projects from `/api/projects?status=APPROVED`
- [ ] Considered engagement (`likes`) and avoided duplicate/weak idea positioning
- [ ] Title fits Sundai limit (<=32 chars)
- [ ] Brief description fits Sundai limit (<=100 chars)
- [ ] GitHub repo exists and is pushed
- [ ] GitHub URL filled in Sundai edit page
- [ ] One-liner filled
- [ ] Full description uses real paragraphs (no literal `\\n`)
- [ ] Team member `vyahhi` added in the New Project create form
- [ ] AI thumbnail generation skipped (known unreliable); proceed without blocking publish
- [ ] Saved after edits
- [ ] Reloaded edit page and re-verified GitHub URL is still filled
- [ ] Reloaded edit page and re-verified Full Description is still filled
- [ ] Reloaded edit page and re-verified team member `vyahhi` is still present
- [ ] Submitted/published (UI Submit or PATCH submit endpoint)
- [ ] Render deployment completed and URL captured
- [ ] Sundai edit form Demo URL set to Render URL and verified after reload
- [ ] GitHub About synced (description + homepage)
- [ ] README includes `Build on Sundai Club on Month D, YYYY` (human-readable date, not linked)
- [ ] README includes `Sundai Project: PROJECT_URL` on a separate line and is pushed

## Full description template

[Problem in 1 paragraph]

[How this project works in 1 paragraph]

[Why it matters / who it helps in 1 paragraph]

Stack: [tech stack]

## Publish verification signals
- Project page shows `Delist` button (published)
- OR API submit returns HTTP 200

# Sundai API-First Mode

Use API calls first for speed/reliability. Use UI only as fallback.

## Principles
- Prefer API for create/update/submit/verify.
- Keep browser UI for auth bootstrap and fallback only.
- After every write, do readback verification before proceeding.
- Log which step used fallback when API fails.

## Core endpoints (observed)
- List approved: `GET /api/projects?status=APPROVED`
- Submit/publish: `PATCH /api/projects/{projectId}/submit`

## Pipeline behavior
1. Create project via API (title/brief/lead/team including `vyahhi`).
2. Patch project fields via API (GitHub URL, one-liner, description, start date; later Demo URL).
3. Verify with API readback (non-empty persisted fields).
4. Publish via API submit endpoint.
5. If API op fails, fallback to equivalent UI step and continue.

## Verification minimums
- `githubUrl` persisted
- `description/fullDescription` persisted with real newlines
- `teamMembers` includes `vyahhi`
- `demoUrl` persisted after deployment
- submit response OK / project in Delist state

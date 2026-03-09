# Sundai API-First Mode

Use API calls first for speed/reliability. Use UI only as fallback.

## Principles
- Prefer API for create/update/submit/verify.
- Reuse authenticated browser session cookies for API calls (cookie-backed API mode).
- Keep browser UI for auth bootstrap and fallback only.
- After every write, do readback verification before proceeding.
- Log which step used fallback when API fails.

## Core endpoints (observed)
- List approved: `GET /api/projects?status=APPROVED`
- Submit/publish: `PATCH /api/projects/{projectId}/submit`

## Known behavior
- `PATCH /api/projects/{projectId}/submit` may return `500 Internal Error` for already-submitted projects.
- On 500, verify project publish state before retrying/fallback.

## Pipeline behavior
1. Create project via API (title/brief/lead/team including `vyahhi`).
2. Patch project fields via API (GitHub URL, one-liner, description, start date; later Demo URL).
3. Verify with API readback (non-empty persisted fields).
4. Publish via API submit endpoint.
5. If API op fails, fallback to equivalent UI step and continue.

## Captured request shapes (from real UI traffic)

### Create
`POST /api/projects`

FormData keys:
- `title`
- `preview`
- `launchLeadId`
- `members` (JSON string array)

Observed example:
```json
{
  "title": "API Create Capture 2",
  "preview": "visible create payload capture",
  "launchLeadId": "bb909f3a-89b6-402c-8062-76172c6aec28",
  "members": "[]"
}
```

### Edit/Save
`PATCH /api/projects/{projectId}/edit`

FormData keys:
- `title`
- `description`
- `preview`
- `startDate` (ISO datetime)
- `githubUrl`
- `demoUrl`
- `blogUrl`
- `participants` (JSON string array)
- `launchLead` (lead id)
- `deleteThumbnail` (`true|false`)

Observed example:
```json
{
  "title": "API Capture Test",
  "description": "null",
  "preview": "capture payload schema",
  "startDate": "2026-03-09T00:05:30.791Z",
  "githubUrl": "",
  "demoUrl": "",
  "blogUrl": "",
  "participants": "[]",
  "launchLead": "bb909f3a-89b6-402c-8062-76172c6aec28",
  "deleteThumbnail": "true"
}
```

## Verification minimums
- `githubUrl` persisted
- `description/fullDescription` persisted with real newlines
- `teamMembers` includes `vyahhi` (if API misses it, enforce UI add-member fallback)
- `demoUrl` persisted after deployment
- submit response OK / project in Delist state

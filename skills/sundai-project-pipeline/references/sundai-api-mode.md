# Sundai API-First Mode

Use API calls first for speed/reliability. Use UI only as fallback.

## Principles
- Prefer API for create/update/submit/verify.
- Reuse authenticated browser session cookies for API calls (cookie-backed API mode).
- If `SUNDAI_COOKIE_HEADER` is present in `.env.sundai`, prefer it as the first auth source for API requests.
- Keep browser UI for auth bootstrap and fallback only.
- After every write, do readback verification before proceeding.
- Log which step used fallback when API fails.
- Treat `401` / `Unauthorized` as expired Sundai auth: report it clearly, refresh/reacquire the cookie header, then retry before UI fallback.

## Core endpoints (verified against sundai-website-v2)
- List approved: `GET /api/projects?status=APPROVED`
- Create project: `POST /api/projects` (FormData)
- Read project: `GET /api/projects/{projectId}`
- Edit/save: `PATCH /api/projects/{projectId}/edit` (FormData)
- Submit/publish or delist: `PATCH /api/projects/{projectId}/submit` (JSON body)
- Generate images: `POST /api/projects/{projectId}/generate-images` (JSON body)

## Submit payload (verified)
`PATCH /api/projects/{projectId}/submit` expects JSON body:
- publish: `{ "status": "APPROVED" }`
- delist: `{ "status": "DRAFT" }`

If submit returns non-200, verify publish state and fallback to UI Submit/Delist.

## Image generation payload (verified)
`POST /api/projects/{projectId}/generate-images` expects JSON body:
- `{ "prompt": "<generation prompt>" }`

Response shape:
- `{ "images": ["url1", "url2", ...] }`

Pipeline rule (API-only):
1. Generate images via API.
2. Pick `images[0]`.
3. Fetch `images[0]` URL as blob/file.
4. Send as FormData key `thumbnail` in `PATCH /api/projects/{projectId}/edit`.
5. Verify `thumbnailId` persisted via readback.

UI image picker is fallback-only.

## Pipeline behavior
1. Create project via API (title/brief/lead/team including `vyahhi`).
2. Patch project fields via API (GitHub URL, one-liner, description, start date; later Demo URL).
   - Before PATCH edit, fetch current project and preserve `participants` unless intentionally changing team.
   - Never send empty `participants` by default (it can remove existing team members).
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
- `members` (JSON string array of objects; use `id` + `role`)

Observed example (UI capture):
```json
{
  "title": "API Create Capture 2",
  "preview": "visible create payload capture",
  "launchLeadId": "bb909f3a-89b6-402c-8062-76172c6aec28",
  "members": "[]"
}
```

Expected member shape (from sundai-website-v2 tests):
```json
"members": "[{\"id\":\"<hacker-id>\",\"role\":\"Developer\"}]"
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
- `participants` (JSON string array of objects like `{ hacker: { id }, role }`)
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

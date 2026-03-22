# Sundai API-First Mode

Use API calls first for speed/reliability. Use UI only as fallback.

## Principles
- Prefer API for create/update/submit/verify.
- After every write, do readback verification before proceeding.
- Log which step used fallback when API fails.
- On `401`/`Unauthorized`: run `deploy/refresh-sundai-auth.sh` to get a fresh cookie, retry, then UI fallback.

## Authentication (Clerk + GitHub OAuth)
Sundai uses Clerk with **OAuth-only** sign-in (GitHub/Google/Discord). No password auth exists.

**How it works:**
1. `SUNDAI_CLERK_CLIENT` (long-lived ~10yr `__client` JWT) + `SUNDAI_SESSION_ID` are stored in `.env.sundai`.
2. Before each API call, mint a fresh `__session` JWT (60s lifetime) via:
   `POST https://clerk.sundai.club/v1/client/sessions/{SUNDAI_SESSION_ID}/tokens`
   with `Cookie: __client={SUNDAI_CLERK_CLIENT}`.
3. Use the returned JWT as `Cookie: __session={jwt}; __client_uat={unix_ts}` in API requests.
4. If the session is expired/revoked, `deploy/refresh-sundai-auth.sh` does a full GitHub OAuth re-auth automatically.

**Quick usage:**
```bash
source deploy/refresh-sundai-auth.sh
COOKIE=$(sundai_cookie_header)
curl -H "Cookie: $COOKIE" https://www.sundai.club/api/projects?status=APPROVED
```

**CLI modes:**
- `deploy/refresh-sundai-auth.sh` — prints fresh cookie header to stdout
- `deploy/refresh-sundai-auth.sh --update` — updates `.env.sundai` with fresh auth
- `deploy/refresh-sundai-auth.sh --test` — verifies API access works

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

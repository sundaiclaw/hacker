# Agent Build Observatory

A live observability layer for agent-driven software work.

## What it does

Build Observatory now supports three explicit source modes:

- `hosted` — authenticated runtimes push structured telemetry to `POST /api/telemetry`
- `runtime-adapter` — local transcript scraping projects `~/.openclaw` activity into the same store for debugging
- `demo` — seeded replay data for local exploration and screenshots

Hosted telemetry is the canonical production path. Runtime scraping remains a local adapter only.

## Core capabilities

- durable SQLite or Postgres-backed observability storage
- authenticated producer ingestion for runs, events, and commands
- authenticated viewer access for dashboard, run detail, and live stream APIs
- project/environment scoped authorization
- sensitive command log redaction for viewers without sensitive-log access
- operator console filters for status, stage, source, and owner
- parent/child run hierarchy on dashboard and run detail
- first-class command telemetry and failed-command promotion
- retention pruning for old observability records
- incremental SSE updates with snapshot + delta messages

## Configuration

### Storage

```bash
OBSERVABILITY_STORAGE_MODE=auto
# auto | sqlite | postgres

DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
OBSERVABILITY_SQLITE_PATH=./data/observability/observability.db
```

Storage resolution:

- `OBSERVABILITY_STORAGE_MODE=auto` selects Postgres when `DATABASE_URL` is set, otherwise SQLite
- `OBSERVABILITY_STORAGE_MODE=postgres` requires `DATABASE_URL`
- `OBSERVABILITY_STORAGE_MODE=sqlite` forces local SQLite

### Source mode

```bash
OBSERVABILITY_SOURCE_MODE=auto
# auto | demo | runtime-adapter | hosted
```

Resolution rules:

- `hosted` reads only hosted telemetry from storage and never scrapes `~/.openclaw`
- `runtime-adapter` scrapes local runtime transcripts and writes structured records into the store
- `demo` serves the seeded demo dataset
- `auto` resolves to `hosted` when Postgres is configured, otherwise prefers `runtime-adapter` locally and falls back to demo if no runtime data exists

### Producer credentials

Hosted ingestion requires Bearer auth when producer auth is enabled.

```bash
OBSERVABILITY_REQUIRE_PRODUCER_AUTH=true
OBSERVABILITY_PRODUCER_CREDENTIALS_JSON='[
  {
    "name": "runtime-a",
    "token": "replace-me",
    "scopes": [{ "projectId": "project-a", "environmentId": "prod" }]
  }
]'
```

### Viewer credentials

Hosted dashboard access uses Basic auth in v1.

```bash
OBSERVABILITY_REQUIRE_VIEWER_AUTH=true
OBSERVABILITY_VIEWER_CREDENTIALS_JSON='[
  {
    "username": "ops",
    "password": "replace-me",
    "scopes": [{ "projectId": "project-a", "environmentId": "prod" }],
    "canViewSensitiveLogs": true
  }
]'
```

Useful flags:

```bash
OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS=false
OBSERVABILITY_ALLOW_LOCAL_PRODUCER_BYPASS=false
OBSERVABILITY_REDACTION_PLACEHOLDER='[Sensitive command output hidden]'
OBSERVABILITY_RETENTION_DAYS=30
```

## Canonical ingestion contract

`POST /api/telemetry`

```json
{
  "requestId": "req_123",
  "source": {
    "projectId": "project-a",
    "environmentId": "prod",
    "runtimeId": "runtime-1",
    "sourceMode": "hosted"
  },
  "run": {
    "id": "run_123",
    "task": "Deploy release",
    "status": "deploying",
    "stage": "deploy",
    "owner": "main",
    "startedAt": "2026-04-18T12:00:00.000Z",
    "updatedAt": "2026-04-18T12:00:02.000Z"
  },
  "events": [
    {
      "id": "evt_1",
      "runId": "run_123",
      "type": "run.started",
      "title": "Started deploy",
      "ts": "2026-04-18T12:00:00.000Z"
    }
  ],
  "commands": [
    {
      "id": "cmd_1",
      "runId": "run_123",
      "label": "npm run smoke",
      "command": "npm run smoke",
      "status": "failed",
      "startedAt": "2026-04-18T12:00:10.000Z",
      "endedAt": "2026-04-18T12:00:25.000Z",
      "exitCode": 1,
      "logSummary": "Smoke test failed",
      "sensitive": true,
      "redactedLogSummary": "Smoke test failed. Raw output requires sensitive-log access."
    }
  ]
}
```

Example request:

```bash
curl -X POST http://localhost:3000/api/telemetry \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer replace-me' \
  --data @tests/fixtures/telemetry/hosted-failed-run.json
```

`POST /api/log` remains available as a compatibility bridge for legacy event-only publishers.

## Storage initialization and pruning

Initialize storage before serving traffic:

```bash
npm run storage:init
```

Prune expired observability data when `OBSERVABILITY_RETENTION_DAYS` is set:

```bash
npm run retention:prune
```

## Local development modes

### Demo replay

```bash
OBSERVABILITY_SOURCE_MODE=demo npm run dev
```

### Runtime adapter

```bash
OBSERVABILITY_SOURCE_MODE=runtime-adapter npm run dev
```

### Hosted mode with local SQLite

```bash
OBSERVABILITY_SOURCE_MODE=hosted \
OBSERVABILITY_STORAGE_MODE=sqlite \
OBSERVABILITY_REQUIRE_PRODUCER_AUTH=true \
OBSERVABILITY_REQUIRE_VIEWER_AUTH=true \
npm run dev
```

### Hosted mode with Postgres

```bash
OBSERVABILITY_SOURCE_MODE=hosted \
OBSERVABILITY_STORAGE_MODE=postgres \
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
OBSERVABILITY_REQUIRE_PRODUCER_AUTH=true \
OBSERVABILITY_REQUIRE_VIEWER_AUTH=true \
npm run storage:init && npm run start
```

## Verification

Focused commands:

```bash
npm run typecheck
npm run test:storage
npm run test:run-detail
npm run test:telemetry
npm run test:access
npm run test:retention
npm run test:parser
npm run test:projection
npm run test:e2e
```

All observability verification:

```bash
npm run verify
```

Verification contract:

- `npm run typecheck` checks tracked TypeScript source and scripts without depending on generated `.next/types` state
- `npm run test:observability` runs the storage, API, retention, parser, projection, and e2e node test suites
- `npm run build` verifies the local Next.js production build, including generation of `.next/standalone/`
- external deployment-time artifact copying should be treated as a separate environment check; this repo only verifies standalone output generation locally

## Deployment, rollout, and rollback

### Recommended rollout

1. initialize the target Postgres store with `npm run storage:init`
2. configure producer and viewer credentials for one project/environment scope
3. start shipping runtime telemetry to `POST /api/telemetry`
4. verify dashboard access, scoped reads, and command redaction with that scope
5. expand to additional scopes only after contract and end-to-end tests pass

### Rollback

- switch `OBSERVABILITY_SOURCE_MODE` away from `hosted` to `runtime-adapter` or `demo`
- keep using the additive schema; no destructive rollback migration is required
- leave producer/viewer auth enabled for hosted mode; only use bypass flags for explicit local development

## Source control hygiene

Generated workflow files and local database artifacts should stay out of source control. The app ignores:

- `.workflow/`
- `data/observability/*.db`
- `data/observability/*.db-shm`
- `data/observability/*.db-wal`

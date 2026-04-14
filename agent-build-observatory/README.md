# Agent Build Observatory

A live observability layer for agent-driven software work.

## Goal

Make agent builds legible while they are happening:
- current stage
- event timeline
- tool and command activity
- changed files
- artifacts
- sub-agent hierarchy
- deploy outcomes

## Current status

V1 scaffolded as a static Next.js dashboard with validated event ingestion, run projections, and dual storage backends:
- `DATABASE_URL` set → Postgres
- no `DATABASE_URL` → local SQLite fallback

## Configuration

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
```

If no `DATABASE_URL` is provided, the app uses a local SQLite database under `data/observability/observability.db`.

## Planned next steps

1. Append-only JSONL event logs per run
2. SQLite-backed run + event store
3. Live SSE updates for active runs
4. Run detail pages with timeline replay
5. Command log viewer and sub-agent tree

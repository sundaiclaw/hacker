import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as BetterSQLiteDatabase } from "better-sqlite3";
import { Pool } from "pg";
import type { ObservatoryCommand, ObservatoryEvent } from "@/lib/observability-schema";

const dataDir = path.join(process.cwd(), "data", "observability");
const dbFile = path.join(dataDir, "observability.db");
const liveEventsFile = path.join(dataDir, "events.jsonl");
const demoEventsFile = path.join(dataDir, "demo-events.jsonl");

type DbHandle = { db: BetterSQLiteDatabase };

declare global {
  var __observabilityDb__: DbHandle | undefined;
  var __observabilityPgPool__: Pool | undefined;
}

export type EventRow = {
  id: string;
  run_id: string;
  parent_run_id: string | null;
  type: string;
  title: string;
  meta: string | null;
  stage: string | null;
  status: string | null;
  owner: string | null;
  payload_json: string | null;
  ts: string;
  source: string;
};

export type RunRow = {
  id: string;
  source: string;
  parent_run_id: string | null;
  task: string;
  status: string;
  stage: string;
  owner: string;
  started_at: string;
  updated_at: string;
  event_count: number;
};

export type RunRecordInput = {
  id: string;
  source: string;
  parentRunId?: string;
  task: string;
  status: string;
  stage: string;
  owner: string;
  startedAt: string;
  updatedAt: string;
  eventCount: number;
};

export type CommandRow = {
  id: string;
  run_id: string;
  label: string;
  command_text: string;
  cwd: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  log_summary: string | null;
  source: string;
};

export function hasExternalDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export async function initializeStorage() {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        parent_run_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        meta TEXT,
        stage TEXT,
        status TEXT,
        owner TEXT,
        payload_json TEXT,
        ts TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL DEFAULT 'live'
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'live',
        parent_run_id TEXT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        owner TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id, source)
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        label TEXT NOT NULL,
        command_text TEXT NOT NULL,
        cwd TEXT,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        duration_ms INTEGER,
        exit_code INTEGER,
        log_summary TEXT,
        source TEXT NOT NULL DEFAULT 'live',
        PRIMARY KEY (id, source)
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id, source, ts);
      CREATE INDEX IF NOT EXISTS idx_events_source_ts ON events(source, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_commands_run_id ON commands(run_id, source, started_at);
      CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(source, status, started_at DESC);
    `);
    return;
  }

  getSqliteDb();
}

export async function countEventsBySource(source: string) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const result = source === "live"
      ? await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events WHERE source <> 'demo'`)
      : await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events WHERE source = $1`, [source]);
    return Number(result.rows[0]?.count ?? 0);
  }

  const db = getSqliteDb();
  const row = source === "live"
    ? (db.prepare(`SELECT COUNT(*) as count FROM events WHERE source <> 'demo'`).get() as { count: number })
    : (db.prepare(`SELECT COUNT(*) as count FROM events WHERE source = ?`).get(source) as { count: number });
  return Number(row.count ?? 0);
}

export async function listEventRows(source: string, limit?: number) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const result = source === "live"
      ? limit
        ? await pool.query<EventRow>(
            `SELECT * FROM events WHERE source <> 'demo' ORDER BY ts DESC LIMIT $1`,
            [limit]
          )
        : await pool.query<EventRow>(`SELECT * FROM events WHERE source <> 'demo' ORDER BY ts DESC`)
      : limit
        ? await pool.query<EventRow>(
            `SELECT * FROM events WHERE source = $1 ORDER BY ts DESC LIMIT $2`,
            [source, limit]
          )
        : await pool.query<EventRow>(`SELECT * FROM events WHERE source = $1 ORDER BY ts DESC`, [source]);
    return result.rows;
  }

  const db = getSqliteDb();
  if (source === "live") {
    if (limit) {
      return db.prepare(`SELECT * FROM events WHERE source <> 'demo' ORDER BY ts DESC LIMIT ?`).all(limit) as EventRow[];
    }
    return db.prepare(`SELECT * FROM events WHERE source <> 'demo' ORDER BY ts DESC`).all() as EventRow[];
  }
  if (limit) {
    return db.prepare(`SELECT * FROM events WHERE source = ? ORDER BY ts DESC LIMIT ?`).all(source, limit) as EventRow[];
  }
  return db.prepare(`SELECT * FROM events WHERE source = ? ORDER BY ts DESC`).all(source) as EventRow[];
}

export async function listRunRows(source: string) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const result = source === "live"
      ? await pool.query<RunRow>(`SELECT * FROM runs WHERE source <> 'demo' ORDER BY updated_at DESC`)
      : await pool.query<RunRow>(`SELECT * FROM runs WHERE source = $1 ORDER BY updated_at DESC`, [source]);
    return result.rows;
  }

  const db = getSqliteDb();
  if (source === "live") {
    return db.prepare(`SELECT * FROM runs WHERE source <> 'demo' ORDER BY updated_at DESC`).all() as RunRow[];
  }
  return db.prepare(`SELECT * FROM runs WHERE source = ? ORDER BY updated_at DESC`).all(source) as RunRow[];
}

export async function getRunEventRows(runId: string, source: string) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const result = await pool.query<EventRow>(
      `SELECT * FROM events WHERE run_id = $1 AND source = $2 ORDER BY ts ASC`,
      [runId, source]
    );
    return result.rows;
  }

  const db = getSqliteDb();
  return db.prepare(`SELECT * FROM events WHERE run_id = ? AND source = ? ORDER BY ts ASC`).all(runId, source) as EventRow[];
}

export async function getRunCommandRows(runId: string, source: string) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const result = await pool.query<CommandRow>(
      `SELECT * FROM commands WHERE run_id = $1 AND source = $2 ORDER BY started_at ASC`,
      [runId, source]
    );
    return result.rows;
  }

  const db = getSqliteDb();
  return db
    .prepare(`SELECT * FROM commands WHERE run_id = ? AND source = ? ORDER BY started_at ASC`)
    .all(runId, source) as CommandRow[];
}

export async function insertEventRecord(event: ObservatoryEvent) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const task = extractTask(event.meta) ?? event.title;
    const source = event.source ?? "live";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const insertResult = await client.query(
        `INSERT INTO events (
          id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.runId,
          event.parentRunId ?? null,
          event.type,
          event.title,
          event.meta ?? null,
          event.stage ?? null,
          event.status ?? null,
          event.owner ?? null,
          event.payload ? JSON.stringify(event.payload) : null,
          event.ts,
          source,
        ]
      );

      if ((insertResult.rowCount ?? 0) > 0) {
        await client.query(
          `INSERT INTO runs (
            id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (id, source)
          DO UPDATE SET
            parent_run_id = COALESCE(EXCLUDED.parent_run_id, runs.parent_run_id),
            task = EXCLUDED.task,
            status = EXCLUDED.status,
            stage = EXCLUDED.stage,
            owner = EXCLUDED.owner,
            updated_at = EXCLUDED.updated_at,
            event_count = runs.event_count + 1`,
          [
            event.runId,
            source,
            event.parentRunId ?? null,
            task,
            event.status ?? "planning",
            event.stage ?? "plan",
            event.owner ?? "main",
            event.ts,
            event.ts,
            1,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return;
  }

  const db = getSqliteDb();
  insertEventSqlite(db, event);
}

export async function replaceRunEvents(run: RunRecordInput, events: ObservatoryEvent[]) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO runs (
          id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id, source)
        DO UPDATE SET
          parent_run_id = EXCLUDED.parent_run_id,
          task = EXCLUDED.task,
          status = EXCLUDED.status,
          stage = EXCLUDED.stage,
          owner = EXCLUDED.owner,
          started_at = EXCLUDED.started_at,
          updated_at = EXCLUDED.updated_at,
          event_count = EXCLUDED.event_count`,
        [
          run.id,
          run.source,
          run.parentRunId ?? null,
          run.task,
          run.status,
          run.stage,
          run.owner,
          run.startedAt,
          run.updatedAt,
          run.eventCount,
        ]
      );

      await client.query(`DELETE FROM events WHERE run_id = $1 AND source = $2`, [run.id, run.source]);

      for (const event of events) {
        await client.query(
          `INSERT INTO events (
            id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            event.id,
            event.runId,
            event.parentRunId ?? null,
            event.type,
            event.title,
            event.meta ?? null,
            event.stage ?? null,
            event.status ?? null,
            event.owner ?? null,
            event.payload ? JSON.stringify(event.payload) : null,
            event.ts,
            event.source ?? run.source,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return;
  }

  const db = getSqliteDb();
  replaceRunEventsSqlite(db, run, events);
}

export async function replaceRunCommands(run: RunRecordInput, commands: ObservatoryCommand[]) {
  if (hasExternalDatabase()) {
    const pool = getPgPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM commands WHERE run_id = $1 AND source = $2`, [run.id, run.source]);

      for (const command of commands) {
        await client.query(
          `INSERT INTO commands (
            id, run_id, label, command_text, cwd, status, started_at, ended_at, duration_ms, exit_code, log_summary, source
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            command.id,
            command.runId,
            command.label,
            command.command,
            command.cwd ?? null,
            command.status,
            command.startedAt,
            command.endedAt ?? null,
            command.durationMs ?? null,
            command.exitCode ?? null,
            command.logSummary ?? null,
            command.source ?? run.source,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return;
  }

  const db = getSqliteDb();
  replaceRunCommandsSqlite(db, run, commands);
}

function getPgPool() {
  if (!globalThis.__observabilityPgPool__) {
    globalThis.__observabilityPgPool__ = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalThis.__observabilityPgPool__;
}

function getSqliteDb() {
  if (!globalThis.__observabilityDb__) {
    mkdirSync(dataDir, { recursive: true });
    const db = new Database(dbFile);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        parent_run_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        meta TEXT,
        stage TEXT,
        status TEXT,
        owner TEXT,
        payload_json TEXT,
        ts TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'live'
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'live',
        parent_run_id TEXT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        owner TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id, source)
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        label TEXT NOT NULL,
        command_text TEXT NOT NULL,
        cwd TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        exit_code INTEGER,
        log_summary TEXT,
        source TEXT NOT NULL DEFAULT 'live',
        PRIMARY KEY (id, source)
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id, source, ts);
      CREATE INDEX IF NOT EXISTS idx_events_source_ts ON events(source, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_commands_run_id ON commands(run_id, source, started_at);
      CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(source, status, started_at DESC);
    `);
    migrateLegacyData(db);
    globalThis.__observabilityDb__ = { db };
  }

  return globalThis.__observabilityDb__.db;
}

function migrateLegacyData(db: BetterSQLiteDatabase) {
  const existing = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
  if (existing.count > 0) return;

  ensureFile(liveEventsFile, "");
  ensureFile(demoEventsFile, "");

  const demoEvents = readJsonl(demoEventsFile);
  const liveEvents = readJsonl(liveEventsFile);

  for (const event of [...demoEvents, ...liveEvents]) {
    insertEventSqlite(db, event);
  }
}

function ensureFile(filePath: string, initial: string) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, initial, "utf8");
  }
}

function readJsonl(filePath: string) {
  const raw = readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ObservatoryEvent);
}

function insertEventSqlite(db: BetterSQLiteDatabase, event: ObservatoryEvent) {
  const insertResult = db
    .prepare(
    `INSERT OR IGNORE INTO events (
      id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.id,
      event.runId,
      event.parentRunId ?? null,
      event.type,
      event.title,
      event.meta ?? null,
      event.stage ?? null,
      event.status ?? null,
      event.owner ?? null,
      event.payload ? JSON.stringify(event.payload) : null,
      event.ts,
      event.source ?? "live"
    );

  if (insertResult.changes === 0) {
    return;
  }

  const task = extractTask(event.meta) ?? event.title;
  const source = event.source ?? "live";
  const existingRun = db
    .prepare("SELECT id FROM runs WHERE id = ? AND source = ?")
    .get(event.runId, source) as { id: string } | undefined;

  if (!existingRun) {
    db.prepare(
      `INSERT INTO runs (
        id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.runId,
      source,
      event.parentRunId ?? null,
      task,
      event.status ?? "planning",
      event.stage ?? "plan",
      event.owner ?? "main",
      event.ts,
      event.ts,
      1
    );
    return;
  }

  db.prepare(
    `UPDATE runs
      SET parent_run_id = COALESCE(?, parent_run_id),
          task = ?,
          status = ?,
          stage = ?,
          owner = ?,
          updated_at = ?,
          event_count = event_count + 1
      WHERE id = ? AND source = ?`
  ).run(
    event.parentRunId ?? null,
    task,
    event.status ?? "planning",
    event.stage ?? "plan",
    event.owner ?? "main",
    event.ts,
    event.runId,
    source
  );
}

function replaceRunEventsSqlite(db: BetterSQLiteDatabase, run: RunRecordInput, events: ObservatoryEvent[]) {
  const transaction = db.transaction((nextRun: RunRecordInput, nextEvents: ObservatoryEvent[]) => {
    db.prepare(
      `INSERT INTO runs (
        id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id, source)
      DO UPDATE SET
        parent_run_id = excluded.parent_run_id,
        task = excluded.task,
        status = excluded.status,
        stage = excluded.stage,
        owner = excluded.owner,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        event_count = excluded.event_count`
    ).run(
      nextRun.id,
      nextRun.source,
      nextRun.parentRunId ?? null,
      nextRun.task,
      nextRun.status,
      nextRun.stage,
      nextRun.owner,
      nextRun.startedAt,
      nextRun.updatedAt,
      nextRun.eventCount
    );

    db.prepare(`DELETE FROM events WHERE run_id = ? AND source = ?`).run(nextRun.id, nextRun.source);

    const insertEvent = db.prepare(
      `INSERT INTO events (
        id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const event of nextEvents) {
      insertEvent.run(
        event.id,
        event.runId,
        event.parentRunId ?? null,
        event.type,
        event.title,
        event.meta ?? null,
        event.stage ?? null,
        event.status ?? null,
        event.owner ?? null,
        event.payload ? JSON.stringify(event.payload) : null,
        event.ts,
        event.source ?? nextRun.source
      );
    }
  });

  transaction(run, events);
}

function replaceRunCommandsSqlite(db: BetterSQLiteDatabase, run: RunRecordInput, commands: ObservatoryCommand[]) {
  const transaction = db.transaction((nextRun: RunRecordInput, nextCommands: ObservatoryCommand[]) => {
    db.prepare(`DELETE FROM commands WHERE run_id = ? AND source = ?`).run(nextRun.id, nextRun.source);

    const insertCommand = db.prepare(
      `INSERT INTO commands (
        id, run_id, label, command_text, cwd, status, started_at, ended_at, duration_ms, exit_code, log_summary, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const command of nextCommands) {
      insertCommand.run(
        command.id,
        command.runId,
        command.label,
        command.command,
        command.cwd ?? null,
        command.status,
        command.startedAt,
        command.endedAt ?? null,
        command.durationMs ?? null,
        command.exitCode ?? null,
        command.logSummary ?? null,
        command.source ?? nextRun.source
      );
    }
  });

  transaction(run, commands);
}

function extractTask(meta?: string) {
  if (!meta) return null;
  const match = meta.match(/task=(.+)$/i);
  return match ? match[1] : null;
}

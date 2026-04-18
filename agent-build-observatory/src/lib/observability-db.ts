import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as BetterSQLiteDatabase } from "better-sqlite3";
import { Pool } from "pg";
import {
  formatObservabilityStorageTarget,
  resolveObservabilityStorageConfig,
  type ObservabilityScopeRule,
  type ObservabilityStorageConfig,
} from "@/lib/observability-config";
import type { ObservatoryCommand, ObservatoryEvent } from "@/lib/observability-schema";
import {
  buildLegacySourceKey,
  buildScopedRecordId,
  demoSourceIdentity,
  localRuntimeSourceIdentity,
  normalizeSourceIdentity,
  normalizeSourceMode,
  type ObservabilitySourceIdentity,
  type ObservabilitySourceMode,
} from "@/lib/observability-source";

const dataDir = path.join(process.cwd(), "data", "observability");
const liveEventsFile = path.join(dataDir, "events.jsonl");
const demoEventsFile = path.join(dataDir, "demo-events.jsonl");

const OBSERVABILITY_SCHEMA_VERSION = 2;

type DbHandle = {
  key: string;
  db: BetterSQLiteDatabase;
};

type PgPoolHandle = {
  key: string;
  pool: Pool;
};

declare global {
  var __observabilityDb__: DbHandle | undefined;
  var __observabilityPgPool__: PgPoolHandle | undefined;
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
  source_mode: string;
  project_id: string;
  environment_id: string;
  runtime_id: string;
  ingest_request_id: string | null;
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
  source_mode: string;
  project_id: string;
  environment_id: string;
  runtime_id: string;
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
  source_mode: string;
  project_id: string;
  environment_id: string;
  runtime_id: string;
  ingest_request_id: string | null;
  sensitive: number | boolean | null;
  redacted_log_summary: string | null;
};

export type DashboardFilters = {
  statuses?: string[];
  stages?: string[];
  owners?: string[];
  sourceModes?: ObservabilitySourceMode[];
};

export type QueryOptions = {
  scopes?: ObservabilityScopeRule[];
  filters?: DashboardFilters;
  sourceModes?: ObservabilitySourceMode[];
  limit?: number;
  since?: string;
};

export type RunRecordInput = {
  id: string;
  source: string;
  sourceMode: ObservabilitySourceMode;
  projectId: string;
  environmentId: string;
  runtimeId: string;
  parentRunId?: string;
  task: string;
  status: string;
  stage: string;
  owner: string;
  startedAt: string;
  updatedAt: string;
  eventCount: number;
};

export type EventRecordInput = ObservatoryEvent & {
  source: string;
  sourceMode: ObservabilitySourceMode;
  projectId: string;
  environmentId: string;
  runtimeId: string;
  ingestRequestId?: string;
};

export type CommandRecordInput = ObservatoryCommand & {
  source: string;
  sourceMode: ObservabilitySourceMode;
  projectId: string;
  environmentId: string;
  runtimeId: string;
  ingestRequestId?: string;
};

export type TelemetryWriteInput = {
  requestId: string;
  source: ObservabilitySourceIdentity & { sourceMode: "hosted" };
  run: Omit<RunRecordInput, "source" | "sourceMode" | "projectId" | "environmentId" | "runtimeId" | "eventCount">;
  events: Array<Omit<EventRecordInput, "source" | "sourceMode" | "projectId" | "environmentId" | "runtimeId" | "ingestRequestId">>;
  commands: Array<
    Omit<CommandRecordInput, "source" | "sourceMode" | "projectId" | "environmentId" | "runtimeId" | "ingestRequestId">
  >;
};

export type IngestSummary = {
  requestId: string;
  acceptedEvents: number;
  dedupedEvents: number;
  acceptedCommands: number;
  dedupedCommands: number;
  duplicateRequest: boolean;
};

export type PruneSummary = {
  retentionDays: number;
  cutoff: string;
  deletedRuns: number;
  deletedEvents: number;
  deletedCommands: number;
  deletedIngestRequests: number;
};

export function getObservabilitySchemaVersion() {
  return OBSERVABILITY_SCHEMA_VERSION;
}

export function hasExternalDatabase(env: Parameters<typeof resolveObservabilityStorageConfig>[0] = process.env) {
  return resolveObservabilityStorageConfig(env).driver === "postgres";
}

export function getStorageContractSummary(
  config: ObservabilityStorageConfig = resolveObservabilityStorageConfig()
) {
  return {
    driver: config.driver,
    mode: config.mode,
    target: formatObservabilityStorageTarget(config),
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
  };
}

export async function initializeStorage(config: ObservabilityStorageConfig = resolveObservabilityStorageConfig()) {
  if (config.driver === "postgres") {
    const pool = getPgPool(config);
    await ensurePostgresSchema(pool);
    return getStorageContractSummary(config);
  }

  const db = getSqliteDb(config);
  ensureSqliteSchema(db);
  migrateLegacyData(db, config.sqlitePath);
  return getStorageContractSummary(config);
}

export async function replaceRunSnapshot(
  run: RunRecordInput,
  events: EventRecordInput[],
  commands: CommandRecordInput[]
) {
  const config = resolveObservabilityStorageConfig();

  if (config.driver === "postgres") {
    const pool = getPgPool(config);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await upsertRunPostgres(client, run);
      await client.query(`DELETE FROM events WHERE run_id = $1 AND source = $2`, [run.id, run.source]);
      await client.query(`DELETE FROM commands WHERE run_id = $1 AND source = $2`, [run.id, run.source]);

      for (const event of events) {
        await insertEventPostgres(client, event);
      }

      for (const command of commands) {
        await insertCommandPostgres(client, command);
      }

      await updateRunEventCountPostgres(client, run.id, run.source);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return;
  }

  const db = getSqliteDb(config);
  const transaction = db.transaction((nextRun: RunRecordInput, nextEvents: EventRecordInput[], nextCommands: CommandRecordInput[]) => {
    upsertRunSqlite(db, nextRun);
    db.prepare(`DELETE FROM events WHERE run_id = ? AND source = ?`).run(nextRun.id, nextRun.source);
    db.prepare(`DELETE FROM commands WHERE run_id = ? AND source = ?`).run(nextRun.id, nextRun.source);

    for (const event of nextEvents) {
      insertEventSqlite(db, event, false);
    }

    for (const command of nextCommands) {
      insertCommandSqlite(db, command, false);
    }

    updateRunEventCountSqlite(db, nextRun.id, nextRun.source);
  });

  transaction(run, events, commands);
}

export async function ingestTelemetryRecords(input: TelemetryWriteInput): Promise<IngestSummary> {
  const identity = normalizeSourceIdentity(input.source, input.source);
  const sourceMode: ObservabilitySourceMode = "hosted";
  const source = buildLegacySourceKey(sourceMode, identity);
  const runRecord: RunRecordInput = {
    id: input.run.id,
    source,
    sourceMode,
    projectId: identity.projectId,
    environmentId: identity.environmentId,
    runtimeId: identity.runtimeId,
    parentRunId: input.run.parentRunId,
    task: input.run.task,
    status: input.run.status,
    stage: input.run.stage,
    owner: input.run.owner,
    startedAt: input.run.startedAt,
    updatedAt: input.run.updatedAt,
    eventCount: input.events.length,
  };
  const events = input.events.map((event) => ({
    ...event,
    id: buildScopedRecordId(source, event.id),
    source,
    sourceMode,
    projectId: identity.projectId,
    environmentId: identity.environmentId,
    runtimeId: identity.runtimeId,
    ingestRequestId: input.requestId,
  }));
  const commands = input.commands.map((command) => ({
    ...command,
    id: buildScopedRecordId(source, command.id),
    source,
    sourceMode,
    projectId: identity.projectId,
    environmentId: identity.environmentId,
    runtimeId: identity.runtimeId,
    ingestRequestId: input.requestId,
  }));

  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    return ingestTelemetryPostgres(getPgPool(config), input.requestId, runRecord, events, commands);
  }

  return ingestTelemetrySqlite(getSqliteDb(config), input.requestId, runRecord, events, commands);
}

export async function listRunRows(options: QueryOptions = {}) {
  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    const { sql, params } = buildRunSelectQuery("postgres", options);
    const result = await getPgPool(config).query<RunRow>(sql, params);
    return result.rows;
  }

  const { sql, params } = buildRunSelectQuery("sqlite", options);
  return getSqliteDb(config).prepare(sql).all(...params) as RunRow[];
}

export async function getRunRow(runId: string, options: QueryOptions = {}) {
  const rows = await listRunRows({ ...options, limit: 2, filters: options.filters, sourceModes: options.sourceModes, scopes: options.scopes });
  const matched = rows.filter((row) => row.id === runId);
  if (matched.length > 0) {
    return matched[0] ?? null;
  }

  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    const { sql, params } = buildRunSelectQuery("postgres", { ...options, runId, limit: 1 } as QueryOptions & { runId: string });
    const result = await getPgPool(config).query<RunRow>(sql, params);
    return result.rows[0] ?? null;
  }

  const { sql, params } = buildRunSelectQuery("sqlite", { ...options, runId, limit: 1 } as QueryOptions & { runId: string });
  return (getSqliteDb(config).prepare(sql).get(...params) as RunRow | undefined) ?? null;
}

export async function listChildRunRows(parentRunId: string, options: QueryOptions = {}) {
  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    const { sql, params } = buildRunSelectQuery("postgres", { ...options, parentRunId } as QueryOptions & { parentRunId: string });
    const result = await getPgPool(config).query<RunRow>(sql, params);
    return result.rows;
  }

  const { sql, params } = buildRunSelectQuery("sqlite", { ...options, parentRunId } as QueryOptions & { parentRunId: string });
  return getSqliteDb(config).prepare(sql).all(...params) as RunRow[];
}

export async function listEventRows(options: QueryOptions & { runId?: string } = {}) {
  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    const { sql, params } = buildEventSelectQuery("postgres", options);
    const result = await getPgPool(config).query<EventRow>(sql, params);
    return result.rows;
  }

  const { sql, params } = buildEventSelectQuery("sqlite", options);
  return getSqliteDb(config).prepare(sql).all(...params) as EventRow[];
}

export async function getRunEventRows(runId: string, options: QueryOptions = {}) {
  return listEventRows({ ...options, runId });
}

export async function listCommandRows(options: QueryOptions & { runId?: string } = {}) {
  const config = resolveObservabilityStorageConfig();
  if (config.driver === "postgres") {
    const { sql, params } = buildCommandSelectQuery("postgres", options);
    const result = await getPgPool(config).query<CommandRow>(sql, params);
    return result.rows;
  }

  const { sql, params } = buildCommandSelectQuery("sqlite", options);
  return getSqliteDb(config).prepare(sql).all(...params) as CommandRow[];
}

export async function getRunCommandRows(runId: string, options: QueryOptions = {}) {
  return listCommandRows({ ...options, runId });
}

export async function pruneExpiredObservabilityRecords(retentionDays: number): Promise<PruneSummary> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const config = resolveObservabilityStorageConfig();

  if (config.driver === "postgres") {
    const pool = getPgPool(config);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const deletedEvents = await client.query(`DELETE FROM events WHERE ts < $1`, [cutoff]);
      const deletedCommands = await client.query(`DELETE FROM commands WHERE COALESCE(ended_at, started_at) < $1`, [cutoff]);
      const deletedRuns = await client.query(`DELETE FROM runs WHERE updated_at < $1`, [cutoff]);
      const deletedIngestRequests = await client.query(`DELETE FROM ingest_requests WHERE received_at < $1`, [cutoff]);
      await client.query("COMMIT");

      return {
        retentionDays,
        cutoff,
        deletedRuns: deletedRuns.rowCount ?? 0,
        deletedEvents: deletedEvents.rowCount ?? 0,
        deletedCommands: deletedCommands.rowCount ?? 0,
        deletedIngestRequests: deletedIngestRequests.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = getSqliteDb(config);
  const transaction = db.transaction(() => {
    const deletedEvents = db.prepare(`DELETE FROM events WHERE ts < ?`).run(cutoff).changes;
    const deletedCommands = db
      .prepare(`DELETE FROM commands WHERE COALESCE(ended_at, started_at) < ?`)
      .run(cutoff).changes;
    const deletedRuns = db.prepare(`DELETE FROM runs WHERE updated_at < ?`).run(cutoff).changes;
    const deletedIngestRequests = db.prepare(`DELETE FROM ingest_requests WHERE received_at < ?`).run(cutoff).changes;

    return {
      retentionDays,
      cutoff,
      deletedRuns,
      deletedEvents,
      deletedCommands,
      deletedIngestRequests,
    };
  });

  return transaction();
}

function getPgPool(config: Extract<ObservabilityStorageConfig, { driver: "postgres" }>) {
  if (!globalThis.__observabilityPgPool__ || globalThis.__observabilityPgPool__.key !== config.databaseUrl) {
    globalThis.__observabilityPgPool__ = {
      key: config.databaseUrl,
      pool: new Pool({ connectionString: config.databaseUrl }),
    };
  }

  return globalThis.__observabilityPgPool__.pool;
}

function getSqliteDb(config: Extract<ObservabilityStorageConfig, { driver: "sqlite" }>) {
  if (!globalThis.__observabilityDb__ || globalThis.__observabilityDb__.key !== config.sqlitePath) {
    globalThis.__observabilityDb__?.db.close();
    mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
    const db = new Database(config.sqlitePath);
    globalThis.__observabilityDb__ = { key: config.sqlitePath, db };
  }

  return globalThis.__observabilityDb__.db;
}

function ensureSqliteSchema(db: BetterSQLiteDatabase) {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'hosted',
      parent_run_id TEXT,
      task TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      owner TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      source_mode TEXT NOT NULL DEFAULT 'hosted',
      project_id TEXT NOT NULL DEFAULT 'default-project',
      environment_id TEXT NOT NULL DEFAULT 'default-environment',
      runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
      PRIMARY KEY (id, source)
    );

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
      source TEXT NOT NULL DEFAULT 'hosted',
      source_mode TEXT NOT NULL DEFAULT 'hosted',
      project_id TEXT NOT NULL DEFAULT 'default-project',
      environment_id TEXT NOT NULL DEFAULT 'default-environment',
      runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
      ingest_request_id TEXT
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
      source TEXT NOT NULL DEFAULT 'hosted',
      source_mode TEXT NOT NULL DEFAULT 'hosted',
      project_id TEXT NOT NULL DEFAULT 'default-project',
      environment_id TEXT NOT NULL DEFAULT 'default-environment',
      runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
      ingest_request_id TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      redacted_log_summary TEXT,
      PRIMARY KEY (id, source)
    );

    CREATE TABLE IF NOT EXISTS ingest_requests (
      request_id TEXT NOT NULL,
      source_mode TEXT NOT NULL,
      project_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      PRIMARY KEY (request_id, project_id, environment_id, runtime_id)
    );
  `);

  ensureSqliteColumn(db, "runs", "source_mode", `TEXT NOT NULL DEFAULT 'hosted'`);
  ensureSqliteColumn(db, "runs", "project_id", `TEXT NOT NULL DEFAULT 'default-project'`);
  ensureSqliteColumn(db, "runs", "environment_id", `TEXT NOT NULL DEFAULT 'default-environment'`);
  ensureSqliteColumn(db, "runs", "runtime_id", `TEXT NOT NULL DEFAULT 'default-runtime'`);

  ensureSqliteColumn(db, "events", "source_mode", `TEXT NOT NULL DEFAULT 'hosted'`);
  ensureSqliteColumn(db, "events", "project_id", `TEXT NOT NULL DEFAULT 'default-project'`);
  ensureSqliteColumn(db, "events", "environment_id", `TEXT NOT NULL DEFAULT 'default-environment'`);
  ensureSqliteColumn(db, "events", "runtime_id", `TEXT NOT NULL DEFAULT 'default-runtime'`);
  ensureSqliteColumn(db, "events", "ingest_request_id", "TEXT");

  ensureSqliteColumn(db, "commands", "source_mode", `TEXT NOT NULL DEFAULT 'hosted'`);
  ensureSqliteColumn(db, "commands", "project_id", `TEXT NOT NULL DEFAULT 'default-project'`);
  ensureSqliteColumn(db, "commands", "environment_id", `TEXT NOT NULL DEFAULT 'default-environment'`);
  ensureSqliteColumn(db, "commands", "runtime_id", `TEXT NOT NULL DEFAULT 'default-runtime'`);
  ensureSqliteColumn(db, "commands", "ingest_request_id", "TEXT");
  ensureSqliteColumn(db, "commands", "sensitive", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(db, "commands", "redacted_log_summary", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_runs_scope_updated ON runs(source_mode, project_id, environment_id, updated_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_runs_parent_scope ON runs(parent_run_id, source_mode, project_id, environment_id);
    CREATE INDEX IF NOT EXISTS idx_events_run_scope ON events(run_id, source_mode, project_id, environment_id, ts ASC, id);
    CREATE INDEX IF NOT EXISTS idx_events_scope_ts ON events(source_mode, project_id, environment_id, ts DESC, id);
    CREATE INDEX IF NOT EXISTS idx_commands_run_scope ON commands(run_id, source_mode, project_id, environment_id, started_at ASC, id);
    CREATE INDEX IF NOT EXISTS idx_commands_scope_status ON commands(source_mode, project_id, environment_id, status, started_at DESC, id);
  `);

  db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`)
    .run(OBSERVABILITY_SCHEMA_VERSION, new Date().toISOString());
}

async function ensurePostgresSchema(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'hosted',
        parent_run_id TEXT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        owner TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        source_mode TEXT NOT NULL DEFAULT 'hosted',
        project_id TEXT NOT NULL DEFAULT 'default-project',
        environment_id TEXT NOT NULL DEFAULT 'default-environment',
        runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
        PRIMARY KEY (id, source)
      );

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
        source TEXT NOT NULL DEFAULT 'hosted',
        source_mode TEXT NOT NULL DEFAULT 'hosted',
        project_id TEXT NOT NULL DEFAULT 'default-project',
        environment_id TEXT NOT NULL DEFAULT 'default-environment',
        runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
        ingest_request_id TEXT
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
        source TEXT NOT NULL DEFAULT 'hosted',
        source_mode TEXT NOT NULL DEFAULT 'hosted',
        project_id TEXT NOT NULL DEFAULT 'default-project',
        environment_id TEXT NOT NULL DEFAULT 'default-environment',
        runtime_id TEXT NOT NULL DEFAULT 'default-runtime',
        ingest_request_id TEXT,
        sensitive BOOLEAN NOT NULL DEFAULT FALSE,
        redacted_log_summary TEXT,
        PRIMARY KEY (id, source)
      );

      CREATE TABLE IF NOT EXISTS ingest_requests (
        request_id TEXT NOT NULL,
        source_mode TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        summary_json TEXT NOT NULL,
        PRIMARY KEY (request_id, project_id, environment_id, runtime_id)
      );

      ALTER TABLE runs ADD COLUMN IF NOT EXISTS source_mode TEXT NOT NULL DEFAULT 'hosted';
      ALTER TABLE runs ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT 'default-project';
      ALTER TABLE runs ADD COLUMN IF NOT EXISTS environment_id TEXT NOT NULL DEFAULT 'default-environment';
      ALTER TABLE runs ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'default-runtime';

      ALTER TABLE events ADD COLUMN IF NOT EXISTS source_mode TEXT NOT NULL DEFAULT 'hosted';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT 'default-project';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS environment_id TEXT NOT NULL DEFAULT 'default-environment';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'default-runtime';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS ingest_request_id TEXT;

      ALTER TABLE commands ADD COLUMN IF NOT EXISTS source_mode TEXT NOT NULL DEFAULT 'hosted';
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT 'default-project';
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS environment_id TEXT NOT NULL DEFAULT 'default-environment';
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'default-runtime';
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS ingest_request_id TEXT;
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE commands ADD COLUMN IF NOT EXISTS redacted_log_summary TEXT;

      CREATE INDEX IF NOT EXISTS idx_runs_scope_updated ON runs(source_mode, project_id, environment_id, updated_at DESC, id);
      CREATE INDEX IF NOT EXISTS idx_runs_parent_scope ON runs(parent_run_id, source_mode, project_id, environment_id);
      CREATE INDEX IF NOT EXISTS idx_events_run_scope ON events(run_id, source_mode, project_id, environment_id, ts ASC, id);
      CREATE INDEX IF NOT EXISTS idx_events_scope_ts ON events(source_mode, project_id, environment_id, ts DESC, id);
      CREATE INDEX IF NOT EXISTS idx_commands_run_scope ON commands(run_id, source_mode, project_id, environment_id, started_at ASC, id);
      CREATE INDEX IF NOT EXISTS idx_commands_scope_status ON commands(source_mode, project_id, environment_id, status, started_at DESC, id);
    `);
    await client.query(
      `INSERT INTO schema_migrations (version, applied_at)
       VALUES ($1, NOW())
       ON CONFLICT (version) DO NOTHING`,
      [OBSERVABILITY_SCHEMA_VERSION]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function ensureSqliteColumn(db: BetterSQLiteDatabase, tableName: string, columnName: string, columnDefinition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function migrateLegacyData(db: BetterSQLiteDatabase, sqlitePath: string) {
  const defaultSqlitePath = path.join(process.cwd(), "data", "observability", "observability.db");
  if (path.resolve(sqlitePath) !== path.resolve(defaultSqlitePath)) return;
  const existing = db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number };
  if (existing.count > 0) return;

  ensureFile(liveEventsFile, "");
  ensureFile(demoEventsFile, "");

  const demoEvents = readJsonl(demoEventsFile);
  const liveEvents = readJsonl(liveEventsFile);

  for (const event of [...demoEvents, ...liveEvents]) {
    const sourceMode = normalizeSourceMode(event.source, "hosted");
    const identity =
      sourceMode === "demo"
        ? demoSourceIdentity
        : sourceMode === "runtime-adapter"
          ? localRuntimeSourceIdentity
          : { projectId: "legacy-project", environmentId: "legacy", runtimeId: "legacy-runtime" };
    const normalizedIdentity = normalizeSourceIdentity(event, identity);
    const source = buildLegacySourceKey(sourceMode, normalizedIdentity);
    const task = extractTask(event.meta) ?? event.title;

    const runRecord: RunRecordInput = {
      id: event.runId,
      source,
      sourceMode,
      projectId: normalizedIdentity.projectId,
      environmentId: normalizedIdentity.environmentId,
      runtimeId: normalizedIdentity.runtimeId,
      parentRunId: event.parentRunId,
      task,
      status: event.status ?? "planning",
      stage: event.stage ?? "plan",
      owner: event.owner ?? "main",
      startedAt: event.ts,
      updatedAt: event.ts,
      eventCount: 1,
    };

    upsertRunSqlite(db, runRecord);
    insertEventSqlite(
      db,
      {
        ...event,
        source,
        sourceMode,
        projectId: normalizedIdentity.projectId,
        environmentId: normalizedIdentity.environmentId,
        runtimeId: normalizedIdentity.runtimeId,
      },
      true
    );
    updateRunEventCountSqlite(db, runRecord.id, runRecord.source);
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

function ingestTelemetrySqlite(
  db: BetterSQLiteDatabase,
  requestId: string,
  run: RunRecordInput,
  events: EventRecordInput[],
  commands: CommandRecordInput[]
): IngestSummary {
  const existing = db
    .prepare(
      `SELECT summary_json FROM ingest_requests
       WHERE request_id = ? AND project_id = ? AND environment_id = ? AND runtime_id = ?`
    )
    .get(requestId, run.projectId, run.environmentId, run.runtimeId) as { summary_json: string } | undefined;

  if (existing) {
    return {
      ...(JSON.parse(existing.summary_json) as IngestSummary),
      duplicateRequest: true,
    };
  }

  const transaction = db.transaction(() => {
    upsertRunSqlite(db, run);
    let acceptedEvents = 0;
    let acceptedCommands = 0;

    for (const event of events) {
      acceptedEvents += insertEventSqlite(db, event, true);
    }

    for (const command of commands) {
      acceptedCommands += insertCommandSqlite(db, command, true);
    }

    updateRunSqlite(db, run);
    updateRunEventCountSqlite(db, run.id, run.source);

    const summary: IngestSummary = {
      requestId,
      acceptedEvents,
      dedupedEvents: Math.max(0, events.length - acceptedEvents),
      acceptedCommands,
      dedupedCommands: Math.max(0, commands.length - acceptedCommands),
      duplicateRequest: false,
    };

    db.prepare(
      `INSERT INTO ingest_requests (
        request_id, source_mode, project_id, environment_id, runtime_id, received_at, summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      requestId,
      run.sourceMode,
      run.projectId,
      run.environmentId,
      run.runtimeId,
      new Date().toISOString(),
      JSON.stringify(summary)
    );

    return summary;
  });

  return transaction();
}

async function ingestTelemetryPostgres(
  pool: Pool,
  requestId: string,
  run: RunRecordInput,
  events: EventRecordInput[],
  commands: CommandRecordInput[]
): Promise<IngestSummary> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query<{ summary_json: string }>(
      `SELECT summary_json FROM ingest_requests
       WHERE request_id = $1 AND project_id = $2 AND environment_id = $3 AND runtime_id = $4`,
      [requestId, run.projectId, run.environmentId, run.runtimeId]
    );

    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ...(JSON.parse(existing.rows[0].summary_json) as IngestSummary),
        duplicateRequest: true,
      };
    }

    await upsertRunPostgres(client, run);
    let acceptedEvents = 0;
    let acceptedCommands = 0;

    for (const event of events) {
      acceptedEvents += await insertEventPostgres(client, event);
    }

    for (const command of commands) {
      acceptedCommands += await insertCommandPostgres(client, command);
    }

    await updateRunPostgres(client, run);
    await updateRunEventCountPostgres(client, run.id, run.source);

    const summary: IngestSummary = {
      requestId,
      acceptedEvents,
      dedupedEvents: Math.max(0, events.length - acceptedEvents),
      acceptedCommands,
      dedupedCommands: Math.max(0, commands.length - acceptedCommands),
      duplicateRequest: false,
    };

    await client.query(
      `INSERT INTO ingest_requests (
        request_id, source_mode, project_id, environment_id, runtime_id, received_at, summary_json
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [requestId, run.sourceMode, run.projectId, run.environmentId, run.runtimeId, JSON.stringify(summary)]
    );

    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function upsertRunSqlite(db: BetterSQLiteDatabase, run: RunRecordInput) {
  db.prepare(
    `INSERT INTO runs (
      id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count,
      source_mode, project_id, environment_id, runtime_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id, source)
    DO UPDATE SET
      parent_run_id = excluded.parent_run_id,
      task = excluded.task,
      status = excluded.status,
      stage = excluded.stage,
      owner = excluded.owner,
      started_at = excluded.started_at,
      updated_at = excluded.updated_at,
      event_count = excluded.event_count,
      source_mode = excluded.source_mode,
      project_id = excluded.project_id,
      environment_id = excluded.environment_id,
      runtime_id = excluded.runtime_id`
  ).run(
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
    run.sourceMode,
    run.projectId,
    run.environmentId,
    run.runtimeId
  );
}

function updateRunSqlite(db: BetterSQLiteDatabase, run: RunRecordInput) {
  db.prepare(
    `UPDATE runs
      SET parent_run_id = ?,
          task = ?,
          status = ?,
          stage = ?,
          owner = ?,
          started_at = ?,
          updated_at = ?,
          source_mode = ?,
          project_id = ?,
          environment_id = ?,
          runtime_id = ?
      WHERE id = ? AND source = ?`
  ).run(
    run.parentRunId ?? null,
    run.task,
    run.status,
    run.stage,
    run.owner,
    run.startedAt,
    run.updatedAt,
    run.sourceMode,
    run.projectId,
    run.environmentId,
    run.runtimeId,
    run.id,
    run.source
  );
}

function updateRunEventCountSqlite(db: BetterSQLiteDatabase, runId: string, source: string) {
  db.prepare(
    `UPDATE runs
       SET event_count = (
         SELECT COUNT(*) FROM events WHERE run_id = ? AND source = ?
       )
     WHERE id = ? AND source = ?`
  ).run(runId, source, runId, source);
}

async function upsertRunPostgres(client: Pool | { query: Pool["query"] }, run: RunRecordInput) {
  await client.query(
    `INSERT INTO runs (
      id, source, parent_run_id, task, status, stage, owner, started_at, updated_at, event_count,
      source_mode, project_id, environment_id, runtime_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (id, source)
    DO UPDATE SET
      parent_run_id = EXCLUDED.parent_run_id,
      task = EXCLUDED.task,
      status = EXCLUDED.status,
      stage = EXCLUDED.stage,
      owner = EXCLUDED.owner,
      started_at = EXCLUDED.started_at,
      updated_at = EXCLUDED.updated_at,
      event_count = EXCLUDED.event_count,
      source_mode = EXCLUDED.source_mode,
      project_id = EXCLUDED.project_id,
      environment_id = EXCLUDED.environment_id,
      runtime_id = EXCLUDED.runtime_id`,
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
      run.sourceMode,
      run.projectId,
      run.environmentId,
      run.runtimeId,
    ]
  );
}

async function updateRunPostgres(client: Pool | { query: Pool["query"] }, run: RunRecordInput) {
  await client.query(
    `UPDATE runs
       SET parent_run_id = $1,
           task = $2,
           status = $3,
           stage = $4,
           owner = $5,
           started_at = $6,
           updated_at = $7,
           source_mode = $8,
           project_id = $9,
           environment_id = $10,
           runtime_id = $11
     WHERE id = $12 AND source = $13`,
    [
      run.parentRunId ?? null,
      run.task,
      run.status,
      run.stage,
      run.owner,
      run.startedAt,
      run.updatedAt,
      run.sourceMode,
      run.projectId,
      run.environmentId,
      run.runtimeId,
      run.id,
      run.source,
    ]
  );
}

async function updateRunEventCountPostgres(client: Pool | { query: Pool["query"] }, runId: string, source: string) {
  await client.query(
    `UPDATE runs
       SET event_count = (
         SELECT COUNT(*) FROM events WHERE run_id = $1 AND source = $2
       )
     WHERE id = $3 AND source = $4`,
    [runId, source, runId, source]
  );
}

function insertEventSqlite(db: BetterSQLiteDatabase, event: EventRecordInput, ignoreConflicts: boolean) {
  const result = db.prepare(
    `${ignoreConflicts ? "INSERT OR IGNORE" : "INSERT"} INTO events (
      id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source,
      source_mode, project_id, environment_id, runtime_id, ingest_request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
    event.source,
    event.sourceMode,
    event.projectId,
    event.environmentId,
    event.runtimeId,
    event.ingestRequestId ?? null
  );

  return result.changes;
}

async function insertEventPostgres(client: Pool | { query: Pool["query"] }, event: EventRecordInput) {
  const result = await client.query(
    `INSERT INTO events (
      id, run_id, parent_run_id, type, title, meta, stage, status, owner, payload_json, ts, source,
      source_mode, project_id, environment_id, runtime_id, ingest_request_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
      event.source,
      event.sourceMode,
      event.projectId,
      event.environmentId,
      event.runtimeId,
      event.ingestRequestId ?? null,
    ]
  );

  return result.rowCount ?? 0;
}

function insertCommandSqlite(db: BetterSQLiteDatabase, command: CommandRecordInput, ignoreConflicts: boolean) {
  const result = db.prepare(
    `${ignoreConflicts ? "INSERT OR IGNORE" : "INSERT"} INTO commands (
      id, run_id, label, command_text, cwd, status, started_at, ended_at, duration_ms, exit_code, log_summary,
      source, source_mode, project_id, environment_id, runtime_id, ingest_request_id, sensitive, redacted_log_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
    command.source,
    command.sourceMode,
    command.projectId,
    command.environmentId,
    command.runtimeId,
    command.ingestRequestId ?? null,
    command.sensitive ? 1 : 0,
    command.redactedLogSummary ?? null
  );

  return result.changes;
}

async function insertCommandPostgres(client: Pool | { query: Pool["query"] }, command: CommandRecordInput) {
  const result = await client.query(
    `INSERT INTO commands (
      id, run_id, label, command_text, cwd, status, started_at, ended_at, duration_ms, exit_code, log_summary,
      source, source_mode, project_id, environment_id, runtime_id, ingest_request_id, sensitive, redacted_log_summary
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (id, source) DO NOTHING`,
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
      command.source,
      command.sourceMode,
      command.projectId,
      command.environmentId,
      command.runtimeId,
      command.ingestRequestId ?? null,
      Boolean(command.sensitive),
      command.redactedLogSummary ?? null,
    ]
  );

  return result.rowCount ?? 0;
}

function buildRunSelectQuery(
  dialect: "sqlite" | "postgres",
  options: QueryOptions & { runId?: string; parentRunId?: string } = {}
) {
  const builder = createQueryBuilder(dialect);
  builder.where(`1 = 1`);
  applyCommonScopeAndSourceFilters(builder, options, "runs");
  if (options.runId) builder.where(`runs.id = ${builder.param(options.runId)}`);
  if (options.parentRunId) builder.where(`runs.parent_run_id = ${builder.param(options.parentRunId)}`);
  applyDashboardFilters(builder, options.filters, "runs");
  let sql = `SELECT * FROM runs ${builder.whereClause()} ORDER BY runs.updated_at DESC, runs.id ASC`;
  if (options.limit) {
    sql += ` LIMIT ${builder.param(options.limit)}`;
  }
  return { sql, params: builder.params };
}

function buildEventSelectQuery(
  dialect: "sqlite" | "postgres",
  options: QueryOptions & { runId?: string } = {}
) {
  const builder = createQueryBuilder(dialect);
  builder.where(`1 = 1`);
  applyCommonScopeAndSourceFilters(builder, options, "events");
  if (options.runId) builder.where(`events.run_id = ${builder.param(options.runId)}`);
  if (options.since) builder.where(`events.ts >= ${builder.param(options.since)}`);
  let sql = `SELECT * FROM events ${builder.whereClause()} ORDER BY events.ts ASC, events.id ASC`;
  if (options.limit) {
    sql += ` LIMIT ${builder.param(options.limit)}`;
  }
  return { sql, params: builder.params };
}

function buildCommandSelectQuery(
  dialect: "sqlite" | "postgres",
  options: QueryOptions & { runId?: string } = {}
) {
  const builder = createQueryBuilder(dialect);
  builder.where(`1 = 1`);
  applyCommonScopeAndSourceFilters(builder, options, "commands");
  if (options.runId) builder.where(`commands.run_id = ${builder.param(options.runId)}`);
  if (options.since) builder.where(`COALESCE(commands.ended_at, commands.started_at) >= ${builder.param(options.since)}`);
  let sql = `SELECT * FROM commands ${builder.whereClause()} ORDER BY commands.started_at ASC, commands.id ASC`;
  if (options.limit) {
    sql += ` LIMIT ${builder.param(options.limit)}`;
  }
  return { sql, params: builder.params };
}

function applyCommonScopeAndSourceFilters(
  builder: ReturnType<typeof createQueryBuilder>,
  options: QueryOptions,
  tableName: "runs" | "events" | "commands"
) {
  const sourceModes = options.sourceModes ?? options.filters?.sourceModes;
  if (sourceModes?.length) {
    builder.in(`${tableName}.source_mode`, sourceModes);
  }
  if (options.scopes?.length) {
    builder.scopeGroup(options.scopes, {
      project: `${tableName}.project_id`,
      environment: `${tableName}.environment_id`,
      runtime: `${tableName}.runtime_id`,
    });
  }
}

function applyDashboardFilters(
  builder: ReturnType<typeof createQueryBuilder>,
  filters: DashboardFilters | undefined,
  tableName: "runs"
) {
  if (!filters) return;
  if (filters.statuses?.length) builder.in(`${tableName}.status`, filters.statuses);
  if (filters.stages?.length) builder.in(`${tableName}.stage`, filters.stages);
  if (filters.owners?.length) builder.in(`${tableName}.owner`, filters.owners);
}

function createQueryBuilder(dialect: "sqlite" | "postgres") {
  const params: Array<string | number> = [];
  const clauses: string[] = [];

  return {
    params,
    param(value: string | number) {
      params.push(value);
      return dialect === "postgres" ? `$${params.length}` : "?";
    },
    where(clause: string) {
      clauses.push(clause);
    },
    in(column: string, values: readonly string[]) {
      if (values.length === 0) return;
      const placeholders = values.map((value) => this.param(value)).join(", ");
      clauses.push(`${column} IN (${placeholders})`);
    },
    scopeGroup(scopes: ObservabilityScopeRule[], columns: { project: string; environment: string; runtime: string }) {
      const groups = scopes.map((scope) => {
        const parts: string[] = [];
        if (scope.projectId !== "*") {
          parts.push(`${columns.project} = ${this.param(scope.projectId)}`);
        }
        if (scope.environmentId !== "*") {
          parts.push(`${columns.environment} = ${this.param(scope.environmentId)}`);
        }
        if (scope.runtimeId && scope.runtimeId !== "*") {
          parts.push(`${columns.runtime} = ${this.param(scope.runtimeId)}`);
        }
        return parts.length === 0 ? `(1 = 1)` : `(${parts.join(" AND ")})`;
      });

      if (groups.some((group) => group === `(1 = 1)`)) {
        return;
      }

      clauses.push(`(${groups.join(" OR ")})`);
    },
    whereClause() {
      return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    },
  };
}

function extractTask(meta?: string) {
  if (!meta) return null;
  const match = meta.match(/task=(.+)$/i);
  return match ? match[1] : null;
}

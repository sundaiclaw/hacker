import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  listChildRunRows,
  listCommandRows,
  listEventRows,
  listRunRows,
  getRunCommandRows,
  getRunEventRows,
  getRunRow,
  getStorageContractSummary,
  hasExternalDatabase,
  initializeStorage,
  ingestTelemetryRecords,
  replaceRunSnapshot,
  type CommandRecordInput,
  type CommandRow,
  type DashboardFilters,
  type EventRecordInput,
  type EventRow,
  type RunRecordInput,
  type RunRow,
} from "@/lib/observability-db";
import { redactCommandForViewer, buildScopeFilter } from "@/lib/observability-access";
import { authenticateViewerRequest, type ViewerAuthContext } from "@/lib/observability-auth";
import { resolveObservabilityRuntimeConfig } from "@/lib/observability-config";
import {
  observabilityCommandSchema,
  observabilityEventInputSchema,
  observabilityEventSchema,
  type ObservatoryCommand,
  type ObservatoryEvent,
  type ObservatoryEventInput,
  type RunKind,
  type RunStage,
  type RunStatus,
} from "@/lib/observability-schema";
import {
  buildLegacySourceKey,
  buildScopedRecordId,
  demoSourceIdentity,
  getSourceModeLabel,
  localRuntimeSourceIdentity,
  normalizeSourceIdentity,
  normalizeSourceMode,
  type ObservabilitySourceMode,
} from "@/lib/observability-source";
import { collectOpenClawRuntime, type RuntimeCollection } from "@/lib/openclaw-runtime";
import type { TelemetryEnvelope } from "@/lib/runtime-telemetry-schema";

export type RunSummary = {
  id: string;
  parentRunId?: string;
  task: string;
  status: RunStatus;
  stage: RunStage;
  owner: RunKind;
  startedAt: string;
  updatedAt: string;
  eventCount: number;
  sourceMode: ObservabilitySourceMode;
  sourceLabel: string;
  projectId: string;
  environmentId: string;
  runtimeId: string;
  childCount: number;
};

export type DashboardData = {
  runs: RunSummary[];
  events: ObservatoryEvent[];
  changedFiles: string[];
  summary: {
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
  };
  sourceMode: ObservabilitySourceMode;
  sourceLabel: string;
  source: ObservabilitySourceMode;
  storage: "postgres" | "sqlite";
  filters: {
    status: string[];
    stage: string[];
    source: string[];
    owner: string[];
  };
};

export type RunDetail = {
  run: RunSummary;
  parentRun: RunSummary | null;
  childRuns: RunSummary[];
  events: ObservatoryEvent[];
  commands: ObservatoryCommand[];
  changedFiles: string[];
};

export type DashboardQuery = {
  filters?: DashboardFilters;
  authContext?: ViewerAuthContext;
};

const dataDir = path.join(process.cwd(), "data", "observability");
const demoEventsFile = path.join(dataDir, "demo-events.jsonl");

declare global {
  var __observabilityStoreBootstrap__:
    | {
        key: string;
        ready: Promise<void>;
      }
    | undefined;
}

const demoEvents: Array<ObservatoryEvent & { sourceMode: "demo"; projectId: string; environmentId: string; runtimeId: string }> = [
  {
    id: "evt_demo_1",
    ts: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    runId: "run_demo_site",
    type: "run.started",
    title: "Started marketing site build",
    meta: "task=Design and deploy Sundai Claw marketing site",
    stage: "plan",
    status: "planning",
    owner: "main",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "evt_demo_2",
    ts: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    runId: "run_demo_site",
    type: "files.changed",
    title: "Implemented homepage and supporting sections",
    meta: "src/app/page.tsx, globals.css, layout.tsx",
    stage: "build",
    status: "building",
    owner: "main",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "evt_demo_3",
    ts: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    runId: "run_demo_site",
    type: "build.completed",
    title: "Production build passed",
    meta: "npm run build",
    stage: "verify",
    status: "verifying",
    owner: "main",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "evt_demo_4",
    ts: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    runId: "run_demo_site",
    type: "deploy.completed",
    title: "Cloud Run deploy completed",
    meta: "service=sundai-claw-site",
    stage: "deploy",
    status: "done",
    owner: "main",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "evt_demo_5",
    ts: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    runId: "run_demo_polish",
    parentRunId: "run_demo_site",
    type: "subagent.spawned",
    title: "Spawned isolated design polish session",
    meta: "task=Premium polish pass",
    stage: "plan",
    status: "planning",
    owner: "subagent",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "evt_demo_6",
    ts: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    runId: "run_demo_polish",
    parentRunId: "run_demo_site",
    type: "run.failed",
    title: "Polish pass stopped on lint failure",
    meta: "npm run lint exited 1",
    stage: "verify",
    status: "failed",
    owner: "subagent",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
];

const demoCommands: Array<ObservatoryCommand & { sourceMode: "demo"; projectId: string; environmentId: string; runtimeId: string }> = [
  {
    id: "cmd_demo_build",
    runId: "run_demo_site",
    label: "npm run build",
    command: "npm run build",
    cwd: "/workspace/agent-build-observatory",
    status: "done",
    startedAt: new Date(Date.now() - 1000 * 60 * 7.5).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 7.1).toISOString(),
    durationMs: 24112,
    exitCode: 0,
    logSummary: "▲ Next.js build completed successfully. Static pages generated and optimized.",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "cmd_demo_deploy",
    runId: "run_demo_site",
    label: "gcloud run deploy sundai-claw-site",
    command: "gcloud run deploy sundai-claw-site --image gcr.io/acme/sundai-claw:latest",
    cwd: "/workspace/agent-build-observatory",
    status: "done",
    startedAt: new Date(Date.now() - 1000 * 60 * 6.3).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 6.02).toISOString(),
    durationMs: 16844,
    exitCode: 0,
    logSummary: "Revision deployed successfully. Traffic routed to latest healthy revision.",
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
  {
    id: "cmd_demo_polish_lint",
    runId: "run_demo_polish",
    label: "npm run lint",
    command: "npm run lint",
    cwd: "/workspace/agent-build-observatory",
    status: "failed",
    startedAt: new Date(Date.now() - 1000 * 60 * 4.2).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 4.02).toISOString(),
    durationMs: 10982,
    exitCode: 1,
    logSummary:
      "> eslint\nsrc/app/page.tsx:84:17 error  Unexpected any. Specify a different type.  @typescript-eslint/no-explicit-any\n\nLint failed with 1 error.",
    redactedLogSummary: "Lint failed. Full command output requires sensitive-log access.",
    sensitive: true,
    source: "demo",
    sourceMode: "demo",
    projectId: demoSourceIdentity.projectId,
    environmentId: demoSourceIdentity.environmentId,
    runtimeId: demoSourceIdentity.runtimeId,
  },
];

const trackedFiles = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/components/dashboard-client.tsx",
  "src/components/console-ui.tsx",
  "src/lib/runtime-telemetry-schema.ts",
  "src/lib/observability-auth.ts",
  "src/lib/observability-access.ts",
  "src/lib/observability-config.ts",
  "src/lib/observability-db.ts",
  "src/lib/observability.ts",
  "src/app/api/dashboard/route.ts",
  "src/app/api/telemetry/route.ts",
  "src/app/api/log/route.ts",
  "src/app/api/stream/route.ts",
  "src/app/api/runs/[id]/route.ts",
  "src/app/runs/[id]/page.tsx",
  "src/proxy.ts",
];

export async function ensureObservabilityStore() {
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  const summary = getStorageContractSummary(runtimeConfig.storage);
  const key = `${summary.driver}:${summary.target}`;

  if (!globalThis.__observabilityStoreBootstrap__ || globalThis.__observabilityStoreBootstrap__.key !== key) {
    globalThis.__observabilityStoreBootstrap__ = {
      key,
      ready: (async () => {
        await mkdir(dataDir, { recursive: true });
        await ensureDemoSeedFile();
        await initializeStorage(runtimeConfig.storage);
        await seedDemoProjection();
      })(),
    };
  }

  await globalThis.__observabilityStoreBootstrap__.ready;
}

export async function appendEvent(input: ObservatoryEventInput) {
  const validated = observabilityEventInputSchema.parse(input);
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  const sourceMode = normalizeSourceMode(validated.sourceMode ?? validated.source, runtimeConfig.resolvedSourceMode);
  const fallbackIdentity =
    sourceMode === "demo"
      ? demoSourceIdentity
      : sourceMode === "runtime-adapter"
        ? localRuntimeSourceIdentity
        : { projectId: "legacy-project", environmentId: "legacy", runtimeId: "legacy-runtime" };
  const identity = normalizeSourceIdentity(validated, fallbackIdentity);
  const source = buildLegacySourceKey(sourceMode, identity);
  const event = observabilityEventSchema.parse({
    id: crypto.randomUUID(),
    ts: validated.ts ?? new Date().toISOString(),
    ...validated,
    source,
    sourceMode,
    projectId: identity.projectId,
    environmentId: identity.environmentId,
    runtimeId: identity.runtimeId,
  });
  const existingRun = await getRunRow(event.runId, { sourceModes: [sourceMode] });

  await ingestTelemetryRecords({
    requestId: `legacy-${event.id}`,
    source: {
      ...identity,
      sourceMode: "hosted",
    },
    run: {
      id: event.runId,
      parentRunId: event.parentRunId,
      task: extractTask(event.meta) ?? event.title,
      status: event.status ?? existingRun?.status ?? "planning",
      stage: event.stage ?? existingRun?.stage ?? "plan",
      owner: (event.owner ?? existingRun?.owner ?? "main") as RunKind,
      startedAt: existingRun ? new Date(String(existingRun.started_at)).toISOString() : event.ts,
      updatedAt: event.ts,
    },
    events: [
      {
        id: event.id,
        runId: event.runId,
        parentRunId: event.parentRunId,
        type: event.type,
        title: event.title,
        meta: event.meta,
        stage: event.stage,
        status: event.status,
        owner: event.owner,
        payload: event.payload,
        ts: event.ts,
      },
    ],
    commands: [],
  });

  return event;
}

export async function ingestTelemetry(envelope: TelemetryEnvelope) {
  await ensureObservabilityStore();
  return ingestTelemetryRecords({
    requestId: envelope.requestId,
    source: envelope.source,
    run: envelope.run,
    events: envelope.events,
    commands: envelope.commands,
  });
}

export async function getDashboardData(query: DashboardQuery = {}): Promise<DashboardData> {
  await ensureObservabilityStore();
  const authContext = query.authContext ?? (await authenticateViewerRequest(new Headers()));
  const active = await resolveActiveSource();
  const scopeFilter = buildScopeFilter(authContext);
  const allRuns = await listRunRows({
    scopes: scopeFilter,
    sourceModes: [active.sourceMode],
  });
  const runs = query.filters
    ? await listRunRows({
        filters: query.filters,
        scopes: scopeFilter,
        sourceModes: [active.sourceMode],
      })
    : allRuns;
  const events = (await listEventRows({
    scopes: scopeFilter,
    sourceModes: [active.sourceMode],
  })).slice(-20);
  const childCounts = buildChildCountIndex(allRuns);
  const mappedRuns = runs.map((row) => mapRunRow(row, childCounts));
  const allMappedRuns = allRuns.map((row) => mapRunRow(row, childCounts));
  const mappedEvents = events.map(mapEventRow);

  return {
    runs: mappedRuns,
    events: mappedEvents,
    changedFiles: active.changedFiles,
    summary: {
      totalRuns: mappedRuns.length,
      activeRuns: mappedRuns.filter((run) => !["done", "failed"].includes(run.status)).length,
      completedRuns: mappedRuns.filter((run) => run.status === "done").length,
      failedRuns: mappedRuns.filter((run) => run.status === "failed").length,
    },
    sourceMode: active.sourceMode,
    sourceLabel: getSourceModeLabel(active.sourceMode),
    source: active.sourceMode,
    storage: hasExternalDatabase() ? "postgres" : "sqlite",
    filters: {
      status: uniqueSorted(allMappedRuns.map((run) => run.status)),
      stage: uniqueSorted(allMappedRuns.map((run) => run.stage)),
      source: uniqueSorted(allMappedRuns.map((run) => run.sourceMode)),
      owner: uniqueSorted(allMappedRuns.map((run) => run.owner)),
    },
  };
}

export async function getRunDetail(runId: string, query: { authContext?: ViewerAuthContext } = {}): Promise<RunDetail | null> {
  await ensureObservabilityStore();
  const authContext = query.authContext ?? (await authenticateViewerRequest(new Headers()));
  const active = await resolveActiveSource();
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  const scopeFilter = buildScopeFilter(authContext);
  let selectedSourceMode = active.sourceMode;
  let runRow = await getRunRow(runId, {
    scopes: scopeFilter,
    sourceModes: [selectedSourceMode],
  });

  if (!runRow && runtimeConfig.resolvedSourceMode !== "hosted" && selectedSourceMode !== "demo") {
    selectedSourceMode = "demo";
    runRow = await getRunRow(runId, {
      scopes: scopeFilter,
      sourceModes: [selectedSourceMode],
    });
  }

  if (!runRow) {
    return null;
  }

  const childRows = await listChildRunRows(runId, {
    scopes: scopeFilter,
    sourceModes: [selectedSourceMode],
  });
  const parentRow = runRow.parent_run_id
    ? await getRunRow(runRow.parent_run_id, {
        scopes: scopeFilter,
        sourceModes: [selectedSourceMode],
      })
    : null;
  const events = await getRunEventRows(runId, { scopes: scopeFilter, sourceModes: [selectedSourceMode] });
  const commands = await getRunCommandRows(runId, { scopes: scopeFilter, sourceModes: [selectedSourceMode] });
  const childCounts = buildChildCountIndex([runRow, ...childRows, ...(parentRow ? [parentRow] : [])]);

  return {
    run: mapRunRow(runRow, childCounts),
    parentRun: parentRow ? mapRunRow(parentRow, childCounts) : null,
    childRuns: childRows.map((row) => mapRunRow(row, childCounts)),
    events: events.map(mapEventRow),
    commands: commands.map((row) => redactCommandForViewer(mapCommandRow(row), authContext)),
    changedFiles: selectedSourceMode === "runtime-adapter" ? active.changedFiles : trackedFiles,
  };
}

export async function getRecentCommands(query: DashboardQuery = {}) {
  await ensureObservabilityStore();
  const authContext = query.authContext ?? (await authenticateViewerRequest(new Headers()));
  const active = await resolveActiveSource();
  const scopeFilter = buildScopeFilter(authContext);
  const commands = (await listCommandRows({
    scopes: scopeFilter,
    sourceModes: [active.sourceMode],
  })).slice(-50);
  return commands.map((row) => redactCommandForViewer(mapCommandRow(row), authContext));
}

export async function syncRuntimeAdapterIntoStore(): Promise<RuntimeCollection | null> {
  await ensureObservabilityStore();
  const runtime = await collectOpenClawRuntime();
  if (!runtime) return null;

  for (const snapshot of runtime.runs) {
    const runtimeId = sanitizeRuntimeId(snapshot.run.id);
    const identity = {
      ...localRuntimeSourceIdentity,
      runtimeId,
    };
    const sourceMode: ObservabilitySourceMode = "runtime-adapter";
    const source = buildLegacySourceKey(sourceMode, identity);
    const runRecord: RunRecordInput = {
      id: snapshot.run.id,
      source,
      sourceMode,
      projectId: identity.projectId,
      environmentId: identity.environmentId,
      runtimeId: identity.runtimeId,
      parentRunId: snapshot.run.parentRunId,
      task: snapshot.run.task,
      status: snapshot.run.status,
      stage: snapshot.run.stage,
      owner: snapshot.run.owner,
      startedAt: snapshot.run.startedAt,
      updatedAt: snapshot.run.updatedAt,
      eventCount: snapshot.events.length,
    };

    await replaceRunSnapshot(
      runRecord,
      snapshot.events.map((event) => ({
        ...event,
        id: buildScopedRecordId(source, event.id),
        source,
        sourceMode,
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        runtimeId: identity.runtimeId,
      })),
      snapshot.commands.map((command) => ({
        ...command,
        id: buildScopedRecordId(source, command.id),
        source,
        sourceMode,
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        runtimeId: identity.runtimeId,
      }))
    );
  }

  return runtime;
}

async function resolveActiveSource(): Promise<{ sourceMode: ObservabilitySourceMode; changedFiles: string[] }> {
  const runtimeConfig = resolveObservabilityRuntimeConfig();

  if (runtimeConfig.sourceMode === "demo") {
    return { sourceMode: "demo", changedFiles: trackedFiles };
  }

  if (runtimeConfig.resolvedSourceMode === "hosted") {
    return { sourceMode: "hosted", changedFiles: trackedFiles };
  }

  const runtime = await syncRuntimeAdapterIntoStoreNoBootstrap();
  if (runtime?.runs.length) {
    return {
      sourceMode: "runtime-adapter",
      changedFiles: mergeChangedFiles(runtime.changedFiles),
    };
  }

  return runtimeConfig.sourceMode === "runtime-adapter"
    ? { sourceMode: "runtime-adapter", changedFiles: mergeChangedFiles() }
    : { sourceMode: "demo", changedFiles: trackedFiles };
}

async function syncRuntimeAdapterIntoStoreNoBootstrap(): Promise<RuntimeCollection | null> {
  const runtime = await collectOpenClawRuntime();
  if (!runtime) return null;

  for (const snapshot of runtime.runs) {
    const runtimeId = sanitizeRuntimeId(snapshot.run.id);
    const identity = {
      ...localRuntimeSourceIdentity,
      runtimeId,
    };
    const sourceMode: ObservabilitySourceMode = "runtime-adapter";
    const source = buildLegacySourceKey(sourceMode, identity);
    await replaceRunSnapshot(
      {
        id: snapshot.run.id,
        source,
        sourceMode,
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        runtimeId: identity.runtimeId,
        parentRunId: snapshot.run.parentRunId,
        task: snapshot.run.task,
        status: snapshot.run.status,
        stage: snapshot.run.stage,
        owner: snapshot.run.owner,
        startedAt: snapshot.run.startedAt,
        updatedAt: snapshot.run.updatedAt,
        eventCount: snapshot.events.length,
      },
      snapshot.events.map((event) => ({
        ...event,
        id: buildScopedRecordId(source, event.id),
        source,
        sourceMode,
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        runtimeId: identity.runtimeId,
      })),
      snapshot.commands.map((command) => ({
        ...command,
        id: buildScopedRecordId(source, command.id),
        source,
        sourceMode,
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        runtimeId: identity.runtimeId,
      }))
    );
  }

  return runtime;
}

async function seedDemoProjection() {
  const groupedEvents = groupByRun(demoEvents);
  const groupedCommands = groupByRun(demoCommands);
  const sourceMode: ObservabilitySourceMode = "demo";
  const source = buildLegacySourceKey(sourceMode, demoSourceIdentity);

  for (const [runId, events] of groupedEvents) {
    const newestEvent = events.reduce((latest, event) => (event.ts > latest.ts ? event : latest), events[0]);
    const oldestEvent = events.reduce((earliest, event) => (event.ts < earliest.ts ? event : earliest), events[0]);
    const runRecord: RunRecordInput = {
      id: runId,
      source,
      sourceMode,
      projectId: demoSourceIdentity.projectId,
      environmentId: demoSourceIdentity.environmentId,
      runtimeId: demoSourceIdentity.runtimeId,
      parentRunId: oldestEvent.parentRunId,
      task: extractDemoTask(events),
      status: newestEvent.status ?? "planning",
      stage: newestEvent.stage ?? "plan",
      owner: newestEvent.owner ?? "main",
      startedAt: oldestEvent.ts,
      updatedAt: newestEvent.ts,
      eventCount: events.length,
    };

    await replaceRunSnapshot(
      runRecord,
      events.map((event) => ({
        ...event,
        id: buildScopedRecordId(source, event.id),
        source,
        sourceMode,
        projectId: demoSourceIdentity.projectId,
        environmentId: demoSourceIdentity.environmentId,
        runtimeId: demoSourceIdentity.runtimeId,
      })) satisfies EventRecordInput[],
      (groupedCommands.get(runId) ?? []).map((command) => ({
        ...command,
        id: buildScopedRecordId(source, command.id),
        source,
        sourceMode,
        projectId: demoSourceIdentity.projectId,
        environmentId: demoSourceIdentity.environmentId,
        runtimeId: demoSourceIdentity.runtimeId,
      })) satisfies CommandRecordInput[]
    );
  }
}

async function ensureDemoSeedFile() {
  try {
    await readFile(demoEventsFile, "utf8");
  } catch {
    const demoContent = demoEvents.map((event) => JSON.stringify(event)).join("\n") + "\n";
    await writeFile(demoEventsFile, demoContent, "utf8");
  }
}

function mapRunRow(row: RunRow, childCounts: Map<string, number>): RunSummary {
  const sourceMode = normalizeSourceMode(String(row.source_mode), "hosted");
  return {
    id: String(row.id),
    parentRunId: row.parent_run_id ? String(row.parent_run_id) : undefined,
    task: String(row.task),
    status: row.status as RunStatus,
    stage: row.stage as RunStage,
    owner: row.owner as RunKind,
    startedAt: new Date(String(row.started_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    eventCount: Number(row.event_count),
    sourceMode,
    sourceLabel: getSourceModeLabel(sourceMode),
    projectId: String(row.project_id),
    environmentId: String(row.environment_id),
    runtimeId: String(row.runtime_id),
    childCount: childCounts.get(String(row.id)) ?? 0,
  };
}

function mapEventRow(row: EventRow): ObservatoryEvent {
  return observabilityEventSchema.parse({
    id: String(row.id),
    runId: String(row.run_id),
    parentRunId: row.parent_run_id ? String(row.parent_run_id) : undefined,
    type: String(row.type),
    title: String(row.title),
    meta: row.meta ? String(row.meta) : undefined,
    stage: row.stage ? String(row.stage) : undefined,
    status: row.status ? String(row.status) : undefined,
    owner: row.owner ? String(row.owner) : undefined,
    payload: row.payload_json ? (JSON.parse(String(row.payload_json)) as Record<string, unknown>) : undefined,
    ts: new Date(String(row.ts)).toISOString(),
    source: String(row.source),
    sourceMode: normalizeSourceMode(String(row.source_mode), "hosted"),
    projectId: String(row.project_id),
    environmentId: String(row.environment_id),
    runtimeId: String(row.runtime_id),
  });
}

function mapCommandRow(row: CommandRow): ObservatoryCommand {
  return observabilityCommandSchema.parse({
    id: String(row.id),
    runId: String(row.run_id),
    label: String(row.label),
    command: String(row.command_text),
    cwd: row.cwd ? String(row.cwd) : undefined,
    status: String(row.status),
    startedAt: new Date(String(row.started_at)).toISOString(),
    endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : undefined,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : undefined,
    exitCode: typeof row.exit_code === "number" ? row.exit_code : undefined,
    logSummary: row.log_summary ? String(row.log_summary) : undefined,
    source: String(row.source),
    sourceMode: normalizeSourceMode(String(row.source_mode), "hosted"),
    projectId: String(row.project_id),
    environmentId: String(row.environment_id),
    runtimeId: String(row.runtime_id),
    sensitive: Boolean(row.sensitive),
    redactedLogSummary: row.redacted_log_summary ? String(row.redacted_log_summary) : undefined,
  });
}

function buildChildCountIndex(rows: RunRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.parent_run_id) continue;
    counts.set(String(row.parent_run_id), (counts.get(String(row.parent_run_id)) ?? 0) + 1);
  }

  return counts;
}

function mergeChangedFiles(runtimeFiles?: string[]) {
  return [...new Set([...(runtimeFiles ?? []), ...trackedFiles])];
}

function groupByRun<T extends { runId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const existing = grouped.get(item.runId);
    if (existing) {
      existing.push(item);
      continue;
    }

    grouped.set(item.runId, [item]);
  }

  return grouped;
}

function extractDemoTask(events: ObservatoryEvent[]) {
  const taskEntry = events.find((event) => event.meta?.startsWith("task="));
  return taskEntry?.meta?.replace(/^task=/, "") ?? events[0]?.title ?? "Demo run";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sanitizeRuntimeId(input: string) {
  return input.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 120) || localRuntimeSourceIdentity.runtimeId;
}

function extractTask(meta?: string) {
  if (!meta) return null;
  const match = meta.match(/task=(.+)$/i);
  return match ? match[1] : null;
}

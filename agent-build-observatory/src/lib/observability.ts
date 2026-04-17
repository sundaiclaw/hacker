import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  countEventsBySource,
  getRunCommandRows,
  getRunEventRows,
  hasExternalDatabase,
  initializeStorage,
  insertEventRecord,
  listEventRows,
  listRunRows,
  replaceRunCommands,
  replaceRunEvents,
  type CommandRow,
  type EventRow,
  type RunRecordInput,
  type RunRow,
} from "@/lib/observability-db";
import { collectOpenClawRuntime, type RuntimeCollection } from "@/lib/openclaw-runtime";
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
  source: string;
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
  source: string;
  storage: "postgres" | "sqlite";
};

export type RunDetail = {
  run: RunSummary;
  events: ObservatoryEvent[];
  commands: ObservatoryCommand[];
  changedFiles: string[];
};

const dataDir = path.join(process.cwd(), "data", "observability");
const demoEventsFile = path.join(dataDir, "demo-events.jsonl");

const demoEvents: ObservatoryEvent[] = [
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
  },
];

const demoCommands: ObservatoryCommand[] = [
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
    source: "demo",
  },
];

const trackedFiles = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/components/dashboard-client.tsx",
  "src/lib/observability-schema.ts",
  "src/lib/observability-db.ts",
  "src/lib/observability.ts",
  "src/app/api/dashboard/route.ts",
  "src/app/api/log/route.ts",
  "src/app/api/stream/route.ts",
  "src/app/api/runs/[id]/route.ts",
  "src/app/runs/[id]/page.tsx",
  "scripts/emit-sample-run.mjs",
];

export async function ensureObservabilityStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(demoEventsFile, "utf8");
  } catch {
    const demoContent = demoEvents.map((event) => JSON.stringify(event)).join("\n") + "\n";
    await writeFile(demoEventsFile, demoContent, "utf8");
  }

  await initializeStorage();
  await seedDemoProjection();
}

export async function listEvents(options?: { source?: "live" | "demo" | "auto" }) {
  await ensureObservabilityStore();
  const source = options?.source ?? "auto";

  if (source === "live") {
    return (await listEventRows("live")).map(mapEventRow);
  }

  if (source === "demo") {
    return (await listEventRows("demo")).map(mapEventRow);
  }

  const liveCount = await countEventsBySource("live");
  const chosenSource = liveCount > 0 ? "live" : "demo";
  return (await listEventRows(chosenSource)).map(mapEventRow);
}

export async function appendEvent(input: ObservatoryEventInput) {
  await ensureObservabilityStore();
  const validated = observabilityEventInputSchema.parse(input);
  const event = observabilityEventSchema.parse({
    id: crypto.randomUUID(),
    ts: validated.ts ?? new Date().toISOString(),
    source: validated.source ?? "live",
    ...validated,
  });

  await insertEventRecord(event);
  return event;
}

export async function getDashboardData(): Promise<DashboardData> {
  await ensureObservabilityStore();
  const runtimeCollection = await syncRuntimeCollection();
  const runtimeCount = await countEventsBySource("runtime");
  const liveCount = await countEventsBySource("live");
  const activeSource = liveCount > 0 ? "live" : "demo";
  const sourceLabel = runtimeCount > 0 ? "runtime" : activeSource;

  const runs = (await listRunRows(activeSource)).map(mapRunRow);
  const events = (await listEventRows(activeSource, 20)).map(mapEventRow);

  return {
    runs,
    events,
    changedFiles: runtimeCount > 0 ? mergeChangedFiles(runtimeCollection?.changedFiles) : trackedFiles,
    summary: {
      totalRuns: runs.length,
      activeRuns: runs.filter((run) => !["done", "failed"].includes(run.status)).length,
      completedRuns: runs.filter((run) => run.status === "done").length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
    },
    source: sourceLabel,
    storage: hasExternalDatabase() ? "postgres" : "sqlite",
  };
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  await ensureObservabilityStore();
  const runtimeCollection = await syncRuntimeCollection();
  const liveRuns = (await listRunRows("live")).map(mapRunRow);
  const demoRuns = (await listRunRows("demo")).map(mapRunRow);
  const run = [...liveRuns, ...demoRuns].find((item) => item.id === runId);

  if (!run) return null;

  const events = (await getRunEventRows(runId, run.source)).map(mapEventRow);
  const commands = (await getRunCommandRows(runId, run.source)).map(mapCommandRow);

  return {
    run,
    events,
    commands,
    changedFiles: run.source === "runtime" ? mergeChangedFiles(runtimeCollection?.changedFiles) : trackedFiles,
  };
}

async function syncRuntimeCollection(): Promise<RuntimeCollection | null> {
  const runtime = await collectOpenClawRuntime();
  if (!runtime) return null;

  for (const snapshot of runtime.runs) {
    const runRecord: RunRecordInput = {
      id: snapshot.run.id,
      source: snapshot.run.source,
      parentRunId: snapshot.run.parentRunId,
      task: snapshot.run.task,
      status: snapshot.run.status,
      stage: snapshot.run.stage,
      owner: snapshot.run.owner,
      startedAt: snapshot.run.startedAt,
      updatedAt: snapshot.run.updatedAt,
      eventCount: snapshot.events.length,
    };
    await replaceRunEvents(runRecord, snapshot.events);
    await replaceRunCommands(runRecord, snapshot.commands);
  }

  return runtime;
}

async function seedDemoProjection() {
  const groupedEvents = groupByRun(demoEvents);
  const groupedCommands = groupByRun(demoCommands);

  for (const [runId, events] of groupedEvents) {
    const newestEvent = events.reduce((latest, event) => (event.ts > latest.ts ? event : latest), events[0]);
    const oldestEvent = events.reduce((earliest, event) => (event.ts < earliest.ts ? event : earliest), events[0]);
    const runRecord: RunRecordInput = {
      id: runId,
      source: "demo",
      parentRunId: oldestEvent.parentRunId,
      task: extractDemoTask(events),
      status: newestEvent.status ?? "planning",
      stage: newestEvent.stage ?? "plan",
      owner: newestEvent.owner ?? "main",
      startedAt: oldestEvent.ts,
      updatedAt: newestEvent.ts,
      eventCount: events.length,
    };

    await replaceRunEvents(runRecord, events);
    await replaceRunCommands(runRecord, groupedCommands.get(runId) ?? []);
  }
}

function mapRunRow(row: RunRow): RunSummary {
  return {
    id: String(row.id),
    source: String(row.source),
    parentRunId: row.parent_run_id ? String(row.parent_run_id) : undefined,
    task: String(row.task),
    status: row.status as RunStatus,
    stage: row.stage as RunStage,
    owner: row.owner as RunKind,
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    eventCount: Number(row.event_count),
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
    source: row.source ? String(row.source) : undefined,
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
    source: row.source ? String(row.source) : undefined,
  });
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

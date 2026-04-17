import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  countEventsBySource,
  getRunEventRows,
  hasExternalDatabase,
  initializeStorage,
  insertEventRecord,
  listEventRows,
  listRunRows,
  replaceRunEvents,
  type EventRow,
  type RunRecordInput,
  type RunRow,
} from "@/lib/observability-db";
import { collectOpenClawRuntime, type RuntimeCollection } from "@/lib/openclaw-runtime";
import {
  observabilityEventInputSchema,
  observabilityEventSchema,
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
    type: "run.completed",
    title: "Polish pass finished successfully",
    meta: "lint + build passed",
    stage: "done",
    status: "done",
    owner: "subagent",
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
  const liveCount = await countEventsBySource("live");
  const activeSource = liveCount > 0 ? "live" : "demo";
  const runs = (await listRunRows(activeSource)).map(mapRunRow);
  const run = runs.find((item) => item.id === runId);

  if (!run) return null;

  const events = (await getRunEventRows(runId, run.source)).map(mapEventRow);

  return {
    run,
    events,
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
  }

  return runtime;
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

function mergeChangedFiles(runtimeFiles?: string[]) {
  return [...new Set([...(runtimeFiles ?? []), ...trackedFiles])];
}

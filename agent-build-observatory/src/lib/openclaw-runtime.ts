import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ObservatoryEvent, RunStage, RunStatus } from "@/lib/observability-schema";
import type { RunSummary } from "@/lib/observability";

const execFileAsync = promisify(execFile);
const ACTIVE_MINUTES = 240;

type CliSessionsResponse = {
  stores?: { agentId?: string; path: string }[];
  sessions?: CliSession[];
};

type CliSession = {
  key: string;
  updatedAt: number;
  ageMs: number;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  model?: string;
  modelProvider?: string;
  agentId?: string;
  kind?: string;
};

type StoreSessionEntry = {
  sessionFile?: string;
  origin?: {
    label?: string;
    provider?: string;
    from?: string;
    to?: string;
  };
};

type TranscriptSnapshot = {
  startedAt: string;
  task: string;
  latestUserText?: string;
  latestAssistantText?: string;
};

type RuntimeDashboardData = {
  runs: RunSummary[];
  events: ObservatoryEvent[];
  changedFiles: string[];
  summary: {
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
  };
  source: "runtime";
  storage: "openclaw";
};

export async function getOpenClawRuntimeDashboardData(): Promise<RuntimeDashboardData | null> {
  const snapshot = await getRuntimeSnapshot();
  if (!snapshot || snapshot.runs.length === 0) return null;

  return {
    ...snapshot,
    source: "runtime",
    storage: "openclaw",
  };
}

export async function getOpenClawRuntimeRunDetail(runId: string) {
  const snapshot = await getRuntimeSnapshot();
  if (!snapshot) return null;

  const run = snapshot.runs.find((item) => item.id === runId);
  if (!run) return null;

  return {
    run,
    events: snapshot.events.filter((event) => event.runId === runId),
    changedFiles: snapshot.changedFiles,
  };
}

async function getRuntimeSnapshot() {
  try {
    const { stdout } = await execFileAsync("openclaw", [
      "sessions",
      "--all-agents",
      "--active",
      String(ACTIVE_MINUTES),
      "--json",
    ]);
    const parsed = JSON.parse(stdout) as CliSessionsResponse;
    const sessions = parsed.sessions ?? [];
    if (sessions.length === 0) return null;

    const storeEntries = await loadStoreEntries(parsed.stores ?? []);
    const transcriptCache = new Map<string, TranscriptSnapshot>();

    const runs: RunSummary[] = [];
    const events: ObservatoryEvent[] = [];

    for (const session of sessions) {
      const storeEntry = storeEntries.get(session.key);
      const transcript = await loadTranscriptSnapshot(storeEntry?.sessionFile, transcriptCache);
      const task = transcript?.task ?? fallbackTask(session.key);
      const owner = session.key.includes(":subagent:") ? "subagent" : "main";
      const stage = inferStage(task, transcript?.latestAssistantText, transcript?.latestUserText);
      const status = inferStatus(session.ageMs, session.abortedLastRun);
      const startedAt = transcript?.startedAt ?? new Date(session.updatedAt).toISOString();
      const updatedAt = new Date(session.updatedAt).toISOString();

      runs.push({
        id: session.key,
        parentRunId: undefined,
        task,
        status,
        stage,
        owner,
        startedAt,
        updatedAt,
        eventCount: 2,
        source: "runtime",
      });

      events.push({
        id: `${session.key}:started`,
        runId: session.key,
        type: "session.started",
        title: task,
        meta: formatStartedMeta(session, storeEntry),
        stage,
        status,
        owner,
        ts: startedAt,
        source: "runtime",
      });

      events.push({
        id: `${session.key}:updated:${session.updatedAt}`,
        runId: session.key,
        type: "session.updated",
        title: `Latest activity in ${session.key}`,
        meta: formatUpdateMeta(session, transcript),
        stage,
        status,
        owner,
        ts: updatedAt,
        source: "runtime",
      });
    }

    runs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    events.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

    return {
      runs,
      events: events.slice(0, 30),
      changedFiles: [
        "~/.openclaw/agents/*/sessions/sessions.json",
        "~/.openclaw/agents/*/sessions/*.jsonl",
        "openclaw sessions --all-agents --active --json",
      ],
      summary: {
        totalRuns: runs.length,
        activeRuns: runs.filter((run) => run.status !== "done" && run.status !== "failed").length,
        completedRuns: runs.filter((run) => run.status === "done").length,
        failedRuns: runs.filter((run) => run.status === "failed").length,
      },
    };
  } catch (error) {
    console.error("Failed to load OpenClaw runtime snapshot", error);
    return null;
  }
}

async function loadStoreEntries(stores: { path: string }[]) {
  const index = new Map<string, StoreSessionEntry>();

  for (const store of stores) {
    try {
      const raw = await readFile(store.path, "utf8");
      const parsed = JSON.parse(raw) as Record<string, StoreSessionEntry>;
      for (const [key, entry] of Object.entries(parsed)) {
        index.set(key, entry);
      }
    } catch {
      // Ignore unavailable stores and continue with what we can observe.
    }
  }

  return index;
}

async function loadTranscriptSnapshot(sessionFile: string | undefined, cache: Map<string, TranscriptSnapshot>) {
  if (!sessionFile) return null;
  const cached = cache.get(sessionFile);
  if (cached) return cached;

  try {
    const raw = await readFile(sessionFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let startedAt = new Date().toISOString();
    let latestUserText: string | undefined;
    let latestAssistantText: string | undefined;

    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.type === "session" && typeof record.timestamp === "string") {
        startedAt = record.timestamp;
      }
      if (record.type !== "message") continue;
      const message = record.message as { role?: string; content?: { type?: string; text?: string }[] } | undefined;
      const text = message?.content
        ?.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text ?? "")
        .join("\n")
        .trim();
      if (!text) continue;
      if (message?.role === "user") latestUserText = text;
      if (message?.role === "assistant") latestAssistantText = text;
    }

    const snapshot: TranscriptSnapshot = {
      startedAt,
      task: summarizeTask(latestUserText) ?? fallbackTask(sessionFile),
      latestUserText,
      latestAssistantText,
    };
    cache.set(sessionFile, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

function summarizeTask(text: string | undefined) {
  if (!text) return null;
  const cleaned = text
    .replace(/Conversation info \(untrusted metadata\):[\s\S]*?```\n```/g, "")
    .replace(/Conversation info \(untrusted metadata\):[\s\S]*?```/g, "")
    .replace(/Sender \(untrusted metadata\):[\s\S]*?```/g, "")
    .replace(/```json[\s\S]*?```/g, "")
    .trim();
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Sender") && !line.startsWith("Conversation info"));
  const chosen = lines.at(-1) ?? lines[0];
  if (!chosen) return null;
  return chosen.slice(0, 140);
}

function fallbackTask(value: string) {
  return value.replace(/^agent:[^:]+:/, "").replace(/:/g, " • ");
}

function inferStage(task: string, latestAssistantText?: string, latestUserText?: string): RunStage {
  const haystack = `${task} ${latestAssistantText ?? ""} ${latestUserText ?? ""}`.toLowerCase();
  if (haystack.includes("deploy")) return "deploy";
  if (haystack.includes("verify") || haystack.includes("test") || haystack.includes("lint")) return "verify";
  if (haystack.includes("build") || haystack.includes("create") || haystack.includes("implement")) return "build";
  return "observe";
}

function inferStatus(ageMs: number, abortedLastRun?: boolean): RunStatus {
  if (abortedLastRun) return "failed";
  if (ageMs <= 2 * 60 * 1000) return "planning";
  if (ageMs <= 15 * 60 * 1000) return "waiting";
  return "done";
}

function formatStartedMeta(session: CliSession, entry?: StoreSessionEntry) {
  return [
    `kind=${session.kind ?? "unknown"}`,
    `agent=${session.agentId ?? "unknown"}`,
    `origin=${entry?.origin?.label ?? entry?.origin?.provider ?? "unknown"}`,
    `model=${session.model ?? "unknown"}`,
  ].join(" | ");
}

function formatUpdateMeta(session: CliSession, transcript: TranscriptSnapshot | null) {
  const fields = [
    `ageMs=${session.ageMs}`,
    `tokens=${session.totalTokens ?? 0}`,
    session.totalTokensFresh ? "tokensFresh=true" : "tokensFresh=false",
    transcript?.latestUserText ? `latestUser=${summarizeTask(transcript.latestUserText)}` : undefined,
  ].filter(Boolean);
  return fields.join(" | ");
}

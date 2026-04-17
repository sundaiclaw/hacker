import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ObservatoryEvent, RunKind, RunStage, RunStatus } from "@/lib/observability-schema";

type StoreSessionEntry = {
  sessionFile?: string;
  origin?: {
    label?: string;
    provider?: string;
    from?: string;
    to?: string;
  };
  status?: string;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
  runtimeMs?: number;
  abortedLastRun?: boolean;
  spawnedBy?: string;
  model?: string;
  modelProvider?: string;
  agentId?: string;
  kind?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
};

type RuntimeSession = StoreSessionEntry & {
  key: string;
  agentId?: string;
  ageMs?: number;
  storePath: string;
};

type TranscriptMessage = {
  id: string;
  role: "assistant" | "toolResult" | "user";
  timestamp: string;
  text?: string;
  phase?: string;
  hasToolCalls: boolean;
  stopReason?: string;
};

type ToolActivity = {
  id: string;
  kind: "call" | "result";
  timestamp: string;
  name: string;
  summary?: string;
  isError?: boolean;
};

type TranscriptSnapshot = {
  startedAt: string;
  updatedAt: string;
  task: string;
  firstUser?: TranscriptMessage;
  latestUser?: TranscriptMessage;
  latestAssistant?: TranscriptMessage;
  latestToolActivity?: ToolActivity;
  lastMessage?: TranscriptMessage;
  pendingToolCalls: number;
  assistantCount: number;
  sawBuildSignal: boolean;
  sawVerifySignal: boolean;
  sawDeploySignal: boolean;
  sawObserveSignal: boolean;
  sawMutationSignal: boolean;
  sawToolError: boolean;
};

export type RuntimeRunRecord = {
  id: string;
  parentRunId?: string;
  task: string;
  status: RunStatus;
  stage: RunStage;
  owner: RunKind;
  startedAt: string;
  updatedAt: string;
  source: "runtime";
};

export type RuntimeRunSnapshot = {
  run: RuntimeRunRecord;
  events: ObservatoryEvent[];
};

export type RuntimeCollection = {
  changedFiles: string[];
  runs: RuntimeRunSnapshot[];
};

export async function collectOpenClawRuntime(): Promise<RuntimeCollection | null> {
  try {
    const sessions = await loadRuntimeSessions();
    if (sessions.length === 0) {
      return null;
    }

    const transcriptCache = new Map<string, TranscriptSnapshot | null>();
    const runs: RuntimeRunSnapshot[] = [];
    const changedFiles = new Set<string>();

    for (const session of sessions) {
      changedFiles.add(session.storePath);
      if (session.sessionFile) {
        changedFiles.add(session.sessionFile);
      }

      const transcript = await loadTranscriptSnapshot(session.sessionFile, transcriptCache);
      const run = buildRunRecord(session, transcript);
      const events = buildRunEvents(run, session, transcript);
      runs.push({ run, events });
    }

    runs.sort((left, right) => Date.parse(right.run.updatedAt) - Date.parse(left.run.updatedAt));

    return {
      changedFiles: [...changedFiles],
      runs,
    };
  } catch (error) {
    console.error("Failed to collect OpenClaw runtime state", error);
    return null;
  }
}

async function loadRuntimeSessions() {
  const stores = await listRuntimeStores();
  const now = Date.now();
  const index = new Map<string, RuntimeSession>();

  for (const store of stores) {
    try {
      const raw = await readFile(store.path, "utf8");
      const parsed = JSON.parse(raw) as Record<string, StoreSessionEntry>;
      for (const [key, entry] of Object.entries(parsed)) {
        const previous = index.get(key);
        const updatedAt = entry.updatedAt ?? 0;

        if (previous && (previous.updatedAt ?? 0) > updatedAt) {
          continue;
        }

        index.set(key, {
          ...entry,
          key,
          agentId: entry.agentId ?? store.agentId,
          ageMs: typeof entry.updatedAt === "number" ? Math.max(0, now - entry.updatedAt) : undefined,
          storePath: store.path,
        });
      }
    } catch {
      // Ignore unavailable stores and continue with what we can observe.
    }
  }

  return [...index.values()].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

async function listRuntimeStores() {
  const agentsDir = path.join(os.homedir(), ".openclaw", "agents");

  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        agentId: entry.name,
        path: path.join(agentsDir, entry.name, "sessions", "sessions.json"),
      }));
  } catch {
    return [];
  }
}

async function loadTranscriptSnapshot(
  sessionFile: string | undefined,
  cache: Map<string, TranscriptSnapshot | null>
) {
  if (!sessionFile) return null;

  if (cache.has(sessionFile)) {
    return cache.get(sessionFile) ?? null;
  }

  try {
    const raw = await readFile(sessionFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let startedAt = new Date().toISOString();
    let updatedAt = startedAt;
    let firstUser: TranscriptMessage | undefined;
    let latestUser: TranscriptMessage | undefined;
    let latestAssistant: TranscriptMessage | undefined;
    let latestToolActivity: ToolActivity | undefined;
    let lastMessage: TranscriptMessage | undefined;
    let assistantCount = 0;
    let sawBuildSignal = false;
    let sawVerifySignal = false;
    let sawDeploySignal = false;
    let sawObserveSignal = false;
    let sawMutationSignal = false;
    let sawToolError = false;
    const pendingToolCalls = new Set<string>();

    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      const recordTimestamp = asIsoTimestamp(record.timestamp);
      if (record.type === "session" && recordTimestamp) {
        startedAt = recordTimestamp;
        updatedAt = recordTimestamp;
        continue;
      }

      if (record.type !== "message") continue;
      if (recordTimestamp) {
        updatedAt = recordTimestamp;
      }

      const message = record.message as
        | {
            role?: "assistant" | "toolResult" | "user";
            content?: Array<Record<string, unknown>>;
            stopReason?: string;
          }
        | undefined;
      const role = message?.role;
      if (role !== "assistant" && role !== "toolResult" && role !== "user") {
        continue;
      }

      const content = Array.isArray(message?.content) ? message.content : [];
      const text = extractText(content);
      const toolCalls = extractToolCalls(content);
      const phase = role === "assistant" ? extractAssistantPhase(content) : undefined;
      const itemId = stringifyValue(record.id) ?? `${role}:${recordTimestamp ?? updatedAt}`;

      const transcriptMessage: TranscriptMessage = {
        id: itemId,
        role,
        timestamp: recordTimestamp ?? updatedAt,
        text,
        phase,
        hasToolCalls: toolCalls.length > 0,
        stopReason: stringifyValue(message?.stopReason),
      };

      if (role === "user") {
        if (!firstUser) firstUser = transcriptMessage;
        latestUser = transcriptMessage;
      }

      if (role === "assistant") {
        assistantCount += 1;
        latestAssistant = transcriptMessage;
      }

      for (const toolCall of toolCalls) {
        if (toolCall.id) pendingToolCalls.add(toolCall.id);
        latestToolActivity = {
          id: `${itemId}:${toolCall.name}:${toolCall.id ?? "call"}`,
          kind: "call",
          timestamp: transcriptMessage.timestamp,
          name: toolCall.name,
          summary: summarizeToolArguments(toolCall.arguments),
        };
        const signal = inferSignal(toolCall.name, toolCall.arguments, text);
        sawBuildSignal ||= signal.build;
        sawVerifySignal ||= signal.verify;
        sawDeploySignal ||= signal.deploy;
        sawObserveSignal ||= signal.observe;
        sawMutationSignal ||= signal.mutate;
      }

      if (role === "toolResult") {
        const toolName = stringifyValue((message as { toolName?: unknown }).toolName) ?? "tool";
        const toolCallId = stringifyValue((message as { toolCallId?: unknown }).toolCallId);
        if (toolCallId) pendingToolCalls.delete(toolCallId);
        const isError = Boolean(record.isError);
        sawToolError ||= isError;
        latestToolActivity = {
          id: `${itemId}:${toolName}:result`,
          kind: "result",
          timestamp: transcriptMessage.timestamp,
          name: toolName,
          summary: text ? summarizeText(text, 180) : undefined,
          isError,
        };
        const signal = inferSignal(toolName, undefined, text);
        sawBuildSignal ||= signal.build;
        sawVerifySignal ||= signal.verify;
        sawDeploySignal ||= signal.deploy;
        sawObserveSignal ||= signal.observe;
        sawMutationSignal ||= signal.mutate;
      }

      if (text) {
        const textSignal = inferSignal(undefined, undefined, text);
        sawBuildSignal ||= textSignal.build;
        sawVerifySignal ||= textSignal.verify;
        sawDeploySignal ||= textSignal.deploy;
        sawObserveSignal ||= textSignal.observe;
        sawMutationSignal ||= textSignal.mutate;
      }

      lastMessage = transcriptMessage;
    }

    const snapshot: TranscriptSnapshot = {
      startedAt,
      updatedAt,
      task: summarizeTask(firstUser?.text) ?? fallbackTask(sessionFile),
      firstUser,
      latestUser,
      latestAssistant,
      latestToolActivity,
      lastMessage,
      pendingToolCalls: pendingToolCalls.size,
      assistantCount,
      sawBuildSignal,
      sawVerifySignal,
      sawDeploySignal,
      sawObserveSignal,
      sawMutationSignal,
      sawToolError,
    };

    cache.set(sessionFile, snapshot);
    return snapshot;
  } catch {
    cache.set(sessionFile, null);
    return null;
  }
}

function buildRunRecord(
  session: RuntimeSession,
  transcript: TranscriptSnapshot | null
): RuntimeRunRecord {
  const task = transcript?.task ?? fallbackTask(session.key);
  const owner = inferOwner(session.key, session);
  const primaryStage = derivePrimaryStage(task, transcript);
  const status =
    normalizeStoredStatus(session.status, primaryStage) ??
    deriveTranscriptStatus(session, transcript, primaryStage);
  const stage = status === "done" ? "done" : primaryStage;
  const startedAt =
    timestampFromMs(session.startedAt) ??
    transcript?.startedAt ??
    timestampFromMs(session.updatedAt) ??
    new Date().toISOString();
  const updatedAt =
    timestampFromMs(session.updatedAt) ??
    transcript?.updatedAt ??
    timestampFromMs(session.updatedAt) ??
    startedAt;

  return {
    id: session.key,
    parentRunId: session.spawnedBy,
    task,
    status,
    stage,
    owner,
    startedAt,
    updatedAt,
    source: "runtime",
  };
}

function buildRunEvents(
  run: RuntimeRunRecord,
  session: RuntimeSession,
  transcript: TranscriptSnapshot | null
): ObservatoryEvent[] {
  const events: ObservatoryEvent[] = [];
  const origin = session.origin?.label ?? session.origin?.provider ?? "unknown";
  const model = session.model ?? "unknown";

  events.push({
    id: `${run.id}:session.started`,
    runId: run.id,
    parentRunId: run.parentRunId,
    type: "session.started",
    title: "Runtime session started",
    meta: [
      `kind=${session.kind ?? "unknown"}`,
      `agent=${session.agentId ?? "unknown"}`,
      `origin=${origin}`,
      `model=${model}`,
    ].join(" | "),
    stage: "plan",
    status: "planning",
    owner: run.owner,
    ts: run.startedAt,
    source: run.source,
  });

  if (transcript?.firstUser?.text) {
    events.push({
      id: `${run.id}:${transcript.firstUser.id}:user.prompt`,
      runId: run.id,
      parentRunId: run.parentRunId,
      type: "user.prompt",
      title: "Received task",
      meta: summarizeText(transcript.firstUser.text, 220),
      stage: "plan",
      status: transcript.assistantCount === 0 ? "queued" : "planning",
      owner: run.owner,
      ts: transcript.firstUser.timestamp,
      source: run.source,
    });
  }

  if (transcript?.latestToolActivity) {
    const toolStatus = transcript.latestToolActivity.isError ? "failed" : run.status;
    events.push({
      id: `${run.id}:${transcript.latestToolActivity.id}`,
      runId: run.id,
      parentRunId: run.parentRunId,
      type:
        transcript.latestToolActivity.kind === "call"
          ? "tool.called"
          : transcript.latestToolActivity.isError
            ? "tool.failed"
            : "tool.completed",
      title:
        transcript.latestToolActivity.kind === "call"
          ? `Requested ${transcript.latestToolActivity.name}`
          : transcript.latestToolActivity.isError
            ? `${transcript.latestToolActivity.name} failed`
            : `${transcript.latestToolActivity.name} finished`,
      meta: transcript.latestToolActivity.summary,
      stage: run.stage,
      status: toolStatus,
      owner: run.owner,
      ts: transcript.latestToolActivity.timestamp,
      source: run.source,
    });
  }

  events.push({
    id: `${run.id}:runtime.status`,
    runId: run.id,
    parentRunId: run.parentRunId,
    type: run.status === "done" ? "run.completed" : run.status === "failed" ? "run.failed" : "run.updated",
    title: formatStatusTitle(run.status),
    meta: buildRunMeta(transcript, session, run.status),
    stage: run.stage,
    status: run.status,
    owner: run.owner,
    ts: run.updatedAt,
    source: run.source,
  });

  return events.sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
}

function inferOwner(sessionKey: string, session?: RuntimeSession): RunKind {
  if (session?.spawnedBy || sessionKey.includes(":subagent:")) return "subagent";
  return "main";
}

function derivePrimaryStage(task: string, transcript: TranscriptSnapshot | null): RunStage {
  if (!transcript) {
    return inferStageFromText(task);
  }

  if (transcript.lastMessage?.role === "user" && transcript.assistantCount === 0) {
    return "plan";
  }
  if (transcript.sawDeploySignal) return "deploy";
  if (transcript.sawVerifySignal) return "verify";
  if (transcript.sawMutationSignal || transcript.sawBuildSignal) return "build";
  if (transcript.sawObserveSignal) return "observe";
  return inferStageFromText(task, transcript.latestAssistant?.text, transcript.latestUser?.text);
}

function deriveTranscriptStatus(
  session: RuntimeSession,
  transcript: TranscriptSnapshot | null,
  primaryStage: RunStage
): RunStatus {
  if (session.abortedLastRun) {
    return "failed";
  }

  if (session.endedAt) {
    return transcript?.sawToolError ? "failed" : "done";
  }

  if (!transcript) {
    return inferFallbackStatus(session.ageMs);
  }

  if (transcript.sawToolError && transcript.lastMessage?.role === "toolResult") {
    return "failed";
  }

  if (transcript.latestAssistant?.phase === "final_answer" && transcript.pendingToolCalls === 0) {
    return "done";
  }

  if (transcript.lastMessage?.role === "user" && transcript.assistantCount === 0) {
    return "queued";
  }

  if (transcript.pendingToolCalls > 0) {
    return statusForStage(primaryStage);
  }

  if (transcript.lastMessage?.role === "toolResult") {
    return transcript.sawToolError ? "failed" : "waiting";
  }

  if (transcript.lastMessage?.role === "assistant") {
    return transcript.lastMessage.phase === "final_answer" ? "done" : statusForStage(primaryStage);
  }

  return inferFallbackStatus(session.ageMs);
}

function normalizeStoredStatus(value: string | undefined, primaryStage: RunStage): RunStatus | undefined {
  if (!value) return undefined;

  switch (value.toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "planning":
    case "plan":
      return "planning";
    case "waiting":
    case "blocked":
      return "waiting";
    case "done":
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
      return "done";
    case "failed":
    case "error":
    case "aborted":
    case "cancelled":
    case "canceled":
      return "failed";
    case "running":
    case "active":
    case "in_progress":
      return statusForStage(primaryStage);
    default:
      return undefined;
  }
}

function statusForStage(stage: RunStage): RunStatus {
  switch (stage) {
    case "build":
      return "building";
    case "verify":
      return "verifying";
    case "deploy":
      return "deploying";
    case "observe":
      return "waiting";
    case "done":
      return "done";
    default:
      return "planning";
  }
}

function inferFallbackStatus(ageMs: number | undefined): RunStatus {
  if (typeof ageMs !== "number") return "planning";
  if (ageMs <= 2 * 60 * 1000) return "planning";
  if (ageMs <= 15 * 60 * 1000) return "waiting";
  return "done";
}

function inferStageFromText(...parts: Array<string | undefined>): RunStage {
  const haystack = parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();

  if (!haystack) return "observe";
  if (/\bdeploy|release|ship|publish\b/.test(haystack)) return "deploy";
  if (/\bverify|verification|test|lint|smoke\b/.test(haystack)) return "verify";
  if (/\bbuild|implement|refactor|fix|edit|write|create|patch\b/.test(haystack)) return "build";
  if (/\bobserve|monitor|check|heartbeat|watch|inspect|review\b/.test(haystack)) return "observe";
  return "plan";
}

function inferSignal(toolName?: string, args?: unknown, text?: string) {
  const argumentText = args ? (JSON.stringify(args) ?? "").toLowerCase() : "";
  const source = `${toolName ?? ""} ${argumentText} ${text ?? ""}`.toLowerCase();
  const mutate = /\b(edit|write|patch|apply_patch|create file|update file)\b/.test(source);
  const build = mutate || /\b(build|implement|refactor|fix|create|scaffold)\b/.test(source);
  const verify = /\b(test|lint|verify|smoke|check|typecheck)\b/.test(source);
  const deploy = /\b(deploy|release|publish|ship)\b/.test(source);
  const observe = /\b(read|fetch|search|inspect|review|monitor|watch|heartbeat)\b/.test(source);

  return { build, verify, deploy, observe, mutate };
}

function extractText(content: Array<Record<string, unknown>>) {
  const text = content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => String(item.text))
    .join("\n")
    .trim();

  return text || undefined;
}

function extractAssistantPhase(content: Array<Record<string, unknown>>) {
  for (const item of content) {
    if (typeof item.textSignature !== "string") continue;
    try {
      const parsed = JSON.parse(item.textSignature) as { phase?: string };
      if (parsed.phase) return parsed.phase;
    } catch {
      // Ignore malformed phase metadata.
    }
  }

  return undefined;
}

function extractToolCalls(content: Array<Record<string, unknown>>) {
  return content
    .filter((item) => item.type === "toolCall")
    .map((item) => ({
      id: stringifyValue(item.id),
      name: stringifyValue(item.name) ?? "tool",
      arguments: item.arguments,
    }));
}

function summarizeTask(text: string | undefined) {
  if (!text) return null;

  const cleaned = text
    .replace(/Conversation info \(untrusted metadata\):[\s\S]*?```/g, "")
    .replace(/Sender \(untrusted metadata\):[\s\S]*?```/g, "")
    .replace(/```json[\s\S]*?```/g, "")
    .replace(/\[Subagent Context\][\s\S]*?\[Subagent Task\]:/g, "")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Sender") && !line.startsWith("Conversation info"));
  const chosen = lines.at(-1) ?? lines[0];
  if (!chosen) return null;
  return summarizeText(chosen, 140);
}

function summarizeText(text: string, maxLength: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}...`;
}

function summarizeToolArguments(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const parts: string[] = [];

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    parts.push(`${key}=${summarizeText(raw, 96)}`);
    if (parts.length === 3) break;
  }

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function fallbackTask(value: string) {
  return value.replace(/^agent:[^:]+:/, "").replace(/:/g, " • ");
}

function buildRunMeta(
  transcript: TranscriptSnapshot | null,
  session: RuntimeSession,
  status: RunStatus
) {
  const fields = [
    session.sessionFile ? `sessionFile=${session.sessionFile}` : undefined,
    transcript?.lastMessage?.role ? `lastRole=${transcript.lastMessage.role}` : undefined,
    transcript?.latestAssistant?.phase ? `assistantPhase=${transcript.latestAssistant.phase}` : undefined,
    transcript?.pendingToolCalls ? `pendingToolCalls=${transcript.pendingToolCalls}` : undefined,
    typeof session.totalTokens === "number" ? `tokens=${session.totalTokens}` : undefined,
    transcript?.latestAssistant?.text
      ? `latestAssistant=${summarizeText(transcript.latestAssistant.text, 160)}`
      : transcript?.latestUser?.text
        ? `latestUser=${summarizeText(transcript.latestUser.text, 160)}`
        : undefined,
    status === "failed" && transcript?.sawToolError ? "toolError=true" : undefined,
  ].filter(Boolean);

  return fields.join(" | ");
}

function formatStatusTitle(status: RunStatus) {
  switch (status) {
    case "done":
      return "Runtime session completed";
    case "failed":
      return "Runtime session failed";
    case "queued":
      return "Runtime session queued";
    case "planning":
      return "Runtime session planning";
    case "building":
      return "Runtime session building";
    case "verifying":
      return "Runtime session verifying";
    case "deploying":
      return "Runtime session deploying";
    case "waiting":
      return "Runtime session waiting";
    default:
      return "Runtime session updated";
  }
}

function asIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function timestampFromMs(value: number | undefined) {
  return typeof value === "number" ? new Date(value).toISOString() : undefined;
}

function stringifyValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

import { expect, type APIRequestContext, type Browser } from "@playwright/test";

const projectId = "project-browser";
const environmentId = "prod";
const runtimeId = "runtime-browser";
const producerToken = "browser-producer-token";
const viewerBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export async function createViewerPage(
  browser: Browser,
  credentials: { username: string; password: string } = { username: "ops-viewer", password: "ops-viewer-pass" }
) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "observability_viewer_credentials",
      value: encodeURIComponent(Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64")),
      url: viewerBaseURL,
    },
  ]);
  const page = await context.newPage();
  return { context, page };
}

type EnvelopeOptions = {
  requestId: string;
  runId: string;
  task: string;
  status: "queued" | "planning" | "building" | "verifying" | "deploying" | "waiting" | "done" | "failed";
  stage: "plan" | "build" | "verify" | "deploy" | "observe" | "done";
  owner?: "main" | "subagent" | "reviewer" | "system";
  parentRunId?: string;
  ts: string;
  command?: {
    id: string;
    label: string;
    command: string;
    status: "running" | "done" | "failed";
    exitCode?: number;
    logSummary?: string;
    sensitive?: boolean;
    redactedLogSummary?: string;
    cwd?: string;
    startedAt: string;
    endedAt?: string;
  };
};

export async function postTelemetry(request: APIRequestContext, options: EnvelopeOptions) {
  const response = await request.post("/api/telemetry", {
    headers: {
      Authorization: `Bearer ${producerToken}`,
      "Content-Type": "application/json",
    },
    data: {
      requestId: options.requestId,
      source: {
        projectId,
        environmentId,
        runtimeId,
        sourceMode: "hosted",
      },
      run: {
        id: options.runId,
        parentRunId: options.parentRunId,
        task: options.task,
        status: options.status,
        stage: options.stage,
        owner: options.owner ?? "main",
        startedAt: options.ts,
        updatedAt: options.ts,
      },
      events: [
        {
          id: `${options.runId}-event`,
          runId: options.runId,
          parentRunId: options.parentRunId,
          type: `run.${options.status}`,
          title: `${options.task} ${options.status}`,
          stage: options.stage,
          status: options.status,
          owner: options.owner ?? "main",
          ts: options.ts,
        },
      ],
      commands: options.command
        ? [
            {
              id: options.command.id,
              runId: options.runId,
              label: options.command.label,
              command: options.command.command,
              cwd: options.command.cwd ?? "/workspace/agent-build-observatory",
              status: options.command.status,
              startedAt: options.command.startedAt,
              endedAt: options.command.endedAt,
              exitCode: options.command.exitCode,
              logSummary: options.command.logSummary,
              sensitive: options.command.sensitive,
              redactedLogSummary: options.command.redactedLogSummary,
            },
          ]
        : [],
    },
  });

  await expect(response).toBeOK();
}

export async function seedDashboardScenario(request: APIRequestContext) {
  const idBase = uniqueSuffix();
  const baseTime = Date.now();

  const failedRunId = `browser-failed-${idBase}`;
  const waitingRunId = `browser-waiting-${idBase}`;
  const activeRunId = `browser-active-${idBase}`;
  const childRunId = `browser-child-${idBase}`;

  await postTelemetry(request, {
    requestId: `req-failed-${idBase}`,
    runId: failedRunId,
    task: `Browser failed run ${idBase}`,
    status: "failed",
    stage: "verify",
    ts: new Date(baseTime - 30_000).toISOString(),
    command: {
      id: `cmd-failed-${idBase}`,
      label: "npm run verify",
      command: "npm run verify",
      status: "failed",
      exitCode: 1,
      logSummary: `Verification failed for ${idBase}`,
      sensitive: true,
      redactedLogSummary: "Verification failed. Full output requires sensitive-log access.",
      startedAt: new Date(baseTime - 35_000).toISOString(),
      endedAt: new Date(baseTime - 30_000).toISOString(),
    },
  });

  await postTelemetry(request, {
    requestId: `req-waiting-${idBase}`,
    runId: waitingRunId,
    task: `Browser waiting run ${idBase}`,
    status: "waiting",
    stage: "deploy",
    ts: new Date(baseTime - 20_000).toISOString(),
  });

  await postTelemetry(request, {
    requestId: `req-active-${idBase}`,
    runId: activeRunId,
    task: `Browser active run ${idBase}`,
    status: "building",
    stage: "build",
    ts: new Date(baseTime - 10_000).toISOString(),
  });

  await postTelemetry(request, {
    requestId: `req-child-${idBase}`,
    runId: childRunId,
    task: `Browser child run ${idBase}`,
    status: "failed",
    stage: "verify",
    owner: "subagent",
    parentRunId: failedRunId,
    ts: new Date(baseTime - 5_000).toISOString(),
  });

  return {
    failedRunId,
    waitingRunId,
    activeRunId,
    childRunId,
    failedTask: `Browser failed run ${idBase}`,
    waitingTask: `Browser waiting run ${idBase}`,
    activeTask: `Browser active run ${idBase}`,
    childTask: `Browser child run ${idBase}`,
  };
}

export async function seedSensitiveFailureScenario(request: APIRequestContext) {
  const idBase = uniqueSuffix();
  const runId = `browser-sensitive-${idBase}`;
  const rawLog = `secret-token-${idBase} leaked in command output`;

  await postTelemetry(request, {
    requestId: `req-sensitive-${idBase}`,
    runId,
    task: `Browser sensitive run ${idBase}`,
    status: "failed",
    stage: "verify",
    ts: new Date().toISOString(),
    command: {
      id: `cmd-sensitive-${idBase}`,
      label: "print secret",
      command: "node -e 'console.log(process.env.SECRET)'",
      status: "failed",
      exitCode: 1,
      logSummary: rawLog,
      sensitive: true,
      redactedLogSummary: "Sensitive command output hidden for this viewer.",
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      endedAt: new Date().toISOString(),
    },
  });

  return {
    runId,
    task: `Browser sensitive run ${idBase}`,
    rawLog,
    redactedLog: "Sensitive command output hidden for this viewer.",
  };
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

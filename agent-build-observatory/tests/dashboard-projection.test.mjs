import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { installAliasHooks, withTempObservabilityEnv } from "./support/test-helpers.mjs";

installAliasHooks();

const observability = await import("../src/lib/observability.ts");
const dashboardRoute = await import("../src/app/api/dashboard/route.ts");

const hostedFailedFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-failed-run.json"), "utf8")
);
const hostedChildFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-child-run.json"), "utf8")
);

test("dashboard projection supports triage sections, filters, hierarchy, and explicit source labels", async () => {
  await withTempObservabilityEnv({}, async () => {
    await observability.ingestTelemetry(hostedFailedFixture);
    await observability.ingestTelemetry(hostedChildFixture);

    const allData = await observability.getDashboardData();
    assert.equal(allData.sourceMode, "hosted");
    assert.equal(allData.sourceLabel, "Hosted ingest");
    assert.equal(allData.systemStatus.sourceLabel, "Hosted ingest");
    assert.equal(allData.systemStatus.storageDriver, "sqlite");
    assert.deepEqual(allData.runs.map((run) => run.id), ["run-hosted-child", "run-hosted-failed"]);
    assert.deepEqual(allData.runInventory.map((run) => run.id), ["run-hosted-child", "run-hosted-failed"]);
    assert.deepEqual(allData.needsAttentionRuns.map((run) => run.id), ["run-hosted-failed"]);
    assert.deepEqual(allData.activeRuns.map((run) => run.id), []);
    assert.deepEqual(allData.recentActivity.map((event) => event.id), [
      "hosted:project-a:prod:runtime-2::evt-child-done",
      "hosted:project-a:prod:runtime-2::evt-child-started",
      "hosted:project-a:prod:runtime-1::evt-run-failed",
      "hosted:project-a:prod:runtime-1::evt-run-started",
    ]);

    const parentRun = allData.runs.find((run) => run.id === "run-hosted-failed");
    assert.equal(parentRun.childCount, 1);

    const failedOnly = await observability.getDashboardData({
      filters: {
        statuses: ["failed"],
      },
    });
    assert.deepEqual(failedOnly.runs.map((run) => run.id), ["run-hosted-failed"]);

    const subagentOnly = await observability.getDashboardData({
      filters: {
        owners: ["subagent"],
      },
    });
    assert.deepEqual(subagentOnly.runs.map((run) => run.id), ["run-hosted-child"]);

    const demoOnly = await observability.getDashboardData({
      filters: {
        sourceModes: ["demo"],
      },
    });
    assert.equal(demoOnly.sourceMode, "demo");
    assert.ok(demoOnly.runs.length > 0);
    assert.ok(demoOnly.runs.every((run) => run.sourceMode === "demo"));
  });
});

test("dashboard exposes canonical filter values and only marks very recent data as live", async () => {
  await withTempObservabilityEnv({}, async () => {
    const now = Date.now();
    await observability.ingestTelemetry({
      requestId: "req-live-filter-check",
      source: {
        projectId: "project-live",
        environmentId: "prod",
        runtimeId: "runtime-live",
        sourceMode: "hosted",
      },
      run: {
        id: "run-live-filter-check",
        task: "Verify dashboard filter contract",
        status: "planning",
        stage: "plan",
        owner: "main",
        startedAt: new Date(now - 45_000).toISOString(),
        updatedAt: new Date(now - 30_000).toISOString(),
      },
      events: [
        {
          id: "evt-live-filter-check",
          runId: "run-live-filter-check",
          type: "run.started",
          title: "Started dashboard filter contract check",
          stage: "plan",
          status: "planning",
          owner: "main",
          ts: new Date(now - 30_000).toISOString(),
        },
      ],
      commands: [],
    });

    const data = await observability.getDashboardData();
    assert.equal(data.systemStatus.freshnessState, "live");
    assert.deepEqual(data.filters.status, [
      "building",
      "deploying",
      "done",
      "failed",
      "planning",
      "queued",
      "verifying",
      "waiting",
    ]);
    assert.deepEqual(data.filters.stage, ["build", "deploy", "done", "observe", "plan", "verify"]);
    assert.deepEqual(data.filters.owner, ["main", "reviewer", "subagent", "system"]);
    assert.deepEqual(data.filters.source, ["demo", "hosted", "runtime-adapter"]);
  });
});

test("invalid source filters are ignored instead of coercing to hosted mode", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_SOURCE_MODE: "demo",
    },
    async () => {
      const response = await dashboardRoute.GET(new Request("http://localhost/api/dashboard?source=not-a-real-source"));
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.sourceMode, "demo");
      assert.ok(payload.runs.length > 0);
      assert.ok(payload.runs.every((run) => run.sourceMode === "demo"));
    }
  );
});

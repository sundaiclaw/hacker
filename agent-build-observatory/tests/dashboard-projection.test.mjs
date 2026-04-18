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

test("dashboard projection supports filters, hierarchy, and explicit source labels", async () => {
  await withTempObservabilityEnv({}, async () => {
    await observability.ingestTelemetry(hostedFailedFixture);
    await observability.ingestTelemetry(hostedChildFixture);

    const allData = await observability.getDashboardData();
    assert.equal(allData.sourceMode, "hosted");
    assert.equal(allData.sourceLabel, "Hosted ingest");
    assert.deepEqual(allData.runs.map((run) => run.id), ["run-hosted-child", "run-hosted-failed"]);

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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { installAliasHooks, withTempObservabilityEnv, basicAuth, bearerAuth } from "./support/test-helpers.mjs";

installAliasHooks();

const telemetryRoute = await import("../src/app/api/telemetry/route.ts");
const dashboardRoute = await import("../src/app/api/dashboard/route.ts");
const runRoute = await import("../src/app/api/runs/[id]/route.ts");

const hostedFailedFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-failed-run.json"), "utf8")
);
const hostedChildFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-child-run.json"), "utf8")
);

test("telemetry ingestion flows through dashboard and run detail APIs", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        { name: "runtime-a", token: "producer-token", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
      OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
        { username: "ops", password: "secret", scopes: [{ projectId: "project-a", environmentId: "prod" }], canViewSensitiveLogs: true },
      ]),
    },
    async () => {
      for (const fixture of [hostedFailedFixture, hostedChildFixture]) {
        const ingestResponse = await telemetryRoute.POST(
          new Request("http://localhost/api/telemetry", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: bearerAuth("producer-token"),
            },
            body: JSON.stringify(fixture),
          })
        );
        assert.equal(ingestResponse.status, 200);
      }

      const dashboardResponse = await dashboardRoute.GET(
        new Request("http://localhost/api/dashboard?status=failed", {
          headers: {
            authorization: basicAuth("ops", "secret"),
          },
        })
      );
      assert.equal(dashboardResponse.status, 200);
      const dashboardPayload = await dashboardResponse.json();
      assert.deepEqual(dashboardPayload.runs.map((run) => run.id), ["run-hosted-failed"]);
      assert.equal(dashboardPayload.runs[0].childCount, 1);

      const runResponse = await runRoute.GET(
        new Request("http://localhost/api/runs/run-hosted-failed", {
          headers: {
            authorization: basicAuth("ops", "secret"),
          },
        }),
        { params: Promise.resolve({ id: "run-hosted-failed" }) }
      );
      assert.equal(runResponse.status, 200);
      const runPayload = await runResponse.json();
      assert.equal(runPayload.childRuns.length, 1);
      assert.equal(runPayload.childRuns[0].id, "run-hosted-child");
      assert.equal(runPayload.commands[0].status, "failed");
      assert.match(runPayload.commands[0].logSummary, /SECRET_TOKEN/);
    }
  );
});

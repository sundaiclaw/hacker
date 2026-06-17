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
const hostedOtherProjectFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-other-project.json"), "utf8")
);
const hostedChildFixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-child-run.json"), "utf8")
);

test("anonymous hosted viewers are denied", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        { name: "runtime-a", token: "producer-token", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
      OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
        { username: "ops", password: "secret", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
    },
    async () => {
      await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: bearerAuth("producer-token"),
          },
          body: JSON.stringify(hostedFailedFixture),
        })
      );

      const response = await dashboardRoute.GET(new Request("http://localhost/api/dashboard"));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), 'Basic realm="Build Observatory"');
    }
  );
});

test("viewer scope only exposes authorized project runs", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        { name: "runtime-a", token: "producer-token", scopes: [{ projectId: "project-a", environmentId: "prod" }, { projectId: "project-b", environmentId: "staging" }] },
      ]),
      OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
        { username: "scoped", password: "secret", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
    },
    async () => {
      for (const fixture of [hostedFailedFixture, hostedOtherProjectFixture]) {
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
        new Request("http://localhost/api/dashboard", {
          headers: {
            authorization: basicAuth("scoped", "secret"),
          },
        })
      );

      assert.equal(dashboardResponse.status, 200);
      const dashboardPayload = await dashboardResponse.json();
      assert.deepEqual(dashboardPayload.runs.map((run) => run.id), ["run-hosted-failed"]);

      const outOfScopeRunResponse = await runRoute.GET(
        new Request("http://localhost/api/runs/run-other-project", {
          headers: {
            authorization: basicAuth("scoped", "secret"),
          },
        }),
        { params: Promise.resolve({ id: "run-other-project" }) }
      );

      assert.equal(outOfScopeRunResponse.status, 404);
    }
  );
});

test("runtime-scoped viewers only see runs from their allowed runtime", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        { name: "runtime-a", token: "producer-token", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
      OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
        {
          username: "runtime-two",
          password: "secret",
          scopes: [{ projectId: "project-a", environmentId: "prod", runtimeId: "runtime-2" }],
        },
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
        new Request("http://localhost/api/dashboard", {
          headers: {
            authorization: basicAuth("runtime-two", "secret"),
          },
        })
      );

      assert.equal(dashboardResponse.status, 200);
      const dashboardPayload = await dashboardResponse.json();
      assert.deepEqual(dashboardPayload.runs.map((run) => run.id), ["run-hosted-child"]);

      const parentRunResponse = await runRoute.GET(
        new Request("http://localhost/api/runs/run-hosted-failed", {
          headers: {
            authorization: basicAuth("runtime-two", "secret"),
          },
        }),
        { params: Promise.resolve({ id: "run-hosted-failed" }) }
      );

      assert.equal(parentRunResponse.status, 404);
    }
  );
});

test("sensitive command output is redacted unless the viewer can view sensitive logs", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        { name: "runtime-a", token: "producer-token", scopes: [{ projectId: "project-a", environmentId: "prod" }] },
      ]),
      OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
        { username: "readonly", password: "secret", scopes: [{ projectId: "project-a", environmentId: "prod" }], canViewSensitiveLogs: false },
        { username: "operator", password: "secret", scopes: [{ projectId: "project-a", environmentId: "prod" }], canViewSensitiveLogs: true },
      ]),
    },
    async () => {
      await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: bearerAuth("producer-token"),
          },
          body: JSON.stringify(hostedFailedFixture),
        })
      );

      const readonlyResponse = await runRoute.GET(
        new Request("http://localhost/api/runs/run-hosted-failed", {
          headers: { authorization: basicAuth("readonly", "secret") },
        }),
        { params: Promise.resolve({ id: "run-hosted-failed" }) }
      );
      const readonlyPayload = await readonlyResponse.json();
      assert.equal(readonlyResponse.status, 200);
      assert.equal(readonlyPayload.commands[0].logSummaryVisible, false);
      assert.match(readonlyPayload.commands[0].logSummary, /requires sensitive-log access|Sensitive command output hidden/i);

      const operatorResponse = await runRoute.GET(
        new Request("http://localhost/api/runs/run-hosted-failed", {
          headers: { authorization: basicAuth("operator", "secret") },
        }),
        { params: Promise.resolve({ id: "run-hosted-failed" }) }
      );
      const operatorPayload = await operatorResponse.json();
      assert.equal(operatorResponse.status, 200);
      assert.equal(operatorPayload.commands[0].logSummaryVisible, true);
      assert.match(operatorPayload.commands[0].logSummary, /SECRET_TOKEN/);
    }
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { installAliasHooks, withTempObservabilityEnv, bearerAuth } from "./support/test-helpers.mjs";

installAliasHooks();

const telemetryRoute = await import("../src/app/api/telemetry/route.ts");
const observability = await import("../src/lib/observability.ts");

const fixture = JSON.parse(
  await readFile(path.join(process.cwd(), "tests", "fixtures", "telemetry", "hosted-failed-run.json"), "utf8")
);

test("authenticated runtimes can submit structured telemetry and command failures are projected", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        {
          name: "runtime-a",
          token: "producer-token",
          scopes: [{ projectId: "project-a", environmentId: "prod" }],
        },
      ]),
    },
    async () => {
      const response = await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: bearerAuth("producer-token"),
          },
          body: JSON.stringify(fixture),
        })
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.summary, {
        requestId: "req-hosted-failed-1",
        acceptedEvents: 2,
        dedupedEvents: 0,
        acceptedCommands: 1,
        dedupedCommands: 0,
        duplicateRequest: false,
      });

      const detail = await observability.getRunDetail("run-hosted-failed");
      assert.ok(detail);
      assert.equal(detail.run.projectId, "project-a");
      assert.equal(detail.run.environmentId, "prod");
      assert.equal(detail.run.runtimeId, "runtime-1");
      assert.equal(detail.run.sourceMode, "hosted");
      assert.equal(detail.commands.length, 1);
      assert.equal(detail.commands[0].status, "failed");
      assert.match(detail.commands[0].logSummary, /Sensitive command output hidden|SECRET_TOKEN/);
    }
  );
});

test("duplicate telemetry requests are deduplicated by request id", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        {
          name: "runtime-a",
          token: "producer-token",
          scopes: [{ projectId: "project-a", environmentId: "prod" }],
        },
      ]),
    },
    async () => {
      const request = () =>
        telemetryRoute.POST(
          new Request("http://localhost/api/telemetry", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: bearerAuth("producer-token"),
            },
            body: JSON.stringify(fixture),
          })
        );

      const first = await request();
      const second = await request();
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);

      const duplicatePayload = await second.json();
      assert.equal(duplicatePayload.summary.duplicateRequest, true);

      const detail = await observability.getRunDetail("run-hosted-failed");
      assert.equal(detail.commands.length, 1);
      assert.equal(detail.events.length, 2);
    }
  );
});

test("unauthenticated producers are rejected and nothing is stored", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        {
          name: "runtime-a",
          token: "producer-token",
          scopes: [{ projectId: "project-a", environmentId: "prod" }],
        },
      ]),
    },
    async () => {
      const response = await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(fixture),
        })
      );

      assert.equal(response.status, 401);
      const detail = await observability.getRunDetail("run-hosted-failed");
      assert.equal(detail, null);
    }
  );
});


test("telemetry payloads are rejected when nested run identifiers do not match the envelope run", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        {
          name: "runtime-a",
          token: "producer-token",
          scopes: [{ projectId: "project-a", environmentId: "prod" }],
        },
      ]),
    },
    async () => {
      const invalidFixture = {
        ...fixture,
        events: [{ ...fixture.events[0], runId: "run-someone-else" }],
      };
      const response = await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: bearerAuth("producer-token"),
          },
          body: JSON.stringify(invalidFixture),
        })
      );

      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.error, "Invalid telemetry payload");
      assert.deepEqual(payload.issues, [
        {
          path: "events.0.runId",
          message: "Event runId must match run.id.",
        },
      ]);
    }
  );
});

test("invalid telemetry payloads are rejected with validation errors", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
      OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
        {
          name: "runtime-a",
          token: "producer-token",
          scopes: [{ projectId: "project-a", environmentId: "prod" }],
        },
      ]),
    },
    async () => {
      const invalidFixture = { ...fixture, run: { ...fixture.run, status: "not-a-real-status" } };
      const response = await telemetryRoute.POST(
        new Request("http://localhost/api/telemetry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: bearerAuth("producer-token"),
          },
          body: JSON.stringify(invalidFixture),
        })
      );

      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.error, "Invalid telemetry payload");
    }
  );
});

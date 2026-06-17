import assert from "node:assert/strict";
import test from "node:test";
import { installAliasHooks, withTempObservabilityEnv } from "./support/test-helpers.mjs";

installAliasHooks();

const observability = await import("../src/lib/observability.ts");
const retention = await import("../src/lib/observability-retention.ts");

test("retention pruning removes expired observability records and keeps recent ones", async () => {
  await withTempObservabilityEnv(
    {
      OBSERVABILITY_RETENTION_DAYS: "7",
    },
    async () => {
      await observability.ingestTelemetry({
        requestId: "req-old",
        source: {
          projectId: "project-a",
          environmentId: "prod",
          runtimeId: "runtime-old",
          sourceMode: "hosted",
        },
        run: {
          id: "run-old",
          task: "Old run",
          status: "done",
          stage: "done",
          owner: "main",
          startedAt: "2026-01-01T10:00:00.000Z",
          updatedAt: "2026-01-01T10:05:00.000Z",
        },
        events: [
          {
            id: "evt-old",
            runId: "run-old",
            type: "run.completed",
            title: "Old run completed",
            stage: "done",
            status: "done",
            owner: "main",
            ts: "2026-01-01T10:05:00.000Z",
          },
        ],
        commands: [],
      });

      const recentTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await observability.ingestTelemetry({
        requestId: "req-recent",
        source: {
          projectId: "project-a",
          environmentId: "prod",
          runtimeId: "runtime-new",
          sourceMode: "hosted",
        },
        run: {
          id: "run-recent",
          task: "Recent run",
          status: "done",
          stage: "done",
          owner: "main",
          startedAt: recentTs,
          updatedAt: recentTs,
        },
        events: [
          {
            id: "evt-recent",
            runId: "run-recent",
            type: "run.completed",
            title: "Recent run completed",
            stage: "done",
            status: "done",
            owner: "main",
            ts: recentTs,
          },
        ],
        commands: [],
      });

      const summary = await retention.pruneObservabilityStore();
      assert.ok(summary);
      assert.equal(summary.retentionDays, 7);
      assert.ok(summary.deletedRuns >= 1);
      assert.ok(summary.deletedEvents >= 1);

      const oldDetail = await observability.getRunDetail("run-old");
      const recentDetail = await observability.getRunDetail("run-recent");
      assert.equal(oldDetail, null);
      assert.ok(recentDetail);
      assert.equal(recentDetail.run.id, "run-recent");
    }
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { installAliasHooks, withTempObservabilityEnv } from "./support/test-helpers.mjs";

installAliasHooks();

const observability = await import("../src/lib/observability.ts");
const route = await import("../src/app/api/runs/[id]/route.ts");

test("getRunDetail exposes failed command telemetry and state-specific investigation data on a run", async () => {
  const detail = await observability.getRunDetail("run_demo_polish");

  assert.ok(detail);
  assert.equal(detail.run.id, "run_demo_polish");
  assert.equal(detail.run.status, "failed");
  assert.equal(detail.investigation.kind, "failure-evidence");
  assert.equal(detail.systemStatus.sourceMode, "demo");
  assert.ok(Array.isArray(detail.commands));
  assert.equal(detail.commands.length, 1);
  assert.equal(detail.failedCommands.length, 1);

  const failedCommand = detail.commands[0];
  assert.equal(failedCommand.label, "npm run lint");
  assert.equal(failedCommand.status, "failed");
  assert.equal(failedCommand.exitCode, 1);
  assert.match(failedCommand.logSummary, /Lint failed/i);
});

test("run detail API returns command payload for failed inspection", async () => {
  const response = await route.GET(new Request("http://localhost/api/runs/run_demo_polish"), {
    params: Promise.resolve({ id: "run_demo_polish" }),
  });

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.run.id, "run_demo_polish");
  assert.equal(payload.investigation.kind, "failure-evidence");
  assert.ok(Array.isArray(payload.commands));
  assert.equal(payload.commands.length, 1);
  assert.deepEqual(
    payload.commands.map((command) => ({
      label: command.label,
      status: command.status,
      exitCode: command.exitCode,
    })),
    [{ label: "npm run lint", status: "failed", exitCode: 1 }]
  );
  assert.match(payload.commands[0].logSummary, /Lint failed/i);
});

test("hosted run detail lookups do not fall back to demo data", async () => {
  await withTempObservabilityEnv({}, async () => {
    const detail = await observability.getRunDetail("run_demo_polish");
    assert.equal(detail, null);
  });
});

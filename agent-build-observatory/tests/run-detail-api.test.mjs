import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: pathToFileURL(path.join(process.cwd(), "src", `${specifier.slice(2)}.ts`)).href,
      };
    }

    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }

    return nextResolve(specifier, context);
  },
});

const observability = await import("../src/lib/observability.ts");
const route = await import("../src/app/api/runs/[id]/route.ts");

test("getRunDetail exposes failed command telemetry on a run", async () => {
  const detail = await observability.getRunDetail("run_demo_polish");

  assert.ok(detail);
  assert.equal(detail.run.id, "run_demo_polish");
  assert.equal(detail.run.status, "failed");
  assert.ok(Array.isArray(detail.commands));
  assert.equal(detail.commands.length, 1);

  const failedCommand = detail.commands[0];
  assert.equal(failedCommand.label, "npm run lint");
  assert.equal(failedCommand.status, "failed");
  assert.equal(failedCommand.exitCode, 1);
  assert.match(failedCommand.logSummary, /Lint failed with 1 error/i);
});

test("run detail API returns command payload for failed inspection", async () => {
  const response = await route.GET(undefined, {
    params: Promise.resolve({ id: "run_demo_polish" }),
  });

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.run.id, "run_demo_polish");
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
  assert.match(payload.commands[0].logSummary, /Unexpected any/i);
});

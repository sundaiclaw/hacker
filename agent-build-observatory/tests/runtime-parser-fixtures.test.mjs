import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { installAliasHooks } from "./support/test-helpers.mjs";

installAliasHooks();

const runtimeModule = await import("../src/lib/openclaw-runtime.ts");

test("runtime adapter fixtures are parsed into hierarchy-aware runs and command telemetry", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "runtime-fixture-"));
  const fixtureHome = path.join(process.cwd(), "tests", "fixtures", "runtime", "home");
  const sessionsPath = path.join(tempDir, "home", ".openclaw", "agents", "agent-1", "sessions", "sessions.json");
  const previousHome = process.env.HOME;

  try {
    await cp(fixtureHome, path.join(tempDir, "home"), { recursive: true });
    const sessionsRaw = await readFile(sessionsPath, "utf8");
    await writeFile(sessionsPath, sessionsRaw.replaceAll("__ROOT__", process.cwd()), "utf8");
    process.env.HOME = path.join(tempDir, "home");

    const collection = await runtimeModule.collectOpenClawRuntime();
    assert.ok(collection);
    assert.equal(collection.runs.length, 2);

    const [childRun, rootRun] = collection.runs;
    assert.equal(childRun.run.parentRunId, "agent:main-run");
    assert.equal(childRun.run.status, "failed");
    assert.equal(childRun.commands.length, 1);
    assert.equal(childRun.commands[0].status, "failed");
    assert.match(childRun.commands[0].logSummary, /Smoke test failed/i);

    assert.equal(rootRun.run.id, "agent:main-run");
    assert.equal(rootRun.run.source, "runtime-adapter");
    assert.ok(collection.changedFiles.some((file) => file.endsWith("sessions.json")));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

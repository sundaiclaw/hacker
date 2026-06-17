import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
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

    return nextResolve(specifier, context);
  },
});

const configModule = await import("../src/lib/observability-config.ts");
const storageModule = await import("../src/lib/observability-db.ts");

test("initializeStorage creates the formal sqlite schema and migration record", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "observability-store-"));
  const sqlitePath = path.join(tempDir, "state", "observability.db");

  try {
    const config = configModule.resolveObservabilityStorageConfig({
      OBSERVABILITY_STORAGE_MODE: "sqlite",
      OBSERVABILITY_SQLITE_PATH: sqlitePath,
    });

    await storageModule.initializeStorage(config);
    await storageModule.initializeStorage(config);

    const db = new Database(sqlitePath, { readonly: true });
    const tableNames = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('schema_migrations', 'events', 'runs', 'commands')
         ORDER BY name`
      )
      .all()
      .map((row) => row.name);
    const migrationRow = db
      .prepare(`SELECT version FROM schema_migrations WHERE version = ?`)
      .get(storageModule.getObservabilitySchemaVersion());
    const migrationCount = db.prepare(`SELECT COUNT(*) AS count FROM schema_migrations`).get();

    assert.deepEqual(tableNames, ["commands", "events", "runs", "schema_migrations"]);
    assert.deepEqual(migrationRow, { version: storageModule.getObservabilitySchemaVersion() });
    assert.deepEqual(migrationCount, { count: 1 });

    db.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

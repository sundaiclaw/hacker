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

    return nextResolve(specifier, context);
  },
});

const configModule = await import("../src/lib/observability-config.ts");

test("auto mode falls back to sqlite with the default local path", () => {
  const config = configModule.resolveObservabilityStorageConfig({});

  assert.equal(config.driver, "sqlite");
  assert.equal(config.mode, "auto");
  assert.equal(
    config.sqlitePath,
    path.join(process.cwd(), "data", "observability", "observability.db")
  );
});

test("auto mode prefers postgres when DATABASE_URL is present", () => {
  const config = configModule.resolveObservabilityStorageConfig({
    DATABASE_URL: "postgres://postgres:secret@db.example.test:5432/observatory",
  });

  assert.equal(config.driver, "postgres");
  assert.equal(config.mode, "auto");
  assert.equal(config.databaseUrl, "postgres://postgres:secret@db.example.test:5432/observatory");
});

test("explicit postgres mode requires DATABASE_URL", () => {
  assert.throws(
    () => configModule.resolveObservabilityStorageConfig({ OBSERVABILITY_STORAGE_MODE: "postgres" }),
    /requires DATABASE_URL/i
  );
});

test("explicit sqlite mode respects OBSERVABILITY_SQLITE_PATH", () => {
  const config = configModule.resolveObservabilityStorageConfig({
    OBSERVABILITY_STORAGE_MODE: "sqlite",
    OBSERVABILITY_SQLITE_PATH: "./tmp/custom-observability.db",
  });

  assert.equal(config.driver, "sqlite");
  assert.equal(config.mode, "sqlite");
  assert.equal(config.sqlitePath, path.resolve("./tmp/custom-observability.db"));
});

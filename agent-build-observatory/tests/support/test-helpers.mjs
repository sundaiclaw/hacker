import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

let hooksInstalled = false;

export function installAliasHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

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
}

export async function withTempObservabilityEnv(overrides, run) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "observability-test-"));
  const previous = new Map();
  const env = {
    OBSERVABILITY_STORAGE_MODE: "sqlite",
    OBSERVABILITY_SOURCE_MODE: "hosted",
    OBSERVABILITY_SQLITE_PATH: path.join(tempDir, "observability.db"),
    OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: "[]",
    OBSERVABILITY_VIEWER_CREDENTIALS_JSON: "[]",
    OBSERVABILITY_REQUIRE_VIEWER_AUTH: "false",
    OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "false",
    OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS: "false",
    OBSERVABILITY_ALLOW_LOCAL_PRODUCER_BYPASS: "false",
    ...overrides,
  };

  try {
    for (const [key, value] of Object.entries(env)) {
      previous.set(key, process.env[key]);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetObservabilityGlobals();
    return await run({ tempDir, env });
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetObservabilityGlobals();
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function resetObservabilityGlobals() {
  globalThis.__observabilityDb__?.db?.close?.();
  delete globalThis.__observabilityDb__;
  delete globalThis.__observabilityPgPool__;
  delete globalThis.__observabilityStoreBootstrap__;
}

export function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function bearerAuth(token) {
  return `Bearer ${token}`;
}

import { spawn, spawnSync } from "node:child_process";
import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const host = "127.0.0.1";
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
const workflowDir = path.join(repoRoot, ".workflow", "productionize-observatory-platform");
const sqlitePath = path.join(workflowDir, "playwright-observability.db");
const standaloneDir = path.join(repoRoot, ".next", "standalone");
const playwrightArgs = process.argv.slice(2);
const sharedEnv = {
  ...process.env,
  PLAYWRIGHT_BASE_URL: baseURL,
  OBSERVABILITY_SOURCE_MODE: "hosted",
  OBSERVABILITY_STORAGE_MODE: "sqlite",
  OBSERVABILITY_SQLITE_PATH: sqlitePath,
  OBSERVABILITY_REQUIRE_VIEWER_AUTH: "true",
  OBSERVABILITY_REQUIRE_PRODUCER_AUTH: "true",
  OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS: "false",
  OBSERVABILITY_ALLOW_LOCAL_PRODUCER_BYPASS: "false",
  OBSERVABILITY_PRODUCER_CREDENTIALS_JSON: JSON.stringify([
    {
      name: "browser-runtime",
      token: "browser-producer-token",
      scopes: [{ projectId: "project-browser", environmentId: "prod" }],
    },
  ]),
  OBSERVABILITY_VIEWER_CREDENTIALS_JSON: JSON.stringify([
    {
      username: "ops-viewer",
      password: "ops-viewer-pass",
      scopes: [{ projectId: "project-browser", environmentId: "prod" }],
      canViewSensitiveLogs: false,
    },
    {
      username: "ops-admin",
      password: "ops-admin-pass",
      scopes: [{ projectId: "project-browser", environmentId: "prod" }],
      canViewSensitiveLogs: true,
    },
  ]),
};

await mkdir(workflowDir, { recursive: true });
spawnSync("bash", ["-lc", `fuser -k ${port}/tcp 2>/dev/null || true`], { cwd: repoRoot, stdio: "ignore" });
const buildResult = spawnSync(
  "bash",
  ["-lc", `rm -rf .next && rm -f '${sqlitePath}' '${sqlitePath}-shm' '${sqlitePath}-wal' && npm run build`],
  { cwd: repoRoot, env: sharedEnv, stdio: "inherit" }
);

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

await prepareStandaloneAssets();

const server = spawn("node", [path.join(".next", "standalone", "server.js")], {
  cwd: repoRoot,
  env: {
    ...sharedEnv,
    HOSTNAME: host,
    PORT: port,
  },
  stdio: ["ignore", "inherit", "inherit"],
});

let serverExited = false;
server.on("exit", () => {
  serverExited = true;
});

try {
  await waitForHealth(`${baseURL}/api/telemetry/health`, 120_000, () => serverExited);
  await warmViewerRoutes(baseURL);

  const testExitCode = await new Promise((resolve, reject) => {
    const child = spawn("npx", ["playwright", "test", "--config", "playwright.browser.config.ts", ...playwrightArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseURL,
      },
      stdio: "inherit",
    });

    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });

  if (testExitCode !== 0) {
    process.exitCode = testExitCode;
  }
} finally {
  await stopProcess(server);
}

async function prepareStandaloneAssets() {
  const standaloneStaticDir = path.join(standaloneDir, ".next", "static");
  const standalonePublicDir = path.join(standaloneDir, "public");

  await rm(standaloneStaticDir, { recursive: true, force: true });
  await cp(path.join(repoRoot, ".next", "static"), standaloneStaticDir, { recursive: true });

  await rm(standalonePublicDir, { recursive: true, force: true });
  await copyIfExists(path.join(repoRoot, "public"), standalonePublicDir);
}

async function copyIfExists(source, target) {
  try {
    await access(source);
  } catch {
    return;
  }

  await cp(source, target, { recursive: true });
}

async function waitForHealth(url, timeoutMs, exited) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (exited()) {
      throw new Error("Browser test server exited before becoming ready.");
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for browser test server readiness at ${url}.`);
}

async function warmViewerRoutes(nextBaseURL) {
  const authorization = `Basic ${Buffer.from("ops-viewer:ops-viewer-pass", "utf8").toString("base64")}`;
  const viewerCookie = `observability_viewer_credentials=${encodeURIComponent(Buffer.from("ops-viewer:ops-viewer-pass", "utf8").toString("base64"))}`;

  await Promise.allSettled([
    fetch(`${nextBaseURL}/api/dashboard`, { headers: { authorization } }),
    fetch(`${nextBaseURL}/`, { headers: { cookie: viewerCookie } }),
    fetch(`${nextBaseURL}/runs/warmup`, { headers: { cookie: viewerCookie } }),
  ]);
}

async function stopProcess(child) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(10_000),
  ]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

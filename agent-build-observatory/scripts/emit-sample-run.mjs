const baseUrl = process.argv[2] || "http://localhost:3000";
const runId = `run_demo_${Date.now()}`;

const events = [
  {
    runId,
    type: "run.started",
    title: "Started sample observability run",
    meta: "task=Demonstrate live event ingestion",
    stage: "plan",
    status: "planning",
    owner: "main",
    source: "script",
  },
  {
    runId,
    type: "files.changed",
    title: "Updated dashboard and APIs",
    meta: "src/app/page.tsx, src/lib/observability.ts",
    stage: "build",
    status: "building",
    owner: "main",
    source: "script",
  },
  {
    runId,
    type: "build.completed",
    title: "Build passed",
    meta: "npm run build",
    stage: "verify",
    status: "verifying",
    owner: "main",
    source: "script",
  },
  {
    runId,
    type: "deploy.started",
    title: "Deploy started",
    meta: "target=Cloud Run",
    stage: "deploy",
    status: "deploying",
    owner: "main",
    source: "script",
  },
  {
    runId,
    type: "deploy.completed",
    title: "Deploy completed",
    meta: "url=https://example.run.app",
    stage: "deploy",
    status: "done",
    owner: "main",
    source: "script",
  },
];

for (const event of events) {
  const response = await fetch(`${baseUrl}/api/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  const payload = await response.json();
  console.log(payload);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

console.log(`Emitted sample run: ${runId}`);

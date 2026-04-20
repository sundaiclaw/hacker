import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractViewerCredentials } from "@/lib/observability-auth-shared";

export async function proxy(request: NextRequest) {
  const viewerAuthRequired = resolveBoolean(
    process.env.OBSERVABILITY_REQUIRE_VIEWER_AUTH,
    resolveDefaultViewerAuthRequirement(process.env.OBSERVABILITY_SOURCE_MODE, process.env.DATABASE_URL)
  );

  if (!viewerAuthRequired) {
    return NextResponse.next();
  }

  const viewers = parseViewerCredentials(process.env.OBSERVABILITY_VIEWER_CREDENTIALS_JSON);
  const credentials = extractViewerCredentials(request.headers);

  if (credentials && viewers.some((viewer) => viewer.username === credentials.username && viewer.password === credentials.password)) {
    return NextResponse.next();
  }

  if (resolveBoolean(process.env.OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS, false)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Viewer authentication failed.", code: "viewer_auth_required" },
      {
        status: 401,
        headers: viewerChallengeHeaders(),
      }
    );
  }

  return new NextResponse(renderUnauthorizedHtml(), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export const config = {
  matcher: ["/", "/admin/:path*", "/runs/:path*", "/api/dashboard", "/api/runs/:path*", "/api/stream"],
};

function resolveBoolean(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function resolveDefaultViewerAuthRequirement(sourceMode: string | undefined, databaseUrl: string | undefined) {
  const normalizedSourceMode = sourceMode?.trim() || "auto";

  if (normalizedSourceMode === "hosted") {
    return true;
  }

  if (normalizedSourceMode === "demo" || normalizedSourceMode === "runtime-adapter") {
    return false;
  }

  return Boolean(databaseUrl?.trim());
}

function parseViewerCredentials(raw: string | undefined) {
  if (!raw?.trim()) return [] as Array<{ username: string; password: string }>;

  try {
    const parsed = JSON.parse(raw) as Array<{ username?: string; password?: string }>;
    return parsed.filter((entry): entry is { username: string; password: string } => Boolean(entry.username && entry.password));
  } catch {
    return [] as Array<{ username: string; password: string }>;
  }
}

function viewerChallengeHeaders() {
  return {
    "WWW-Authenticate": 'Basic realm="Build Observatory"',
  };
}

function renderUnauthorizedHtml() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Viewer access required</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, sans-serif;
        background: #050a12;
        color: #ecf2ff;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 24%), linear-gradient(180deg, #08101b 0%, #050a12 45%, #04070d 100%);
      }
      main {
        width: min(640px, calc(100vw - 2rem));
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 24px;
        background: rgba(12, 20, 34, 0.94);
        box-shadow: 0 24px 90px rgba(2,6,23,0.46);
        padding: 28px;
      }
      p.eyebrow {
        margin: 0;
        color: rgba(186, 230, 253, 0.8);
        font-size: 11px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 0;
        font-size: 2rem;
      }
      p.copy {
        margin: 16px 0 0;
        color: rgba(203, 213, 225, 0.82);
        line-height: 1.7;
      }
      code {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        color: #bae6fd;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Authorization required</p>
      <h1>Viewer access required</h1>
      <p class="copy">This observability view is protected. Provide valid viewer credentials for this scope, then reload the page. API requests return a <code>viewer_auth_required</code> error instead of an empty dataset.</p>
    </main>
  </body>
</html>`;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const viewerAuthRequired = resolveBoolean(
    process.env.OBSERVABILITY_REQUIRE_VIEWER_AUTH,
    resolveDefaultViewerAuthRequirement(process.env.OBSERVABILITY_SOURCE_MODE, process.env.DATABASE_URL)
  );

  if (!viewerAuthRequired) {
    return NextResponse.next();
  }

  const viewers = parseViewerCredentials(process.env.OBSERVABILITY_VIEWER_CREDENTIALS_JSON);
  const credentials = parseBasicAuth(request.headers.get("authorization"));

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

  return new NextResponse(null, {
    status: 401,
    headers: viewerChallengeHeaders(),
  });
}

export const config = {
  matcher: ["/", "/runs/:path*", "/api/dashboard", "/api/runs/:path*", "/api/stream"],
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

function parseBasicAuth(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, encoded] = authorizationHeader.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function viewerChallengeHeaders() {
  return {
    "WWW-Authenticate": 'Basic realm="Build Observatory"',
  };
}

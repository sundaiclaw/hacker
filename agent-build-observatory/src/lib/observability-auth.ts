import { timingSafeEqual } from "node:crypto";
import {
  resolveObservabilityRuntimeConfig,
  type ObservabilityProducerCredential,
  type ObservabilityRuntimeConfig,
  type ObservabilityScopeRule,
  type ObservabilityViewerCredential,
} from "@/lib/observability-config";
import { extractViewerCredentials } from "@/lib/observability-auth-shared";

export class ObservabilityHttpError extends Error {
  status: number;
  code: string;
  responseHeaders?: Record<string, string>;

  constructor(status: number, code: string, message: string, responseHeaders?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.responseHeaders = responseHeaders;
  }
}

export type ProducerAuthContext = {
  kind: "producer";
  subject: string;
  scopes: ObservabilityScopeRule[];
  bypass: boolean;
};

export type ViewerAuthContext = {
  kind: "viewer";
  subject: string;
  scopes: ObservabilityScopeRule[];
  canViewSensitiveLogs: boolean;
  bypass: boolean;
};

export async function authenticateProducerRequest(
  headers: Headers,
  runtimeConfig: ObservabilityRuntimeConfig = resolveObservabilityRuntimeConfig()
): Promise<ProducerAuthContext> {
  if (!runtimeConfig.requireProducerAuth && runtimeConfig.producers.length === 0) {
    return buildProducerBypassContext();
  }

  const token = parseBearerToken(headers.get("authorization"));
  const credential = token ? findProducerCredential(runtimeConfig.producers, token) : undefined;

  if (credential) {
    return {
      kind: "producer",
      subject: credential.name,
      scopes: credential.scopes,
      bypass: false,
    };
  }

  if (!runtimeConfig.requireProducerAuth && runtimeConfig.allowLocalProducerBypass) {
    return buildProducerBypassContext();
  }

  throw new ObservabilityHttpError(401, "producer_auth_required", "Telemetry producer authentication failed.");
}

export async function authenticateViewerRequest(
  headers: Headers,
  runtimeConfig: ObservabilityRuntimeConfig = resolveObservabilityRuntimeConfig()
): Promise<ViewerAuthContext> {
  if (!runtimeConfig.requireViewerAuth) {
    return buildViewerBypassContext();
  }

  const credentials = extractViewerCredentials(headers);
  const viewer = credentials
    ? findViewerCredential(runtimeConfig.viewers, credentials.username, credentials.password)
    : undefined;

  if (viewer) {
    return {
      kind: "viewer",
      subject: viewer.username,
      scopes: viewer.scopes,
      canViewSensitiveLogs: viewer.canViewSensitiveLogs,
      bypass: false,
    };
  }

  if (runtimeConfig.allowLocalViewerBypass) {
    return buildViewerBypassContext();
  }

  throw new ObservabilityHttpError(
    401,
    "viewer_auth_required",
    "Viewer authentication failed.",
    viewerAuthChallengeHeaders()
  );
}

export function viewerAuthChallengeHeaders(): Record<string, string> {
  return {
    "WWW-Authenticate": 'Basic realm="Build Observatory"',
  };
}

export function buildErrorHeaders(error: unknown): Record<string, string> | undefined {
  if (error instanceof ObservabilityHttpError && error.responseHeaders) {
    return error.responseHeaders;
  }

  return undefined;
}

function buildProducerBypassContext(): ProducerAuthContext {
  return {
    kind: "producer",
    subject: "local-bypass",
    scopes: [{ projectId: "*", environmentId: "*" }],
    bypass: true,
  };
}

function buildViewerBypassContext(): ViewerAuthContext {
  return {
    kind: "viewer",
    subject: "local-bypass",
    scopes: [{ projectId: "*", environmentId: "*" }],
    canViewSensitiveLogs: true,
    bypass: true,
  };
}

function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function findProducerCredential(credentials: ObservabilityProducerCredential[], token: string) {
  return credentials.find((credential) => secureEqual(credential.token, token));
}

function findViewerCredential(
  credentials: ObservabilityViewerCredential[],
  username: string,
  password: string
) {
  return credentials.find(
    (credential) => secureEqual(credential.username, username) && secureEqual(credential.password, password)
  );
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export const OBSERVABILITY_VIEWER_COOKIE = "observability_viewer_credentials";

export type ParsedViewerCredentials = {
  username: string;
  password: string;
};

export function extractViewerCredentials(headers: Pick<Headers, "get">): ParsedViewerCredentials | null {
  return parseBasicAuth(headers.get("authorization")) ?? parseViewerCookie(headers.get("cookie"));
}

export function parseBasicAuth(authorizationHeader: string | null): ParsedViewerCredentials | null {
  if (!authorizationHeader) return null;
  const [scheme, encoded] = authorizationHeader.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  return decodeCredentialPair(encoded);
}

export function parseViewerCookie(cookieHeader: string | null): ParsedViewerCredentials | null {
  const encoded = readCookie(cookieHeader, OBSERVABILITY_VIEWER_COOKIE);
  if (!encoded) {
    return null;
  }

  return decodeCredentialPair(encoded);
}

export function encodeViewerCookieValue(username: string, password: string) {
  return encodeURIComponent(encodeBase64(`${username}:${password}`));
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const chunk of cookieHeader.split(/;\s*/)) {
    const separator = chunk.indexOf("=");
    if (separator === -1) continue;
    const key = chunk.slice(0, separator);
    if (key !== name) continue;
    return decodeURIComponent(chunk.slice(separator + 1));
  }

  return null;
}

function decodeCredentialPair(encoded: string): ParsedViewerCredentials | null {
  try {
    const decoded = decodeBase64(encoded);
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

function decodeBase64(value: string) {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("utf8");
}

function encodeBase64(value: string) {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value, "utf8").toString("base64");
}

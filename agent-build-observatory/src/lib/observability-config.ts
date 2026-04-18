import path from "node:path";
import { z } from "zod";
import {
  observabilitySourceModeConfigSchema,
  type ObservabilitySourceMode,
  type ObservabilitySourceModeConfig,
} from "@/lib/observability-source";

export const observabilityStorageModeSchema = z.enum(["auto", "sqlite", "postgres"]);

export type ObservabilityStorageMode = z.infer<typeof observabilityStorageModeSchema>;

export type ObservabilityStorageConfig =
  | {
      mode: ObservabilityStorageMode;
      driver: "sqlite";
      sqlitePath: string;
    }
  | {
      mode: ObservabilityStorageMode;
      driver: "postgres";
      databaseUrl: string;
    };

export type ObservabilityScopeRule = {
  projectId: string;
  environmentId: string;
  runtimeId?: string;
};

export type ObservabilityProducerCredential = {
  name: string;
  token: string;
  scopes: ObservabilityScopeRule[];
};

export type ObservabilityViewerCredential = {
  username: string;
  password: string;
  scopes: ObservabilityScopeRule[];
  canViewSensitiveLogs: boolean;
};

export type ObservabilityRuntimeConfig = {
  storage: ObservabilityStorageConfig;
  sourceMode: ObservabilitySourceModeConfig;
  resolvedSourceMode: ObservabilitySourceMode;
  requireViewerAuth: boolean;
  requireProducerAuth: boolean;
  allowLocalViewerBypass: boolean;
  allowLocalProducerBypass: boolean;
  retentionDays: number | null;
  redactionPlaceholder: string;
  producers: ObservabilityProducerCredential[];
  viewers: ObservabilityViewerCredential[];
};

const scopeRuleSchema = z.object({
  projectId: z.string().trim().min(1).default("*"),
  environmentId: z.string().trim().min(1).default("*"),
  runtimeId: z.string().trim().min(1).optional(),
});

const legacyCredentialScopeSchema = z.object({
  projectIds: z.array(z.string().trim().min(1)).optional(),
  environmentIds: z.array(z.string().trim().min(1)).optional(),
});

const producerCredentialSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    token: z.string().trim().min(1),
    scopes: z.array(scopeRuleSchema).min(1).optional(),
  })
  .and(legacyCredentialScopeSchema)
  .transform((value) => ({
    name: value.name ?? "producer",
    token: value.token,
    scopes: value.scopes ?? expandLegacyScopes(value.projectIds, value.environmentIds),
  }));

const viewerCredentialSchema = z
  .object({
    username: z.string().trim().min(1),
    password: z.string().trim().min(1),
    canViewSensitiveLogs: z.boolean().optional(),
    scopes: z.array(scopeRuleSchema).min(1).optional(),
  })
  .and(legacyCredentialScopeSchema)
  .transform((value) => ({
    username: value.username,
    password: value.password,
    canViewSensitiveLogs: value.canViewSensitiveLogs ?? false,
    scopes: value.scopes ?? expandLegacyScopes(value.projectIds, value.environmentIds),
  }));

const producerCredentialsSchema = z.array(producerCredentialSchema).default([]);
const viewerCredentialsSchema = z.array(viewerCredentialSchema).default([]);

type ObservabilityEnv =
  | NodeJS.ProcessEnv
  | Partial<
      Record<
        | "DATABASE_URL"
        | "OBSERVABILITY_STORAGE_MODE"
        | "OBSERVABILITY_SQLITE_PATH"
        | "OBSERVABILITY_SOURCE_MODE"
        | "OBSERVABILITY_PRODUCER_CREDENTIALS_JSON"
        | "OBSERVABILITY_VIEWER_CREDENTIALS_JSON"
        | "OBSERVABILITY_REQUIRE_VIEWER_AUTH"
        | "OBSERVABILITY_REQUIRE_PRODUCER_AUTH"
        | "OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS"
        | "OBSERVABILITY_ALLOW_LOCAL_PRODUCER_BYPASS"
        | "OBSERVABILITY_RETENTION_DAYS"
        | "OBSERVABILITY_REDACTION_PLACEHOLDER",
        string | undefined
      >
    >;

export function resolveObservabilityStorageConfig(
  env: ObservabilityEnv = process.env
): ObservabilityStorageConfig {
  const mode = observabilityStorageModeSchema.parse(env.OBSERVABILITY_STORAGE_MODE ?? "auto");
  const sqlitePath = path.resolve(
    env.OBSERVABILITY_SQLITE_PATH ?? path.join(process.cwd(), "data", "observability", "observability.db")
  );

  if (mode === "sqlite") {
    return {
      mode,
      driver: "sqlite",
      sqlitePath,
    };
  }

  if (mode === "postgres") {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("OBSERVABILITY_STORAGE_MODE=postgres requires DATABASE_URL to be set.");
    }

    return {
      mode,
      driver: "postgres",
      databaseUrl,
    };
  }

  if (env.DATABASE_URL?.trim()) {
    return {
      mode,
      driver: "postgres",
      databaseUrl: env.DATABASE_URL.trim(),
    };
  }

  return {
    mode,
    driver: "sqlite",
    sqlitePath,
  };
}

export function resolveObservabilityRuntimeConfig(env: ObservabilityEnv = process.env): ObservabilityRuntimeConfig {
  const storage = resolveObservabilityStorageConfig(env);
  const sourceMode = observabilitySourceModeConfigSchema.parse(env.OBSERVABILITY_SOURCE_MODE ?? "auto");
  const resolvedSourceMode = resolveSourceMode(sourceMode, storage.driver);
  const producers = parseJsonConfig(
    env.OBSERVABILITY_PRODUCER_CREDENTIALS_JSON,
    producerCredentialsSchema,
    "OBSERVABILITY_PRODUCER_CREDENTIALS_JSON"
  );
  const viewers = parseJsonConfig(
    env.OBSERVABILITY_VIEWER_CREDENTIALS_JSON,
    viewerCredentialsSchema,
    "OBSERVABILITY_VIEWER_CREDENTIALS_JSON"
  );
  const requireViewerAuth = parseBoolean(
    env.OBSERVABILITY_REQUIRE_VIEWER_AUTH,
    resolvedSourceMode === "hosted"
  );
  const requireProducerAuth = parseBoolean(
    env.OBSERVABILITY_REQUIRE_PRODUCER_AUTH,
    resolvedSourceMode === "hosted" || producers.length > 0
  );

  return {
    storage,
    sourceMode,
    resolvedSourceMode,
    requireViewerAuth,
    requireProducerAuth,
    allowLocalViewerBypass: parseBoolean(env.OBSERVABILITY_ALLOW_LOCAL_VIEWER_BYPASS, false),
    allowLocalProducerBypass: parseBoolean(env.OBSERVABILITY_ALLOW_LOCAL_PRODUCER_BYPASS, false),
    retentionDays: parseOptionalPositiveInteger(env.OBSERVABILITY_RETENTION_DAYS),
    redactionPlaceholder: env.OBSERVABILITY_REDACTION_PLACEHOLDER?.trim() || "[Sensitive command output hidden]",
    producers,
    viewers,
  };
}

export function resolveSourceMode(
  mode: ObservabilitySourceModeConfig,
  storageDriver: ObservabilityStorageConfig["driver"]
): ObservabilitySourceMode {
  if (mode === "auto") {
    return storageDriver === "postgres" ? "hosted" : "runtime-adapter";
  }

  return mode;
}

export function formatObservabilityStorageTarget(config: ObservabilityStorageConfig) {
  if (config.driver === "sqlite") {
    return config.sqlitePath;
  }

  try {
    const url = new URL(config.databaseUrl);
    const credentials = url.username ? `${url.username}:***@` : "";
    const databaseName = url.pathname.replace(/^\//, "") || "(default)";
    return `${url.protocol}//${credentials}${url.hostname}:${url.port || "5432"}/${databaseName}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function parseJsonConfig<T>(raw: string | undefined, schema: z.ZodType<T>, envName: string): T {
  if (!raw?.trim()) {
    return schema.parse([]);
  }

  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid ${envName}: ${error.message}`);
    }

    throw new Error(`Invalid ${envName}.`);
  }
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseOptionalPositiveInteger(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("OBSERVABILITY_RETENTION_DAYS must be a positive integer when set.");
  }
  return value;
}

function expandLegacyScopes(projectIds?: string[], environmentIds?: string[]) {
  const normalizedProjects = projectIds?.length ? projectIds : ["*"];
  const normalizedEnvironments = environmentIds?.length ? environmentIds : ["*"];
  const scopes: ObservabilityScopeRule[] = [];

  for (const projectId of normalizedProjects) {
    for (const environmentId of normalizedEnvironments) {
      scopes.push({ projectId, environmentId });
    }
  }

  return scopes;
}

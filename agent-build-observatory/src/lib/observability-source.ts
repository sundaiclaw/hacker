import { z } from "zod";

export const observabilitySourceModeSchema = z.enum(["demo", "runtime-adapter", "hosted"]);
export const observabilitySourceModeConfigSchema = z.enum(["auto", "demo", "runtime-adapter", "hosted"]);

export const observabilitySourceIdentitySchema = z.object({
  projectId: z.string().trim().min(1),
  environmentId: z.string().trim().min(1),
  runtimeId: z.string().trim().min(1),
});

export type ObservabilitySourceMode = z.infer<typeof observabilitySourceModeSchema>;
export type ObservabilitySourceModeConfig = z.infer<typeof observabilitySourceModeConfigSchema>;
export type ObservabilitySourceIdentity = z.infer<typeof observabilitySourceIdentitySchema>;

export const demoSourceIdentity: ObservabilitySourceIdentity = {
  projectId: "demo-project",
  environmentId: "demo",
  runtimeId: "demo-runtime",
};

export const localRuntimeSourceIdentity: ObservabilitySourceIdentity = {
  projectId: "local-project",
  environmentId: "local",
  runtimeId: "local-runtime",
};

export function normalizeSourceIdentity(
  identity: Partial<ObservabilitySourceIdentity> | undefined,
  fallback: ObservabilitySourceIdentity
): ObservabilitySourceIdentity {
  return observabilitySourceIdentitySchema.parse({
    projectId: identity?.projectId ?? fallback.projectId,
    environmentId: identity?.environmentId ?? fallback.environmentId,
    runtimeId: identity?.runtimeId ?? fallback.runtimeId,
  });
}

export function normalizeSourceMode(value: string | undefined, fallback: ObservabilitySourceMode): ObservabilitySourceMode {
  if (!value) return fallback;

  if (value === "runtime") return "runtime-adapter";
  if (value === "live") return "hosted";

  const parsed = observabilitySourceModeSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function parseSourceModeFilter(value: string | undefined): ObservabilitySourceMode | null {
  if (!value) return null;

  if (value === "runtime") return "runtime-adapter";
  if (value === "live") return "hosted";

  const parsed = observabilitySourceModeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getSourceModeLabel(mode: ObservabilitySourceMode) {
  switch (mode) {
    case "demo":
      return "Demo replay";
    case "runtime-adapter":
      return "Runtime adapter";
    case "hosted":
      return "Hosted ingest";
    default:
      return mode;
  }
}

export function buildLegacySourceKey(mode: ObservabilitySourceMode, identity: ObservabilitySourceIdentity) {
  if (mode === "demo") {
    return "demo";
  }

  return `${mode}:${identity.projectId}:${identity.environmentId}:${identity.runtimeId}`;
}

export function buildScopedRecordId(scopeKey: string, recordId: string) {
  return `${scopeKey}::${recordId}`;
}

export function isWildcardScopeValue(value: string | undefined) {
  return value === "*";
}

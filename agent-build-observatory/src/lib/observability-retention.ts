import { resolveObservabilityRuntimeConfig } from "@/lib/observability-config";
import { pruneExpiredObservabilityRecords } from "@/lib/observability-db";

export async function pruneObservabilityStore() {
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  if (!runtimeConfig.retentionDays) {
    return null;
  }

  return pruneExpiredObservabilityRecords(runtimeConfig.retentionDays);
}

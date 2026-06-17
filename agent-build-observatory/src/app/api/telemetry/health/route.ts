import { NextResponse } from "next/server";
import { resolveObservabilityRuntimeConfig } from "@/lib/observability-config";
import { getStorageContractSummary } from "@/lib/observability-db";

export async function GET() {
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  return NextResponse.json({
    ok: true,
    sourceMode: runtimeConfig.resolvedSourceMode,
    requireProducerAuth: runtimeConfig.requireProducerAuth,
    requireViewerAuth: runtimeConfig.requireViewerAuth,
    retentionDays: runtimeConfig.retentionDays,
    storage: getStorageContractSummary(runtimeConfig.storage),
  });
}

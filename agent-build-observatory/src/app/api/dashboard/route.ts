import { NextRequest, NextResponse } from "next/server";
import { authenticateViewerRequest, buildErrorHeaders, ObservabilityHttpError } from "@/lib/observability-auth";
import { getDashboardData } from "@/lib/observability";
import type { DashboardFilters } from "@/lib/observability-db";
import { parseSourceModeFilter } from "@/lib/observability-source";

export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateViewerRequest(request.headers);
    const filters = parseDashboardFilters(new URL(request.url).searchParams);
    const data = await getDashboardData({ filters, authContext });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ObservabilityHttpError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: buildErrorHeaders(error) }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const status = collectFilterValues(searchParams, "status");
  const stage = collectFilterValues(searchParams, "stage");
  const owner = collectFilterValues(searchParams, "owner");
  const source = collectFilterValues(searchParams, "source")
    .map((value) => parseSourceModeFilter(value))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    statuses: status.length > 0 ? status : undefined,
    stages: stage.length > 0 ? stage : undefined,
    owners: owner.length > 0 ? owner : undefined,
    sourceModes: source.length > 0 ? source : undefined,
  };
}

function collectFilterValues(searchParams: URLSearchParams, key: string) {
  return [...new Set(searchParams.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}

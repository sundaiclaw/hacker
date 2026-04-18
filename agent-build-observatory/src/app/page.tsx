import { headers } from "next/headers";
import { DashboardClient } from "@/components/dashboard-client";
import { authenticateViewerRequest } from "@/lib/observability-auth";
import { getDashboardData } from "@/lib/observability";
import type { DashboardFilters } from "@/lib/observability-db";
import { parseSourceModeFilter } from "@/lib/observability-source";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  const authContext = await authenticateViewerRequest(requestHeaders);
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams);
  const data = await getDashboardData({ filters, authContext });

  return (
    <DashboardClient
      initialData={data}
      initialFilters={{
        status: firstValue(resolvedSearchParams.status),
        stage: firstValue(resolvedSearchParams.stage),
        source: firstValue(resolvedSearchParams.source),
        owner: firstValue(resolvedSearchParams.owner),
      }}
    />
  );
}

function parseDashboardFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  const statuses = normalizeValues(searchParams.status);
  const stages = normalizeValues(searchParams.stage);
  const owners = normalizeValues(searchParams.owner);
  const sourceModes = normalizeValues(searchParams.source)
    .map((value) => parseSourceModeFilter(value))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    statuses: statuses.length > 0 ? statuses : undefined,
    stages: stages.length > 0 ? stages : undefined,
    owners: owners.length > 0 ? owners : undefined,
    sourceModes: sourceModes.length > 0 ? sourceModes : undefined,
  };
}

function normalizeValues(value: string | string[] | undefined) {
  if (!value) return [];
  return [...new Set((Array.isArray(value) ? value : [value]).flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean))];
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

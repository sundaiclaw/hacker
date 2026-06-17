import { headers } from "next/headers";
import Link from "next/link";
import { DashboardClient } from "@/components/dashboard-client";
import { EmptyState, SectionCard } from "@/components/console-ui";
import { authenticateViewerRequest, ObservabilityHttpError } from "@/lib/observability-auth";
import { getDashboardData } from "@/lib/observability";
import type { DashboardFilters } from "@/lib/observability-db";
import { parseSourceModeFilter } from "@/lib/observability-source";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await loadHomePage(searchParams);

  if (result.kind === "access-denied") {
    return <AccessDeniedState />;
  }

  return (
    <DashboardClient
      initialData={result.data}
      initialFilters={{
        status: firstValue(result.searchParams.status),
        stage: firstValue(result.searchParams.stage),
        source: firstValue(result.searchParams.source),
        owner: firstValue(result.searchParams.owner),
      }}
    />
  );
}

async function loadHomePage(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  try {
    const requestHeaders = await headers();
    const authContext = await authenticateViewerRequest(requestHeaders);
    const resolvedSearchParams = await searchParams;
    const filters = parseDashboardFilters(resolvedSearchParams);
    const data = await getDashboardData({ filters, authContext });

    return {
      kind: "ready" as const,
      data,
      searchParams: resolvedSearchParams,
    };
  } catch (error) {
    if (error instanceof ObservabilityHttpError) {
      return { kind: "access-denied" as const };
    }

    throw error;
  }
}

function AccessDeniedState() {
  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-[780px] px-4 py-16 sm:px-6 lg:px-8">
        <SectionCard
          eyebrow="Authorization required"
          title="Viewer access required"
          description="Hosted dashboard access is protected by viewer authentication."
        >
          <EmptyState
            title="Access denied"
            message="Provide viewer credentials for this observability scope, then reload the dashboard."
            tone="warning"
            action={<Link href="/api/telemetry/health" className="inline-flex items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/16">View telemetry health</Link>}
          />
        </SectionCard>
      </div>
    </main>
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

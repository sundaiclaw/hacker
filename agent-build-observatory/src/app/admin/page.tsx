import Link from "next/link";
import { headers } from "next/headers";
import { EmptyState, InfoPill, SectionCard } from "@/components/console-ui";
import { authenticateViewerRequest, ObservabilityHttpError } from "@/lib/observability-auth";
import { resolveObservabilityRuntimeConfig } from "@/lib/observability-config";
import { getStorageContractSummary } from "@/lib/observability-db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const result = await loadAdminPage();

  if (result.kind === "access-denied") {
    return (
      <main className="min-h-screen text-foreground">
        <div className="mx-auto max-w-[780px] px-4 py-16 sm:px-6 lg:px-8">
          <SectionCard
            eyebrow="Authorization required"
            title="Viewer access required"
            description="This admin surface is protected by the same viewer authentication used for the dashboard."
          >
            <EmptyState
              title="Access denied"
              message="Provide viewer credentials, then reload the admin page."
              tone="warning"
            />
          </SectionCard>
        </div>
      </main>
    );
  }

  const { runtimeConfig, storage } = result;

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-sky-200/65">Admin and integration</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">Admin and integration</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Telemetry contract, storage posture, and authentication settings live here so the main dashboard can stay focused on triage.
              </p>
            </div>
            <Link href="/" className="inline-flex items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/16">
              Back to dashboard
            </Link>
          </div>

          <SectionCard
            eyebrow="Service posture"
            title="Service posture"
            description="Hosted source mode, storage backend, and auth requirements for this deployment."
          >
            <div className="flex flex-wrap gap-2">
              <InfoPill tone="accent">{runtimeConfig.resolvedSourceMode}</InfoPill>
              <InfoPill tone="muted">storage {storage.driver}</InfoPill>
              <InfoPill tone="muted">producer auth {runtimeConfig.requireProducerAuth ? "required" : "optional"}</InfoPill>
              <InfoPill tone="muted">viewer auth {runtimeConfig.requireViewerAuth ? "required" : "optional"}</InfoPill>
              <InfoPill tone="muted">retention {runtimeConfig.retentionDays ?? "not set"}</InfoPill>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InfoBlock label="Storage target" value={storage.target} mono />
              <InfoBlock label="Schema version" value={String(storage.schemaVersion)} />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Telemetry contract"
            title="POST /api/telemetry"
            description="Hosted runtimes submit the canonical envelope to this route. /api/log remains available as a compatibility bridge for event-only publishers."
          >
            <pre className="overflow-x-auto rounded-[1.15rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-7 text-slate-300">{`POST /api/telemetry
Authorization: Bearer <producer-token>
Content-Type: application/json

{
  "requestId": "req_123",
  "source": {
    "projectId": "project-a",
    "environmentId": "prod",
    "runtimeId": "runtime-1",
    "sourceMode": "hosted"
  },
  "run": {
    "id": "run_123",
    "task": "Deploy release",
    "status": "deploying",
    "stage": "deploy",
    "owner": "main",
    "startedAt": "2026-04-18T12:00:00.000Z",
    "updatedAt": "2026-04-18T12:00:02.000Z"
  },
  "events": [],
  "commands": []
}`}</pre>
          </SectionCard>

          <SectionCard
            eyebrow="Health"
            title="Health endpoints"
            description="Use these endpoints for posture checks and contract verification during rollout."
          >
            <div className="space-y-3 text-sm text-slate-300">
              <InfoBlock label="Telemetry health" value="/api/telemetry/health" />
              <InfoBlock label="Dashboard JSON" value="/api/dashboard" />
              <InfoBlock label="Live stream" value="/api/stream" />
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}

async function loadAdminPage() {
  try {
    const requestHeaders = await headers();
    await authenticateViewerRequest(requestHeaders);
    const runtimeConfig = resolveObservabilityRuntimeConfig();
    const storage = getStorageContractSummary(runtimeConfig.storage);

    return {
      kind: "ready" as const,
      runtimeConfig,
      storage,
    };
  } catch (error) {
    if (error instanceof ObservabilityHttpError) {
      return { kind: "access-denied" as const };
    }

    throw error;
  }
}

function InfoBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-2 text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

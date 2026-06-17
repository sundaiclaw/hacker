import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  EmptyState,
  formatConsoleTime,
  formatRelativeWindow,
  InfoPill,
  SectionCard,
  StatusBadge,
  TimelineEventCard,
} from "@/components/console-ui";
import { authenticateViewerRequest, ObservabilityHttpError } from "@/lib/observability-auth";
import { getCommandAnchorId, getRunDetail } from "@/lib/observability";
import type { ObservatoryCommand } from "@/lib/observability-schema";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await loadRunDetailPage(params);

  if (result.kind === "access-denied") {
    return <AccessDeniedState />;
  }

  const { detail } = result;
  const primaryEvent = detail.investigation.latestEvent;
  const primaryFailedCommand = detail.investigation.failedCommand;

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className={actionLinkClass("secondary")}>
              Back to runs
            </Link>
            <div className="flex flex-wrap gap-2">
              {detail.parentRun ? (
                <Link href={`/runs/${detail.parentRun.id}`} className={actionLinkClass("secondary")}>
                  View parent
                </Link>
              ) : null}
              {detail.failedCommands.length > 0 ? (
                <Link href="#failed-commands" className={actionLinkClass("secondary")}>
                  Failed commands
                </Link>
              ) : null}
              <Link href="#run-lineage" className={actionLinkClass("secondary")}>
                Run lineage
              </Link>
            </div>
          </div>

          <header className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,35,0.96),rgba(10,16,28,0.98))] shadow-[0_24px_90px_rgba(2,6,23,0.46)]">
            <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[minmax(0,1.3fr)_360px]">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-sky-200/65">Run summary</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-[2.65rem]">{detail.run.task}</h1>
                <p className="mt-4 font-mono text-sm text-slate-300">{detail.run.id}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusBadge status={detail.run.status} />
                  <InfoPill tone="accent">{detail.run.sourceLabel}</InfoPill>
                  <InfoPill tone="muted">{detail.run.stage}</InfoPill>
                  <InfoPill tone="muted">{detail.run.owner}</InfoPill>
                  <InfoPill tone="muted">{detail.run.projectId}/{detail.run.environmentId}</InfoPill>
                  <InfoPill tone="muted">{detail.run.runtimeId}</InfoPill>
                </div>
                <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-400">
                  Review the current state, follow run lineage, and inspect failed commands directly from this page.
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(19,33,51,0.55),rgba(8,13,23,0.92))] p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Source context</p>
                <dl className="mt-5 space-y-4">
                  <MetaRow label="Source" value={detail.systemStatus.sourceLabel} />
                  <MetaRow label="Freshness" value={formatFreshness(detail.systemStatus.freshnessState)} />
                  <MetaRow label="Started" value={formatConsoleTime(detail.run.startedAt)} />
                  <MetaRow label="Last update" value={formatConsoleTime(detail.run.updatedAt)} />
                  <MetaRow label="Active window" value={formatRelativeWindow(detail.run.updatedAt)} />
                </dl>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/8 px-5 py-5 sm:grid-cols-2 sm:px-7 lg:grid-cols-4 xl:grid-cols-5">
              <MetricCard label="Events" value={String(detail.run.eventCount)} meta="Structured events attached to this run." />
              <MetricCard label="Commands" value={String(detail.commands.length)} meta="First-class command executions captured for this run." />
              <MetricCard label="Children" value={String(detail.childRuns.length)} meta="Linked sub-runs projected under this run." />
              <MetricCard
                label="Failed commands"
                value={String(detail.failedCommands.length)}
                meta={detail.failedCommands.length > 0 ? "Failed commands are promoted below." : "No failed commands were recorded."}
              />
              <MetricCard label="Status" value={detail.run.status} meta={`Current stage: ${detail.run.stage}`} />
            </div>
          </header>

          {detail.systemStatus.freshnessState === "stale" ? (
            <EmptyState
              title="Dataset is stale"
              message="This run has not received a recent successful update. Verify the runtime or ingestion path before assuming the run is idle."
              tone="warning"
            />
          ) : null}

          <SectionCard
            eyebrow={detail.investigation.kind === "failure-evidence" ? "Failure evidence" : detail.investigation.kind === "current-state" ? "Current state" : "Completion context"}
            title={detail.investigation.title}
            description={detail.investigation.description}
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="primary-investigation-section" className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                {primaryFailedCommand ? (
                  <InvestigationCommandCard command={primaryFailedCommand} />
                ) : primaryEvent ? (
                  <TimelineEventCard
                    eyebrow={primaryEvent.type}
                    title={primaryEvent.title}
                    meta={primaryEvent.meta}
                    timestamp={formatConsoleTime(primaryEvent.ts)}
                    status={primaryEvent.status}
                    stage={primaryEvent.stage}
                    owner={primaryEvent.owner}
                    runId={primaryEvent.runId}
                    sourceLabel={primaryEvent.sourceMode}
                  />
                ) : (
                  <EmptyState
                    title="No investigation evidence available"
                    message="This run does not have a failed command or recent event to promote yet. Review the timeline below for additional context."
                  />
                )}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-slate-500">Investigation actions</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link href={`/runs/${detail.run.id}`} className={actionLinkClass()}>
                    View run
                  </Link>
                  {detail.investigation.failedCommandAnchorId ? (
                    <Link href={`#${detail.investigation.failedCommandAnchorId}`} className={actionLinkClass("secondary")}>
                      View failed command
                    </Link>
                  ) : null}
                  {detail.parentRun ? (
                    <Link href={`/runs/${detail.parentRun.id}`} className={actionLinkClass("secondary")}>
                      View parent
                    </Link>
                  ) : null}
                </div>
                <div className="mt-5 space-y-3 text-sm leading-6 text-slate-400">
                  <p>Scope: {detail.run.projectId}/{detail.run.environmentId}</p>
                  <p>Source: {detail.systemStatus.sourceLabel}</p>
                  <p>Owner: {detail.run.owner}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Run lineage"
            title="Run lineage"
            description="Navigate parent and child runs before moving into secondary metadata or artifacts."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div id="run-lineage" data-testid="run-lineage-section" className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">Parent run</p>
                {detail.parentRun ? (
                  <LineageCard run={detail.parentRun} actionLabel="View parent" />
                ) : detail.run.parentRunId ? (
                  <EmptyState
                    title="Parent run unavailable"
                    message={`This run reports parent ${detail.run.parentRunId}, but that parent is not available in the current scope or dataset.`}
                    tone="warning"
                  />
                ) : (
                  <EmptyState
                    title="No parent run"
                    message="This run is a root run. A parent link will appear here when a delegated child run is opened."
                  />
                )}
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">Child runs</p>
                {detail.childRuns.length > 0 ? (
                  <div className="space-y-3">
                    {detail.childRuns.map((childRun) => (
                      <LineageCard key={childRun.id} run={childRun} actionLabel="View child" />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No child runs"
                    message="Delegated or sub-agent work will appear here once linked child runs are emitted for this parent."
                  />
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Failed commands"
            title="Failed commands"
            description="Failed commands stay promoted in-console so operators can inspect command text, timing, and output summaries without leaving the run."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div id="failed-commands" data-testid="failed-commands-section">
              {detail.failedCommands.length > 0 ? (
                <div className="space-y-4">
                  {detail.failedCommands.map((command) => (
                    <CommandCard key={command.id} command={command} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No failed commands"
                  message="This run does not currently have any failed command telemetry to inspect."
                />
              )}
            </div>
          </SectionCard>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
            <SectionCard
              eyebrow="Recent activity"
              title="Recent activity"
              description="Full chronological event history for this run."
              className="scroll-mt-6"
              contentClassName="px-5 py-5 sm:px-6"
            >
              {detail.events.length > 0 ? (
                <div className="space-y-4">
                  {detail.events.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      eyebrow={event.type}
                      title={event.title}
                      meta={event.meta}
                      timestamp={formatConsoleTime(event.ts)}
                      status={event.status}
                      stage={event.stage}
                      owner={event.owner}
                      runId={event.runId}
                      sourceLabel={event.sourceMode}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="No run events" message="No events were recorded for this run." />
              )}
            </SectionCard>

            <div className="space-y-6">
              <SectionCard
                eyebrow="Observed files"
                title="Observed files"
                description="File paths currently exposed through the observability surface for this app."
              >
                {detail.changedFiles.length > 0 ? (
                  <div className="max-h-[360px] space-y-3 overflow-auto pr-1 font-mono text-xs text-slate-300">
                    {detail.changedFiles.map((file) => (
                      <div key={file} className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-3 leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        {file}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Source unavailable"
                    message="Observed files are not currently available for this run or source mode."
                  />
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Run metadata"
                title="Run metadata"
                description="Secondary metadata stays below the main investigation path."
              >
                <div className="space-y-3 text-sm leading-6 text-slate-300">
                  <MetadataRow label="Run id" value={detail.run.id} mono />
                  <MetadataRow label="Scope" value={`${detail.run.projectId}/${detail.run.environmentId}`} />
                  <MetadataRow label="Runtime" value={detail.run.runtimeId} />
                  <MetadataRow label="Source" value={detail.systemStatus.sourceLabel} />
                  <MetadataRow label="Started" value={formatConsoleTime(detail.run.startedAt)} />
                  <MetadataRow label="Last update" value={formatConsoleTime(detail.run.updatedAt)} />
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

async function loadRunDetailPage(params: Promise<{ id: string }>) {
  try {
    const requestHeaders = await headers();
    const authContext = await authenticateViewerRequest(requestHeaders);
    const { id } = await params;
    const detail = await getRunDetail(id, { authContext });

    if (!detail) {
      notFound();
    }

    return {
      kind: "ready" as const,
      detail,
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
          description="This hosted run detail view requires valid viewer credentials."
        >
          <EmptyState
            title="Access denied"
            message="Provide viewer credentials for this observability scope, then reload the run detail page."
            tone="warning"
            action={<Link href="/" className={actionLinkClass()}>Back to dashboard</Link>}
          />
        </SectionCard>
      </div>
    </main>
  );
}

function InvestigationCommandCard({ command }: { command: ObservatoryCommand }) {
  return (
    <div className="rounded-[1.2rem] border border-rose-500/28 bg-rose-500/[0.06] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-rose-100/70">Failed command</p>
      <p className="mt-3 text-sm font-semibold text-rose-50">{command.label}</p>
      <p className="mt-2 font-mono text-xs leading-6 text-rose-100/85">{command.command}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge status={command.status} />
        {typeof command.exitCode === "number" ? <InfoPill tone="muted">exit {command.exitCode}</InfoPill> : null}
        {typeof command.durationMs === "number" ? <InfoPill tone="muted">{formatDuration(command.durationMs)}</InfoPill> : null}
        {command.cwd ? <InfoPill tone="muted">{command.cwd}</InfoPill> : null}
      </div>
      {command.logSummaryVisible ? (
        <p className="mt-4 text-xs leading-5 text-rose-100/80">
          Captured output summary is available in the failed commands section below.
        </p>
      ) : command.sensitive && !command.logSummaryVisible ? (
        <p className="mt-4 text-xs leading-5 text-rose-100/80">
          Sensitive output is redacted for this viewer. Use the failed commands section below for the explicit redaction state.
        </p>
      ) : null}
      <div className="mt-4">
        <Link href={`#${getCommandAnchorId(command.id)}`} className={actionLinkClass("secondary")}>
          Jump to failed command
        </Link>
      </div>
    </div>
  );
}

function LineageCard({ run, actionLabel }: { run: { id: string; task: string; status: string; stage: string; sourceLabel: string }; actionLabel: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{run.task}</p>
          <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <InfoPill tone="muted">{run.stage}</InfoPill>
        <InfoPill tone="accent">{run.sourceLabel}</InfoPill>
      </div>
      <div className="mt-4">
        <Link href={`/runs/${run.id}`} className={actionLinkClass()}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function CommandCard({ command }: { command: ObservatoryCommand }) {
  return (
    <article
      id={getCommandAnchorId(command.id)}
      className={
        command.status === "failed"
          ? "rounded-[1.2rem] border border-rose-500/28 bg-rose-500/[0.05] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      }
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Command</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-white">{command.label}</p>
          <p className="mt-2 overflow-x-auto font-mono text-xs leading-6 text-slate-300">{command.command}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={command.status} />
            {command.cwd ? <InfoPill tone="muted">{command.cwd}</InfoPill> : null}
            {typeof command.exitCode === "number" ? <InfoPill tone="muted">exit {command.exitCode}</InfoPill> : null}
            {typeof command.durationMs === "number" ? <InfoPill tone="muted">{formatDuration(command.durationMs)}</InfoPill> : null}
            {command.sensitive ? <InfoPill tone="muted">sensitive</InfoPill> : null}
          </div>
        </div>
        <div className="shrink-0 space-y-2 text-right text-xs uppercase tracking-[0.22em] text-slate-500">
          <p>{formatConsoleTime(command.startedAt)}</p>
          <p>{command.endedAt ? `ended ${formatConsoleTime(command.endedAt)}` : "still running"}</p>
        </div>
      </div>
      {command.logSummary ? (
        <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-6 text-slate-300">
          {command.logSummary}
        </pre>
      ) : null}
      {command.sensitive && !command.logSummaryVisible ? (
        <p className="mt-3 text-xs leading-5 text-slate-400">Sensitive output is redacted for this viewer.</p>
      ) : null}
    </article>
  );
}

function MetricCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{meta}</p>
    </div>
  );
}

function MetadataRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-2 text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function formatFreshness(value: "live" | "reconnecting" | "stale") {
  if (value === "live") return "Live";
  if (value === "reconnecting") return "Reconnecting";
  return "Stale";
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60_000).toFixed(1)}m`;
}

function actionLinkClass(tone: "primary" | "secondary" = "primary") {
  return tone === "primary"
    ? "inline-flex items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/16"
    : "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100";
}

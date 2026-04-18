import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  EmptyState,
  formatConsoleTime,
  formatRelativeWindow,
  InfoPill,
  KeyMetric,
  SectionCard,
  StatusBadge,
  TimelineEventCard,
} from "@/components/console-ui";
import { authenticateViewerRequest } from "@/lib/observability-auth";
import { getRunDetail } from "@/lib/observability";
import type { ObservatoryCommand } from "@/lib/observability-schema";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const authContext = await authenticateViewerRequest(requestHeaders);
  const { id } = await params;
  const detail = await getRunDetail(id, { authContext });

  if (!detail) {
    notFound();
  }

  const latestEvent = detail.events[detail.events.length - 1];
  const failedCommands = detail.commands.filter((command) => command.status === "failed");

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-[1580px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
            >
              Back to console
            </Link>
            <div className="flex flex-wrap gap-2">
              <InfoPill tone="accent">{detail.run.sourceLabel}</InfoPill>
              <InfoPill tone="muted">{detail.run.owner}</InfoPill>
              <InfoPill tone="muted">{detail.run.stage}</InfoPill>
              <InfoPill tone="muted">{detail.run.projectId}/{detail.run.environmentId}</InfoPill>
            </div>
          </div>

          <header className="overflow-hidden rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,35,0.96),rgba(10,16,28,0.98))] shadow-[0_24px_90px_rgba(2,6,23,0.48)]">
            <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[minmax(0,1.3fr)_360px]">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-sky-200/65">Run detail</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-[2.7rem]">{detail.run.task}</h1>
                <p className="mt-4 max-w-3xl font-mono text-sm text-slate-300">{detail.run.id}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusBadge status={detail.run.status} />
                  <InfoPill tone="accent">{detail.run.sourceLabel}</InfoPill>
                  <InfoPill tone="muted">{detail.run.stage}</InfoPill>
                  <InfoPill tone="muted">{detail.run.owner}</InfoPill>
                  <InfoPill tone="muted">{detail.run.runtimeId}</InfoPill>
                  {detail.parentRun ? (
                    <Link href={`/runs/${detail.parentRun.id}`} className="inline-flex">
                      <InfoPill tone="muted">parent {detail.parentRun.id}</InfoPill>
                    </Link>
                  ) : (
                    <InfoPill tone="muted">root run</InfoPill>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(19,33,51,0.55),rgba(8,13,23,0.92))] p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Run posture</p>
                <dl className="mt-5 space-y-4">
                  <MetaRow label="Started" value={formatConsoleTime(detail.run.startedAt)} />
                  <MetaRow label="Last update" value={formatConsoleTime(detail.run.updatedAt)} />
                  <MetaRow label="Active window" value={formatRelativeWindow(detail.run.updatedAt)} />
                  <MetaRow label="Scope" value={`${detail.run.projectId}/${detail.run.environmentId}`} />
                </dl>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/8 px-5 py-5 sm:grid-cols-2 sm:px-7 lg:grid-cols-4 xl:grid-cols-5">
              <KeyMetric label="Events" value={String(detail.run.eventCount)} meta="Structured observations attached to this run." />
              <KeyMetric label="Commands" value={String(detail.commands.length)} meta="First-class command executions captured for this run." />
              <KeyMetric label="Children" value={String(detail.childRuns.length)} meta="Linked sub-runs projected under this run." />
              <KeyMetric
                label="Failed commands"
                value={String(failedCommands.length)}
                meta={failedCommands.length > 0 ? "Failed command logs are expanded below." : "No failed commands recorded."}
              />
              <KeyMetric label="Status" value={detail.run.status} meta={`Current stage: ${detail.run.stage} · Updated ${formatConsoleTime(detail.run.updatedAt)}`} />
            </div>
          </header>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.92fr)]">
            <div className="space-y-6">
              <SectionCard
                eyebrow="Commands"
                title="Execution trace"
                description="Shell-level command telemetry for this run, including cwd, timing, exit code, and protected-output inspection."
                contentClassName="px-5 py-5 sm:px-6 sm:py-6"
              >
                {detail.commands.length > 0 ? (
                  <div className="max-h-[920px] space-y-4 overflow-auto pr-1">
                    {detail.commands.map((command) => (
                      <CommandCard key={command.id} command={command} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-slate-400">No command telemetry recorded for this run.</p>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Timeline"
                title="Ordered event history"
                description="Full chronological replay for this run, preserving deterministic time ordering across events."
                contentClassName="px-5 py-5 sm:px-6 sm:py-6"
              >
                {detail.events.length > 0 ? (
                  <div className="max-h-[980px] space-y-4 overflow-auto pr-1">
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
                  <p className="text-sm leading-6 text-slate-400">No events recorded for this run.</p>
                )}
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                eyebrow="Run synopsis"
                title="Operational notes"
                description="Compressed summary of the current run state, source context, and hierarchy."
              >
                <div className="space-y-4">
                  <SynopsisRow label="Source" value={detail.run.sourceLabel} />
                  <SynopsisRow label="Scope" value={`${detail.run.projectId}/${detail.run.environmentId}`} />
                  <SynopsisRow label="Runtime" value={detail.run.runtimeId} />
                  <SynopsisRow label="Owner" value={detail.run.owner} />
                  <SynopsisRow label="Stage" value={detail.run.stage} />
                  <SynopsisRow label="Status" value={detail.run.status} />
                  <SynopsisRow label="Latest event" value={latestEvent ? latestEvent.title : "No events"} />
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Hierarchy"
                title="Parent and child runs"
                description="Trace sub-agent or delegated activity directly from the run detail page."
              >
                <div className="space-y-4">
                  {detail.parentRun ? (
                    <Link href={`/runs/${detail.parentRun.id}`} className="block rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-4 text-sm text-white hover:border-sky-400/30 hover:text-sky-100">
                      Parent run · {detail.parentRun.task}
                      <p className="mt-2 text-xs text-slate-400">{detail.parentRun.id}</p>
                    </Link>
                  ) : (
                    <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-4 text-sm text-slate-300">This is a root run.</div>
                  )}
                  {detail.childRuns.length > 0 ? (
                    <div className="space-y-3">
                      {detail.childRuns.map((child) => (
                        <Link key={child.id} href={`/runs/${child.id}`} className="block rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-4 hover:border-sky-400/30">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-white">{child.task}</p>
                              <p className="mt-2 text-xs text-slate-400">{child.id}</p>
                            </div>
                            <StatusBadge status={child.status} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No child runs projected"
                      message="Delegated or sub-agent activity will appear here once linked child runs are emitted for this parent."
                    />
                  )}
                </div>
              </SectionCard>

              {failedCommands.length > 0 ? (
                <SectionCard
                  eyebrow="Failures"
                  title="Failed command inspection"
                  description="Commands that exited unsuccessfully are promoted here with captured output summaries."
                >
                  <div className="space-y-4">
                    {failedCommands.map((command) => (
                      <CommandFailureCard key={command.id} command={command} />
                    ))}
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard
                eyebrow="Observed surfaces"
                title="Tracked files"
                description="Files currently included in the observability surface for this app."
              >
                {detail.changedFiles.length > 0 ? (
                  <div className="max-h-[360px] space-y-3 overflow-auto pr-1 font-mono text-xs text-slate-300">
                    {detail.changedFiles.map((file) => (
                      <div
                        key={file}
                        className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-3 leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No tracked files recorded"
                    message="File-change telemetry has not been attached to this run yet."
                  />
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      </div>
    </main>
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

function SynopsisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-white">{value}</p>
    </div>
  );
}

function CommandCard({ command }: { command: ObservatoryCommand }) {
  const isFailed = command.status === "failed";

  return (
    <div
      className={
        isFailed
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
    </div>
  );
}

function CommandFailureCard({ command }: { command: ObservatoryCommand }) {
  return (
    <div className="rounded-[1.15rem] border border-rose-500/28 bg-rose-500/[0.07] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-50">{command.label}</p>
          <p className="mt-2 font-mono text-xs leading-6 text-rose-100/85">{command.command}</p>
        </div>
        <StatusBadge status={command.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {command.cwd ? <InfoPill tone="muted">{command.cwd}</InfoPill> : null}
        {typeof command.exitCode === "number" ? <InfoPill tone="muted">exit {command.exitCode}</InfoPill> : null}
        {typeof command.durationMs === "number" ? <InfoPill tone="muted">{formatDuration(command.durationMs)}</InfoPill> : null}
        {command.sensitive ? <InfoPill tone="muted">sensitive</InfoPill> : null}
      </div>
      {command.logSummary ? (
        <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-rose-400/18 bg-[#12080d] px-4 py-4 text-xs leading-6 text-rose-50/90">
          {command.logSummary}
        </pre>
      ) : null}
      {command.sensitive && !command.logSummaryVisible ? (
        <p className="mt-3 text-xs leading-5 text-rose-100/80">Sensitive output is redacted for this viewer.</p>
      ) : null}
    </div>
  );
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60_000).toFixed(1)}m`;
}

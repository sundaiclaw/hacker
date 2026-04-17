import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatConsoleTime,
  formatRelativeWindow,
  InfoPill,
  KeyMetric,
  SectionCard,
  StatusBadge,
  TimelineEventCard,
} from "@/components/console-ui";
import { getRunDetail } from "@/lib/observability";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRunDetail(id);

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
              <InfoPill tone="accent">{detail.run.source}</InfoPill>
              <InfoPill tone="muted">{detail.run.owner}</InfoPill>
              <InfoPill tone="muted">{detail.run.stage}</InfoPill>
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
                  <InfoPill tone="accent">{detail.run.stage}</InfoPill>
                  <InfoPill tone="muted">{detail.run.owner}</InfoPill>
                  <InfoPill tone="muted">{detail.run.source}</InfoPill>
                  {detail.run.parentRunId ? <InfoPill tone="muted">parent {detail.run.parentRunId}</InfoPill> : null}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(19,33,51,0.55),rgba(8,13,23,0.92))] p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Run posture</p>
                <dl className="mt-5 space-y-4">
                  <MetaRow label="Started" value={formatConsoleTime(detail.run.startedAt)} />
                  <MetaRow label="Last update" value={formatConsoleTime(detail.run.updatedAt)} />
                  <MetaRow label="Active window" value={formatRelativeWindow(detail.run.updatedAt)} />
                  <MetaRow label="Event count" value={String(detail.run.eventCount)} />
                </dl>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/8 px-5 py-5 sm:grid-cols-2 sm:px-7 lg:grid-cols-4">
              <KeyMetric label="Events" value={String(detail.run.eventCount)} meta="Structured observations attached to this run." />
              <KeyMetric label="Commands" value={String(detail.commands.length)} meta="First-class command executions captured for this run." />
              <KeyMetric label="Started" value={formatConsoleTime(detail.run.startedAt)} meta={formatRelativeWindow(detail.run.startedAt)} />
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
                description="Shell-level command telemetry for this run, including cwd, timing, exit code, and failed-output inspection."
                contentClassName="px-5 py-5 sm:px-6 sm:py-6"
              >
                {detail.commands.length > 0 ? (
                  <div className="max-h-[920px] space-y-4 overflow-auto pr-1">
                    {detail.commands.map((command) => (
                      <CommandCard
                        key={command.id}
                        label={command.label}
                        command={command.command}
                        cwd={command.cwd}
                        status={command.status}
                        startedAt={command.startedAt}
                        endedAt={command.endedAt}
                        durationMs={command.durationMs}
                        exitCode={command.exitCode}
                        logSummary={command.logSummary}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-slate-400">No command telemetry recorded for this run.</p>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Timeline"
                title="Ordered event history"
                description="Full chronological replay for this run, preserving the existing event data while improving scannability."
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
                description="A compressed summary of the current run state and the latest observation."
              >
                <div className="space-y-4">
                  <SynopsisRow label="Source" value={detail.run.source} />
                  <SynopsisRow label="Owner" value={detail.run.owner} />
                  <SynopsisRow label="Stage" value={detail.run.stage} />
                  <SynopsisRow label="Status" value={detail.run.status} />
                  <SynopsisRow label="Parent" value={detail.run.parentRunId ?? "Root run"} />
                  <SynopsisRow label="Commands" value={`${detail.commands.length} recorded · ${failedCommands.length} failed`} />
                  <SynopsisRow label="Latest event" value={latestEvent ? latestEvent.title : "No events"} />
                </div>
              </SectionCard>

              {failedCommands.length > 0 ? (
                <SectionCard
                  eyebrow="Failures"
                  title="Failed command inspection"
                  description="Commands that exited unsuccessfully are promoted here with their captured output."
                >
                  <div className="space-y-4">
                    {failedCommands.map((command) => (
                      <div
                        key={command.id}
                        className="rounded-[1.15rem] border border-rose-500/28 bg-rose-500/[0.07] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      >
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
                        </div>
                        {command.logSummary ? (
                          <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-rose-400/18 bg-[#12080d] px-4 py-4 text-xs leading-6 text-rose-50/90">
                            {command.logSummary}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard
                eyebrow="Observed surfaces"
                title="Tracked files"
                description="Files currently included in the observability surface for this app."
              >
                <div className="max-h-[360px] space-y-3 overflow-auto pr-1 font-mono text-xs text-slate-300">
                  {detail.changedFiles.map((file: string) => (
                    <div
                      key={file}
                      className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-3 leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    >
                      {file}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Emit example"
                title="Append another event"
                description="The ingestion shape is unchanged. This page now presents the example in the same operator-console system."
              >
                <pre className="overflow-x-auto rounded-[1.15rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-7 text-slate-300">{`curl -X POST /api/log
{
  "runId": "${detail.run.id}",
  "type": "command.completed",
  "title": "npm run build finished",
  "meta": "exitCode=0 durationMs=24112",
  "stage": "verify",
  "status": "done",
  "owner": "main"
}`}</pre>
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

function CommandCard({
  label,
  command,
  cwd,
  status,
  startedAt,
  endedAt,
  durationMs,
  exitCode,
  logSummary,
}: {
  label: string;
  command: string;
  cwd?: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  exitCode?: number;
  logSummary?: string;
}) {
  const isFailed = status === "failed";

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
          <p className="mt-2 text-sm font-semibold leading-6 text-white">{label}</p>
          <p className="mt-2 overflow-x-auto font-mono text-xs leading-6 text-slate-300">{command}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={status} />
            {cwd ? <InfoPill tone="muted">{cwd}</InfoPill> : null}
            {typeof exitCode === "number" ? <InfoPill tone="muted">exit {exitCode}</InfoPill> : null}
            {typeof durationMs === "number" ? <InfoPill tone="muted">{formatDuration(durationMs)}</InfoPill> : null}
          </div>
        </div>
        <div className="shrink-0 space-y-2 text-right text-xs uppercase tracking-[0.22em] text-slate-500">
          <p>{formatConsoleTime(startedAt)}</p>
          <p>{endedAt ? `ended ${formatConsoleTime(endedAt)}` : "still running"}</p>
        </div>
      </div>
      {logSummary ? (
        <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-6 text-slate-300">
          {logSummary}
        </pre>
      ) : null}
    </div>
  );
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60_000).toFixed(1)}m`;
}

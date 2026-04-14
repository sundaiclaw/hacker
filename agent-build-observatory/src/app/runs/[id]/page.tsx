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
              <KeyMetric label="Started" value={formatConsoleTime(detail.run.startedAt)} meta={formatRelativeWindow(detail.run.startedAt)} />
              <KeyMetric label="Updated" value={formatConsoleTime(detail.run.updatedAt)} meta={formatRelativeWindow(detail.run.updatedAt)} />
              <KeyMetric label="Status" value={detail.run.status} meta={`Current stage: ${detail.run.stage}`} />
            </div>
          </header>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.92fr)]">
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
                  <SynopsisRow label="Latest event" value={latestEvent ? latestEvent.title : "No events"} />
                </div>
              </SectionCard>

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

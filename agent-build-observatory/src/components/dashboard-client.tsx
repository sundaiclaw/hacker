"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  formatConsoleTime,
  formatRelativeWindow,
  InfoPill,
  KeyMetric,
  SectionCard,
  StatusBadge,
  TimelineEventCard,
} from "@/components/console-ui";

type DashboardData = {
  runs: Array<{
    id: string;
    source: string;
    parentRunId?: string;
    task: string;
    status: string;
    stage: string;
    owner: string;
    startedAt: string;
    updatedAt: string;
    eventCount: number;
  }>;
  events: Array<{
    id: string;
    ts: string;
    runId: string;
    type: string;
    title: string;
    meta?: string;
    stage?: string;
    status?: string;
    owner?: string;
  }>;
  changedFiles: string[];
  summary: {
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
  };
  source?: string;
  storage?: string;
};

const navItems = [
  { label: "Overview", value: "Live board", href: "#overview" },
  { label: "Runs", value: "Inventory", href: "#runs" },
  { label: "Timeline", value: "Event stream", href: "#timeline" },
  { label: "Failures", value: "Escalations", href: "#failures" },
  { label: "Artifacts", value: "Watch surfaces", href: "#artifacts" },
];

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchLatest = async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as DashboardData;
        if (!cancelled) {
          setData(next);
        }
      } catch {
        // Ignore transient fetch errors; the next poll or SSE frame can recover.
      }
    };

    const connect = () => {
      if (cancelled) return;
      sourceRef.current?.close();
      const source = new EventSource("/api/stream");
      sourceRef.current = source;

      source.onmessage = (event) => {
        try {
          setData(JSON.parse(event.data) as DashboardData);
        } catch {
          // Ignore malformed events and keep the last valid snapshot.
        }
      };

      source.onerror = () => {
        source.close();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    };

    connect();
    void fetchLatest();
    const pollTimer = setInterval(() => void fetchLatest(), 2000);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void fetchLatest();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", visibilityHandler);
      sourceRef.current?.close();
    };
  }, []);

  const latestRun = data.runs[0];
  const watchlist = data.runs.filter((run) => run.status === "failed" || run.status === "waiting").slice(0, 3);
  const sourceLabel = data.source === "demo" ? "Demo replay" : "Live ingest";
  const storageLabel = (data.storage ?? "sqlite").toUpperCase();
  const stats = [
    { label: "Tracked runs", value: String(data.summary.totalRuns), meta: "Total projected run records in the active feed." },
    { label: "In flight", value: String(data.summary.activeRuns), meta: "Runs that have not yet resolved to done or failed." },
    { label: "Completed", value: String(data.summary.completedRuns), meta: "Runs that reached a successful terminal state." },
    { label: "Failures", value: String(data.summary.failedRuns), meta: "Runs requiring review or intervention." },
  ];

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,31,0.96),rgba(7,12,21,0.98))] shadow-[0_24px_90px_rgba(2,6,23,0.5)]">
              <div className="border-b border-white/8 px-5 py-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-sky-200/65">Agent Ops</p>
                <h1 className="mt-3 text-[1.55rem] font-semibold tracking-[-0.04em] text-white">Build Observatory</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  A serious operational view of agent-driven work, run lineage, and verification state.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <InfoPill tone="accent">{sourceLabel}</InfoPill>
                  <InfoPill tone="muted">{storageLabel}</InfoPill>
                </div>
              </div>

              <div className="border-b border-white/8 px-3 py-3">
                <nav className="space-y-1.5">
                  {navItems.map((item, index) => (
                    <a
                      key={item.label}
                      href={item.href}
                      className={
                        index === 0
                          ? "block rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-sky-300/35 hover:bg-sky-400/14"
                          : "block rounded-2xl border border-transparent px-4 py-3 text-slate-400 transition hover:border-white/8 hover:bg-white/[0.03] hover:text-slate-200"
                      }
                    >
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{item.value}</p>
                    </a>
                  ))}
                </nav>
              </div>

              <div className="px-5 py-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Runtime posture</p>
                <dl className="mt-4 space-y-4 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Feed state</dt>
                    <dd className="text-right font-medium text-white">{sourceLabel}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Backend</dt>
                    <dd className="text-right font-medium text-white">{storageLabel}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Recent events</dt>
                    <dd className="text-right font-medium text-white">{data.events.length}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Most recent run</dt>
                    <dd className="text-right font-medium text-white">{latestRun ? formatRelativeWindow(latestRun.updatedAt) : "n/a"}</dd>
                  </div>
                </dl>
              </div>

              {watchlist.length > 0 ? (
                <div className="border-t border-white/8 bg-white/[0.02] px-5 py-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Attention board</p>
                  <div className="mt-4 space-y-3">
                    {watchlist.map((run) => (
                      <div key={run.id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{run.task}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">{run.id}</p>
                          </div>
                          <StatusBadge status={run.status} />
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">
                          Stage {run.stage} · Owner {run.owner} · Updated {formatRelativeWindow(run.updatedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
            <header id="overview" className="scroll-mt-6 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,35,0.96),rgba(10,16,28,0.98))] px-5 py-5 shadow-[0_24px_90px_rgba(2,6,23,0.46)] sm:px-6 sm:py-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-sky-200/65">Operator console</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-[2.6rem]">
                    Mission control for active software runs.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[0.98rem]">
                    Watch run progression, verify operational health, and inspect the latest execution trail without leaving the board.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <InfoPill tone="accent">{data.summary.activeRuns > 0 ? "Operations active" : "Stable idle state"}</InfoPill>
                  <InfoPill tone="muted">{data.events.length} events in frame</InfoPill>
                  <InfoPill tone="muted">{data.summary.failedRuns} flagged runs</InfoPill>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {stats.map((item) => (
                  <KeyMetric key={item.label} label={item.label} value={item.value} meta={item.meta} />
                ))}
              </div>
            </header>

            <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
              <div className="space-y-6">
                <SectionCard
                  eyebrow="Primary run"
                  title={latestRun ? latestRun.task : "No active run loaded"}
                  description={
                    latestRun
                      ? "The most recently updated run anchors the board and exposes current ownership, stage, and verification posture."
                      : "The observability feed has not projected any runs yet."
                  }
                  action={latestRun ? <StatusBadge status={latestRun.status} /> : null}
                >
                  {latestRun ? (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_340px]">
                      <div className="space-y-5">
                        <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.035] px-5 py-5">
                          <div className="flex flex-wrap gap-2">
                            <InfoPill tone="accent">{latestRun.stage}</InfoPill>
                            <InfoPill tone="muted">{latestRun.owner}</InfoPill>
                            <InfoPill tone="muted">{latestRun.source}</InfoPill>
                            {latestRun.parentRunId ? <InfoPill tone="muted">parent {latestRun.parentRunId}</InfoPill> : null}
                          </div>
                          <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Run identifier</p>
                          <p className="mt-2 font-mono text-sm text-slate-200">{latestRun.id}</p>
                          <div className="mt-5 grid gap-4 sm:grid-cols-3">
                            <MetricStack label="Event count" value={String(latestRun.eventCount)} meta="Structured observations attached to this run." />
                            <MetricStack label="Started" value={formatConsoleTime(latestRun.startedAt)} meta={formatRelativeWindow(latestRun.startedAt)} />
                            <MetricStack label="Last update" value={formatConsoleTime(latestRun.updatedAt)} meta={formatRelativeWindow(latestRun.updatedAt)} />
                          </div>
                        </div>
                      </div>

                      <div className="flex h-full flex-col justify-between rounded-[1.2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,31,49,0.62),rgba(8,14,23,0.92))] p-5">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Operational brief</p>
                          <dl className="mt-5 space-y-4">
                            <MetaRow label="Stage" value={latestRun.stage} />
                            <MetaRow label="Owner" value={latestRun.owner} />
                            <MetaRow label="Status" value={latestRun.status} />
                            <MetaRow label="Source" value={latestRun.source} />
                          </dl>
                        </div>
                        <Link
                          href={`/runs/${latestRun.id}`}
                          className="mt-6 inline-flex items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/16"
                        >
                          Open run detail
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-slate-400">No run data available from the current source.</p>
                  )}
                </SectionCard>

                <div id="runs" className="scroll-mt-6">
                  <SectionCard
                    eyebrow="Run inventory"
                    title="Execution queue and history"
                    description="A compact operational table of projected runs, ordered by their latest update."
                  >
                  {data.runs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[860px] w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-[10px] font-medium uppercase tracking-[0.3em] text-slate-500">
                            <th className="border-b border-white/8 px-4 pb-3 font-medium">Run</th>
                            <th className="border-b border-white/8 px-4 pb-3 font-medium">Stage</th>
                            <th className="border-b border-white/8 px-4 pb-3 font-medium">Status</th>
                            <th className="border-b border-white/8 px-4 pb-3 font-medium">Owner</th>
                            <th className="border-b border-white/8 px-4 pb-3 font-medium">Activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.runs.map((run, index) => (
                            <tr key={run.id} className="align-top">
                              <td className={`px-4 py-4 ${index !== data.runs.length - 1 ? "border-b border-white/6" : ""}`}>
                                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <Link
                                        href={`/runs/${run.id}`}
                                        className="block text-sm font-medium leading-6 text-white transition hover:text-sky-200"
                                      >
                                        {run.task}
                                      </Link>
                                      <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
                                    </div>
                                    {run.parentRunId ? <InfoPill tone="muted">parent</InfoPill> : null}
                                  </div>
                                </div>
                              </td>
                              <td className={`px-4 py-4 ${index !== data.runs.length - 1 ? "border-b border-white/6" : ""}`}>
                                <div className="space-y-2">
                                  <InfoPill tone="accent">{run.stage}</InfoPill>
                                  <p className="text-xs leading-5 text-slate-400">{run.parentRunId ? `Lineage ${run.parentRunId}` : "Root run"}</p>
                                </div>
                              </td>
                              <td className={`px-4 py-4 ${index !== data.runs.length - 1 ? "border-b border-white/6" : ""}`}>
                                <StatusBadge status={run.status} />
                              </td>
                              <td className={`px-4 py-4 text-sm text-slate-300 ${index !== data.runs.length - 1 ? "border-b border-white/6" : ""}`}>
                                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">{run.owner}</div>
                              </td>
                              <td className={`px-4 py-4 ${index !== data.runs.length - 1 ? "border-b border-white/6" : ""}`}>
                                <p className="text-sm font-medium text-white">{formatConsoleTime(run.updatedAt)}</p>
                                <p className="mt-2 text-xs leading-5 text-slate-400">
                                  {run.eventCount} events · {formatRelativeWindow(run.updatedAt)}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-slate-400">No runs projected into the dashboard yet.</p>
                  )}
                  </SectionCard>
                </div>
              </div>

              <div className="space-y-6">
                <div id="failures" className="scroll-mt-6"></div>
                <div id="timeline" className="scroll-mt-6">
                  <SectionCard
                    eyebrow="Event stream"
                    title="Latest operational timeline"
                    description="Recent events across the active source, styled as a live command trail."
                    contentClassName="px-5 py-5 sm:px-6 sm:py-6"
                  >
                  {data.events.length > 0 ? (
                    <div className="max-h-[780px] space-y-4 overflow-auto pr-1">
                      {data.events.map((event) => (
                        <TimelineEventCard
                          key={event.id}
                          eyebrow={event.type}
                          title={event.title}
                          meta={event.meta}
                          timestamp={formatConsoleTime(event.ts)}
                          runId={event.runId}
                          status={event.status}
                          stage={event.stage}
                          owner={event.owner}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-slate-400">No events available in the current stream.</p>
                  )}
                  </SectionCard>
                </div>

                <div id="artifacts" className="scroll-mt-6">
                  <SectionCard
                    eyebrow="Observed surfaces"
                    title="Tracked files"
                    description="Paths that are currently part of the observability and dashboard surface."
                  >
                  <div className="max-h-[360px] space-y-3 overflow-auto pr-1 font-mono text-xs text-slate-300">
                    {data.changedFiles.map((file) => (
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
                    eyebrow="Ingestion contract"
                    title="Emit structured events"
                    description="The existing event API stays intact. This panel now presents it in a cleaner operator-facing surface."
                  >
                    <pre className="overflow-x-auto rounded-[1.15rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-7 text-slate-300">{`POST /api/log
{
  "runId": "run_123",
  "type": "build.completed",
  "title": "Production build passed",
  "stage": "verify",
  "status": "done",
  "owner": "main"
}`}</pre>
                  </SectionCard>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MetricStack({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-[#08111b] px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-medium text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{meta}</p>
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

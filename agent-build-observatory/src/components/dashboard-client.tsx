"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { DashboardData, RunSummary } from "@/lib/observability";
import type { LiveMessage } from "@/lib/observability-live";

type FilterState = {
  status: string;
  stage: string;
  source: string;
  owner: string;
};

type StreamState = "connecting" | "live" | "reconnecting";

const navItems = [
  { label: "Overview", value: "Live board", href: "#overview" },
  { label: "Runs", value: "Inventory", href: "#runs" },
  { label: "Timeline", value: "Event stream", href: "#timeline" },
  { label: "Failures", value: "Escalations", href: "#failures" },
  { label: "Artifacts", value: "Watch surfaces", href: "#artifacts" },
];

const emptyFilters: FilterState = {
  status: "",
  stage: "",
  source: "",
  owner: "",
};

export function DashboardClient({
  initialData,
  initialFilters = emptyFilters,
}: {
  initialData: DashboardData;
  initialFilters?: FilterState;
}) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState(initialFilters);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(() => Date.now());
  const sourceRef = useRef<EventSource | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const queryString = useMemo(() => buildQueryString(filters), [filters]);
  const filterOptions = data.filters;
  const latestRun = data.runs[0];
  const watchlist = data.runs.filter((run) => run.status === "failed" || run.status === "waiting").slice(0, 4);
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const sourceLabel = data.sourceLabel;
  const storageLabel = (data.storage ?? "sqlite").toUpperCase();
  const connectionMeta = getConnectionMeta({ streamState, isRefreshing, apiError, activeFilterCount, lastSyncAt });
  const stats = [
    { label: "Tracked runs", value: String(data.summary.totalRuns), meta: "Total projected run records in the active feed." },
    { label: "In flight", value: String(data.summary.activeRuns), meta: "Runs that have not yet resolved to done or failed." },
    { label: "Completed", value: String(data.summary.completedRuns), meta: "Runs that reached a successful terminal state." },
    { label: "Failures", value: String(data.summary.failedRuns), meta: "Runs requiring review or intervention." },
  ];

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchLatest = async () => {
      if (cancelled) return;
      setIsRefreshing(true);
      try {
        const response = await fetch(`/api/dashboard${queryString}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setApiError(`Snapshot refresh returned ${response.status}. The board will keep retrying automatically.`);
          }
          return;
        }
        const next = (await response.json()) as DashboardData;
        if (!cancelled) {
          setData(next);
          setApiError(null);
          setLastSyncAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          setApiError("Snapshot refresh failed. The console will keep retrying and preserve the last good board.");
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    };

    const connect = () => {
      if (cancelled) return;
      setStreamState((current) => (current === "reconnecting" ? current : "connecting"));
      sourceRef.current?.close();
      const source = new EventSource(`/api/stream${queryString}`);
      sourceRef.current = source;

      source.onopen = () => {
        if (cancelled) return;
        setStreamState("live");
        setApiError(null);
        setLastSyncAt(Date.now());
      };

      source.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as LiveMessage;
          setData((current) => reduceLiveMessage(current, message));
          setStreamState("live");
          setApiError(null);
          setLastSyncAt(Date.now());
        } catch {
          // ignore malformed frames and keep polling fallback alive
        }
      };

      source.onerror = () => {
        source.close();
        if (!cancelled) {
          setStreamState("reconnecting");
          setApiError("Live stream interrupted. Polling snapshots continue while the console reconnects.");
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    };

    refreshRef.current = fetchLatest;
    connect();
    void fetchLatest();
    const pollTimer = setInterval(() => void fetchLatest(), 5000);
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
      refreshRef.current = null;
    };
  }, [queryString]);

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
                  A scoped operations console for hosted telemetry, runtime-adapter traces, and demo playback.
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
                  <MetaRow label="Feed state" value={sourceLabel} />
                  <MetaRow label="Backend" value={storageLabel} />
                  <MetaRow label="Recent events" value={String(data.events.length)} />
                  <MetaRow label="Most recent run" value={latestRun ? formatRelativeWindow(latestRun.updatedAt) : "n/a"} />
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          <InfoPill tone="accent">{run.sourceLabel}</InfoPill>
                          <InfoPill tone="muted">{run.stage}</InfoPill>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">
                          {run.projectId}/{run.environmentId} · {run.childCount} child runs · Updated {formatRelativeWindow(run.updatedAt)}
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
                    Filter by status, stage, source, and owner while keeping hierarchy, failed runs, and recent telemetry in one place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <InfoPill tone="accent">{data.summary.activeRuns > 0 ? "Operations active" : "Stable idle state"}</InfoPill>
                  <InfoPill tone="muted">{data.events.length} events in frame</InfoPill>
                  <InfoPill tone="muted">{data.summary.failedRuns} flagged runs</InfoPill>
                </div>
              </div>

              <div
                className={`mt-6 rounded-[1.2rem] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
                  connectionMeta.tone === "warning"
                    ? "border-amber-400/22 bg-amber-400/[0.06]"
                    : connectionMeta.tone === "error"
                      ? "border-rose-500/22 bg-rose-500/[0.06]"
                      : "border-white/8 bg-white/[0.035]"
                }`}
                aria-live="polite"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Board state</p>
                    <p className="mt-2 text-sm font-medium text-white">{connectionMeta.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{connectionMeta.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <InfoPill tone={streamState === "live" && !isRefreshing ? "accent" : "muted"}>{connectionMeta.pill}</InfoPill>
                    <InfoPill tone="muted">Last sync {formatRelativeTime(lastSyncAt)}</InfoPill>
                    <button
                      type="button"
                      onClick={() => void refreshRef.current?.()}
                      disabled={isRefreshing}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRefreshing ? "Refreshing" : "Refresh now"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {stats.map((item) => (
                  <KeyMetric key={item.label} label={item.label} value={item.value} meta={item.meta} />
                ))}
              </div>
            </header>

            <div className="mt-6 space-y-6">
              <SectionCard
                eyebrow="Filters"
                title="Scope the run inventory"
                description="Filter the console by run status, stage, source mode, and owner without leaving the dashboard."
                action={
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
                    <span>{data.runs.length} runs</span>
                    <span>{activeFilterCount} active filters</span>
                  </div>
                }
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FilterSelect
                    label="Status"
                    value={filters.status}
                    options={filterOptions.status}
                    onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
                  />
                  <FilterSelect
                    label="Stage"
                    value={filters.stage}
                    options={filterOptions.stage}
                    onChange={(value) => setFilters((current) => ({ ...current, stage: value }))}
                  />
                  <FilterSelect
                    label="Source"
                    value={filters.source}
                    options={filterOptions.source}
                    onChange={(value) => setFilters((current) => ({ ...current, source: value }))}
                  />
                  <FilterSelect
                    label="Owner"
                    value={filters.owner}
                    options={filterOptions.owner}
                    onChange={(value) => setFilters((current) => ({ ...current, owner: value }))}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(filters).map(([key, value]) =>
                    value ? (
                      <button
                        key={key}
                        type="button"
                          onClick={() => setFilters((current) => ({ ...current, [key]: "" }))}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
                      >
                        {key}: {value}
                      </button>
                    ) : null
                  )}
                  <button
                    type="button"
                    onClick={() => setFilters(emptyFilters)}
                    disabled={activeFilterCount === 0}
                    className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear filters
                  </button>
                </div>
              </SectionCard>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
                <div className="space-y-6">
                  <SectionCard
                    eyebrow="Primary run"
                    title={latestRun ? latestRun.task : "No active run loaded"}
                    description={
                      latestRun
                        ? "The most recently updated run anchors the board and exposes current ownership, stage, hierarchy, and source scope."
                        : "The observability feed has not projected any runs yet."
                    }
                    action={latestRun ? <StatusBadge status={latestRun.status} /> : null}
                  >
                    {latestRun ? (
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_340px]">
                        <div className="space-y-5 rounded-[1.2rem] border border-white/8 bg-white/[0.035] px-5 py-5">
                          <div className="flex flex-wrap gap-2">
                            <InfoPill tone="accent">{latestRun.sourceLabel}</InfoPill>
                            <InfoPill tone="muted">{latestRun.stage}</InfoPill>
                            <InfoPill tone="muted">{latestRun.owner}</InfoPill>
                            {latestRun.parentRunId ? <InfoPill tone="muted">child run</InfoPill> : <InfoPill tone="muted">root run</InfoPill>}
                          </div>
                          <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Run identifier</p>
                          <p className="mt-2 font-mono text-sm text-slate-200">{latestRun.id}</p>
                          <div className="mt-5 grid gap-4 sm:grid-cols-3">
                            <MetricStack label="Scope" value={`${latestRun.projectId}/${latestRun.environmentId}`} meta={latestRun.runtimeId} />
                            <MetricStack label="Events" value={String(latestRun.eventCount)} meta={`${latestRun.childCount} child runs`} />
                            <MetricStack label="Last update" value={formatConsoleTime(latestRun.updatedAt)} meta={formatRelativeWindow(latestRun.updatedAt)} />
                          </div>
                        </div>

                        <div className="flex h-full flex-col justify-between rounded-[1.2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,31,49,0.62),rgba(8,14,23,0.92))] p-5">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">Operational brief</p>
                            <dl className="mt-5 space-y-4">
                              <MetaRow label="Stage" value={latestRun.stage} />
                              <MetaRow label="Owner" value={latestRun.owner} />
                              <MetaRow label="Status" value={latestRun.status} />
                              <MetaRow label="Source" value={latestRun.sourceLabel} />
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
                      <EmptyState
                        title="No run data available"
                        message="This source has not projected any runs yet. Confirm telemetry is being emitted, or switch filters and refresh the board."
                        action={
                          <div className="flex flex-wrap gap-2">
                            {activeFilterCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => setFilters(emptyFilters)}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
                              >
                                Clear filters
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void refreshRef.current?.()}
                              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
                            >
                              Refresh board
                            </button>
                          </div>
                        }
                      />
                    )}
                  </SectionCard>

                  <div id="runs" className="scroll-mt-6">
                    <SectionCard
                      eyebrow="Run inventory"
                      title="Execution queue and history"
                      description="Filterable, hierarchy-aware run inventory ordered by most recent update."
                    >
                      {data.runs.length > 0 ? (
                        <>
                          <div className="space-y-4 lg:hidden">
                            {data.runs.map((run) => (
                              <RunCardView key={run.id} run={run} />
                            ))}
                          </div>
                          <div className="hidden overflow-x-auto lg:block">
                          <table className="min-w-[980px] w-full border-separate border-spacing-0">
                            <thead>
                              <tr className="text-left text-[10px] font-medium uppercase tracking-[0.3em] text-slate-500">
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Run</th>
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Scope</th>
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Stage</th>
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Status</th>
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Owner</th>
                                <th className="border-b border-white/8 px-4 pb-3 font-medium">Activity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.runs.map((run, index) => (
                                <RunRowView key={run.id} run={run} bordered={index !== data.runs.length - 1} />
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </>
                      ) : (
                        <EmptyState
                          title="No runs match this scope"
                          message={
                            activeFilterCount > 0
                              ? "The current filter combination is empty. Clear one or more filters to widen the board."
                              : "No runs have been projected into the inventory yet. Refresh after the next ingestion cycle."
                          }
                          action={
                            <div className="flex flex-wrap gap-2">
                              {activeFilterCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setFilters(emptyFilters)}
                                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
                                >
                                  Clear filters
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void refreshRef.current?.()}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100"
                              >
                                Refresh board
                              </button>
                            </div>
                          }
                        />
                      )}
                    </SectionCard>
                  </div>
                </div>

                <div className="space-y-6">
                  <div id="failures" className="scroll-mt-6">
                    <SectionCard
                      eyebrow="Failures"
                      title="Failed runs needing attention"
                      description="Isolate failed runs without leaving the console and jump directly into detailed inspection."
                    >
                      {failedRuns.length > 0 ? (
                        <div className="space-y-4">
                          {failedRuns.map((run) => (
                            <div key={run.id} className="rounded-[1.15rem] border border-rose-500/28 bg-rose-500/[0.06] px-4 py-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <Link href={`/runs/${run.id}`} className="text-sm font-semibold text-rose-50 hover:text-white">
                                    {run.task}
                                  </Link>
                                  <p className="mt-2 text-xs leading-5 text-rose-100/80">
                                    {run.projectId}/{run.environmentId} · {run.sourceLabel} · {run.childCount} child runs
                                  </p>
                                </div>
                                <StatusBadge status={run.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No failed runs projected"
                          message="Nothing currently needs escalation in this scope. Keep the board live or widen filters if you expected a failure here."
                        />
                      )}
                    </SectionCard>
                  </div>

                  <div id="timeline" className="scroll-mt-6">
                    <SectionCard
                      eyebrow="Event stream"
                      title="Latest operational timeline"
                      description="Recent events across the active source, preserving explicit source-mode context."
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
                              sourceLabel={event.sourceMode}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No events in the current stream"
                          message="The timeline is empty for this scope. Leave the board open for live updates, or refresh after a telemetry producer posts the next event."
                          tone={streamState === "reconnecting" ? "warning" : "default"}
                        />
                      )}
                    </SectionCard>
                  </div>

                  <div id="artifacts" className="scroll-mt-6">
                    <SectionCard
                      eyebrow="Observed surfaces"
                      title="Tracked files"
                      description="Paths currently included in the observability and dashboard surface."
                    >
                      {data.changedFiles.length > 0 ? (
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
                      ) : (
                        <EmptyState
                          title="No tracked files yet"
                          message="Tracked files appear here after file-change telemetry lands in the observability store."
                        />
                      )}
                    </SectionCard>

                    <SectionCard
                      eyebrow="Ingestion contract"
                      title="Emit structured telemetry"
                      description="Hosted runtimes POST the canonical envelope to /api/telemetry. /api/log remains a compatibility bridge for legacy event posts."
                    >
                      <pre className="overflow-x-auto rounded-[1.15rem] border border-white/8 bg-[#07101a] px-4 py-4 text-xs leading-7 text-slate-300">{`POST /api/telemetry
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
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RunCardView({ run }: { run: RunSummary }) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/runs/${run.id}`} className="block text-sm font-medium leading-6 text-white transition hover:text-sky-200">
            {run.task}
          </Link>
          <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <InfoPill tone="accent">{run.sourceLabel}</InfoPill>
        <InfoPill tone="muted">{run.stage}</InfoPill>
        <InfoPill tone="muted">{run.owner}</InfoPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-white/8 bg-[#08111b] px-3 py-3 text-sm text-slate-300">
          <p>{run.projectId}</p>
          <p className="mt-1 text-xs text-slate-400">{run.environmentId} · {run.runtimeId}</p>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-[#08111b] px-3 py-3">
          <p className="text-sm font-medium text-white">{formatConsoleTime(run.updatedAt)}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {run.eventCount} events · {formatRelativeWindow(run.updatedAt)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {run.parentRunId ? <InfoPill tone="muted">parent {run.parentRunId}</InfoPill> : <InfoPill tone="muted">root</InfoPill>}
        {run.childCount > 0 ? <InfoPill tone="muted">{run.childCount} children</InfoPill> : null}
      </div>
    </div>
  );
}

function RunRowView({ run, bordered }: { run: RunSummary; bordered: boolean }) {
  return (
    <tr className="align-top">
      <td className={`px-4 py-4 ${bordered ? "border-b border-white/6" : ""}`}>
        <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link href={`/runs/${run.id}`} className="block text-sm font-medium leading-6 text-white transition hover:text-sky-200">
                {run.task}
              </Link>
              <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <InfoPill tone="accent">{run.sourceLabel}</InfoPill>
                {run.parentRunId ? <InfoPill tone="muted">parent {run.parentRunId}</InfoPill> : <InfoPill tone="muted">root</InfoPill>}
                {run.childCount > 0 ? <InfoPill tone="muted">{run.childCount} children</InfoPill> : null}
              </div>
            </div>
          </div>
        </div>
      </td>
      <td className={`px-4 py-4 ${bordered ? "border-b border-white/6" : ""}`}>
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
          <p>{run.projectId}</p>
          <p className="mt-1 text-xs text-slate-400">{run.environmentId} · {run.runtimeId}</p>
        </div>
      </td>
      <td className={`px-4 py-4 ${bordered ? "border-b border-white/6" : ""}`}>
        <div className="space-y-2">
          <InfoPill tone="accent">{run.stage}</InfoPill>
          <p className="text-xs leading-5 text-slate-400">{run.parentRunId ? "Child run" : "Root run"}</p>
        </div>
      </td>
      <td className={`px-4 py-4 ${bordered ? "border-b border-white/6" : ""}`}>
        <StatusBadge status={run.status} />
      </td>
      <td className={`px-4 py-4 text-sm text-slate-300 ${bordered ? "border-b border-white/6" : ""}`}>
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">{run.owner}</div>
      </td>
      <td className={`px-4 py-4 ${bordered ? "border-b border-white/6" : ""}`}>
        <p className="text-sm font-medium text-white">{formatConsoleTime(run.updatedAt)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {run.eventCount} events · {formatRelativeWindow(run.updatedAt)}
        </p>
      </td>
    </tr>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1rem] border border-white/10 bg-[#08111b] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/40"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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

function buildQueryString(filters: FilterState) {
  const searchParams = new URLSearchParams();
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.stage) searchParams.set("stage", filters.stage);
  if (filters.source) searchParams.set("source", filters.source);
  if (filters.owner) searchParams.set("owner", filters.owner);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function getConnectionMeta({
  streamState,
  isRefreshing,
  apiError,
  activeFilterCount,
  lastSyncAt,
}: {
  streamState: StreamState;
  isRefreshing: boolean;
  apiError: string | null;
  activeFilterCount: number;
  lastSyncAt: number;
}) {
  if (streamState === "reconnecting") {
    return {
      label: "Live stream reconnecting",
      message: apiError ?? "The board is retrying the stream and preserving the last good snapshot.",
      pill: "Retrying stream",
      tone: "warning" as const,
    };
  }

  if (isRefreshing) {
    return {
      label: "Refreshing dashboard snapshot",
      message:
        activeFilterCount > 0
          ? "The board is applying the current filters and fetching a fresh snapshot."
          : "The board is syncing the latest run inventory, failures, and timeline state.",
      pill: "Refreshing",
      tone: "default" as const,
    };
  }

  if (apiError) {
    return {
      label: "Snapshot guidance available",
      message: `${apiError} Last successful sync ${formatRelativeTime(lastSyncAt)}.`,
      pill: "Using last good snapshot",
      tone: "error" as const,
    };
  }

  if (streamState === "live") {
    return {
      label: "Live updates active",
      message:
        activeFilterCount > 0
          ? "Filtered live updates are flowing into the board. Clear filters to return to the full queue."
          : "The board is receiving live updates and polling backup snapshots in the background.",
      pill: "Live stream",
      tone: "default" as const,
    };
  }

  return {
    label: "Connecting to the observability feed",
    message: "The board is opening the live stream and validating the latest snapshot.",
    pill: "Connecting",
    tone: "default" as const,
  };
}

function formatRelativeTime(timestamp: number) {
  return formatRelativeWindow(new Date(timestamp).toISOString());
}

function reduceLiveMessage(current: DashboardData, message: LiveMessage): DashboardData {
  switch (message.type) {
    case "snapshot":
      return message.data;
    case "run.upsert": {
      const runs = upsertRun(current.runs, message.run);
      return {
        ...current,
        runs,
        summary: summarizeRuns(runs),
      };
    }
    case "event.append": {
      const events = [...current.events.filter((event) => event.id !== message.event.id), message.event]
        .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime())
        .slice(-20);
      return {
        ...current,
        events,
      };
    }
    case "command.upsert":
      return current;
    default:
      return current;
  }
}

function upsertRun(runs: RunSummary[], incoming: RunSummary) {
  return [...runs.filter((run) => run.id !== incoming.id), incoming].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

function summarizeRuns(runs: RunSummary[]) {
  return {
    totalRuns: runs.length,
    activeRuns: runs.filter((run) => !["done", "failed"].includes(run.status)).length,
    completedRuns: runs.filter((run) => run.status === "done").length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
  };
}

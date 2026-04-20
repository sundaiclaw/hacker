"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  formatConsoleTime,
  InfoPill,
  SectionCard,
  StatusBadge,
  TimelineEventCard,
} from "@/components/console-ui";
import type { DashboardData, FreshnessState, RunSummary } from "@/lib/observability";
import type { LiveMessage } from "@/lib/observability-live";

type FilterState = {
  status: string;
  stage: string;
  source: string;
  owner: string;
};

type StreamState = "connecting" | "live" | "reconnecting";

type FreshnessDisplay = {
  state: FreshnessState;
  label: string;
  message: string;
};

const emptyFilters: FilterState = {
  status: "",
  stage: "",
  source: "",
  owner: "",
};

const LIVE_FRESHNESS_WINDOW_MS = 60_000;
const STALE_FRESHNESS_WINDOW_MS = 5 * 60_000;

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
  const [lastSyncAt, setLastSyncAt] = useState(() => resolveInitialSyncTime(initialData.systemStatus.lastUpdatedAt));
  const sourceRef = useRef<EventSource | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const queryString = useMemo(() => buildQueryString(filters), [filters]);
  const filterOptions = data.filters;
  const runInventory = data.runInventory ?? data.runs;
  const needsAttentionRuns = data.needsAttentionRuns ?? runInventory.filter((run) => run.status === "failed" || run.status === "waiting");
  const activeRuns = data.activeRuns ?? runInventory.filter((run) => isActiveRun(run.status));
  const recentActivity = data.recentActivity ?? data.events;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const freshness = buildFreshnessDisplay(data.systemStatus.lastUpdatedAt, streamState);
  const summaryItems = [
    {
      label: "Source",
      value: data.systemStatus.sourceLabel,
      meta: `${data.systemStatus.sourceMode} mode`,
    },
    {
      label: "Storage",
      value: data.systemStatus.storageDriver.toUpperCase(),
      meta: "Hosted storage driver for this console",
    },
    {
      label: "Freshness",
      value: freshness.label,
      meta: freshness.message,
    },
    {
      label: "Last update",
      value: data.systemStatus.lastUpdatedAt ? formatConsoleTime(data.systemStatus.lastUpdatedAt) : "No updates yet",
      meta: data.systemStatus.lastUpdatedAt ? `Recorded at ${formatConsoleTime(data.systemStatus.lastUpdatedAt)}` : "Waiting for telemetry",
    },
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
            setApiError(`Snapshot refresh returned ${response.status}. The console will keep the last good view and retry automatically.`);
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
          setApiError("Snapshot refresh failed. The console will keep retrying and preserve the last good view.");
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
          // keep the last good snapshot and fallback polling
        }
      };

      source.onerror = () => {
        source.close();
        if (!cancelled) {
          setStreamState("reconnecting");
          setApiError("Live updates disconnected. Snapshot refreshes will continue while the console reconnects.");
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
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(7,12,21,0.98))] px-5 py-5 shadow-[0_24px_90px_rgba(2,6,23,0.42)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-sky-200/65">Operator console</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-[2.45rem]">Build Observatory</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Triage active software runs, inspect failures, and follow run lineage without leaving the console.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin" className={actionLinkClass("secondary")}>
                Admin and integration
              </Link>
              <button
                type="button"
                onClick={() => void refreshRef.current?.()}
                disabled={isRefreshing}
                className={actionButtonClass()}
              >
                {isRefreshing ? "Refreshing" : "Refresh now"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <InfoPill tone="accent">{data.systemStatus.sourceLabel}</InfoPill>
            <InfoPill tone="muted">{data.systemStatus.storageDriver.toUpperCase()}</InfoPill>
            <InfoPill tone={freshness.state === "live" ? "accent" : "muted"}>{freshness.label}</InfoPill>
            {apiError ? <InfoPill tone="muted">Using last good snapshot</InfoPill> : null}
            <InfoPill tone="muted">Last sync {lastSyncAt > 0 ? formatConsoleTime(new Date(lastSyncAt).toISOString()) : "Not synced yet"}</InfoPill>
          </div>
        </header>

        <div className="mt-6 space-y-6">
          <SectionCard
            eyebrow="System status"
            title="System status"
            description="Source mode, storage driver, and freshness for the current observability scope."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="system-status" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{item.label}</p>
                  <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">{item.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{item.meta}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Needs attention"
            title="Needs attention"
            description="Runs with failed or waiting status appear here first so operators can act immediately."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="needs-attention-section">
              {needsAttentionRuns.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {needsAttentionRuns.map((run) => (
                    <RunTriageCard key={run.id} run={run} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No runs need attention"
                  message="There are no failed or waiting runs in this scope right now. Keep the console open for live updates."
                />
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Active runs"
            title="Active runs"
            description="Queued, planning, building, verifying, and deploying runs stay grouped together so operators can track current work."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="active-runs-section">
              {activeRuns.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {activeRuns.map((run) => (
                    <RunTriageCard key={run.id} run={run} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No active runs"
                  message="There are no queued, planning, building, verifying, or deploying runs in this scope right now."
                />
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Recent activity"
            title="Recent activity"
            description="The latest run events are shown in reverse chronological order for fast investigation."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="recent-activity-section">
              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((event) => (
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
                  title="No recent activity"
                  message={
                    streamState === "reconnecting"
                      ? "The live feed is reconnecting and there are no recent events to show in the current snapshot."
                      : "This scope has not reported any recent events yet."
                  }
                  tone={streamState === "reconnecting" ? "warning" : "default"}
                />
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Runs"
            title="Runs"
            description="Filter the run inventory by status, stage, source, and owner. Filters combine conjunctively."
            className="scroll-mt-6"
            contentClassName="px-5 py-5 sm:px-6"
          >
            <div data-testid="runs-inventory-section">
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <InfoPill tone="muted">{runInventory.length} visible runs</InfoPill>
                <InfoPill tone="muted">{activeFilterCount} active filters</InfoPill>
                {Object.entries(filters).map(([key, value]) =>
                  value ? (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, [key]: "" }))}
                      className={actionButtonClass("secondary")}
                    >
                      {key}: {value}
                    </button>
                  ) : null
                )}
                <button
                  type="button"
                  onClick={() => setFilters(emptyFilters)}
                  disabled={activeFilterCount === 0}
                  className={actionButtonClass("secondary")}
                >
                  Clear filters
                </button>
              </div>

              {runInventory.length > 0 ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {runInventory.map((run) => (
                    <RunInventoryCard key={run.id} run={run} />
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    title="No runs match this filter set"
                    message={
                      activeFilterCount > 0
                        ? "The current filter combination is empty. Clear one or more filters to widen the run inventory."
                        : "This scope has not projected any runs yet."
                    }
                    action={
                      activeFilterCount > 0 ? (
                        <button type="button" onClick={() => setFilters(emptyFilters)} className={actionButtonClass()}>
                          Clear filters
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <footer className="mt-6 flex flex-col gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.025] px-4 py-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Admin and integration details stay off the main triage path. Use the separate admin page for ingest guidance and storage posture.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className={actionLinkClass("secondary")}>
              Open admin page
            </Link>
            <Link href="/api/telemetry/health" className={actionLinkClass("secondary")}>
              Telemetry health JSON
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function RunTriageCard({ run }: { run: RunSummary }) {
  return (
    <article className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{run.task}</p>
          <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <InfoPill tone="accent">{run.sourceLabel}</InfoPill>
        <InfoPill tone="muted">{run.stage}</InfoPill>
        <InfoPill tone="muted">{run.owner}</InfoPill>
        {run.parentRunId ? <InfoPill tone="muted">child run</InfoPill> : <InfoPill tone="muted">root run</InfoPill>}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">
        {run.projectId}/{run.environmentId} · {run.runtimeId} · Updated {formatConsoleTime(run.updatedAt)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/runs/${run.id}`} className={actionLinkClass()}>
          View run
        </Link>
        {run.status === "failed" ? (
          <Link href={`/runs/${run.id}#failed-commands`} className={actionLinkClass("secondary")}>
            View failed command
          </Link>
        ) : null}
        {run.parentRunId ? (
          <Link href={`/runs/${run.id}#run-lineage`} className={actionLinkClass("secondary")}>
            View parent
          </Link>
        ) : run.childCount > 0 ? (
          <Link href={`/runs/${run.id}#run-lineage`} className={actionLinkClass("secondary")}>
            View lineage
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function RunInventoryCard({ run }: { run: RunSummary }) {
  return (
    <article className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{run.task}</p>
          <p className="mt-2 font-mono text-xs text-slate-400">{run.id}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InventoryCell label="Scope" value={`${run.projectId}/${run.environmentId}`} meta={run.runtimeId} />
        <InventoryCell label="Stage" value={run.stage} meta={`${run.owner} · ${run.sourceLabel}`} />
        <InventoryCell label="Updated" value={formatConsoleTime(run.updatedAt)} meta={`Recorded at ${formatConsoleTime(run.updatedAt)}`} />
        <InventoryCell label="Events" value={String(run.eventCount)} meta={`${run.childCount} child runs`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/runs/${run.id}`} className={actionLinkClass()}>
          View run
        </Link>
        {run.status === "failed" ? (
          <Link href={`/runs/${run.id}#failed-commands`} className={actionLinkClass("secondary")}>
            View failed command
          </Link>
        ) : null}
        {run.parentRunId ? (
          <Link href={`/runs/${run.id}#run-lineage`} className={actionLinkClass("secondary")}>
            View parent
          </Link>
        ) : run.childCount > 0 ? (
          <Link href={`/runs/${run.id}#run-lineage`} className={actionLinkClass("secondary")}>
            View lineage
          </Link>
        ) : null}
      </div>
    </article>
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
  const handleValueChange = (nextValue: string) => {
    onChange(nextValue);
  };

  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">{label}</span>
      <select
        name={label.toLowerCase()}
        value={value}
        onChange={(event) => handleValueChange(event.target.value)}
        onInput={(event) => handleValueChange((event.target as HTMLSelectElement).value)}
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

function InventoryCell({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-[#08111b] px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{meta}</p>
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

function buildFreshnessDisplay(lastUpdatedAt: string | null, streamState: StreamState): FreshnessDisplay {
  if (!lastUpdatedAt) {
    return {
      state: "stale",
      label: "Stale",
      message: "No recent telemetry is available for this scope yet.",
    };
  }

  const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
  if (streamState === "reconnecting" && ageMs <= STALE_FRESHNESS_WINDOW_MS) {
    return {
      state: "reconnecting",
      label: "Reconnecting",
      message: `The live feed is retrying. Last successful update was recorded at ${formatConsoleTime(lastUpdatedAt)}.`,
    };
  }

  if (ageMs <= LIVE_FRESHNESS_WINDOW_MS) {
    return {
      state: "live",
      label: "Live",
      message: `The latest update was recorded at ${formatConsoleTime(lastUpdatedAt)}.`,
    };
  }

  return {
    state: "stale",
    label: "Stale",
    message:
      ageMs > STALE_FRESHNESS_WINDOW_MS
        ? `The last successful update was recorded at ${formatConsoleTime(lastUpdatedAt)}.`
        : `No updates have arrived in the last minute. Last successful update was recorded at ${formatConsoleTime(lastUpdatedAt)}.`,
  };
}

function reduceLiveMessage(current: DashboardData, message: LiveMessage): DashboardData {
  switch (message.type) {
    case "snapshot":
      return message.data;
    default:
      return current;
  }
}

function isActiveRun(status: RunSummary["status"]) {
  return ["queued", "planning", "building", "verifying", "deploying"].includes(status);
}

function resolveInitialSyncTime(lastUpdatedAt: string | null) {
  return lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : 0;
}

function actionLinkClass(tone: "primary" | "secondary" = "primary") {
  return tone === "primary"
    ? "inline-flex items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/16"
    : "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100";
}

function actionButtonClass(tone: "primary" | "secondary" = "primary") {
  const palette =
    tone === "primary"
      ? "border-sky-400/25 bg-sky-400/10 text-sky-100 hover:border-sky-300/35 hover:bg-sky-400/16"
      : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-sky-100";

  return `inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-50 ${palette}`;
}

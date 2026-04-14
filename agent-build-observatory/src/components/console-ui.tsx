import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getStatusTone(status?: string) {
  switch (status) {
    case "failed":
      return {
        badge: "border-rose-500/30 bg-rose-500/10 text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        dot: "bg-rose-400 shadow-[0_0_0_5px_rgba(244,63,94,0.12)]",
      };
    case "done":
      return {
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        dot: "bg-emerald-400 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]",
      };
    case "building":
    case "deploying":
    case "verifying":
    case "planning":
      return {
        badge: "border-amber-400/30 bg-amber-400/10 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        dot: "bg-amber-300 shadow-[0_0_0_5px_rgba(251,191,36,0.12)]",
      };
    case "queued":
    case "waiting":
      return {
        badge: "border-sky-400/30 bg-sky-400/10 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        dot: "bg-sky-300 shadow-[0_0_0_5px_rgba(125,211,252,0.12)]",
      };
    default:
      return {
        badge: "border-white/12 bg-white/[0.04] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        dot: "bg-slate-300 shadow-[0_0_0_5px_rgba(203,213,225,0.08)]",
      };
  }
}

export function SectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,25,39,0.96),rgba(9,14,24,0.98))] shadow-[0_24px_80px_rgba(2,6,23,0.48)]",
        className
      )}
    >
      {(eyebrow || description || action) && (
        <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-sky-200/55">{eyebrow}</p>
              ) : null}
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white sm:text-[1.3rem]">{title}</h2>
              {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      )}
      <div className={cx("px-5 py-5 sm:px-6 sm:py-6", contentClassName)}>{children}</div>
    </section>
  );
}

export function KeyMetric({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      {meta ? <p className="mt-2 text-xs leading-5 text-slate-400">{meta}</p> : null}
    </div>
  );
}

export function InfoPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "accent";
}) {
  const palette =
    tone === "accent"
      ? "border-sky-400/25 bg-sky-400/10 text-sky-100"
      : tone === "muted"
        ? "border-white/10 bg-white/[0.03] text-slate-300"
        : "border-white/12 bg-white/[0.05] text-slate-200";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em]", palette)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const tone = getStatusTone(status);

  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em]", tone.badge)}>
      <span className={cx("h-2 w-2 rounded-full", tone.dot)} />
      {status ?? "unknown"}
    </span>
  );
}

export function TimelineEventCard({
  title,
  eyebrow,
  meta,
  timestamp,
  runId,
  status,
  stage,
  owner,
  className,
}: {
  title: string;
  eyebrow: string;
  meta?: string;
  timestamp: string;
  runId?: string;
  status?: string;
  stage?: string;
  owner?: string;
  className?: string;
}) {
  const tone = getStatusTone(status);

  return (
    <div className={cx("group relative pl-10", className)}>
      <div className="absolute left-[0.9rem] top-0 bottom-0 w-px bg-gradient-to-b from-white/18 via-white/10 to-transparent" />
      <div className={cx("absolute left-0 top-1.5 h-4 w-4 rounded-full border border-slate-950/80", tone.dot)} />
      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4 transition duration-200 group-hover:border-white/14 group-hover:bg-white/[0.045]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-slate-500">{eyebrow}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-white sm:text-[0.98rem]">{title}</p>
            {meta ? <p className="mt-2 text-sm leading-6 text-slate-400">{meta}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {status ? <StatusBadge status={status} /> : null}
              {stage ? <InfoPill tone="muted">{stage}</InfoPill> : null}
              {owner ? <InfoPill tone="muted">{owner}</InfoPill> : null}
              {runId ? <InfoPill tone="muted">{runId}</InfoPill> : null}
            </div>
          </div>
          <div className="shrink-0 text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{timestamp}</div>
        </div>
      </div>
    </div>
  );
}

export function formatConsoleTime(input: string) {
  return new Date(input).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeWindow(input: string) {
  const seconds = Math.round((Date.now() - new Date(input).getTime()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) {
    return seconds >= 0 ? `${absSeconds}s ago` : `in ${absSeconds}s`;
  }

  const minutes = Math.round(absSeconds / 60);
  if (minutes < 60) {
    return seconds >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return seconds >= 0 ? `${hours}h ago` : `in ${hours}h`;
  }

  const days = Math.round(hours / 24);
  return seconds >= 0 ? `${days}d ago` : `in ${days}d`;
}

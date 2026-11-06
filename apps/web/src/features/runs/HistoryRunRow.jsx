"use client";

import Link from "next/link";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Detail, RunDetails } from "./RunRow";
import { formatDuration, formatFullTime, formatRelativeTime, runStatusMeta, stepProgress, stepStatusMeta } from "./runStatus";

const barTone = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary animate-pulse",
  neutral: "bg-line-strong",
};
const MAX_BARS = 8;

/** One small bar per step, coloured by its status. Decorative: the row also says "2 of 3 steps done". */
function StepBars({ executions }) {
  const steps = (executions || []).filter((e) => e.status !== "SKIPPED");
  if (steps.length === 0) return <span className="text-xs text-ink-faint">—</span>;
  const shown = steps.slice(0, MAX_BARS);
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {shown.map((e, i) => (
        <span key={e.id || i} className={cn("h-1.5 w-3.5 rounded-full", barTone[stepStatusMeta(e).tone])} />
      ))}
      {steps.length > MAX_BARS && <span className="ml-0.5 text-[11px] tabular-nums text-ink-faint">+{steps.length - MAX_BARS}</span>}
    </span>
  );
}

/**
 * A run on the Zap History page: status, Zap (links to its builder), when, steps and duration.
 * Click anywhere on the row (or the chevron, for keyboards) to open the step trace.
 */
export function HistoryRunRow({ run, now, expanded, detail, loadingDetail, detailError, fresh, onToggle, onRetry }) {
  const meta = runStatusMeta(detail || run);
  const progress = stepProgress(run);
  const counted = (run.stepExecutions || []).filter((e) => e.status !== "SKIPPED");
  const shortProgress = counted.length ? `${counted.filter((e) => e.status === "SUCCESS").length}/${counted.length} steps` : null;
  const zapId = run.zapId || run.zap?.id;
  const zapName = run.zap?.zapName || "Untitled Zap";
  const panelId = `history-run-${run.id}`;
  const duration = formatDuration(run.startedAt, run.completedAt);
  const when = formatRelativeTime(run.createdAt, now);
  const badge = (
    <Badge tone={meta.tone} dot className={run.status === "RUNNING" ? "[&>span:first-child]:animate-pulse" : undefined}>
      {meta.label}
    </Badge>
  );

  // The whole row toggles for pointer users; links and buttons inside keep their own action.
  const onRowClick = (e) => {
    if (e.target.closest("a, button") || window.getSelection()?.toString()) return;
    onToggle();
  };

  return (
    <li
      className={cn(
        "motion-safe:animate-[fadeIn_0.35s_ease-out] transition-colors duration-1000",
        fresh && "bg-primary-soft/60"
      )}
    >
      <div
        onClick={onRowClick}
        className={cn(
          "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 sm:gap-4 sm:px-5",
          expanded ? "bg-subtle/70" : "hover:bg-subtle/50"
        )}
      >
        <span className="hidden w-32 shrink-0 sm:block">{badge}</span>

        <span className="min-w-0 flex-1">
          {zapId ? (
            <Link
              href={`/zaps/${zapId}/edit`}
              className="block w-fit max-w-full truncate rounded-sm text-sm font-medium text-ink decoration-ink-faint underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {zapName}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium text-ink-muted">Deleted Zap</span>
          )}
          <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-ink-faint sm:mt-0.5">
            <span className="shrink-0 sm:hidden">{badge}</span>
            <span className="truncate">
            <time dateTime={run.createdAt} title={formatFullTime(run.createdAt)}>{when}</time>
            <span className="sm:hidden">{duration !== "—" && ` · ${duration}`}</span>
            {" · "}
            {shortProgress && <span className="sm:hidden">{shortProgress}</span>}
            <span className={cn(shortProgress && "max-sm:hidden")}>
              {progress || (run.status === "QUEUED" ? "Waiting to start" : "No steps recorded yet")}
            </span>
            </span>
          </span>
        </span>

        <span className="hidden w-28 shrink-0 xl:block" title={progress || undefined}>
          <StepBars executions={run.stepExecutions} />
        </span>

        <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-ink-muted sm:block">{duration}</span>

        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 px-2 sm:px-2.5"
          leftIcon={<RotateCcw className="size-3.5" />}
          onClick={() => onRetry(run)}
          aria-label={`Retry this run of ${zapName}`}
        >
          <span className="hidden xl:inline">Retry</span>
        </Button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? "Hide" : "Show"} steps for ${zapName}, ${meta.label}, ${when}`}
          className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <div className="motion-safe:animate-[fadeIn_0.2s_ease-out]">
          <RunDetails
            id={panelId}
            run={run}
            zapId={zapId}
            detail={detail}
            loadingDetail={loadingDetail}
            detailError={detailError}
            extra={
              <Detail label="Zap">
                {zapId ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <Link href={`/zaps/${zapId}/edit`} className="font-medium text-ink underline underline-offset-2 hover:text-primary">Edit Zap</Link>
                    <Link href={`/zaps/${zapId}/runs?run=${run.id}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">All its runs</Link>
                  </span>
                ) : (
                  "Deleted"
                )}
              </Detail>
            }
          />
        </div>
      )}
    </li>
  );
}

export function HistoryRunRowSkeleton() {
  return (
    <li className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <div className="h-5 w-24 shrink-0 animate-pulse rounded-full bg-subtle sm:w-28" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-subtle" />
        <div className="h-3 w-56 max-w-full animate-pulse rounded bg-subtle" />
      </div>
      <div className="hidden h-1.5 w-24 animate-pulse rounded-full bg-subtle xl:block" />
      <div className="hidden h-3.5 w-12 animate-pulse rounded bg-subtle sm:block" />
      <div className="size-7 animate-pulse rounded-md bg-subtle" />
    </li>
  );
}

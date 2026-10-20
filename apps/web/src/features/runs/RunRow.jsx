"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { JsonViewer } from "./JsonViewer";
import { StepTrace } from "./StepTrace";
import { formatDuration, formatFullTime, formatRelativeTime, runStatusMeta, stepProgress } from "./runStatus";

/** One run in the history list. Click to expand the trigger data and step trace. */
export function RunRow({ run, expanded, detail, loadingDetail, detailError, highlighted, onToggle, onRetry }) {
  const meta = runStatusMeta(detail || run);
  const progress = stepProgress(detail || run);
  const panelId = `run-${run.id}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border bg-surface transition-shadow",
        expanded ? "border-line-strong shadow-raised" : "border-line shadow-card hover:border-line-strong",
        highlighted && "ring-2 ring-primary/40"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer sm:gap-5"
        >
          <span className="w-32 shrink-0">
            <Badge tone={meta.tone} dot className={run.status === "RUNNING" ? "[&>span:first-child]:animate-pulse" : undefined}>
              {meta.label}
            </Badge>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink" title={formatFullTime(run.createdAt)}>
              {formatRelativeTime(run.createdAt)}
            </span>
            <span className="block truncate text-xs text-ink-faint">{progress || "No steps recorded yet"}</span>
          </span>
          <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-ink-muted sm:block">
            {formatDuration(run.startedAt, run.completedAt)}
          </span>
        </button>

        <Button size="sm" variant="outline" leftIcon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(run)}>
          <span className="hidden sm:inline">Retry</span>
          <span className="sr-only sm:hidden">Retry run</span>
        </Button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Hide details" : "Show details"}
          className="rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer"
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <div id={panelId} className="space-y-5 border-t border-line bg-canvas px-4 py-5 sm:px-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Detail label="Started">{formatFullTime(run.startedAt || run.createdAt)}</Detail>
            <Detail label="Duration">{formatDuration(run.startedAt, run.completedAt)}</Detail>
            <Detail label="Status">{meta.label}</Detail>
            <Detail label="Run ID"><span className="break-all font-mono text-xs">{run.id}</span></Detail>
          </dl>

          <JsonViewer label="Trigger data" data={run.triggerPayload} />

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Steps</h4>
            {loadingDetail ? (
              <div className="flex items-center gap-2 py-2 text-sm text-ink-muted"><Spinner className="size-4" /> Loading steps…</div>
            ) : detailError ? (
              <p className="text-sm text-danger">{detailError}</p>
            ) : (
              <StepTrace executions={detail?.stepExecutions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

export function RunRowSkeleton() {
  return (
    <div className="flex items-center gap-5 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
      <div className="h-5 w-24 animate-pulse rounded-full bg-subtle" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-28 animate-pulse rounded bg-subtle" />
        <div className="h-3 w-40 animate-pulse rounded bg-subtle" />
      </div>
      <div className="h-8 w-20 animate-pulse rounded-control bg-subtle" />
    </div>
  );
}

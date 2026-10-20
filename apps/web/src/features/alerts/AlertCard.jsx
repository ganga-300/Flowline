"use client";

import { AlertTriangle, ArrowRight, ChevronRight, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatFullTime, formatRelativeTime } from "@/features/runs/runStatus";
import { alertReason, alertRunHref, isOutcomeUnknownAlert } from "./alertText";

/** One failed-run alert: which Zap, why it failed, a link to the run, and Dismiss. */
export function AlertCard({ alert, dismissing, onDismiss }) {
  const unknown = isOutcomeUnknownAlert(alert);
  const Icon = unknown ? AlertTriangle : XCircle;
  const href = alertRunHref(alert);

  return (
    <article className={cn("rounded-card border border-line bg-surface p-4 shadow-card transition-opacity sm:p-5", dismissing && "opacity-50")}>
      <div className="flex items-start gap-3.5">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", unknown ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h3 className="truncate text-sm font-semibold text-ink">
              {alert.zap?.zapName || "Untitled Zap"}
              <span className="font-normal text-ink-muted">{unknown ? " · outcome unknown" : " · run failed"}</span>
            </h3>
            <time dateTime={alert.createdAt} title={formatFullTime(alert.createdAt)} className="text-xs text-ink-faint">
              {formatRelativeTime(alert.createdAt)}
            </time>
          </div>

          <p className="mt-1 break-words text-sm text-ink-muted">{alertReason(alert)}</p>
          {unknown && (
            <p className="mt-1 text-sm text-ink-muted">Check the app before retrying, so nothing is sent twice.</p>
          )}

          {alert.errorTrace && alert.errorTrace !== alertReason(alert) && (
            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-faint hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                Technical details
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-control border border-line bg-subtle px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
                {alert.errorTrace}
              </pre>
            </details>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {href && (
              <Button size="sm" variant="outline" href={href} rightIcon={<ArrowRight className="size-3.5" />}>
                View run
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDismiss(alert)} disabled={dismissing} leftIcon={<X className="size-3.5" />}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="size-8 animate-pulse rounded-full bg-subtle" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 animate-pulse rounded bg-subtle" />
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-subtle" />
        <div className="h-8 w-24 animate-pulse rounded-control bg-subtle" />
      </div>
    </div>
  );
}

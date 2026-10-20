import { AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";
import { JsonViewer } from "./JsonViewer";
import { describeStep, formatError, isOutcomeUnknown, stepStatusMeta } from "./runStatus";

const dotTone = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary",
  neutral: "bg-line-strong",
};

/** Vertical timeline of a run's step executions with errors and input/output. */
export function StepTrace({ executions }) {
  if (!executions?.length) {
    return <p className="py-2 text-sm text-ink-muted">No steps ran. The run may have been filtered or stopped before its first step.</p>;
  }

  return (
    <ol className="relative space-y-3">
      {executions.map((execution, index) => {
        const step = describeStep(execution.step, index);
        const meta = stepStatusMeta(execution);
        const unknown = isOutcomeUnknown(execution);
        const isLast = index === executions.length - 1;

        return (
          <li key={execution.id || index} className="relative pl-7">
            {!isLast && <span aria-hidden="true" className="absolute left-[7px] top-5 -bottom-3 w-px bg-line" />}
            <span aria-hidden="true" className={cn("absolute left-0.5 top-[7px] size-3 rounded-full ring-4 ring-surface", dotTone[meta.tone])} />

            <div className="rounded-card border border-line bg-surface p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {step.app && <AppIcon app={step.app} size="sm" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{step.title}</p>
                    <p className="text-xs text-ink-faint">
                      {step.kind}
                      {execution.attempt > 1 && ` · tried ${execution.attempt} times`}
                    </p>
                  </div>
                </div>
                <Badge tone={meta.tone} dot>{meta.label}</Badge>
              </div>

              {execution.error && (
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm",
                    unknown ? "border-warning/20 bg-warning-soft text-ink" : "border-danger/20 bg-danger-soft text-ink"
                  )}
                >
                  {unknown ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
                  <p className="min-w-0 break-words">{formatError(execution.error)}</p>
                </div>
              )}

              <div className="mt-3 grid gap-2 md:grid-cols-2 empty:hidden">
                <JsonViewer label="Input" data={execution.input} />
                <JsonViewer label="Output" data={execution.output} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

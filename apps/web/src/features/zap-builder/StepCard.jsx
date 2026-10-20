import { CheckCircle2, CircleDashed, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { StepIcon } from "./StepIcon";

/** A trigger or step on the canvas. Click opens it in the drawer. */
export function StepCard({ number, eyebrow, title, summary, app, iconType, configured, active, onOpen, onRemove }) {
  return (
    <div
      className={cn(
        "group relative w-full rounded-card border bg-surface shadow-card transition-all",
        active ? "border-primary ring-4 ring-primary/10" : configured ? "border-line hover:border-line-strong hover:shadow-raised" : "border-dashed border-line-strong hover:border-ink-faint"
      )}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 p-4 text-left cursor-pointer sm:p-5">
        <StepIcon app={app} type={iconType} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs font-medium text-ink-faint">
            <span className="tabular-nums">{number}.</span>
            <span>{eyebrow}</span>
            {configured ? (
              <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" />Ready</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning"><CircleDashed className="size-3.5" />Needs setup</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-sm text-ink-muted">{summary}</span>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove step ${number}`}
          className="absolute right-3 top-3 rounded-md p-1.5 text-ink-faint opacity-100 transition hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 cursor-pointer sm:opacity-0 sm:group-hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

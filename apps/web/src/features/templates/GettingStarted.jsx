import Link from "next/link";
import { ArrowRight, Circle, CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Welcome card with the 3-item checklist. items: from gettingStartedItems().
 * welcome: show the full welcome (no Flows yet) instead of the compact "Getting started" title.
 */
export function GettingStarted({ items, welcome = false }) {
  const doneCount = items.filter((i) => i.done).length;
  // The first item not done yet gets the primary call to action.
  const nextId = items.find((i) => !i.done)?.id;

  return (
    <section aria-labelledby="getting-started-title" className="mb-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="getting-started-title" className={cn("font-semibold text-ink", welcome ? "text-lg" : "text-base")}>
          {welcome ? "Welcome to Flowline" : "Getting started"}
        </h2>
        <p className="text-xs font-medium text-ink-faint tabular-nums">{doneCount} of {items.length} done</p>
      </div>
      {welcome && (
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          A Flow runs on its own: when something happens in GitHub, Gmail, Slack or a webhook, Flowline does the next steps for you. Three steps to your first one:
        </p>
      )}

      <ol className="mt-4 divide-y divide-line border-t border-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-3.5 last:pb-0">
            {item.done ? (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-ink-faint" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", item.done ? "text-ink-muted line-through decoration-ink-faint/60" : "text-ink")}>
                {item.title}
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
              </p>
              {!item.done && <p className="mt-0.5 text-sm text-ink-muted">{item.description}</p>}
            </div>
            {!item.done && item.href && (
              <Link
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-control px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  item.id === nextId ? "bg-primary text-white hover:bg-primary-hover" : "text-primary hover:bg-primary-soft"
                )}
              >
                {item.cta}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

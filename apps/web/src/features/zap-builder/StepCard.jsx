"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { cn } from "@/lib/cn";
import { StepIcon } from "./StepIcon";
import { StepMenu } from "./StepMenu";

/**
 * A trigger or step on the canvas. Click opens it in the drawer. menuItems (optional) adds
 * the "…" menu. While renaming, the title is an input: onRenameDone(name), or null to cancel.
 */
export function StepCard({ number, eyebrow, title, summary, app, iconType, configured, active, onOpen, menuItems, renaming, onRenameDone }) {
  return (
    <div
      className={cn(
        "group relative w-full rounded-card border bg-surface shadow-card transition-all duration-200",
        active
          ? "border-primary ring-4 ring-primary/10"
          : configured
            ? "border-line hover:-translate-y-px hover:border-line-strong hover:shadow-raised"
            : "border-dashed border-line-strong hover:border-ink-faint"
      )}
    >
      {renaming ? (
        <div className="flex items-center gap-3.5 p-4 sm:p-5">
          <StepIcon app={app} type={iconType} size="lg" />
          <RenameField initial={title} onDone={onRenameDone} />
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-card p-4 pr-12 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-5 sm:pr-12">
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
      )}
      {menuItems && !renaming && (
        <div className="absolute right-2.5 top-2.5 opacity-100 transition focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <StepMenu label={`Options for step ${number}`} items={menuItems} />
        </div>
      )}
    </div>
  );
}

// Mounted only while renaming, so it starts from the current title each time.
function RenameField({ initial, onDone }) {
  const [name, setName] = useState(initial);
  return (
    <input
      autoFocus
      aria-label="Step name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(name);
        if (e.key === "Escape") onDone(null);
      }}
      className="h-9 min-w-0 flex-1 rounded-control border border-primary bg-surface px-2.5 text-[15px] font-semibold text-ink outline-none ring-2 ring-primary/20"
    />
  );
}

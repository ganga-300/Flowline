"use client";

import { cn } from "@/lib/cn";

/** Segmented tabs. items: [{ id, label, icon? }] */
export function Tabs({ items, value, onChange, className }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-control bg-subtle p-1", className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              active ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

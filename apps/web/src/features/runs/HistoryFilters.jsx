"use client";

import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DATE_RANGES, HISTORY_STATUS_FILTERS } from "./history";

const chipDot = {
  ALL: null,
  SUCCESS: "bg-success",
  FAILED: "bg-danger",
  FILTERED: "bg-ink-faint",
  ACTIVE: "bg-primary",
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * Zap History filter bar: status chips with counts, then search, Zap and date range.
 * counts: { ALL, SUCCESS, FAILED, FILTERED, ACTIVE } or null while unknown.
 */
export function HistoryFilters({ filters, counts, zapOptions, searchText, onSearchText, onChange, onClear, canClear }) {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 p-2.5 sm:p-3">
        <div role="group" aria-label="Filter by status" className="relative -m-1 flex min-w-0 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] sm:flex-wrap">
          {HISTORY_STATUS_FILTERS.map((chip) => {
            const active = filters.status === chip.id;
            const count = counts?.[chip.id];
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ status: chip.id })}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-all duration-150 cursor-pointer",
                  focusRing,
                  active
                    ? "border-primary/25 bg-primary-soft text-primary shadow-card"
                    : "border-transparent text-ink-muted hover:bg-subtle hover:text-ink"
                )}
              >
                {chipDot[chip.id] && <span aria-hidden="true" className={cn("size-1.5 rounded-full", chipDot[chip.id])} />}
                {chip.label}
                {count !== undefined && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums transition-colors motion-safe:animate-[fadeIn_0.2s_ease-out]",
                      active ? "bg-surface text-primary" : "bg-subtle text-ink-faint"
                    )}
                  >
                    {count.toLocaleString("en-US")}
                    <span className="sr-only">{count === 1 ? " run" : " runs"}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {canClear && (
          <button
            type="button"
            onClick={onClear}
            className={cn("hidden h-8 shrink-0 items-center gap-1 rounded-control px-2.5 text-sm text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer sm:inline-flex", focusRing)}
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      <div className="grid gap-2 border-t border-line p-2.5 sm:p-3 md:grid-cols-2 xl:flex xl:items-center">
        <div className="relative xl:flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            type="search"
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
            placeholder="Search by Zap name"
            aria-label="Search by Zap name"
            maxLength={100}
            className="pl-9"
          />
        </div>
        <div className="xl:w-60">
          <Select
            aria-label="Zap"
            value={filters.zapId}
            onChange={(e) => onChange({ zapId: e.target.value })}
            options={zapOptions}
          />
        </div>
        <div role="group" aria-label="Date range" className="grid grid-cols-4 rounded-control bg-subtle p-1 md:col-span-2 xl:shrink-0">
          {DATE_RANGES.map((r) => {
            const active = filters.range === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ range: r.id })}
                className={cn(
                  "whitespace-nowrap rounded-[8px] px-2.5 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer",
                  focusRing,
                  active ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {canClear && (
          <button
            type="button"
            onClick={onClear}
            className={cn("inline-flex h-9 items-center justify-center gap-1 rounded-control text-sm text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer sm:hidden", focusRing)}
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

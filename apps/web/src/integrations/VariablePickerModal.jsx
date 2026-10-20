"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getStepOutputVariables } from "./stepOutputs";
import { getIntegration, getIntegrationAction } from "./index";

function formatLabel(path) {
  const key = path.split(".").pop();
  return key.replace(/_/g, " ").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function flattenObject(obj, prefix = "") {
  let result = [];
  if (!obj || typeof obj !== "object") return result;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) result = result.concat(flattenObject(val, path));
    else result.push({ path, label: formatLabel(path), value: String(val) });
  }
  return result;
}

function stepTabLabel(step, idx) {
  const c = step.config || {};
  const name = c.provider
    ? getIntegrationAction(c.provider, c.action)?.name || getIntegration(c.provider)?.name || c.provider
    : step.name || step.type;
  return `${idx + 2}. ${name}`;
}

/** Inline panel for inserting trigger fields or earlier steps' outputs into a field. */
export function VariablePickerModal({ sampleData = {}, steps = [], onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("trigger");
  const q = search.toLowerCase();
  const matches = (item) => !q || item.path.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || String(item.value).toLowerCase().includes(q);

  const items =
    activeTab === "trigger"
      ? flattenObject(sampleData).map((f) => ({ ...f, path: `trigger.${f.path}`, token: `{{trigger.${f.path}}}` }))
      : getStepOutputVariables(steps.find((s) => s.id === activeTab) || {});
  const shown = items.filter(matches);

  const tabs = [{ id: "trigger", label: "1. Trigger" }, ...steps.map((s, i) => ({ id: s.id, label: stepTabLabel(s, i) }))];

  return (
    <div className="mt-1 space-y-2.5 rounded-card border border-line bg-surface p-3 shadow-raised">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            autoFocus
            type="text"
            placeholder="Search data"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-control border border-line bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer">
            <X className="size-4" />
          </button>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer",
                activeTab === t.id ? "bg-ink text-white" : "bg-subtle text-ink-muted hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {shown.length > 0 ? (
          shown.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => onSelect({ token: item.token, label: item.label, path: item.path })}
              className="flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left hover:bg-subtle cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{item.label}</span>
                <span className="block truncate font-mono text-[11px] text-ink-faint">{item.path}</span>
              </span>
              <span className="max-w-[45%] truncate text-xs text-ink-muted">{activeTab === "trigger" ? item.value : `e.g. ${item.value}`}</span>
            </button>
          ))
        ) : (
          <p className="px-2.5 py-4 text-center text-sm text-ink-muted">
            {items.length === 0 ? "This step has no output to insert." : "Nothing matches your search."}
          </p>
        )}
      </div>
    </div>
  );
}

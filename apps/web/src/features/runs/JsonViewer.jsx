"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { isEmptyPayload } from "./runStatus";

/** Collapsible, copyable JSON block. Renders nothing for empty data. */
export function JsonViewer({ label, data, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  if (isEmptyPayload(data)) return null;

  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (http, permissions); the JSON is still selectable.
    }
  };

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-control border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-2 pr-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
          {label}
        </button>
        {open && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-line bg-subtle px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}

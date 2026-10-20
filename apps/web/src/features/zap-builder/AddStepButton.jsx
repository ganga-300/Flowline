"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, Hourglass, Plus, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { STEP_KINDS } from "./stepTypes";

const ICONS = { ACTION: Zap, FILTER: Filter, DELAY: Hourglass, AI: Sparkles };

/** The line between two cards, with a + that opens the step-type menu. */
export function AddStepButton({ onAdd, label = "Add a step" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex h-14 flex-col items-center">
      <span aria-hidden="true" className="h-full w-px bg-line-strong" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border bg-surface shadow-card transition cursor-pointer",
          open ? "border-primary text-primary" : "border-line-strong text-ink-muted hover:border-primary hover:text-primary"
        )}
      >
        <Plus className={cn("size-4 transition-transform", open && "rotate-45")} />
      </button>

      {open && (
        <div role="menu" className="absolute top-[calc(50%+20px)] z-20 w-72 rounded-card border border-line bg-surface p-1.5 shadow-raised">
          {STEP_KINDS.map((kind) => {
            const Icon = ICONS[kind.type];
            return (
              <button
                key={kind.type}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onAdd(kind.type);
                }}
                className="flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left hover:bg-subtle cursor-pointer"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control bg-subtle text-ink-muted">
                  <Icon className="size-3.5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{kind.label}</span>
                  <span className="block text-xs text-ink-muted">{kind.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

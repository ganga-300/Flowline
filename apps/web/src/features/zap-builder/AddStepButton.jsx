"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, Hourglass, Plus, Repeat, Sparkles, Split, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { STEP_KINDS } from "./stepTypes";

const ICONS = { ACTION: Zap, FILTER: Filter, DELAY: Hourglass, AI: Sparkles, BRANCH: Split, LOOP: Repeat };

/**
 * The line between two cards, with a + that opens the step-type menu.
 * isAllowed(type): which kinds may go here (e.g. no Delay inside Paths or a Loop).
 * variant "slot": a dashed "Add a step" box, for an empty path or loop.
 */
export function AddStepButton({ onAdd, label = "Add a step", isAllowed = () => true, variant = "line" }) {
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

  const slot = variant === "slot";
  return (
    <div ref={ref} className={cn("relative flex flex-col items-center", slot ? "w-full" : "h-14")}>
      {slot ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-card border border-dashed bg-surface/60 px-4 py-5 text-sm font-medium transition cursor-pointer",
            open ? "border-primary text-primary" : "border-line-strong text-ink-muted hover:border-primary hover:text-primary"
          )}
        >
          <Plus className="size-4" />
          {label}
        </button>
      ) : (
        <>
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
        </>
      )}

      {open && (
        <div role="menu" className={cn("absolute z-20 w-72", slot ? "top-[calc(100%+6px)]" : "top-[calc(50%+20px)]", "rounded-card border border-line bg-surface p-1.5 shadow-raised animate-fadeIn")}>
          {STEP_KINDS.filter((kind) => isAllowed(kind.type)).map((kind) => {
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

"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The "…" menu on a step card. items: [{ label, icon, onSelect, disabled?, danger? }].
 * Arrow keys move between items; Escape or a click outside closes it.
 */
export function StepMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation(); // don't also close the drawer
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const enabled = [...ref.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const at = enabled.indexOf(document.activeElement);
    enabled[(at + (e.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length]?.focus();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded-md p-1.5 text-ink-faint transition hover:bg-subtle hover:text-ink cursor-pointer",
          open && "bg-subtle text-ink"
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-48 rounded-card border border-line bg-surface p-1 shadow-raised animate-fadeIn">
          {items.map(({ label: text, icon: Icon, onSelect, disabled, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition cursor-pointer focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                danger ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : "text-ink hover:bg-subtle focus:bg-subtle"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog. Closes on Escape and on backdrop click. Focus moves into it on open,
 * Tab stays inside, the page behind doesn't scroll, and focus returns to the opener on close.
 */
export function Modal({ open, onClose, title, description, footer, className, children }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    // Prefer the first control in the content or footer; the close button is the fallback.
    const items = [...(dialog?.querySelectorAll(FOCUSABLE) ?? [])];
    const first = items.find((el) => el.getAttribute("aria-label") !== "Close") ?? items[0];
    (first ?? dialog)?.focus();

    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  const trapTab = (e) => {
    if (e.key !== "Tab") return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn("relative w-full max-w-md rounded-card border border-line bg-surface shadow-raised outline-none", className)}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            {title && <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p id={descriptionId} className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : <div className="h-4" />}
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

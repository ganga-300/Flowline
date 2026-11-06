"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-side panel. Focus moves into it on open, Tab stays inside, Escape and the
 * backdrop close it, and focus returns to whatever opened it.
 * `suspended`: a dialog is open on top, so leave Escape and focus to that dialog.
 */
export function Drawer({ open, onClose, labelledBy, suspended = false, children }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || suspended) return;
    // Back from a dialog on top: if what had focus is gone (a removed account), refocus the panel.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, suspended]);

  const trapTab = (e) => {
    if (e.key !== "Tab" || suspended) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="animate-fadeIn absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="animate-slideLeft absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-raised outline-none sm:max-w-md"
      >
        {children}
      </div>
    </div>
  );
}

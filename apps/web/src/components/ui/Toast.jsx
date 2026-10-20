"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  success: { icon: CheckCircle2, color: "text-success" },
  info: { icon: Info, color: "text-primary" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  danger: { icon: XCircle, color: "text-danger" },
};

/** Floating message at the bottom of the screen. Render it when there's something to say. */
export function Toast({ tone = "success", children, onClose }) {
  const t = tones[tone] || tones.info;
  const Icon = t.icon;
  return (
    <div role="status" className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-raised sm:inset-x-auto sm:right-6">
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.color)} />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-ink-faint hover:text-ink cursor-pointer">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

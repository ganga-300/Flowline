"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "bg-primary-soft border-primary/20", icon: Info, color: "text-primary" },
  success: { box: "bg-success-soft border-success/20", icon: CheckCircle2, color: "text-success" },
  warning: { box: "bg-warning-soft border-warning/20", icon: AlertTriangle, color: "text-warning" },
  danger: { box: "bg-danger-soft border-danger/20", icon: XCircle, color: "text-danger" },
};

/** Inline message banner. */
export function Alert({ tone = "info", title, onDismiss, className, children }) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-control border px-4 py-3 text-sm", t.box, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.color)} />
      <div className="min-w-0 flex-1 text-ink">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-muted")}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-ink-faint hover:text-ink cursor-pointer">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

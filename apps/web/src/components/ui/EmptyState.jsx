import { cn } from "@/lib/cn";

/** Friendly placeholder for empty lists. */
export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-subtle text-ink-muted">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

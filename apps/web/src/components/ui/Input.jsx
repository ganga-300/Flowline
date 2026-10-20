import { cn } from "@/lib/cn";

export const controlClasses = cn(
  "w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint",
  "transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted"
);

export function Input({ className, invalid, ...props }) {
  return <input className={cn(controlClasses, "h-10", invalid && "border-danger focus:border-danger focus:ring-danger/20", className)} {...props} />;
}

export function Textarea({ className, invalid, rows = 4, ...props }) {
  return <textarea rows={rows} className={cn(controlClasses, "py-2 leading-relaxed", invalid && "border-danger", className)} {...props} />;
}

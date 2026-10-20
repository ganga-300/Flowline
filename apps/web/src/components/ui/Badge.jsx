import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-subtle text-ink-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
const dots = { neutral: "bg-ink-faint", primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

export function Badge({ tone = "neutral", dot = false, className, children }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

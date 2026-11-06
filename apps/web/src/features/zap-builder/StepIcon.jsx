import { Filter, Globe, Hourglass, Repeat, Sparkles, Split, Zap } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";

// Built-in step kinds: a symbol on a soft tint, so they read apart from app logos at a glance.
const TYPE_ICONS = {
  FILTER: { icon: Filter, tint: "bg-warning-soft text-warning" },
  DELAY: { icon: Hourglass, tint: "bg-primary-soft text-primary" },
  AI: { icon: Sparkles, tint: "bg-primary-soft text-primary" },
  HTTP: { icon: Globe, tint: "bg-subtle text-ink-muted" },
  BRANCH: { icon: Split, tint: "bg-success-soft text-success" },
  LOOP: { icon: Repeat, tint: "bg-success-soft text-success" },
};
const sizes = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-11 [&_svg]:size-5" };

/** App logo for app steps/triggers, otherwise a symbol for the step type. */
export function StepIcon({ app, type, size = "md", className }) {
  if (app) return <AppIcon app={app} size={size} className={className} />;
  const kind = TYPE_ICONS[type];
  const Icon = kind?.icon || Zap;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control",
        kind ? kind.tint : "border border-dashed border-line-strong bg-subtle text-ink-muted",
        sizes[size],
        className
      )}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}

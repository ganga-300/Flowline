import { Filter, Globe, Hourglass, Sparkles, Zap } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";

const TYPE_ICONS = { FILTER: Filter, DELAY: Hourglass, AI: Sparkles, HTTP: Globe };
const sizes = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-11 [&_svg]:size-5" };

/** App logo for app steps/triggers, otherwise a symbol for the step type. */
export function StepIcon({ app, type, size = "md", className }) {
  if (app) return <AppIcon app={app} size={size} className={className} />;
  const Icon = TYPE_ICONS[type] || Zap;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-control border border-dashed border-line-strong bg-subtle text-ink-muted", sizes[size], className)}>
      <Icon aria-hidden="true" />
    </span>
  );
}

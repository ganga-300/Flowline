import { Calculator, Type } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";

// AppIcon covers the OAuth apps and Webhooks; the built-in utility apps get a symbol here.
const UTILITY_ICONS = { formatter: { icon: Type, label: "Formatter" }, math: { icon: Calculator, label: "Math" } };
const sizes = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-11 [&_svg]:size-5" };

export function AppGlyph({ app, size = "md", className }) {
  const utility = UTILITY_ICONS[app];
  if (!utility) return <AppIcon app={app} size={size} className={className} />;
  const Icon = utility.icon;
  return (
    <span title={utility.label} className={cn("inline-flex shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink", sizes[size], className)}>
      <Icon aria-hidden="true" />
      <span className="sr-only">{utility.label}</span>
    </span>
  );
}

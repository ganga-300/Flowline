import { GitBranch, Hash, Mail, Webhook, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

// Neutral symbols per app. To use official logos, put the files in /public and render
// <img> here instead - every screen uses this one component.
const APPS = {
  github: { icon: GitBranch, label: "GitHub" },
  slack: { icon: Hash, label: "Slack" },
  gmail: { icon: Mail, label: "Gmail" },
  webhook: { icon: Webhook, label: "Webhook" },
};

const sizes = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-11 [&_svg]:size-5" };

export function AppIcon({ app, size = "md", className }) {
  const { icon: Icon, label } = APPS[app] || { icon: Zap, label: app || "App" };
  return (
    <span title={label} className={cn("inline-flex shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink", sizes[size], className)}>
      <Icon aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

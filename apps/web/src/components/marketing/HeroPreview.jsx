import { ArrowDown, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";

// A faithful mock of a real Flowline Zap (GitHub New Issue -> Slack message):
// same trigger/action names, same {{trigger.*}} variables the builder inserts.
function StepBlock({ app, label, title, detail }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <AppIcon app={app} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}

const RUNS = [
  { title: "Login button broken on Safari", when: "just now", tone: "success", status: "Succeeded" },
  { title: "Dark mode toggle resets", when: "12 min ago", tone: "success", status: "Succeeded" },
  { title: "Typo in onboarding email", when: "1 h ago", tone: "warning", status: "Filtered" },
];

export function HeroPreview() {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/70 p-3 shadow-raised backdrop-blur-xl sm:p-4">
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[22px] bg-canvas/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">New issue → Slack</p>
            <Badge tone="success" dot>On</Badge>
          </div>
          <StepBlock app="github" label="When" title="New issue created" detail="octo/storefront" />
          <div className="flex justify-center py-1.5 text-ink-faint"><ArrowDown className="size-4" /></div>
          <StepBlock app="slack" label="Then" title="Send channel message" detail="#engineering" />
          <div className="mt-3 rounded-2xl border border-dashed border-line-strong bg-surface/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            New issue #<span className="rounded bg-primary-soft px-1 text-primary">issue.number</span>{" "}
            <span className="rounded bg-primary-soft px-1 text-primary">issue.title</span> by{" "}
            <span className="rounded bg-primary-soft px-1 text-primary">issue.user.login</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-[22px] bg-surface p-4 shadow-card sm:p-5">
            <div className="flex items-center gap-2">
              <AppIcon app="slack" size="sm" />
              <p className="text-sm font-semibold text-ink">#engineering</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink">
              New issue #42: <span className="font-medium">Login button broken on Safari</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">by alice · github.com/octo/storefront/issues/42</p>
          </div>
          <div className="flex-1 rounded-[22px] bg-surface p-4 shadow-card sm:p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Recent runs</p>
            <ul className="space-y-2.5">
              {RUNS.map((r) => (
                <li key={r.title} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className={r.tone === "success" ? "size-4 shrink-0 text-success" : "size-4 shrink-0 text-warning"} />
                    <span className="truncate text-ink">{r.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{r.when}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

import { CheckCircle2, ChevronDown, CircleDot } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "./SectionHeading";

function Step({ n, title, description, children }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-card">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{n}</span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>
      <div className="mt-6 flex-1 rounded-2xl bg-canvas p-4">{children}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-5 py-24 sm:px-8">
      <SectionHeading
        eyebrow="How it works"
        title="Set it up once. It runs on its own."
        description="A Zap is a trigger and the steps that follow it. No code required."
      />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
        <Step n="1" title="Pick a trigger" description="Choose the app and the event that starts your workflow.">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-control border border-line bg-surface px-3 py-2">
              <span className="flex items-center gap-2"><AppIcon app="github" size="sm" /> New issue created</span>
              <ChevronDown className="size-4 text-ink-faint" />
            </div>
            <p className="px-1 text-xs text-ink-muted">Watching <span className="font-medium text-ink">octo/storefront</span></p>
          </div>
        </Step>
        <Step n="2" title="Map the data" description="Insert details from the trigger into the next step with one click.">
          <div className="rounded-control border border-line bg-surface p-3 text-sm leading-relaxed text-ink">
            Fwd:{" "}
            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">Subject</span>{" "}
            from{" "}
            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">Sender</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Subject", "Sender", "Email Body", "Date"].map((c) => (
              <span key={c} className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">+ {c}</span>
            ))}
          </div>
        </Step>
        <Step n="3" title="Watch every run" description="See what triggered each run, what every step did, and why anything failed.">
          <ul className="space-y-2 text-sm">
            {[
              { icon: CheckCircle2, cls: "text-success", text: "Trigger: new email received" },
              { icon: CheckCircle2, cls: "text-success", text: "GitHub: issue #128 created" },
              { icon: CircleDot, cls: "text-primary", text: "Slack: posting to #support" },
            ].map(({ icon: Icon, cls, text }) => (
              <li key={text} className="flex items-center gap-2 rounded-control bg-surface px-3 py-2 shadow-card">
                <Icon className={`size-4 ${cls}`} />
                <span className="text-ink">{text}</span>
              </li>
            ))}
          </ul>
        </Step>
      </div>
    </section>
  );
}

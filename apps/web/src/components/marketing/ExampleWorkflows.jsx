import { ArrowRight } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "./SectionHeading";

// The three workflows Flowline was built and tested around.
const WORKFLOWS = [
  { from: "github", to: "slack", title: "New GitHub issue → Slack message", description: "Tell the team the moment an issue is opened, with its title, author and link." },
  { from: "gmail", to: "github", title: "New email → GitHub issue", description: "Turn bug reports that arrive by email into tracked issues automatically." },
  { from: "slack", to: "gmail", title: "Slack message → email", description: "Forward important channel messages to someone's inbox." },
];

export function ExampleWorkflows() {
  return (
    <section id="workflows" className="scroll-mt-24 bg-surface px-5 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Workflows"
        title="Ideas to start with."
        description="Each of these takes a couple of minutes to set up."
      />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
        {WORKFLOWS.map((w) => (
          <div key={w.title} className="rounded-card border border-line bg-canvas p-6 transition-shadow hover:shadow-raised">
            <div className="flex items-center gap-2">
              <AppIcon app={w.from} />
              <ArrowRight className="size-4 text-ink-faint" />
              <AppIcon app={w.to} />
            </div>
            <h3 className="mt-5 text-base font-semibold text-ink">{w.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{w.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

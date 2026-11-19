import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TEMPLATES } from "@/features/templates/templates";
import { TemplateApps } from "@/features/templates/TemplateCards";
import { SectionHeading } from "./SectionHeading";

// The same templates offered in the app ("Start from a template" on the dashboard).
export function ExampleWorkflows() {
  return (
    <section id="workflows" className="scroll-mt-24 bg-surface px-5 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Workflows"
        title="Ideas to start with."
        description="Each of these takes a couple of minutes to set up."
      />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Link
            key={t.id}
            href="/signup"
            className="group flex flex-col rounded-card border border-line bg-canvas p-6 transition hover:-translate-y-px hover:border-line-strong hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <TemplateApps apps={t.apps} />
            <h3 className="mt-5 text-base font-semibold text-ink">{t.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">{t.description}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Start with this
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

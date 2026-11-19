import Link from "next/link";
import { ArrowRight, LayoutTemplate } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { TEMPLATES } from "./templates";

const templateHref = (t) => `/flows/new?template=${encodeURIComponent(t.id)}`;

/** The apps a template uses, in order, with arrows between them. */
export function TemplateApps({ apps, size = "md" }) {
  return (
    <span className="flex items-center gap-1.5">
      {apps.map((app, i) => (
        <span key={`${app}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="size-3.5 text-ink-faint" aria-hidden="true" />}
          <AppIcon app={app} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Full "Start from a template" grid (dashboard with no Flows yet). */
export function TemplateGrid({ templates = TEMPLATES }) {
  return (
    <section aria-labelledby="templates-title">
      <h2 id="templates-title" className="text-base font-semibold text-ink">Start from a template</h2>
      <p className="mt-1 text-sm text-ink-muted">The steps come filled in. You choose your accounts, the channel or repository, then turn it on.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Link
            key={t.id}
            href={templateHref(t)}
            className="group flex flex-col rounded-card border border-line bg-surface p-5 shadow-card transition hover:-translate-y-px hover:border-line-strong hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <TemplateApps apps={t.apps} size="sm" />
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{t.title}</h3>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-muted">{t.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Use this template
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Compact "Start from a template" row above the Flows list. */
export function TemplateRow({ templates = TEMPLATES }) {
  return (
    <nav aria-label="Start from a template" className="mb-6 flex flex-wrap items-center gap-2">
      <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted">
        <LayoutTemplate className="size-4 text-ink-faint" aria-hidden="true" />
        Start from a template:
      </span>
      {templates.map((t) => (
        <Link
          key={t.id}
          href={templateHref(t)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm text-ink transition-colors hover:border-line-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex gap-0.5">
            {t.apps.map((app, i) => <AppIcon key={`${app}-${i}`} app={app} size="sm" />)}
          </span>
          {t.title}
        </Link>
      ))}
    </nav>
  );
}

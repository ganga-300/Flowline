import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { integrationsList } from "@/integrations";
import { SectionHeading } from "./SectionHeading";

// Lists come straight from the integration definitions the builder uses,
// so this section always matches what Flowline can actually do.
export function Integrations() {
  return (
    <section id="integrations" className="scroll-mt-24 px-5 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Integrations"
        title="Three apps your team already lives in."
        description="Start a workflow from something that happens in one app, and finish it in another."
      />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
        {integrationsList.map((app) => (
          <Card key={app.id} className="p-6">
            <div className="flex items-center gap-3">
              <AppIcon app={app.id} size="lg" />
              <h3 className="text-lg font-semibold text-ink">{app.name}</h3>
            </div>
            <div className="mt-6 space-y-5 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">When</p>
                <ul className="mt-2 space-y-1.5">
                  {app.triggers.map((t) => <li key={t.id} className="text-ink">{t.name}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Then</p>
                <ul className="mt-2 space-y-1.5">
                  {app.actions.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-ink">
                      <ArrowRight className="size-3.5 text-ink-faint" />
                      {a.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

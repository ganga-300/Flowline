import { RefreshCcw, ShieldCheck, Telescope } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

// Numbers come from Flowline's own crash and load tests
// (docs/25-reliability-and-load-results.md) - keep them in sync with that file.
const STATS = [
  { value: "0", label: "duplicate actions", note: "across 1,500 events with 6 deliberate worker crashes" },
  { value: "1,000/s", label: "webhooks accepted", note: "at p95 under 10 ms in load tests" },
  { value: "195 ms", label: "from webhook to finished run", note: "p95 for a two-step Zap, app APIs simulated" },
];

const POINTS = [
  { icon: RefreshCcw, title: "Survives restarts", text: "If a worker stops mid-run, completed steps are never repeated and nothing is lost." },
  { icon: ShieldCheck, title: "Retries only when safe", text: "Rate limits and outages are retried. Anything that might already have gone out is flagged, not resent." },
  { icon: Telescope, title: "Nothing hidden", text: "Run history shows exactly what each step sent and received, so problems are quick to fix." },
];

export function Reliability() {
  return (
    <section id="reliability" className="scroll-mt-24 px-5 py-24 sm:px-8">
      <SectionHeading
        eyebrow="Reliability"
        title="Built to do the job exactly once."
        description="An automation you can't trust is worse than none. Flowline is tested for the moments things go wrong."
      />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-6 shadow-card">
            <p className="heading-display text-5xl text-ink">{s.value}</p>
            <p className="mt-2 text-sm font-medium text-ink">{s.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-5 grid max-w-6xl gap-5 md:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-4 rounded-card bg-subtle/70 p-6">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-xs text-ink-faint">
        Measured with k6 and a crash test on a single 4-vCPU machine, with the app APIs simulated.
      </p>
    </section>
  );
}

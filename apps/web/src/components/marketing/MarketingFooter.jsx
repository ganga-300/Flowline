import Link from "next/link";
import { Logo } from "@/components/layout";

const COLUMNS = [
  { title: "Product", links: [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#integrations", label: "Integrations" },
    { href: "/#workflows", label: "Workflows" },
    { href: "/#reliability", label: "Reliability" },
  ] },
  { title: "Account", links: [
    { href: "/signup", label: "Sign up" },
    { href: "/login", label: "Log in" },
  ] },
  { title: "Legal", links: [
    { href: "/privacy", label: "Privacy policy" },
  ] },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface px-5 py-14 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-10 md:flex-row">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-ink-muted">Automations between GitHub, Slack and Gmail.</p>
        </div>
        <div className="flex gap-16">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.includes("#") ? (
                      <a href={l.href} className="text-sm text-ink-muted hover:text-ink">{l.label}</a>
                    ) : (
                      <Link href={l.href} className="text-sm text-ink-muted hover:text-ink">{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-12 max-w-6xl text-xs text-ink-faint">© {new Date().getFullYear()} Flowline</p>
    </footer>
  );
}

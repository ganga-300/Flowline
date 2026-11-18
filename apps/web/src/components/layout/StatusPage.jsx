import { Logo } from "./Logo";

/** Full-page message (404, crash): logo, a short title and explanation, and actions. */
export function StatusPage({ code, title, description, actions }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        {code && <p className="font-mono text-sm font-medium text-ink-faint">{code}</p>}
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-md text-sm text-ink-muted">{description}</p>}
        {actions && <div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div>}
      </main>
    </div>
  );
}

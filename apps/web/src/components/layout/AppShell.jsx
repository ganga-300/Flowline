"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, History, LayoutGrid, LogOut, Menu, Plug, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Spinner } from "@/components/ui";
import { useAuthProtection } from "@/lib/useAuthProtection";
import { authFetch } from "@/lib/api";
import { Logo } from "./Logo";

// Dispatched on window when alerts are dismissed, so the nav badge recounts right away.
export const ALERTS_CHANGED = "flowline:alerts-changed";
const ALERT_POLL_MS = 60_000;

/** Alerts not dismissed yet (GET /alerts/count), refreshed on navigation, every minute and on ALERTS_CHANGED. */
function useAlertCount(enabled) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      authFetch("/alerts/count")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => alive && data && setCount(Number(data.count) || 0))
        .catch(() => {}); // a badge isn't worth an error message
    load();
    const timer = setInterval(load, ALERT_POLL_MS);
    window.addEventListener(ALERTS_CHANGED, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(ALERTS_CHANGED, load);
    };
  }, [enabled, pathname]);
  return count;
}

const NAV = [
  { href: "/dashboard", label: "Zaps", icon: LayoutGrid },
  { href: "/history", label: "Zap History", icon: History },
  { href: "/connections", label: "Apps", icon: Plug },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

function NavLinks({ onNavigate, alertCount = 0 }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/dashboard" && pathname.startsWith("/zaps"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-subtle text-ink" : "text-ink-muted hover:bg-subtle hover:text-ink"
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/alerts" && alertCount > 0 && (
              <span className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5 text-white">
                {alertCount > 99 ? "99+" : alertCount}
                <span className="sr-only"> {alertCount === 1 ? "alert" : "alerts"}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Signed-in layout: sidebar on desktop, top bar + drawer on mobile. Redirects to /login if signed out. */
export function AppShell({ children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuthProtection();
  const alertCount = useAlertCount(isAuthenticated);

  const logout = () => {
    localStorage.removeItem("flowline_token");
    router.push("/login");
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo href="/dashboard" className="px-1" />
      <Button href="/zaps/new" leftIcon={<Plus className="size-4" />} onClick={() => setOpen(false)}>
        New Zap
      </Button>
      <NavLinks onNavigate={() => setOpen(false)} alertCount={alertCount} />
      <div className="mt-auto border-t border-line pt-3">
        <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer">
          <LogOut className="size-4" />
          Log out
        </button>
      </div>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-ink-faint">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button type="button" onClick={() => setOpen(true)} aria-label={alertCount > 0 ? `Open menu (${alertCount} ${alertCount === 1 ? "alert" : "alerts"})` : "Open menu"} className="relative rounded-md p-2 text-ink-muted hover:bg-subtle cursor-pointer">
          <Menu className="size-5" />
          {alertCount > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface" />}
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-raised">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-md p-1.5 text-ink-faint hover:bg-subtle cursor-pointer">
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

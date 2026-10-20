"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LayoutGrid, LogOut, Menu, Plug, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { Logo } from "./Logo";

const NAV = [
  { href: "/dashboard", label: "Zaps", icon: LayoutGrid },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

function NavLinks({ onNavigate }) {
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
          </Link>
        );
      })}
    </nav>
  );
}

/** Signed-in layout: sidebar on desktop, top bar + drawer on mobile. */
export function AppShell({ children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
      <NavLinks onNavigate={() => setOpen(false)} />
      <div className="mt-auto border-t border-line pt-3">
        <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer">
          <LogOut className="size-4" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-ink-muted hover:bg-subtle cursor-pointer">
          <Menu className="size-5" />
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

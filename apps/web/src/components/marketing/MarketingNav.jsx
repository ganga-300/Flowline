"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { Logo } from "@/components/layout";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#integrations", label: "Integrations" },
  { href: "#workflows", label: "Workflows" },
  { href: "#reliability", label: "Reliability" },
];

/** Transparent over the hero; frosted once the page scrolls. */
export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-colors", scrolled ? "border-b border-line/70 bg-canvas/80 backdrop-blur-md" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full bg-white/55 px-2 py-1 shadow-card ring-1 ring-white/70 backdrop-blur md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-white hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="px-3 text-sm font-medium text-ink-muted hover:text-ink">Log in</Link>
          <Button href="/signup" size="sm">Get started</Button>
        </div>
        <button type="button" className="rounded-md p-2 text-ink md:hidden cursor-pointer" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-surface px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-control px-3 py-2 text-sm text-ink-muted hover:bg-subtle">{l.label}</a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            <Button href="/login" variant="outline" className="flex-1">Log in</Button>
            <Button href="/signup" className="flex-1">Get started</Button>
          </div>
        </div>
      )}
    </header>
  );
}

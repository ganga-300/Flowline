import Link from "next/link";
import { cn } from "@/lib/cn";

/** Flowline mark (three connected steps) + wordmark. */
export function Logo({ href = "/", className, showWordmark = true }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
        <rect width="28" height="28" rx="8" className="fill-ink" />
        <circle cx="8" cy="14" r="2.6" fill="#fff" />
        <circle cx="20" cy="8.5" r="2.6" fill="#fff" />
        <circle cx="20" cy="19.5" r="2.6" fill="#fff" />
        <path d="M10.4 13 L17.6 9.5 M10.4 15 L17.6 18.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {showWordmark && <span className="text-[17px] font-semibold tracking-tight">Flowline</span>}
    </Link>
  );
}

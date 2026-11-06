"use client";

import { ChevronRight, Plus } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AppGlyph } from "./AppGlyph";
import { capabilitySummary, connectedLabel } from "./appsDirectory";

const tileFrame = "relative flex flex-col rounded-card border border-line bg-surface shadow-card";

/** Status at the bottom of a tile: connected badge, built-in note, or a Connect button. */
function TileStatus({ app, accounts, onConnect }) {
  if (app.kind === "builtin") return <Badge tone="neutral">Built in · no account needed</Badge>;
  if (accounts.length > 0) return <Badge tone="success" dot>{connectedLabel(accounts.length)}</Badge>;
  return (
    // Sits above the tile's full-size click target, so it connects instead of opening details.
    <Button size="sm" className="relative z-10" leftIcon={<Plus className="size-3.5" />} onClick={() => onConnect(app.id)} aria-label={`Connect ${app.name}`}>
      Connect
    </Button>
  );
}

/**
 * One app in the directory. The whole tile opens the app's details (the name is the real
 * button; its ::after covers the tile), and "Connect" starts OAuth straight away.
 * `match`: why it matched the search, to show "Action · Send Email" under the purpose.
 */
export function AppTile({ app, accounts = [], match, onOpen, onConnect }) {
  const hint = match && match.field !== "app" ? match : null;
  return (
    <div
      className={cn(
        tileFrame,
        "group transition duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised",
        "has-[[data-tile-open]:focus-visible]:ring-2 has-[[data-tile-open]:focus-visible]:ring-primary/40 has-[[data-tile-open]:focus-visible]:ring-offset-2 has-[[data-tile-open]:focus-visible]:ring-offset-canvas"
      )}
    >
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <AppGlyph app={app.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-6 text-ink">
            <button
              type="button"
              data-tile-open
              onClick={() => onOpen(app.id)}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] cursor-pointer"
            >
              {app.name}
            </button>
          </h3>
          <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-ink-muted">{app.purpose}</p>
        </div>
        <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-faint transition duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>

      {hint && (
        <p className="-mt-1 truncate px-5 pb-4 text-xs text-ink-muted">
          <span className="mr-1.5 rounded-md bg-primary-soft px-1.5 py-0.5 font-medium text-primary">{hint.field === "trigger" ? "Trigger" : "Action"}</span>
          {hint.name}
        </p>
      )}

      <div className="mt-auto flex min-h-14 items-center justify-between gap-3 border-t border-line px-5 py-3">
        <TileStatus app={app} accounts={accounts} onConnect={onConnect} />
        <span className="shrink-0 text-xs text-ink-faint">{capabilitySummary(app)}</span>
      </div>
    </div>
  );
}

/** Placeholder tile while connections load. */
export function AppTileSkeleton() {
  return (
    <div className={tileFrame} aria-hidden="true">
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <div className="size-11 shrink-0 animate-pulse rounded-control bg-subtle" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-24 animate-pulse rounded bg-subtle" />
          <div className="h-3 w-full animate-pulse rounded bg-subtle" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-subtle" />
        </div>
      </div>
      <div className="flex min-h-14 items-center justify-between border-t border-line px-5 py-3">
        <div className="h-6 w-32 animate-pulse rounded-full bg-subtle" />
        <div className="h-3 w-20 animate-pulse rounded bg-subtle" />
      </div>
    </div>
  );
}

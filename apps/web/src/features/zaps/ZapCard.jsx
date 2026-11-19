"use client";

import Link from "next/link";
import { AlertTriangle, History, Pencil, Play, Trash2 } from "lucide-react";
import { Badge, Button, Card, Switch } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";
import { describeTrigger } from "./describeTrigger";
import { lastRunSummary, reconnectHref, zapReconnectWarning } from "./zapHealth";

/** One Zap on the dashboard: what it watches, on/off, and its actions. */
export function ZapCard({ zap, running, onRun, onToggle, onDelete }) {
  const trigger = describeTrigger(zap.trigger);
  const enabled = zap.status === "ENABLED";
  const name = zap.zapName || zap.name || "Untitled Zap";
  const lastRun = lastRunSummary(zap);
  const warning = zapReconnectWarning(zap);

  return (
    <Card interactive className={cn("flex flex-col", (warning || (enabled && lastRun?.failing)) && "border-warning/40")}>
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <AppIcon app={trigger.app} />
          <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            {enabled ? "On" : "Off"}
            <Switch checked={enabled} onChange={() => onToggle(zap)} label={enabled ? `Pause ${name}` : `Turn on ${name}`} />
          </label>
        </div>
        <h3 className="mt-4 truncate text-base font-semibold text-ink" title={name}>{name}</h3>
        <p className="mt-1 text-sm text-ink-muted">
          <span className="text-ink">{trigger.appName}</span> · {trigger.event}
        </p>
        {trigger.detail && <p className="mt-0.5 truncate text-sm text-ink-faint" title={trigger.detail}>{trigger.detail}</p>}

        <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
          {lastRun ? (
            <>
              <span>Last run</span>
              <Link href={lastRun.href} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" aria-label={`Last run: ${lastRun.label}, ${lastRun.when}. Open it`}>
                <Badge tone={lastRun.tone} dot>{lastRun.label}</Badge>
              </Link>
              <span>{lastRun.when}</span>
            </>
          ) : (
            <span>No runs yet</span>
          )}
        </p>

        {warning && (
          <div className="mt-3 flex gap-2 rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0">
              {warning}{" "}
              <Link href={reconnectHref(zap)} className="font-medium underline underline-offset-2 hover:text-primary">Reconnect</Link>
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            loading={running}
            disabled={!enabled}
            title={enabled ? undefined : "Turn the Zap on to run it"}
            leftIcon={<Play className="size-3.5" />}
            onClick={() => onRun(zap)}
          >
            {running ? "Running" : "Run"}
          </Button>
          <Button size="sm" variant="ghost" href={`/zaps/${zap.id}/runs`} leftIcon={<History className="size-3.5" />}>History</Button>
          <Button size="sm" variant="ghost" href={`/zaps/${zap.id}/edit`} leftIcon={<Pencil className="size-3.5" />}>Edit</Button>
        </div>
        <button
          type="button"
          onClick={() => onDelete(zap)}
          aria-label={`Delete ${name}`}
          title="Delete"
          className="rounded-md p-2 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger cursor-pointer"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </Card>
  );
}

export function ZapCardSkeleton() {
  return (
    <Card className="animate-pulse p-5">
      <div className="flex justify-between">
        <div className="size-9 rounded-control bg-subtle" />
        <div className="h-5 w-16 rounded-full bg-subtle" />
      </div>
      <div className="mt-5 h-4 w-2/3 rounded bg-subtle" />
      <div className="mt-3 h-3 w-1/2 rounded bg-subtle" />
      <div className="mt-8 h-8 w-full rounded bg-subtle" />
    </Card>
  );
}

"use client";

import Link from "next/link";
import { History, Pencil, Play, Trash2 } from "lucide-react";
import { Button, Card, Switch } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { describeTrigger } from "./describeTrigger";

/** One Zap on the dashboard: what it watches, on/off, and its actions. */
export function ZapCard({ zap, running, onRun, onToggle, onDelete }) {
  const trigger = describeTrigger(zap.trigger);
  const enabled = zap.status === "ENABLED";
  const name = zap.zapName || zap.name || "Untitled Zap";

  return (
    <Card interactive className="flex flex-col">
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
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" loading={running} leftIcon={<Play className="size-3.5" />} onClick={() => onRun(zap)}>
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

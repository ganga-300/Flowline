"use client";

import { Plus, Unplug } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";

const HINTS = {
  slack: "On Slack's page, pick the workspace that has your channels using the menu at the top right.",
  github: "GitHub shows an account picker, so you can connect an account other than the one you're signed in with.",
  gmail: "Google lets you choose which account to connect.",
};

function accountLabel(app, conn) {
  if (app === "github" && conn.email && !conn.email.includes("Account (")) return `@${conn.email}`;
  return conn.email;
}

function connectedOn(date) {
  return date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** One app (GitHub, Slack or Gmail): what it's used for, connected accounts, connect button. */
export function AppConnectionCard({ app, connections, onConnect, onDisconnect }) {
  const hasAccounts = connections.length > 0;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-4 p-5">
        <AppIcon app={app.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{app.name}</h2>
            {hasAccounts && <Badge tone="success" dot>Connected</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {app.triggers.length > 0 && <>Start Zaps on {app.triggers.map((t) => t.name.toLowerCase()).join(", ")}. </>}
            {app.actions.length > 0 && <>{app.actions.map((a) => a.name).join(", ")}.</>}
          </p>
        </div>
      </div>

      {hasAccounts && (
        <ul className="border-t border-line">
          {connections.map((conn) => (
            <li key={conn.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{accountLabel(app.id, conn)}</p>
                <p className="text-xs text-ink-faint">Connected {connectedOn(conn.createdAt)}</p>
              </div>
              <Button size="sm" variant="ghost" leftIcon={<Unplug className="size-3.5" />} onClick={() => onDisconnect(app, conn)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto border-t border-line px-5 py-4">
        <Button
          variant={hasAccounts ? "outline" : "primary"}
          size="sm"
          leftIcon={<Plus className="size-3.5" />}
          onClick={() => onConnect(app.id)}
        >
          {hasAccounts ? `Connect another ${app.name} account` : `Connect ${app.name}`}
        </Button>
        <p className="mt-2 text-xs text-ink-faint">{HINTS[app.id]}</p>
      </div>
    </Card>
  );
}

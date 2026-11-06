"use client";

import Link from "next/link";
import { ArrowUpRight, Play, Plus, RefreshCw, Unplug, X, Zap } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { AppGlyph } from "./AppGlyph";
import { CONNECT_HINTS, accountLabel, connectedLabel, connectedOn, usageText } from "./appsDirectory";

function Section({ title, count, children }) {
  return (
    <section className="px-5 py-5 sm:px-6">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {title}
        {count != null && <span className="rounded-full bg-subtle px-1.5 py-px text-[11px] tabular-nums text-ink-muted">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Triggers or actions: name + description, or a note when the app has none. */
function EventList({ items, icon: Icon, empty }) {
  if (items.length === 0) return <p className="text-sm text-ink-faint">{empty}</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 rounded-control px-2 py-2 -mx-2 transition-colors hover:bg-subtle">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{item.name}</p>
            {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One connected account: name, date, the Zaps using it, Reconnect / Disconnect. */
function AccountRow({ app, conn, isNew, onReconnect, onDisconnect }) {
  const label = accountLabel(app.id, conn) || "Account";
  const usage = usageText(conn.usedBy);
  return (
    <li className="rounded-control border border-line bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold uppercase text-ink-muted">
          {label.replace(/^@/, "").charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">{label}</p>
            {isNew && <Badge tone="primary">New</Badge>}
          </div>
          <p className="text-xs text-ink-faint">
            Connected {connectedOn(conn.createdAt)}
            {usage && <> · {usage}</>}
          </p>
        </div>
      </div>

      {conn.usedBy?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 pl-11" aria-label={`Zaps using ${label}`}>
          {conn.usedBy.map((zap) => (
            <li key={zap.zapId}>
              <Link
                href={`/zaps/${zap.zapId}/edit`}
                className="inline-flex max-w-56 items-center gap-1 rounded-md border border-line bg-canvas px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="truncate">{zap.zapName}</span>
                <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2 pl-11">
        <Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-3.5" />} onClick={() => onReconnect(app.id)} title={`Sign in to ${app.name} again`}>
          Reconnect
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<Unplug className="size-3.5" />} onClick={() => onDisconnect(app, conn)} aria-label={`Disconnect ${label}`}>
          Disconnect
        </Button>
      </div>
    </li>
  );
}

/** Contents of the app drawer: header, accounts (OAuth apps), triggers and actions. */
export function AppDetail({ app, accounts, titleId, newConnectionId, onClose, onConnect, onDisconnect }) {
  const isOAuth = app.kind === "oauth";
  return (
    <>
      <header className="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-6">
        <AppGlyph app={app.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">{app.name}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{app.description}</p>
          <div className="mt-2.5">
            {!isOAuth ? (
              <Badge tone="neutral">Built in · no account needed</Badge>
            ) : accounts.length > 0 ? (
              <Badge tone="success" dot>{connectedLabel(accounts.length)}</Badge>
            ) : (
              <Badge tone="neutral" dot>Not connected</Badge>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 divide-y divide-line overflow-y-auto">
        {isOAuth ? (
          <Section title="Accounts" count={accounts.length}>
            {accounts.length > 0 ? (
              <ul className="space-y-2.5">
                {accounts.map((conn) => (
                  <AccountRow key={conn.id} app={app} conn={conn} isNew={conn.id === newConnectionId} onReconnect={onConnect} onDisconnect={onDisconnect} />
                ))}
              </ul>
            ) : (
              <div className="rounded-control border border-dashed border-line-strong bg-canvas px-4 py-5 text-center">
                <p className="text-sm font-medium text-ink">No {app.name} account yet</p>
                <p className="mt-1 text-sm text-ink-muted">Connect one to use {app.name} in your Zaps.</p>
              </div>
            )}
          </Section>
        ) : (
          <Section title="Setup">
            <p className="text-sm text-ink-muted">
              {`${app.name} works out of the box. Add it as a step when you build a Zap; there's nothing to connect.`}
            </p>
          </Section>
        )}

        <Section title="Triggers" count={app.triggers.length}>
          <EventList items={app.triggers} icon={Play} empty={`${app.name} can't start a Zap, but you can use it in any step after the trigger.`} />
        </Section>
        <Section title="Actions" count={app.actions.length}>
          <EventList items={app.actions} icon={Zap} empty={`${app.name} has no actions yet; use it to start a Zap.`} />
        </Section>
      </div>

      <footer className="border-t border-line bg-canvas/60 px-5 py-4 sm:px-6">
        {isOAuth ? (
          <>
            <Button className="w-full" variant={accounts.length > 0 ? "outline" : "primary"} leftIcon={<Plus className="size-4" />} onClick={() => onConnect(app.id)}>
              {accounts.length > 0 ? "Connect another account" : `Connect ${app.name}`}
            </Button>
            {CONNECT_HINTS[app.id] && <p className="mt-2 text-xs text-ink-faint">{CONNECT_HINTS[app.id]}</p>}
          </>
        ) : (
          <Button className="w-full" href="/zaps/new" leftIcon={<Plus className="size-4" />}>Create a Zap</Button>
        )}
      </footer>
    </>
  );
}

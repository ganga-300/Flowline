"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SearchX, Unplug, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import { readOAuthResult, startOAuth } from "@/lib/oauth";
import { integrationsList } from "@/integrations";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, EmptyState, Input, Modal, Tabs, Toast } from "@/components/ui";
import { AppDetail } from "@/features/connections/AppDetail";
import { AppTile, AppTileSkeleton } from "@/features/connections/AppTile";
import { Drawer } from "@/features/connections/Drawer";
import {
  STATUS_FILTERS, accountLabel, buildAppCatalog, disconnectWarning, filterApps, groupConnections, statusCounts,
} from "@/features/connections/appsDirectory";

const APPS = buildAppCatalog(integrationsList);
const APP_NAMES = Object.fromEntries(APPS.map((a) => [a.id, a.name]));
const SECTIONS = [
  { kind: "oauth", title: "Connect your accounts" },
  { kind: "builtin", title: "Built-in tools" },
];
const DRAWER_TITLE_ID = "app-drawer-title";

/** Apps directory: every app Zaps can use, the accounts connected to each, and what it can do. */
export default function AppsPage() {
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Result of an OAuth round trip: the server redirects back here with ?connected=... or ?error=...
  const [oauthResult, setOauthResult] = useState(null);
  const [newConnectionId, setNewConnectionId] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [openAppId, setOpenAppId] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null); // { app, conn }
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);

  // ?app=slack opens that app (OAuth returns here with it, so the new account is in view).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = readOAuthResult(window.location.search);
    const appId = params.get("app");
    if (!result && !appId) return;
    queueMicrotask(() => {
      if (result?.tone === "danger") setOauthResult(result);
      else {
        if (result) {
          setNewConnectionId(params.get("connectionId"));
          setToast({ tone: "success", message: `${APP_NAMES[result.provider] || "Account"} connected. You can now use it in your Zaps.` });
        }
        const open = result?.provider || appId;
        if (APP_NAMES[open]) setOpenAppId(open);
      }
    });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // "/" jumps to the search box, like most directories.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || openAppId) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAppId]);

  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await authFetch("/connections");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to fetch connections (${res.status})`);
      setConnections(data.connections || []);
    } catch (err) {
      setLoadError(err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Failed to load connections");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("flowline_token")) return; // AppShell redirects to /login
    queueMicrotask(loadConnections);
  }, [loadConnections]);

  const byApp = useMemo(() => groupConnections(connections), [connections]);
  const counts = useMemo(() => statusCounts(APPS, byApp), [byApp]);
  const rows = useMemo(() => filterApps(APPS, { query, status }, byApp), [query, status, byApp]);
  const openApp = APPS.find((a) => a.id === openAppId) || null;

  const handleConnect = (provider) => {
    // Come back with the app open, so the new account shows up right where they started.
    if (!startOAuth(provider, `/connections?app=${encodeURIComponent(provider)}`)) {
      setToast({ tone: "danger", message: "Please log in again to connect an account." });
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return;
    setIsDisconnecting(true);
    try {
      const res = await authFetch(`/connections/${disconnectTarget.conn.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to disconnect");
      }
      setConnections((prev) => prev.filter((c) => c.id !== disconnectTarget.conn.id));
      setToast({ tone: "success", message: `${disconnectTarget.app.name} account disconnected.` });
      setDisconnectTarget(null);
    } catch (err) {
      setToast({ tone: "danger", message: err.message || "Failed to disconnect account." });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
  };

  const disconnectUsedBy = disconnectTarget?.conn.usedBy;

  return (
    <AppShell>
      <PageHeader title="Apps" description="Connect the apps your Zaps use and see what each one can do. You can connect more than one account per app." />

      {oauthResult && (
        <Alert tone="danger" title="Connection failed" onDismiss={() => setOauthResult(null)} className="mb-6">
          {oauthResult.message}
        </Alert>
      )}

      {loadError && (
        <Alert tone="danger" title="Couldn't load your connected accounts" className="mb-6">
          {loadError}{" "}
          <button type="button" onClick={loadConnections} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
        </Alert>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search apps, triggers and actions"
            aria-label="Search apps, triggers and actions"
            className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-subtle px-1.5 font-mono text-[11px] text-ink-faint sm:block">/</kbd>
          )}
        </div>
        <Tabs
          value={status}
          onChange={setStatus}
          className="w-full sm:w-auto [&>button]:flex-1 [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:px-2 sm:[&>button]:flex-none sm:[&>button]:px-3"
          items={STATUS_FILTERS.map((f) => ({
            id: f.id,
            label: (
              <>
                {f.label}
                {!isLoading && <span className="tabular-nums text-ink-faint">{counts[f.id]}</span>}
              </>
            ),
          }))}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading apps">
          {[0, 1, 2, 3, 4, 5].map((i) => <AppTileSkeleton key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={query ? <SearchX className="size-5" /> : <Unplug className="size-5" />}
          title={query ? `No apps match “${query.trim()}”` : status === "connected" ? "No connected apps yet" : "Every app is connected"}
          description={
            query ? "Try an app name, or something you want to do, like “send email” or “new issue”." :
            status === "connected" ? "Connect an account and it will show up here." :
            "You've connected an account for every app that needs one."
          }
          action={<Button variant="outline" onClick={clearFilters}>{query ? "Clear search" : "Show all apps"}</Button>}
        />
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const sectionRows = rows.filter((r) => r.app.kind === section.kind);
            if (sectionRows.length === 0) return null;
            return (
              <section key={section.kind} aria-labelledby={`apps-${section.kind}`}>
                <h2 id={`apps-${section.kind}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{section.title}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sectionRows.map(({ app, match }) => (
                    <AppTile key={app.id} app={app} accounts={byApp[app.id]} match={match} onOpen={setOpenAppId} onConnect={handleConnect} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="sr-only" aria-live="polite">{isLoading ? "" : `${rows.length} ${rows.length === 1 ? "app" : "apps"} shown`}</p>

      <Drawer open={Boolean(openApp)} onClose={() => setOpenAppId(null)} labelledBy={DRAWER_TITLE_ID} suspended={Boolean(disconnectTarget)}>
        {openApp && (
          <AppDetail
            app={openApp}
            accounts={byApp[openApp.id] || []}
            titleId={DRAWER_TITLE_ID}
            newConnectionId={newConnectionId}
            onClose={() => setOpenAppId(null)}
            onConnect={handleConnect}
            onDisconnect={(app, conn) => setDisconnectTarget({ app, conn })}
          />
        )}
      </Drawer>

      <Modal
        open={Boolean(disconnectTarget)}
        onClose={() => !isDisconnecting && setDisconnectTarget(null)}
        title={`Disconnect ${disconnectTarget ? accountLabel(disconnectTarget.app.id, disconnectTarget.conn) : "this account"}?`}
        description={disconnectTarget ? disconnectWarning(disconnectTarget.app.name, disconnectUsedBy) : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisconnectTarget(null)} disabled={isDisconnecting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDisconnect} loading={isDisconnecting}>Disconnect</Button>
          </>
        }
      />

      {toast && <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { readOAuthResult, startOAuth } from "@/lib/oauth";
import { integrationsList } from "@/integrations";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, Card, Modal, Toast } from "@/components/ui";
import { AppConnectionCard } from "@/features/connections/AppConnectionCard";

const APP_NAMES = Object.fromEntries(integrationsList.map((a) => [a.id, a.name]));

export default function ConnectionsPage() {
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Result of an OAuth round trip: the server redirects back here with ?connected=... or ?error=...
  const [oauthResult, setOauthResult] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null); // { app, conn }
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const result = readOAuthResult(window.location.search);
    if (!result) return;
    queueMicrotask(() => setOauthResult(result));
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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

  const handleConnect = (provider) => {
    if (!startOAuth(provider, "/connections")) {
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

  return (
    <AppShell>
      <PageHeader title="Connections" description="Connect the accounts your Zaps use. You can connect more than one account per app." />

      {oauthResult && (
        <Alert
          tone={oauthResult.tone}
          title={oauthResult.tone === "danger" ? "Connection failed" : `${APP_NAMES[oauthResult.provider] || "Account"} connected`}
          onDismiss={() => setOauthResult(null)}
          className="mb-6"
        >
          {oauthResult.tone === "danger" ? oauthResult.message : "You can now use it in your Zaps."}
        </Alert>
      )}

      {loadError && (
        <Alert tone="danger" title="Couldn't load your connections" className="mb-6">
          {loadError}{" "}
          <button type="button" onClick={loadConnections} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Card key={i} className="h-56 animate-pulse bg-subtle/60" />)}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {integrationsList.map((app) => (
            <AppConnectionCard
              key={app.id}
              app={app}
              connections={connections.filter((c) => c.provider === app.id)}
              onConnect={handleConnect}
              onDisconnect={(a, conn) => setDisconnectTarget({ app: a, conn })}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(disconnectTarget)}
        onClose={() => !isDisconnecting && setDisconnectTarget(null)}
        title={`Disconnect ${disconnectTarget?.conn.email || "this account"}?`}
        description={`Zaps that use this ${disconnectTarget?.app.name || ""} account will stop working until you choose another account.`}
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

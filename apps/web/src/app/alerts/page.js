"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, EmptyState, Toast } from "@/components/ui";
import { AlertCard, AlertCardSkeleton } from "@/features/alerts/AlertCard";

function errorMessage(err, fallback) {
  return err instanceof TypeError ? "Can't reach the Flowline server right now." : err?.message || fallback;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((tone, message, ms = 4000) => {
    clearTimeout(toastTimer.current);
    setToast({ tone, message });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const loadAlerts = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await authFetch("/alerts");
      const data = await res.json().catch(() => {
        throw new Error("Server returned an invalid response");
      });
      if (!res.ok) throw new Error(data.error || `Couldn't load alerts (${res.status})`);
      setAlerts(data.alerts || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load alerts"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("flowline_token")) return; // AppShell redirects to /login
    queueMicrotask(loadAlerts);
    return () => clearTimeout(toastTimer.current);
  }, [loadAlerts]);

  const dismiss = async (alert) => {
    setDismissingId(alert.id);
    try {
      const res = await authFetch(`/alerts/${alert.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't dismiss the alert");
      }
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (err) {
      showToast("danger", errorMessage(err, "Couldn't dismiss the alert"));
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Alerts"
        description={
          alerts.length > 0
            ? `${alerts.length} failed run${alerts.length === 1 ? "" : "s"} to look at. The run history shows exactly which step broke.`
            : "When a Zap run fails, Flowline tells you here."
        }
        actions={
          <Button variant="outline" onClick={() => loadAlerts({ quiet: true })} loading={isRefreshing} leftIcon={<RefreshCw className="size-4" />}>
            Refresh
          </Button>
        }
      />

      {loadError && (
        <Alert tone="danger" title="Couldn't load alerts" className="mb-5">
          {loadError}{" "}
          <button type="button" onClick={() => loadAlerts()} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <AlertCardSkeleton key={i} />)}</div>
      ) : alerts.length === 0 && !loadError ? (
        <EmptyState
          icon={<BellOff className="size-5" />}
          title="No alerts"
          description="None of your Zaps have failed. If a run fails, you'll see which Zap and why, with a link to the run."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} dismissing={dismissingId === alert.id} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {toast && <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
    </AppShell>
  );
}

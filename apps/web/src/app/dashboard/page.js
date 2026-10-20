"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Workflow } from "lucide-react";
import { authFetch } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, EmptyState, Modal, Toast } from "@/components/ui";
import { ZapCard, ZapCardSkeleton } from "@/features/zaps/ZapCard";

export default function DashboardPage() {
  const [zaps, setZaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [runningZapId, setRunningZapId] = useState(null);
  const [toast, setToast] = useState(null); // { tone, message }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((tone, message, ms = 5000) => {
    clearTimeout(toastTimer.current);
    setToast({ tone, message });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const loadZaps = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await authFetch("/zaps");
      const data = await res.json().catch(() => {
        throw new Error("Server returned an invalid response");
      });
      if (!res.ok) throw new Error(data.error || `Failed to fetch zaps (${res.status})`);
      setZaps(data.zaps || []);
    } catch (err) {
      setLoadError(err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Failed to load Zaps");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch when signed in; AppShell redirects to /login otherwise.
    if (!localStorage.getItem("flowline_token")) return;
    queueMicrotask(loadZaps);
    return () => clearTimeout(toastTimer.current);
  }, [loadZaps]);

  const handleRun = async (zap) => {
    setRunningZapId(zap.id);
    try {
      const res = await authFetch(`/zaps/${zap.id}/run`, {
        method: "POST",
        body: JSON.stringify({ payload: { triggeredBy: "user_click", timestamp: new Date().toISOString() } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to run Zap");
      // The server says what actually happened: new events, nothing new, first check, or a read problem.
      showToast(data.success === false ? "warning" : "success", data.message || "Zap triggered. Actions are running.", 7000);
    } catch (err) {
      showToast("danger", err.message || "Failed to run Zap");
    } finally {
      setRunningZapId(null);
    }
  };

  const handleToggle = async (zap) => {
    const nextStatus = zap.status === "ENABLED" ? "DISABLED" : "ENABLED";
    try {
      const res = await authFetch(`/zaps/${zap.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update Zap status");
      }
      setZaps((prev) => prev.map((z) => (z.id === zap.id ? { ...z, status: nextStatus } : z)));
      showToast("success", nextStatus === "ENABLED" ? "Zap turned on." : "Zap paused.", 3000);
    } catch (err) {
      showToast("danger", err.message || "Failed to update Zap status");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/zaps/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete Zap");
      }
      setZaps((prev) => prev.filter((z) => z.id !== deleteTarget.id));
      showToast("success", "Zap deleted.", 3000);
      setDeleteTarget(null);
    } catch (err) {
      showToast("danger", err.message || "Failed to delete Zap");
    } finally {
      setIsDeleting(false);
    }
  };

  const activeCount = zaps.filter((z) => z.status === "ENABLED").length;

  return (
    <AppShell>
      <PageHeader
        title="Zaps"
        description={
          zaps.length > 0
            ? `${zaps.length} Zap${zaps.length === 1 ? "" : "s"}, ${activeCount} on. Run them now, pause them, or see what happened.`
            : "Your automations between GitHub, Slack and Gmail."
        }
        actions={<Button href="/zaps/new" leftIcon={<Plus className="size-4" />}>New Zap</Button>}
      />

      {loadError && (
        <Alert tone="danger" title="Couldn't load your Zaps" className="mb-6">
          {loadError}{" "}
          <button type="button" onClick={loadZaps} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <ZapCardSkeleton key={i} />)}
        </div>
      ) : zaps.length === 0 && !loadError ? (
        <EmptyState
          icon={<Workflow className="size-5" />}
          title="No Zaps yet"
          description="Create your first automation: pick what starts it, then what Flowline should do next."
          action={<Button href="/zaps/new" leftIcon={<Plus className="size-4" />}>Create a Zap</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {zaps.map((zap) => (
            <ZapCard
              key={zap.id}
              zap={zap}
              running={runningZapId === zap.id}
              onRun={handleRun}
              onToggle={handleToggle}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.zapName || "this Zap"}"?`}
        description="Its run history is deleted too. This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={isDeleting}>Delete Zap</Button>
          </>
        }
      />

      {toast && <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
    </AppShell>
  );
}

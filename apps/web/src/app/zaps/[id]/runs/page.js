"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Pencil, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, EmptyState, Modal, Tabs, Toast } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { describeTrigger } from "@/features/zaps/describeTrigger";
import { RunRow, RunRowSkeleton } from "@/features/runs/RunRow";
import { RUN_FILTERS, isActive, runStatusMeta } from "@/features/runs/runStatus";

const POLL_MS = 4000;

const EMPTY_COPY = {
  ALL: { title: "No runs yet", description: "When this Zap's trigger fires, or you press Run on the Zaps page, each run shows up here with every step." },
  SUCCESS: { title: "No successful runs", description: "Runs that finish every step show up here." },
  FAILED: { title: "No failed runs", description: "Nothing has failed. Runs that hit an error show up here with the step that broke." },
  FILTERED: { title: "No filtered runs", description: "Runs stopped by a Filter step show up here." },
  RUNNING: { title: "Nothing running", description: "Runs in progress, including ones waiting on a Delay step, show up here." },
  QUEUED: { title: "Nothing queued", description: "Runs waiting for a worker show up here." },
};

function errorMessage(err, fallback) {
  return err instanceof TypeError ? "Can't reach the Flowline server right now." : err?.message || fallback;
}

export default function ZapRunsPage({ params }) {
  const { id: zapId } = use(params);

  const [zap, setZap] = useState(null);
  const [runs, setRuns] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // runId -> { run } | { error } | { loading }
  const [retryTarget, setRetryTarget] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((tone, message, ms = 5000) => {
    clearTimeout(toastTimer.current);
    setToast({ tone, message });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const loadZap = useCallback(async () => {
    try {
      const res = await authFetch(`/zaps/${zapId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setZap(data.zap);
      else if (res.status === 404) setLoadError("This Zap doesn't exist or isn't yours.");
    } catch {
      // The runs request reports connection problems; the header just falls back.
    }
  }, [zapId]);

  const loadDetail = useCallback(async (runId) => {
    setDetails((prev) => ({ ...prev, [runId]: { ...prev[runId], loading: !prev[runId]?.run } }));
    try {
      const res = await authFetch(`/zaps/${zapId}/runs/${runId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load this run's steps.");
      setDetails((prev) => ({ ...prev, [runId]: { run: data.run } }));
    } catch (err) {
      setDetails((prev) => ({ ...prev, [runId]: { ...prev[runId], loading: false, error: errorMessage(err, "Couldn't load this run's steps.") } }));
    }
  }, [zapId]);

  // quiet = background refresh: no skeleton, no error banner flicker.
  const loadRuns = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const query = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await authFetch(`/zaps/${zapId}/runs${query}`);
      const data = await res.json().catch(() => {
        throw new Error("Server returned an invalid response");
      });
      if (!res.ok) throw new Error(data.error || `Couldn't load runs (${res.status})`);
      setRuns(data.runs || []);
      setLoadError(null);
    } catch (err) {
      if (!quiet) setLoadError(errorMessage(err, "Couldn't load runs"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [zapId, filter]);

  useEffect(() => {
    if (!localStorage.getItem("flowline_token")) return; // AppShell redirects to /login
    queueMicrotask(loadZap);
    return () => clearTimeout(toastTimer.current);
  }, [loadZap]);

  useEffect(() => {
    if (!localStorage.getItem("flowline_token")) return;
    queueMicrotask(() => loadRuns());
  }, [loadRuns]);

  // While something is queued or running, refresh the list (and the open run) until it settles.
  const hasActive = runs.some(isActive);
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadRuns({ quiet: true });
      if (expandedId) loadDetail(expandedId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, expandedId, loadRuns, loadDetail]);

  const toggle = (runId) => {
    if (expandedId === runId) return setExpandedId(null);
    setExpandedId(runId);
    if (!details[runId]?.run) loadDetail(runId);
  };

  const confirmRetry = async () => {
    if (!retryTarget) return;
    setIsRetrying(true);
    try {
      const res = await authFetch(`/zaps/${zapId}/runs/${retryTarget.id}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the retry");
      setRetryTarget(null);
      setFilter("ALL");
      setHighlightId(data.runId || null);
      showToast("success", "New run queued with the same trigger data. It's highlighted below.");
      await loadRuns({ quiet: true });
    } catch (err) {
      showToast("danger", errorMessage(err, "Couldn't start the retry"));
    } finally {
      setIsRetrying(false);
    }
  };

  const trigger = zap?.trigger ? describeTrigger(zap.trigger) : null;
  const unknownCount = runs.filter((r) => runStatusMeta(r).label === "Outcome unknown").length;
  const empty = EMPTY_COPY[filter] || EMPTY_COPY.ALL;

  return (
    <AppShell>
      <PageHeader
        back={
          <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Zaps
          </Link>
        }
        title={zap?.zapName || "Run history"}
        description={
          trigger ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <AppIcon app={trigger.app} size="sm" />
              <span>{trigger.appName} · {trigger.event}{trigger.detail && ` · ${trigger.detail}`}</span>
            </span>
          ) : (
            "Every run of this Zap, newest first."
          )
        }
        actions={
          <>
            <Button variant="outline" onClick={() => loadRuns({ quiet: true })} loading={isRefreshing} leftIcon={<RefreshCw className="size-4" />}>
              Refresh
            </Button>
            <Button variant="secondary" href={`/zaps/${zapId}/edit`} leftIcon={<Pencil className="size-4" />}>Edit Zap</Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <Tabs items={RUN_FILTERS} value={filter} onChange={(id) => { setFilter(id); setExpandedId(null); }} />
        </div>
        <p className="text-xs text-ink-faint">
          Latest 50 runs{hasActive && " · updating live"}
        </p>
      </div>

      {loadError && (
        <Alert tone="danger" title="Couldn't load run history" className="mb-5">
          {loadError}{" "}
          <button type="button" onClick={() => loadRuns()} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
        </Alert>
      )}

      {unknownCount > 0 && (
        <Alert tone="warning" title={`${unknownCount} run${unknownCount === 1 ? "" : "s"} with an unknown outcome`} className="mb-5">
          Flowline stopped while a step was sending its request, so it can&apos;t tell whether the app received it.
          It wasn&apos;t re-sent, to avoid a duplicate. Check the app first, then use Retry only if it&apos;s missing.
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <RunRowSkeleton key={i} />)}</div>
      ) : runs.length === 0 && !loadError ? (
        <EmptyState icon={<History className="size-5" />} title={empty.title} description={empty.description} />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              detail={details[run.id]?.run}
              loadingDetail={details[run.id]?.loading}
              detailError={details[run.id]?.error}
              highlighted={highlightId === run.id}
              onToggle={() => toggle(run.id)}
              onRetry={setRetryTarget}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(retryTarget)}
        onClose={() => !isRetrying && setRetryTarget(null)}
        title="Retry this run?"
        description="Flowline starts a new run with the same trigger data. The original run stays in the history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetryTarget(null)} disabled={isRetrying}>Cancel</Button>
            <Button onClick={confirmRetry} loading={isRetrying}>Retry run</Button>
          </>
        }
      >
        <Alert tone="warning">
          Every step runs again, including ones that already worked. Messages, emails or issues the
          original run sent will be sent a second time.
        </Alert>
      </Modal>

      {toast && <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
    </AppShell>
  );
}

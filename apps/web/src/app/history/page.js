"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Plus, RefreshCw, Workflow } from "lucide-react";
import { authFetch } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, EmptyState, Spinner, Toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { HistoryFilters } from "@/features/runs/HistoryFilters";
import { HistoryRunRow, HistoryRunRowSkeleton } from "@/features/runs/HistoryRunRow";
import { RetryDialog } from "@/features/runs/RetryDialog";
import { isActive } from "@/features/runs/runStatus";
import {
  DEFAULT_FILTERS, appendRuns, buildHistorySearch, buildRunsQuery, buildSummaryQuery, chipCounts,
  groupRunsByDay, hasActiveFilters, historyErrorMessage, mergePolledRuns, parseHistoryParams, staleActiveIds,
} from "@/features/runs/history";

const POLL_MS = 5000;
const FRESH_MS = 4000;
const SEARCH_DEBOUNCE_MS = 300;

/** GET a JSON body; throws with .status on a non-2xx or unreadable response. */
async function getJson(path) {
  const res = await authFetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(data?.error || (res.ok ? "Server returned an invalid response" : `Request failed (${res.status})`));
    err.status = res.status;
    throw err;
  }
  return data;
}

const hasToken = () => typeof window !== "undefined" && Boolean(localStorage.getItem("flowline_token"));

export default function HistoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<ListSkeleton />}>
        <ZapHistory />
      </Suspense>
    </AppShell>
  );
}

function ZapHistory() {
  // The URL is the source of truth for filters, so other pages can deep-link (?zap=&status=).
  const searchParams = useSearchParams();
  const filterSearch = buildHistorySearch(parseHistoryParams(searchParams));
  const filters = useMemo(() => parseHistoryParams(new URLSearchParams(filterSearch)), [filterSearch]);

  const setFilters = useCallback((patch) => {
    const next = { ...filters, ...patch };
    // Native history updates stay in sync with useSearchParams without a navigation.
    window.history.replaceState(null, "", `${window.location.pathname}${buildHistorySearch(next)}`);
  }, [filters]);

  const [searchText, setSearchText] = useState(filters.q);
  useEffect(() => {
    if (searchText.trim() === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: searchText.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, filters.q, setFilters]);

  const [list, setList] = useState({ runs: [], nextCursor: null });
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [refetching, setRefetching] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [counts, setCounts] = useState(null);
  const [live, setLive] = useState("live"); // live | reconnecting
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(null);
  const [zaps, setZaps] = useState(null);

  const [expanded, setExpanded] = useState({}); // runId -> true
  const [details, setDetails] = useState({}); // runId -> { run } | { error } | { loading }
  const [fresh, setFresh] = useState({}); // runId -> true while highlighted
  const [retryTarget, setRetryTarget] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const genRef = useRef(0); // bumps on every first-page load; older responses are dropped
  const pollingRef = useRef(false);
  const runsRef = useRef(list.runs);
  const expandedRef = useRef(expanded);
  const detailsRef = useRef(details);
  const timers = useRef(new Set());
  useEffect(() => {
    runsRef.current = list.runs;
    expandedRef.current = expanded;
    detailsRef.current = details;
  }, [list.runs, expanded, details]);

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const showToast = useCallback((tone, message) => {
    setToast({ tone, message, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const markFresh = useCallback((ids) => {
    if (!ids.length) return;
    setFresh((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    later(() => setFresh((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    }), FRESH_MS);
  }, [later]);

  const loadDetail = useCallback(async (run, { quiet = false } = {}) => {
    const zapId = run.zapId || run.zap?.id;
    if (!quiet) setDetails((prev) => ({ ...prev, [run.id]: { ...prev[run.id], loading: !prev[run.id]?.run, error: null } }));
    try {
      const data = await getJson(`/zaps/${zapId}/runs/${run.id}`);
      setDetails((prev) => ({ ...prev, [run.id]: { run: data.run } }));
    } catch (err) {
      if (quiet && detailsRef.current[run.id]?.run) return; // keep showing the last good trace
      const message = err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Couldn't load this run's steps.";
      setDetails((prev) => ({ ...prev, [run.id]: { ...prev[run.id], loading: false, error: message } }));
    }
  }, []);

  const loadFirstPage = useCallback(async () => {
    const gen = ++genRef.current;
    setRefetching(true);
    setMoreError(null);
    try {
      const [page, summary] = await Promise.all([
        getJson(buildRunsQuery(filters)),
        getJson(buildSummaryQuery(filters)).catch(() => null),
      ]);
      if (gen !== genRef.current) return;
      setList({ runs: page.runs || [], nextCursor: page.nextCursor || null });
      setCounts(summary?.counts || null);
      setLoadError(null);
      setLive("live");
      setPhase("ready");
    } catch (err) {
      if (gen !== genRef.current) return;
      setLoadError(historyErrorMessage(err));
      setPhase("error");
    } finally {
      if (gen === genRef.current) setRefetching(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!hasToken()) return; // AppShell redirects to /login
    queueMicrotask(loadFirstPage);
  }, [loadFirstPage]);

  useEffect(() => {
    if (!hasToken()) return;
    let cancelled = false;
    getJson("/zaps")
      .then((data) => !cancelled && setZaps(data.zaps || []))
      .catch(() => !cancelled && setZaps([]));
    return () => { cancelled = true; };
  }, []);

  // Live refresh: new runs go on top, runs in progress update in place, open rows stay open.
  const poll = useCallback(async ({ force = false } = {}) => {
    if (pollingRef.current || (!force && document.visibilityState !== "visible")) return;
    pollingRef.current = true;
    const gen = genRef.current;
    try {
      const head = await getJson(buildRunsQuery(filters));
      const headRuns = head.runs || [];
      const stale = staleActiveIds(runsRef.current, headRuns);
      const [refreshed, summary] = await Promise.all([
        stale.length ? getJson(`/runs?ids=${stale.map(encodeURIComponent).join(",")}`).then((d) => d.runs || []).catch(() => []) : [],
        getJson(buildSummaryQuery(filters)).catch(() => null),
      ]);
      if (gen !== genRef.current) return;

      const known = new Set(runsRef.current.map((r) => r.id));
      const added = runsRef.current.length ? headRuns.filter((r) => !known.has(r.id)).map((r) => r.id) : [];
      setList((prev) => {
        const merged = mergePolledRuns(prev.runs, headRuns, { refreshed });
        if (merged.gap) return { runs: headRuns, nextCursor: head.nextCursor || null };
        return merged.runs === prev.runs ? prev : { ...prev, runs: merged.runs };
      });
      markFresh(added);
      if (summary) setCounts(summary.counts);
      setLive("live");

      // Keep open traces current while their run is still going (or just finished).
      const latest = new Map([...refreshed, ...headRuns].map((r) => [r.id, r]));
      for (const id of Object.keys(expandedRef.current)) {
        const run = latest.get(id);
        const shown = detailsRef.current[id]?.run;
        if (run && (isActive(run) || (shown && shown.status !== run.status))) loadDetail(run, { quiet: true });
      }
    } catch {
      if (gen === genRef.current) setLive("reconnecting");
    } finally {
      pollingRef.current = false;
    }
  }, [filters, loadDetail, markFresh]);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, poll]);

  // Keep "5 min ago" honest between polls.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const loadMore = async () => {
    if (!list.nextCursor || loadingMore) return;
    const gen = genRef.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await getJson(buildRunsQuery(filters, { cursor: list.nextCursor }));
      if (gen !== genRef.current) return;
      setList((prev) => ({ runs: appendRuns(prev.runs, page.runs), nextCursor: page.nextCursor || null }));
    } catch (err) {
      if (gen === genRef.current) setMoreError(historyErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (run) => {
    const open = !expanded[run.id];
    setExpanded((prev) => {
      const next = { ...prev };
      if (open) next[run.id] = true;
      else delete next[run.id];
      return next;
    });
    if (open && !details[run.id]?.run) loadDetail(run);
  };

  const confirmRetry = async (mode) => {
    const target = retryTarget;
    if (!target) return;
    setIsRetrying(true);
    try {
      const zapId = target.zapId || target.zap?.id;
      const res = await authFetch(`/zaps/${zapId}/runs/${target.id}/retry`, { method: "POST", body: JSON.stringify({ mode }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the retry");
      setRetryTarget(null);
      const visible = filters.status === "ALL" || filters.status === "ACTIVE";
      showToast(
        "success",
        `${data.mode === "resume" ? "Retrying from the failed step." : "Running every step again."} ${
          visible ? "The new run is at the top." : "Switch to All or Running/Queued to follow it."
        }`
      );
      await poll({ force: true });
      if (data.runId) markFresh([data.runId]);
    } catch (err) {
      showToast("danger", err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Couldn't start the retry");
    } finally {
      setIsRetrying(false);
    }
  };

  const clearFilters = () => {
    setSearchText("");
    setFilters(DEFAULT_FILTERS);
  };

  const chips = chipCounts(counts);
  const total = chips?.[filters.status];
  const groups = useMemo(() => groupRunsByDay(list.runs, now), [list.runs, now]);
  const filtered = hasActiveFilters(filters);

  const zapOptions = useMemo(() => {
    const options = [{ value: "", label: "All Zaps" }];
    const sorted = [...(zaps || [])].sort((a, b) => (a.zapName || "").localeCompare(b.zapName || ""));
    options.push(...sorted.map((z) => ({ value: z.id, label: z.zapName || "Untitled Zap" })));
    if (filters.zapId && !sorted.some((z) => z.id === filters.zapId)) {
      const seen = list.runs.find((r) => (r.zapId || r.zap?.id) === filters.zapId)?.zap?.zapName;
      options.push({ value: filters.zapId, label: seen || (zaps ? "Zap not found" : "Loading…") });
    }
    return options;
  }, [zaps, filters.zapId, list.runs]);

  return (
    <>
      <PageHeader
        title="Zap History"
        description="Every run across all your Zaps, newest first. Open a run to see each step's data in and out."
        actions={
          <>
            {phase === "ready" && <LiveIndicator state={live} />}
            <Button
              variant="outline"
              onClick={() => (phase === "ready" ? poll({ force: true }) : loadFirstPage())}
              loading={refetching && phase !== "loading"}
              leftIcon={<RefreshCw className="size-4" />}
            >
              Refresh
            </Button>
          </>
        }
      />

      <HistoryFilters
        filters={filters}
        counts={chips}
        zapOptions={zapOptions}
        searchText={searchText}
        onSearchText={setSearchText}
        onChange={(patch) => setFilters(patch)}
        onClear={clearFilters}
        canClear={filtered || Boolean(searchText.trim())}
      />

      <div className="mb-3 mt-6 flex min-h-5 items-center justify-between gap-3 text-xs text-ink-faint" aria-live="polite">
        <span>
          {phase === "ready" && list.runs.length > 0 && (
            total !== undefined && total >= list.runs.length
              ? `Showing ${list.runs.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} run${total === 1 ? "" : "s"}`
              : `Showing ${list.runs.length.toLocaleString("en-US")} run${list.runs.length === 1 ? "" : "s"}`
          )}
        </span>
        {refetching && phase === "ready" && (
          <span className="inline-flex items-center gap-1.5"><Spinner className="size-3" /> Updating</span>
        )}
      </div>

      {loadError && (
        <Alert tone="danger" title="Couldn't load Zap History" className="mb-5">
          {loadError}{" "}
          <button type="button" onClick={() => loadFirstPage()} className="font-medium text-ink underline underline-offset-2 cursor-pointer">
            Try again
          </button>
        </Alert>
      )}

      {phase === "loading" ? (
        <ListSkeleton bare />
      ) : phase === "error" ? null : list.runs.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<History className="size-5" />}
            title="No runs match these filters"
            description="Try another status, Zap or date range, or clear the filters to see every run."
            action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState
            icon={<History className="size-5" />}
            title="No runs yet"
            description="Each time one of your Zaps is triggered, or you press Run on a Zap, the run shows up here with every step's data in and out. This page updates live."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button href="/zaps/new" leftIcon={<Plus className="size-4" />}>Create a Zap</Button>
                <Button href="/dashboard" variant="outline" leftIcon={<Workflow className="size-4" />}>Your Zaps</Button>
              </div>
            }
          />
        )
      ) : (
        <div className={cn("space-y-6 transition-opacity duration-200", refetching && "opacity-60")}>
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`day-${group.key}`}>
              <h2
                id={`day-${group.key}`}
                className="sticky top-14 z-10 -mx-1 mb-2 bg-canvas/90 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint backdrop-blur lg:top-0"
              >
                {group.label}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
                {group.runs.map((run) => (
                  <HistoryRunRow
                    key={run.id}
                    run={run}
                    now={now}
                    expanded={Boolean(expanded[run.id])}
                    detail={details[run.id]?.run}
                    loadingDetail={details[run.id]?.loading}
                    detailError={details[run.id]?.error}
                    fresh={Boolean(fresh[run.id])}
                    onToggle={() => toggle(run)}
                    onRetry={setRetryTarget}
                  />
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-col items-center gap-2 pb-4">
            {list.nextCursor ? (
              <Button variant="outline" onClick={loadMore} loading={loadingMore} className="min-w-40">
                Load more runs
              </Button>
            ) : (
              <p className="text-xs text-ink-faint">That&apos;s every run{filtered ? " matching these filters" : ""}.</p>
            )}
            {moreError && (
              <p role="alert" className="text-sm text-danger">
                {moreError}{" "}
                <button type="button" onClick={loadMore} className="font-medium text-ink underline underline-offset-2 cursor-pointer">Try again</button>
              </p>
            )}
          </div>
        </div>
      )}

      <RetryDialog
        key={retryTarget?.id || "none"}
        run={retryTarget ? details[retryTarget.id]?.run || retryTarget : null}
        retrying={isRetrying}
        onCancel={() => setRetryTarget(null)}
        onConfirm={confirmRetry}
      />

      {toast && <Toast key={toast.id} tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
    </>
  );
}

function LiveIndicator({ state }) {
  const live = state === "live";
  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted sm:inline-flex"
      title={live ? "New runs appear automatically while this tab is open." : "Lost contact with the server. Retrying…"}
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
        <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-success" : "bg-warning")} />
      </span>
      {live ? "Live" : "Reconnecting…"}
    </span>
  );
}

function ListSkeleton({ bare = false }) {
  const rows = (
    <div aria-busy="true" aria-label="Loading runs">
      <div className="mb-2 h-3 w-16 animate-pulse rounded bg-subtle" />
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {[0, 1, 2, 3, 4, 5].map((i) => <HistoryRunRowSkeleton key={i} />)}
      </ul>
    </div>
  );
  if (bare) return rows;
  return (
    <>
      <div className="mb-8 space-y-2">
        <div className="h-7 w-44 animate-pulse rounded bg-subtle" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-subtle" />
      </div>
      <div className="mb-6 h-28 animate-pulse rounded-card bg-subtle" />
      {rows}
    </>
  );
}

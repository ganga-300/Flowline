"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { useAuthProtection } from "@/lib/useAuthProtection";

// ── Icons ────────────────────────────────────────────────────────────
function ZapIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function ChevronDownIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function RefreshIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function CodeIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function AlertIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

// Format absolute date timestamp with precision
function formatAbsoluteTimestamp(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const pad = (n) => String(n).padStart(2, "0");
  const padMs = (n) => String(n).padStart(3, "0");

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  const ms = padMs(date.getUTCMilliseconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} UTC`;
}

// Calculate duration string
function calculateDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return "—";

  const diffMs = end - start;
  if (diffMs < 1000) {
    return `${diffMs}ms`;
  }
  return `${(diffMs / 1000).toFixed(2)}s`;
}

// Status Badges component
function RunStatusBadge({ status }) {
  switch (status) {
    case "SUCCESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#c4f542]/10 border border-[#c4f542]/30 text-[#c4f542]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c4f542]" />
          SUCCESS
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          FAILED
        </span>
      );
    case "FILTERED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          FILTERED
        </span>
      );
    case "RUNNING":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          RUNNING
        </span>
      );
    case "QUEUED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-800 border border-slate-700 text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          QUEUED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-slate-800 border border-slate-700 text-slate-400">
          {status || "UNKNOWN"}
        </span>
      );
  }
}

// Step Status Badge component
function StepStatusBadge({ status }) {
  switch (status) {
    case "SUCCESS":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          SUCCESS
        </span>
      );
    case "FAILED":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
          FAILED
        </span>
      );
    case "SKIPPED":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-purple-950/50 border border-purple-800/40 text-purple-300">
          SKIPPED
        </span>
      );
    case "RETRYING":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
          RETRYING
        </span>
      );
    case "RUNNING":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400 animate-pulse">
          RUNNING
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 border border-slate-700 text-slate-400">
          {status || "PENDING"}
        </span>
      );
  }
}

// JSON Block component with toggle view
function JsonBlock({ title, data }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
    return null;
  }

  const jsonString = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0d1117]/80">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-slate-900/60 hover:bg-slate-800/80 text-left text-xs font-mono text-slate-300 flex items-center justify-between transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <CodeIcon className="w-3.5 h-3.5 text-[#c4f542]" />
          <span>{title} Payload</span>
        </span>
        <span className="text-slate-500 flex items-center gap-1 text-[11px]">
          {isOpen ? "Collapse" : "Expand JSON"}
          {isOpen ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
        </span>
      </button>

      {isOpen && (
        <pre className="p-3 text-xs font-mono text-slate-300 bg-[#0d1117] overflow-x-auto border-t border-slate-800 max-h-64 scrollbar-thin">
          <code>{jsonString}</code>
        </pre>
      )}
    </div>
  );
}

export default function ZapRunsPage({ params }) {
  const resolvedParams = use(params);
  const zapId = resolvedParams.id;
  const { isAuthenticated } = useAuthProtection();

  const [zap, setZap] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [error, setError] = useState(null);

  // Accordion state
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [runDetails, setRunDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});

  // Fetch Zap details
  useEffect(() => {
    async function fetchZap() {
      try {
        const res = await authFetch(`http://localhost:4000/zaps/${zapId}`);
        if (res.ok) {
          const data = await res.json();
          setZap(data.zap);
        } else {
          setZap({ zapName: `Zap #${zapId}` });
        }
      } catch (err) {
        console.warn("Could not connect to backend server for Zap info:", err);
        setZap({ zapName: `Zap #${zapId}` });
      }
    }
    if (zapId) fetchZap();
  }, [zapId]);

  // Fetch Runs list (with status filter)
  const fetchRuns = async (status = selectedStatus) => {
    setIsLoadingRuns(true);
    setError(null);

    try {
      const url =
        status && status !== "ALL"
          ? `http://localhost:4000/zaps/${zapId}/runs?status=${status}`
          : `http://localhost:4000/zaps/${zapId}/runs`;

      const res = await authFetch(url);
      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Failed to load execution runs (${res.status})`);
      }
      setRuns(data.runs || []);
    } catch (err) {
      setError(err.message || "Failed to load runs");
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (zapId) {
      fetchRuns(selectedStatus);
    }
  }, [zapId, selectedStatus]);

  // Toggle run trace expansion
  const toggleExpand = async (runId) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(runId);

    // If step executions not loaded yet, fetch trace
    if (!runDetails[runId]) {
      setLoadingDetails((prev) => ({ ...prev, [runId]: true }));
      try {
        const res = await authFetch(`http://localhost:4000/zaps/${zapId}/runs/${runId}`);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setRunDetails((prev) => ({ ...prev, [runId]: data.run }));
        }
      } catch (err) {
        console.error(`Failed to fetch run ${runId} trace:`, err);
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [runId]: false }));
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center font-mono text-xs text-slate-400">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans flex flex-col selection:bg-[#c4f542]/30">
      {/* ── Top Header Bar ── */}
      <header className="h-16 border-b border-slate-800/80 bg-[#161b22]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">Dashboard</span>
          </Link>
          <div className="h-5 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
              <ZapIcon className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight">
                {zap?.zapName || "Execution History"}
              </h1>
              <div className="text-[11px] font-mono text-slate-400">
                Zap ID: {zapId}
              </div>
            </div>
          </div>
        </div>

        {/* Status Filter Dropdown & Refresh */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchRuns(selectedStatus)}
            title="Refresh runs"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshIcon className={`w-4 h-4 ${isLoadingRuns ? "animate-spin text-[#c4f542]" : ""}`} />
          </button>

          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-slate-400">Filter:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[#0d1117] border border-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-mono focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="FILTERED">FILTERED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="QUEUED">QUEUED</option>
            </select>
          </div>
        </div>
      </header>

      {/* ── Main Runs Content Container ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto py-8 px-4 sm:px-6">
        
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/80 border border-red-700 rounded-xl text-sm text-red-200 flex items-center gap-3">
            <AlertIcon className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold">Failed to fetch run history</p>
              <p className="text-xs text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoadingRuns ? (
          <div className="text-center py-20 bg-[#161b22]/40 rounded-2xl border border-slate-800">
            <div className="inline-block animate-spin w-8 h-8 border-2 border-[#c4f542] border-t-transparent rounded-full mb-3" />
            <p className="text-sm font-mono text-slate-400">Loading execution runs...</p>
          </div>
        ) : runs.length === 0 ? (
          /* ── Empty State ── */
          <div className="text-center py-20 px-4 bg-[#161b22]/40 rounded-2xl border border-slate-800/80 shadow-lg">
            <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <ZapIcon className="w-7 h-7 text-[#c4f542]" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No runs yet</h3>
            <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
              Trigger this Zap to see execution history here.
            </p>
          </div>
        ) : (
          /* ── Runs List ── */
          <div className="space-y-3">
            <div className="px-4 py-2 text-xs font-mono text-slate-400 flex items-center justify-between uppercase tracking-wider border-b border-slate-800/80">
              <div className="flex items-center gap-8">
                <span className="w-28">Status</span>
                <span>Execution Time (UTC)</span>
              </div>
              <div className="flex items-center gap-6">
                <span>Duration</span>
                <span className="w-16 text-right">Details</span>
              </div>
            </div>

            {runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const detail = runDetails[run.id];
              const isLoadingDetail = loadingDetails[run.id];

              return (
                <div
                  key={run.id}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isExpanded
                      ? "bg-[#161b22] border-[#c4f542]/50 shadow-[0_0_20px_rgba(196,245,66,0.05)]"
                      : "bg-[#161b22]/60 border-slate-800 hover:border-slate-700 hover:bg-[#161b22]"
                  }`}
                >
                  {/* Row Header (Clickable Accordion Trigger) */}
                  <div
                    onClick={() => toggleExpand(run.id)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-28 shrink-0">
                        <RunStatusBadge status={run.status} />
                      </div>
                      <div>
                        <div className="text-xs font-mono text-slate-200 font-medium">
                          {formatAbsoluteTimestamp(run.createdAt)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Run ID: {run.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-xs font-mono text-slate-400">
                        {calculateDuration(run.startedAt, run.completedAt)}
                      </div>
                      <div className="text-slate-400 hover:text-white transition-colors">
                        {isExpanded ? (
                          <ChevronDownIcon className="w-5 h-5 text-[#c4f542]" />
                        ) : (
                          <ChevronRightIcon className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Expanded Step Trace Details */}
                  {isExpanded && (
                    <div className="p-5 border-t border-slate-800/80 bg-[#0d1117]/60 space-y-4 animate-fadeIn">
                      
                      {/* Trigger Payload section */}
                      {run.triggerPayload && (
                        <div className="mb-4">
                          <JsonBlock title="Trigger" data={run.triggerPayload} />
                        </div>
                      )}

                      {/* Loading Step Trace */}
                      {isLoadingDetail ? (
                        <div className="py-6 text-center text-xs font-mono text-slate-400 flex items-center justify-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-[#c4f542] border-t-transparent rounded-full" />
                          <span>Fetching step execution trace...</span>
                        </div>
                      ) : detail?.stepExecutions && detail.stepExecutions.length > 0 ? (
                        <div className="space-y-3">
                          <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                            Step Execution Trace ({detail.stepExecutions.length} steps)
                          </div>

                          <div className="space-y-3 border-l-2 border-slate-800 ml-3 pl-4 pt-1">
                            {detail.stepExecutions.map((execution, index) => (
                              <div
                                key={execution.id || index}
                                className="bg-[#161b22] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm relative"
                              >
                                {/* Step Header */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-mono text-xs text-[#c4f542] font-semibold bg-[#c4f542]/10 px-2 py-0.5 rounded border border-[#c4f542]/20">
                                      {execution.step?.type || "STEP"}
                                    </span>
                                    <span className="text-sm font-semibold text-white">
                                      {execution.step?.name || `Step #${index + 1}`}
                                    </span>
                                    {execution.attempt > 1 && (
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                        Retried {execution.attempt}x
                                      </span>
                                    )}
                                  </div>

                                  <StepStatusBadge status={execution.status} />
                                </div>

                                {/* Step Error Box (if error exists) */}
                                {execution.error && (
                                  <div className="bg-red-950/40 border border-red-800/80 rounded-lg p-3 text-xs font-mono text-red-300 flex items-start gap-2">
                                    <AlertIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 overflow-x-auto">
                                      <span className="font-bold text-red-400">Error: </span>
                                      <span>
                                        {typeof execution.error === "object"
                                          ? JSON.stringify(execution.error)
                                          : execution.error}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Step Input & Output collapsible JSON blocks */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                  <JsonBlock title="Input" data={execution.input} />
                                  <JsonBlock title="Output" data={execution.output} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-xs font-mono text-slate-500">
                          No step executions recorded for this run.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

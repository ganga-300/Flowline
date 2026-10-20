// Pure helpers for the run history page: labels, tones, timing and the
// "outcome unknown" state. No React here, so they're easy to test.

export const RUN_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "SUCCESS", label: "Succeeded" },
  { id: "FAILED", label: "Failed" },
  { id: "FILTERED", label: "Filtered" },
  { id: "RUNNING", label: "Running" },
  { id: "QUEUED", label: "Queued" },
];

const RUN_STATUS = {
  SUCCESS: { tone: "success", label: "Succeeded" },
  FAILED: { tone: "danger", label: "Failed" },
  FILTERED: { tone: "neutral", label: "Filtered out" },
  RUNNING: { tone: "primary", label: "Running" },
  QUEUED: { tone: "neutral", label: "Queued" },
};

const STEP_STATUS = {
  SUCCESS: { tone: "success", label: "Done" },
  FAILED: { tone: "danger", label: "Failed" },
  SKIPPED: { tone: "neutral", label: "Skipped" },
  RETRYING: { tone: "warning", label: "Retrying" },
  RUNNING: { tone: "primary", label: "Running" },
  PENDING: { tone: "neutral", label: "Pending" },
};

const OUTCOME_UNKNOWN = { tone: "warning", label: "Outcome unknown" };

// The worker stores this sentence on a step that was mid-request when it stopped
// (apps/worker/src/index.js). That step was not re-sent, so we can't know if it landed.
const OUTCOME_UNKNOWN_MARKER = "can't tell whether the app received it";

export function isOutcomeUnknown(execution) {
  return execution?.status === "FAILED" && typeof execution.error === "string" && execution.error.includes(OUTCOME_UNKNOWN_MARKER);
}

/** Badge for a whole run. A failed run with an unknown-outcome step shows that instead of "Failed". */
export function runStatusMeta(run) {
  if (run?.status === "FAILED" && (run.stepExecutions || []).some(isOutcomeUnknown)) return OUTCOME_UNKNOWN;
  return RUN_STATUS[run?.status] || { tone: "neutral", label: run?.status || "Unknown" };
}

export function stepStatusMeta(execution) {
  if (isOutcomeUnknown(execution)) return OUTCOME_UNKNOWN;
  if (execution?.reusedFromRunId && execution.status === "SUCCESS") return { tone: "neutral", label: "Reused" };
  return STEP_STATUS[execution?.status] || { tone: "neutral", label: execution?.status || "Pending" };
}

/** "2 of 3 steps done" for the list row, or null when the run has no step records yet. */
export function stepProgress(run) {
  const executions = (run?.stepExecutions || []).filter((e) => e.status !== "SKIPPED");
  if (executions.length === 0) return null;
  const done = executions.filter((e) => e.status === "SUCCESS").length;
  return `${done} of ${executions.length} step${executions.length === 1 ? "" : "s"} done`;
}

export function isActive(run) {
  return run?.status === "QUEUED" || run?.status === "RUNNING";
}

/** "850 ms", "2.4 s", "1 min 5 s"; "—" when the run hasn't finished. */
export function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

/** Short relative time for the row ("5 min ago"), falling back to a date after a week. */
export function formatRelativeTime(dateStr, now = Date.now()) {
  const t = new Date(dateStr).getTime();
  if (!dateStr || !Number.isFinite(t)) return "—";
  const sec = Math.round((now - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min ago`;
  if (sec < 86_400) return `${Math.round(sec / 3600)} h ago`;
  if (sec < 7 * 86_400) return `${Math.round(sec / 86_400)} d ago`;
  const date = new Date(t);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!sameYear && { year: "numeric" }) });
}

/** Full local timestamp for tooltips and the expanded run. */
export function formatFullTime(dateStr) {
  const t = new Date(dateStr);
  if (!dateStr || Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
}

/** Step errors are usually strings; older records may hold objects. */
export function formatError(error) {
  if (!error) return "";
  return typeof error === "string" ? error : JSON.stringify(error);
}

const STEP_TYPE_LABELS = {
  ACTION: "Action", AI: "AI", FILTER: "Filter", BRANCH: "Branch", DELAY: "Delay",
  TRANSFORM: "Transform", FORMATTER: "Formatter", LOOP: "Loop",
};

/** { app, title, kind } for a step row: app is a provider id for app actions, else null. */
export function describeStep(step, index = 0) {
  const app = step?.type === "ACTION" ? step?.config?.provider || null : null;
  return {
    app,
    title: step?.name || `Step ${index + 1}`,
    kind: STEP_TYPE_LABELS[step?.type] || "Step",
  };
}

export function isEmptyPayload(data) {
  if (data === null || data === undefined || data === "") return true;
  return typeof data === "object" && Object.keys(data).length === 0;
}

/** Retry choices for a run: a failed run can resume from the failed step. */
export function retryOptions(run) {
  return run?.status === "FAILED" ? ["resume", "all"] : ["all"];
}

// Pure helpers for the Zap History page (/history): URL params, API queries, date
// presets, merging polled runs into the list and grouping by day. No React here.

export const PAGE_SIZE = 25;

/** Status chips. ACTIVE covers both Running and Queued runs. */
export const HISTORY_STATUS_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "SUCCESS", label: "Succeeded" },
  { id: "FAILED", label: "Failed" },
  { id: "FILTERED", label: "Filtered" },
  { id: "ACTIVE", label: "Running/Queued" },
];

const STATUS_QUERY = { SUCCESS: "SUCCESS", FAILED: "FAILED", FILTERED: "FILTERED", ACTIVE: "RUNNING,QUEUED" };

export const DATE_RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

export const DEFAULT_FILTERS = { status: "ALL", zapId: "", range: "all", q: "" };

const DAY_MS = 86_400_000;

/** Status chip id for a ?status= value. Other pages may link with RUNNING or QUEUED. */
export function normalizeStatus(value) {
  const s = String(value || "").trim().toUpperCase();
  if (s === "RUNNING" || s === "QUEUED" || s === "ACTIVE") return "ACTIVE";
  return STATUS_QUERY[s] ? s : "ALL";
}

/** Filters from the page URL: ?zap=<id>&status=<s>&range=<r>&q=<text>. Unknown values fall back to defaults. */
export function parseHistoryParams(params) {
  const get = (k) => (typeof params?.get === "function" ? params.get(k) : params?.[k]) || "";
  const range = get("range");
  return {
    status: normalizeStatus(get("status")),
    zapId: get("zap").trim(),
    range: DATE_RANGES.some((r) => r.id === range) ? range : DEFAULT_FILTERS.range,
    q: get("q").trim(),
  };
}

/** "?zap=..&status=.." for the page URL, leaving out defaults ("" when everything is default). */
export function buildHistorySearch(filters) {
  const p = new URLSearchParams();
  if (filters.zapId) p.set("zap", filters.zapId);
  if (filters.status && filters.status !== "ALL") p.set("status", filters.status);
  if (filters.range && filters.range !== DEFAULT_FILTERS.range) p.set("range", filters.range);
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(filters) {
  return Boolean(filters.zapId || filters.q?.trim() || (filters.status && filters.status !== "ALL") || (filters.range && filters.range !== DEFAULT_FILTERS.range));
}

/** Start of the date preset as a Date ("today" = local midnight), or null for all time. */
export function rangeStart(range, now = Date.now()) {
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "7d") return new Date(now - 7 * DAY_MS);
  if (range === "30d") return new Date(now - 30 * DAY_MS);
  return null;
}

function baseParams(filters, now) {
  const p = new URLSearchParams();
  if (filters.zapId) p.set("zapId", filters.zapId);
  const from = rangeStart(filters.range, now);
  if (from) p.set("from", from.toISOString());
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  return p;
}

/** GET /runs query string for the filters, plus an optional cursor and page size. */
export function buildRunsQuery(filters, { cursor, limit = PAGE_SIZE, now = Date.now() } = {}) {
  const p = baseParams(filters, now);
  const status = STATUS_QUERY[filters.status];
  if (status) p.set("status", status);
  if (cursor) p.set("cursor", cursor);
  if (limit) p.set("limit", String(limit));
  const s = p.toString();
  return `/runs${s ? `?${s}` : ""}`;
}

/** GET /runs/summary query: same filters, without status (each chip shows its own count). */
export function buildSummaryQuery(filters, { now = Date.now() } = {}) {
  const s = baseParams(filters, now).toString();
  return `/runs/summary${s ? `?${s}` : ""}`;
}

/** Counts for the chips from the summary response; null while unknown. */
export function chipCounts(counts) {
  if (!counts) return null;
  const n = (k) => Number(counts[k]) || 0;
  return {
    ALL: n("ALL"),
    SUCCESS: n("SUCCESS"),
    FAILED: n("FAILED"),
    FILTERED: n("FILTERED"),
    ACTIVE: n("RUNNING") + n("QUEUED"),
  };
}

/** Newest first; createdAt then id, matching the API's order. */
export function compareRuns(a, b) {
  const ta = new Date(a.createdAt).getTime() || 0;
  const tb = new Date(b.createdAt).getTime() || 0;
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Add the next page under the current list, skipping runs already shown. */
export function appendRuns(current, page) {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...(page || []).filter((r) => !seen.has(r.id))];
}

/**
 * Merge a poll into the list without disturbing it: known runs are updated in place,
 * new runs go on top. `head` is the newest page for the current filters; `refreshed`
 * are runs fetched by id (in-progress runs below the newest page).
 *
 * gap: the newest page was full and every run in it is new, so more runs may have
 * arrived than one page holds. The caller should replace the list with `head`.
 */
export function mergePolledRuns(current, head = [], { refreshed = [], pageSize = PAGE_SIZE } = {}) {
  const byId = new Map(current.map((r) => [r.id, r]));
  const added = head.filter((r) => !byId.has(r.id)).map((r) => r.id);
  const gap = current.length > 0 && head.length >= pageSize && added.length === head.length;

  const updates = new Map([...refreshed, ...head].map((r) => [r.id, r]));
  let changed = added.length > 0;
  const kept = current.map((r) => {
    const next = updates.get(r.id);
    if (!next || sameRun(r, next)) return r; // same object: React leaves the row alone
    changed = true;
    return next;
  });
  const fresh = head.filter((r) => added.includes(r.id));
  const runs = changed ? [...fresh, ...kept].sort(compareRuns) : current;
  return { runs, added, gap };
}

/** True when nothing the list shows has changed. */
export function sameRun(a, b) {
  if (a.status !== b.status || a.startedAt !== b.startedAt || a.completedAt !== b.completedAt) return false;
  if (a.zap?.zapName !== b.zap?.zapName) return false;
  const sa = a.stepExecutions || [];
  const sb = b.stepExecutions || [];
  return sa.length === sb.length && sa.every((e, i) => e.id === sb[i].id && e.status === sb[i].status && e.error === sb[i].error);
}

/** Ids of runs still in progress that the newest page didn't cover, to refresh by id. */
export function staleActiveIds(current, head, max = 100) {
  const inHead = new Set(head.map((r) => r.id));
  return current.filter((r) => (r.status === "QUEUED" || r.status === "RUNNING") && !inHead.has(r.id)).map((r) => r.id).slice(0, max);
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Day heading for a run: "Today", "Yesterday", "Monday, Nov 3" or "Nov 3, 2025". */
export function dayLabel(dateStr, now = Date.now()) {
  const t = new Date(dateStr).getTime();
  if (!dateStr || !Number.isFinite(t)) return "Unknown date";
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = new Date(t);
  if (days > 1 && days < 7) return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!sameYear && { year: "numeric" }) });
}

/** [{ key, label, runs }] in list order, one group per local calendar day. */
export function groupRunsByDay(runs, now = Date.now()) {
  const groups = [];
  for (const run of runs) {
    const t = new Date(run.createdAt).getTime();
    const key = Number.isFinite(t) ? String(startOfDay(t)) : "unknown";
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(run.createdAt, now), runs: [] };
      groups.push(group);
    }
    group.runs.push(run);
  }
  return groups;
}

/** Message for a failed history request. A 404 means the API predates /runs. */
export function historyErrorMessage(err) {
  if (err instanceof TypeError) return "Can't reach the Flowline server right now.";
  if (err?.status === 404) return "Zap History isn't available on this server yet. Restart the Flowline API to enable it.";
  return err?.message || "Couldn't load run history.";
}

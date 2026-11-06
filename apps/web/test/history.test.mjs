// Zap History helpers: URL params, API queries, date presets, merging polled runs (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendRuns, buildHistorySearch, buildRunsQuery, buildSummaryQuery, chipCounts, dayLabel,
  groupRunsByDay, hasActiveFilters, historyErrorMessage, mergePolledRuns, normalizeStatus,
  parseHistoryParams, rangeStart, staleActiveIds, DEFAULT_FILTERS,
} from "../src/features/runs/history.js";

const NOW = new Date(2026, 10, 6, 15, 30).getTime(); // local time: Nov 6 2026, 15:30
const run = (id, minutesAgo, status = "SUCCESS", extra = {}) => ({
  id, status, createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(), startedAt: null, completedAt: null,
  zap: { id: "z1", zapName: "Zap" }, stepExecutions: [], ...extra,
});
const params = (s) => new URLSearchParams(s);
const query = (url) => Object.fromEntries(new URL(url, "http://x").searchParams);

test("deep links: ?zap and ?status (other pages may link RUNNING or QUEUED)", () => {
  assert.deepEqual(parseHistoryParams(params("zap=z1&status=failed")), { status: "FAILED", zapId: "z1", range: "all", q: "" });
  assert.equal(parseHistoryParams(params("status=RUNNING")).status, "ACTIVE");
  assert.equal(parseHistoryParams(params("status=QUEUED")).status, "ACTIVE");
  assert.equal(parseHistoryParams(params("status=nonsense&range=1y")).status, "ALL");
  assert.equal(parseHistoryParams(params("range=1y")).range, "all");
  assert.equal(parseHistoryParams(params("range=7d&q=%20slack%20")).q, "slack");
  assert.deepEqual(parseHistoryParams(params("")), DEFAULT_FILTERS);
  assert.equal(normalizeStatus(undefined), "ALL");
});

test("page URL leaves out defaults and round-trips", () => {
  assert.equal(buildHistorySearch(DEFAULT_FILTERS), "");
  const filters = { status: "ACTIVE", zapId: "z 1", range: "7d", q: "gmail" };
  const search = buildHistorySearch(filters);
  assert.deepEqual(parseHistoryParams(params(search.slice(1))), filters);
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, q: "  " }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, range: "today" }), true);
});

test("date presets: today starts at local midnight; 7 and 30 days count back from now", () => {
  assert.equal(rangeStart("today", NOW).getTime(), new Date(2026, 10, 6).getTime());
  assert.equal(rangeStart("7d", NOW).getTime(), NOW - 7 * 86_400_000);
  assert.equal(rangeStart("30d", NOW).getTime(), NOW - 30 * 86_400_000);
  assert.equal(rangeStart("all", NOW), null);
});

test("API query: status chip maps to API statuses; summary omits status, cursor and limit", () => {
  assert.equal(buildRunsQuery(DEFAULT_FILTERS, { now: NOW }), "/runs?limit=25");
  const filters = { status: "ACTIVE", zapId: "z1", range: "today", q: " slack " };
  assert.deepEqual(query(buildRunsQuery(filters, { cursor: "abc", now: NOW })), {
    zapId: "z1", from: new Date(2026, 10, 6).toISOString(), q: "slack", status: "RUNNING,QUEUED", cursor: "abc", limit: "25",
  });
  assert.equal(query(buildRunsQuery({ ...DEFAULT_FILTERS, status: "FAILED" })).status, "FAILED");
  assert.equal(query(buildRunsQuery({ ...DEFAULT_FILTERS, status: "ALL" })).status, undefined);
  assert.deepEqual(query(buildSummaryQuery(filters, { now: NOW })), { zapId: "z1", from: new Date(2026, 10, 6).toISOString(), q: "slack" });
  assert.equal(buildSummaryQuery(DEFAULT_FILTERS), "/runs/summary");
});

test("chip counts combine Running and Queued", () => {
  assert.deepEqual(chipCounts({ ALL: 9, QUEUED: 1, RUNNING: 2, SUCCESS: 3, FAILED: 2, FILTERED: 1 }), { ALL: 9, SUCCESS: 3, FAILED: 2, FILTERED: 1, ACTIVE: 3 });
  assert.equal(chipCounts(null), null);
});

test("polling: new runs go on top, running runs update in place, unchanged rows keep their object", () => {
  const r1 = run("r1", 30);
  const r2 = run("r2", 10, "RUNNING");
  const current = [r2, r1];
  const r2done = { ...r2, status: "SUCCESS", completedAt: new Date(NOW).toISOString() };
  const r3 = run("r3", 1, "QUEUED");

  const { runs, added, gap } = mergePolledRuns(current, [r3, r2done, { ...r1 }]);
  assert.deepEqual(runs.map((r) => r.id), ["r3", "r2", "r1"]);
  assert.deepEqual(added, ["r3"]);
  assert.equal(gap, false);
  assert.equal(runs[1].status, "SUCCESS");
  assert.equal(runs[2], r1, "an unchanged run keeps the same object, so its row doesn't re-render");
});

test("polling: nothing changed returns the same list", () => {
  const current = [run("r2", 10), run("r1", 30)];
  const result = mergePolledRuns(current, current.map((r) => ({ ...r, stepExecutions: [] })));
  assert.equal(result.runs, current);
  assert.deepEqual(result.added, []);
});

test("polling: runs loaded with Load more stay; in-progress runs below the newest page refresh by id", () => {
  const old = run("old", 600, "RUNNING");
  const current = [run("a", 5), run("b", 6), old];
  assert.deepEqual(staleActiveIds(current, [current[0], current[1]]), ["old"]);
  assert.deepEqual(staleActiveIds(current, [old]), []);

  const { runs } = mergePolledRuns(current, [current[0], current[1]], { refreshed: [{ ...old, status: "FAILED" }], pageSize: 2 });
  assert.deepEqual(runs.map((r) => r.id), ["a", "b", "old"]);
  assert.equal(runs[2].status, "FAILED");
});

test("polling: a full page of only new runs is a gap (list must be reset)", () => {
  const current = [run("a", 50)];
  assert.equal(mergePolledRuns(current, [run("n1", 1), run("n2", 2)], { pageSize: 2 }).gap, true);
  assert.equal(mergePolledRuns(current, [run("n1", 1), current[0]], { pageSize: 2 }).gap, false);
  assert.equal(mergePolledRuns([], [run("n1", 1), run("n2", 2)], { pageSize: 2 }).gap, false, "an empty list just fills");
});

test("polling: runs with the same timestamp are ordered by id like the API", () => {
  const t = new Date(NOW).toISOString();
  const { runs } = mergePolledRuns([{ id: "a", createdAt: t, status: "SUCCESS" }], [{ id: "b", createdAt: t, status: "QUEUED" }]);
  assert.deepEqual(runs.map((r) => r.id), ["b", "a"]);
});

test("load more skips runs already in the list", () => {
  const current = [run("a", 1), run("b", 2)];
  assert.deepEqual(appendRuns(current, [run("b", 2), run("c", 3)]).map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(appendRuns(current, undefined).map((r) => r.id), ["a", "b"]);
});

test("day groups: Today, Yesterday, weekday, then dates", () => {
  const runs = [run("a", 10), run("b", 60), run("c", 24 * 60), run("d", 3 * 24 * 60), run("e", 40 * 24 * 60)];
  const groups = groupRunsByDay(runs, NOW);
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Yesterday", "Tuesday, Nov 3", "Sep 27"]);
  assert.deepEqual(groups[0].runs.map((r) => r.id), ["a", "b"]);
  assert.equal(dayLabel(new Date(2025, 0, 2).toISOString(), NOW), "Jan 2, 2025");
  assert.equal(dayLabel(null, NOW), "Unknown date");
});

test("error messages: unreachable server, missing endpoint, server error", () => {
  assert.match(historyErrorMessage(new TypeError("Failed to fetch")), /Can't reach/);
  assert.match(historyErrorMessage(Object.assign(new Error("x"), { status: 404 })), /Restart the Flowline API/);
  assert.equal(historyErrorMessage(new Error("Failed to load run history")), "Failed to load run history");
});

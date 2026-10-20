// Run history helpers: labels, the "outcome unknown" state and time formatting (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeStep, formatDuration, formatError, formatRelativeTime, isActive,
  isOutcomeUnknown, runStatusMeta, stepProgress, stepStatusMeta,
} from "../src/features/runs/runStatus.js";

// Same sentence the worker stores on a step interrupted mid-request.
const UNKNOWN_ERROR = "Flowline stopped while this step was sending its request, so it can't tell whether the app received it. It was not re-sent automatically to avoid a duplicate - check the app and use Retry run if needed.";

test("a step interrupted mid-request is 'Outcome unknown', not a plain failure", () => {
  const step = { status: "FAILED", error: UNKNOWN_ERROR };
  assert.equal(isOutcomeUnknown(step), true);
  assert.deepEqual(stepStatusMeta(step), { tone: "warning", label: "Outcome unknown" });
  assert.equal(isOutcomeUnknown({ status: "FAILED", error: "Slack error: channel_not_found" }), false);
  assert.equal(isOutcomeUnknown({ status: "SUCCESS", error: UNKNOWN_ERROR }), false);
});

test("a failed run shows 'Outcome unknown' when one of its steps is unknown", () => {
  assert.equal(runStatusMeta({ status: "FAILED", stepExecutions: [{ status: "SUCCESS" }, { status: "FAILED", error: UNKNOWN_ERROR }] }).label, "Outcome unknown");
  assert.deepEqual(runStatusMeta({ status: "FAILED", stepExecutions: [{ status: "FAILED", error: "boom" }] }), { tone: "danger", label: "Failed" });
  assert.deepEqual(runStatusMeta({ status: "SUCCESS" }), { tone: "success", label: "Succeeded" });
  assert.equal(runStatusMeta({ status: "WEIRD" }).label, "WEIRD");
});

test("step progress ignores skipped branch steps", () => {
  assert.equal(stepProgress({ stepExecutions: [{ status: "SUCCESS" }, { status: "FAILED" }, { status: "SKIPPED" }] }), "1 of 2 steps done");
  assert.equal(stepProgress({ stepExecutions: [{ status: "SUCCESS" }] }), "1 of 1 step done");
  assert.equal(stepProgress({ stepExecutions: [] }), null);
  assert.equal(stepProgress({}), null);
});

test("queued and running runs are active (the page polls while they exist)", () => {
  assert.equal(isActive({ status: "QUEUED" }), true);
  assert.equal(isActive({ status: "RUNNING" }), true);
  assert.equal(isActive({ status: "SUCCESS" }), false);
});

test("durations read naturally and unfinished runs show a dash", () => {
  const t = "2026-10-20T10:00:00.000Z";
  assert.equal(formatDuration(t, "2026-10-20T10:00:00.195Z"), "195 ms");
  assert.equal(formatDuration(t, "2026-10-20T10:00:02.400Z"), "2.4 s");
  assert.equal(formatDuration(t, "2026-10-20T10:01:05.000Z"), "1 min 5 s");
  assert.equal(formatDuration(t, null), "—");
  assert.equal(formatDuration("2026-10-20T10:00:05Z", t), "—");
});

test("relative times: just now, minutes, hours, days, then a date", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  assert.equal(formatRelativeTime("2026-10-20T11:59:50Z", now), "just now");
  assert.equal(formatRelativeTime("2026-10-20T11:55:00Z", now), "5 min ago");
  assert.equal(formatRelativeTime("2026-10-20T09:00:00Z", now), "3 h ago");
  assert.equal(formatRelativeTime("2026-10-18T12:00:00Z", now), "2 d ago");
  assert.equal(formatRelativeTime("2026-09-01T12:00:00Z", now), "Sep 1");
  assert.equal(formatRelativeTime("2025-09-01T12:00:00Z", now), "Sep 1, 2025");
  assert.equal(formatRelativeTime(null, now), "—");
});

test("steps describe their app and kind", () => {
  assert.deepEqual(describeStep({ type: "ACTION", name: "Post to #alerts", config: { provider: "slack" } }), { app: "slack", title: "Post to #alerts", kind: "Action" });
  assert.deepEqual(describeStep({ type: "FILTER", name: "Only bugs", config: {} }), { app: null, title: "Only bugs", kind: "Filter" });
  assert.deepEqual(describeStep(undefined, 2), { app: null, title: "Step 3", kind: "Step" });
});

test("object errors are shown as JSON", () => {
  assert.equal(formatError({ code: 404 }), '{"code":404}');
  assert.equal(formatError("plain"), "plain");
  assert.equal(formatError(null), "");
});

test("steps reused by 'retry from failed step' are labelled, and count as done", async () => {
  const { retryOptions } = await import("../src/features/runs/runStatus.js");
  assert.deepEqual(stepStatusMeta({ status: "SUCCESS", reusedFromRunId: "r1" }), { tone: "neutral", label: "Reused" });
  assert.equal(stepProgress({ stepExecutions: [{ status: "SUCCESS", reusedFromRunId: "r1" }, { status: "SUCCESS" }] }), "2 of 2 steps done");
  assert.deepEqual(retryOptions({ status: "FAILED" }), ["resume", "all"]);
  assert.deepEqual(retryOptions({ status: "SUCCESS" }), ["all"]);
});

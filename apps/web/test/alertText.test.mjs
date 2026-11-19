// Failure alert text helpers (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { alertReason, alertRunHref, isOutcomeUnknownAlert } from "../src/features/alerts/alertText.js";

test("the reason drops the worker's 'Flow ... failed during execution' prefix", () => {
  assert.equal(alertReason({ message: 'Flow "Issues to Slack" failed during execution: Slack error: channel_not_found' }), "Slack error: channel_not_found");
  assert.equal(alertReason({ message: "Something else went wrong" }), "Something else went wrong");
  assert.equal(alertReason({}), "The run failed.");
});

test("unknown-outcome alerts are recognised", () => {
  assert.equal(isOutcomeUnknownAlert({ message: `Flow "A" failed during execution: A step's outcome is unknown after a worker restart; not re-sent to avoid a duplicate.` }), true);
  assert.equal(isOutcomeUnknownAlert({ message: 'Flow "A" failed during execution: timeout' }), false);
});

test("alerts link to the failed run in the Flow's history", () => {
  assert.equal(alertRunHref({ zapId: "z1", zapRunId: "r1" }), "/flows/z1/runs?run=r1");
  assert.equal(alertRunHref({ zapId: "z1" }), "/flows/z1/runs");
  assert.equal(alertRunHref({}), null);
});

test("alerts saved before Zaps were renamed to Flows still show just the reason", () => {
  assert.equal(alertReason({ message: 'Zap "Old one" failed during execution: Slack rate limit' }), "Slack rate limit");
  assert.equal(alertReason({ message: 'Flow "New one" failed during execution: Slack rate limit' }), "Slack rate limit");
});

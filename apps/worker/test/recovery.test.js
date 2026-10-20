// Retry safety and crash-recovery decisions (pure logic, no network/DB).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isRetryable, retryableError, runWithRetry, planRecovery } = require("../src/recovery");

const netErr = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

test("only errors where the request certainly had no effect are retryable", () => {
  assert.equal(isRetryable(retryableError("rate limited", 429)), true);
  for (const s of [502, 503, 504]) assert.equal(isRetryable(retryableError("x", s)), true, `HTTP ${s}`);
  assert.equal(isRetryable(retryableError("x", 500)), false, "500: provider may have acted");
  assert.equal(isRetryable(retryableError("x", 400)), false);
  assert.equal(isRetryable(new Error("Slack API error: channel_not_found")), false, "plain errors are not retried");
  for (const c of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]) assert.equal(isRetryable(netErr(c)), true, c);
  for (const c of ["ECONNRESET", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT"]) assert.equal(isRetryable(netErr(c)), false, `${c}: request may have been processed`);
});

test("runWithRetry: retries transient failures, then succeeds", async () => {
  const events = [];
  let calls = 0;
  const result = await runWithRetry(async () => { calls++; if (calls < 3) throw retryableError("busy", 503); return "ok"; }, {
    attempts: 3, sleep: async () => {}, onAttemptStart: (n) => events.push(`start${n}`), onAttemptFailed: (n) => events.push(`fail${n}`),
  });
  assert.equal(result, "ok");
  assert.deepEqual(events, ["start1", "fail1", "start2", "fail2", "start3"]);
});

test("runWithRetry: a non-retryable error is NOT retried (no duplicate send)", async () => {
  let calls = 0;
  await assert.rejects(runWithRetry(async () => { calls++; throw new Error("GitHub API create issue failed (500)"); }, { attempts: 3, sleep: async () => {} }), /500/);
  assert.equal(calls, 1);
});

test("runWithRetry: gives up after the attempt limit", async () => {
  let calls = 0;
  await assert.rejects(runWithRetry(async () => { calls++; throw retryableError("rate limited", 429); }, { attempts: 3, sleep: async () => {} }), /rate limited/);
  assert.equal(calls, 3);
});

test("planRecovery: completed steps are skipped, in-flight ones are reported as unknown", () => {
  const steps = [{ id: "s1", type: "ACTION" }, { id: "s2", type: "ACTION" }, { id: "s3", type: "ACTION" }, { id: "d1", type: "DELAY" }, { id: "f1", type: "FILTER" }, { id: "b1", type: "BRANCH" }];
  const plan = planRecovery(steps, [
    { id: "e1", stepId: "s1", status: "SUCCESS", output: { a: 1 } },
    { id: "e2", stepId: "s2", status: "RUNNING" },
    { id: "e3", stepId: "s3", status: "RETRYING" },
    { id: "e4", stepId: "d1", status: "SUCCESS" },
    { id: "e5", stepId: "f1", status: "SUCCESS", output: { passed: true } },
    { id: "e6", stepId: "b1", status: "SUCCESS", output: { selectedStepId: "s3" } },
  ]);
  assert.deepEqual([...plan.completedStepIds].sort(), ["f1", "s1"], "DELAY/BRANCH are re-evaluated");
  assert.deepEqual(plan.interrupted.map((e) => e.id), ["e2"]);
  assert.deepEqual(plan.superseded.map((e) => e.id), ["e3"], "RETRYING = was waiting to retry, safe to run again");
  assert.deepEqual(plan.completedExecutions.map((e) => e.id), ["e1", "e5"]);
});

test("planRecovery: a fresh run has nothing to recover", () => {
  const plan = planRecovery([{ id: "s1", type: "ACTION" }], []);
  assert.equal(plan.completedStepIds.size, 0);
  assert.equal(plan.interrupted.length, 0);
});

// ── Retry from failed step ──
const { planRetryCarryOver } = require("../src/recovery");

const zapSteps = [
  { id: "f", type: "FILTER" }, { id: "d", type: "DELAY" }, { id: "a1", type: "ACTION" },
  { id: "b", type: "BRANCH" }, { id: "a2", type: "ACTION" }, { id: "a3", type: "ACTION" },
];

test("retry from failed step reuses only steps that succeeded and still exist", () => {
  const original = [
    { stepId: "f", status: "SUCCESS", output: { passed: true } },
    { stepId: "d", status: "SUCCESS", output: { delayedSeconds: 30 } },
    { stepId: "a1", status: "SUCCESS", input: { text: "hi" }, output: { ts: "1.2" } },
    { stepId: "b", status: "SUCCESS", output: { selectedStepId: "a2" } },
    { stepId: "a2", status: "FAILED", error: "channel_not_found" },
    { stepId: "gone", status: "SUCCESS", output: {} },
  ];
  const rows = planRetryCarryOver(zapSteps, original, "r1");
  assert.deepEqual(rows.map((r) => r.stepId), ["f", "d", "a1"], "failed step, BRANCH and deleted steps are not reused");
  assert.deepEqual(rows[2], { stepId: "a1", status: "SUCCESS", input: { text: "hi" }, output: { ts: "1.2" }, reusedFromRunId: "r1" });
});

test("an 'outcome unknown' step is not reused - retrying it is the user's decision", () => {
  const rows = planRetryCarryOver(zapSteps, [{ stepId: "a1", status: "FAILED", error: "can't tell whether the app received it" }], "r1");
  assert.deepEqual(rows, []);
});

test("a retry of a retry points at the run where the step really ran", () => {
  const rows = planRetryCarryOver(zapSteps, [{ stepId: "a1", status: "SUCCESS", output: {}, reusedFromRunId: "r0" }], "r1");
  assert.equal(rows[0].reusedFromRunId, "r0");
});

test("after a crash, a reused DELAY counts as done (no second wait); a normal DELAY is re-evaluated", () => {
  const reused = planRecovery(zapSteps, [{ id: "e1", stepId: "d", status: "SUCCESS", reusedFromRunId: "r1" }]);
  assert.equal(reused.completedStepIds.has("d"), true);
  const own = planRecovery(zapSteps, [{ id: "e1", stepId: "d", status: "SUCCESS" }]);
  assert.equal(own.completedStepIds.has("d"), false);
});

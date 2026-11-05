/**
 * Retry safety and crash recovery for action steps.
 *
 * Slack, Gmail and GitHub have no idempotency keys, so a request that may already have
 * taken effect must never be sent again automatically. We therefore:
 *  - retry only failures where the provider certainly did NOT act (rate limits,
 *    502/503/504, connection never established);
 *  - after a worker crash, skip steps that already succeeded and report steps that were
 *    mid-request as "outcome unknown" instead of re-sending them.
 */

// HTTP statuses that mean the request was not processed.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
// Network failures where the connection was never established (nothing was sent).
const SAFE_NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);

function retryableError(message, status) {
  const err = new Error(message);
  err.status = status;
  err.retryable = RETRYABLE_STATUSES.has(status);
  return err;
}

function isRetryable(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  const code = err.cause && err.cause.code;
  return Boolean(code && SAFE_NETWORK_CODES.has(code));
}

async function runWithRetry(fn, { attempts = 3, baseDelayMs = 500, sleep, onAttemptStart, onAttemptFailed } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (onAttemptStart) await onAttemptStart(attempt);
    try {
      return await fn(attempt);
    } catch (err) {
      const willRetry = attempt < attempts && isRetryable(err);
      if (onAttemptFailed) await onAttemptFailed(attempt, err, willRetry);
      if (!willRetry) throw err;
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new Error("runWithRetry: no attempts made");
}

/**
 * Identifies one execution of a step within a run. Steps inside a Loop run once per item,
 * so they are told apart by their position in the loop(s) (`input.loopPath`, outermost loop
 * first); every other step runs at most once and is identified by its id alone.
 */
function executionKey(stepId, loopPath) {
  return Array.isArray(loopPath) && loopPath.length ? `${stepId}#${loopPath.join(".")}` : stepId;
}

/**
 * Decides how to continue a run whose job is being processed again (e.g. BullMQ re-ran it
 * after the worker crashed).
 *  - completedStepIds: executionKey()s of steps that already succeeded - skip them, reuse
 *    their outputs (completedOutputs: executionKey -> output).
 *    DELAY is excluded so a crash before the resume job was queued doesn't lose the wait;
 *    BRANCH/LOOP are excluded so they are re-evaluated and reach their child steps
 *    (children that already succeeded are still skipped individually).
 *  - interrupted: executions still RUNNING - the request may or may not have reached the
 *    provider, so they are failed as "outcome unknown" rather than re-sent.
 *  - superseded: executions in RETRYING - they were waiting to retry after a failure that
 *    certainly had no effect, so running the step again is safe.
 */
function planRecovery(steps, executions) {
  const typeById = new Map(steps.map((s) => [s.id, s.type]));
  const reEvaluated = new Set(["DELAY", "BRANCH", "LOOP"]);
  // A DELAY reused from an earlier run (retry from failed step) already waited there.
  const completedExecutions = executions.filter(
    (e) => e.status === "SUCCESS" && (!reEvaluated.has(typeById.get(e.stepId)) || (e.reusedFromRunId && typeById.get(e.stepId) === "DELAY"))
  );
  const keyOf = (e) => executionKey(e.stepId, e.input?.loopPath);
  return {
    completedStepIds: new Set(completedExecutions.map(keyOf)),
    completedOutputs: new Map(completedExecutions.map((e) => [keyOf(e), e.output])),
    completedExecutions,
    interrupted: executions.filter((e) => e.status === "RUNNING"),
    superseded: executions.filter((e) => e.status === "RETRYING"),
  };
}

/**
 * "Retry from failed step": which results of the original run the retry reuses.
 * Steps that succeeded there and still exist in the Zap are copied into the new run as
 * SUCCESS (marked reusedFromRunId) and not sent again; the failed step and everything after
 * it run normally. BRANCH/LOOP are not copied: they are re-evaluated (they send nothing)
 * so their already-succeeded children can be skipped individually.
 * Returns rows for prisma.stepExecution.createMany (without zapRunId).
 */
function planRetryCarryOver(steps, originalExecutions, originalRunId) {
  const typeById = new Map(steps.map((s) => [s.id, s.type]));
  const seen = new Set();
  const rows = [];
  for (const e of originalExecutions) {
    const type = typeById.get(e.stepId);
    // One row per execution: a step inside a Loop is carried over once per iteration.
    const key = executionKey(e.stepId, e.input?.loopPath);
    if (e.status !== "SUCCESS" || !type || type === "BRANCH" || type === "LOOP" || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      stepId: e.stepId,
      status: "SUCCESS",
      input: e.input ?? undefined,
      output: e.output ?? undefined,
      // A retry of a retry points at the run where the step actually ran.
      reusedFromRunId: e.reusedFromRunId || originalRunId,
    });
  }
  return rows;
}

module.exports = { isRetryable, retryableError, runWithRetry, executionKey, planRecovery, planRetryCarryOver, RETRYABLE_STATUSES };

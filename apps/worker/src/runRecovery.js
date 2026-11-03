/**
 * Recovery sweep: makes sure every unfinished run in Postgres has the BullMQ job that will
 * move it forward. Redis can lose jobs (the free Render Key Value instance keeps nothing on
 * restart; a worker crash plus a Redis restart loses the active job), which would leave
 * runs QUEUED or RUNNING forever. Postgres has what's needed to rebuild them:
 *  - QUEUED run                          -> its job  zap-run-<run>          (no delay)
 *  - RUNNING run whose latest step is a
 *    Delay that succeeded (not reused)   -> its job  zap-run-<run>-after-<delay step>, with
 *                                           the REMAINING wait: Delay createdAt + delayedSeconds
 *  - other RUNNING run, quiet for a while -> the job that was running it: the resume job of
 *                                           its latest Delay, or zap-run-<run>
 *
 * For each, the job's state decides:
 *  - waiting / delayed / active / ...  -> left alone (it will run, or is running).
 *  - missing                           -> added (same deterministic id).
 *  - failed / completed but the run is still unfinished -> the id is occupied by a job that
 *    won't run again: removed and re-added, when safe (see below).
 * Finished jobs are also trimmed by BullMQ (JOB_RETENTION in runQueue.js): a trimmed job is
 * "missing" here, which is handled exactly like a completed one (same quiet-period rules).
 *
 * Attempts: every re-queue of a job that may already have run counts against the run's limit
 * (MAX_RECOVERY_ATTEMPTS over its lifetime; a manual "Retry run" is a new run, starting at 0).
 * The count is ZapRun.recoveryAttempts in Postgres - not in the BullMQ job, which trimming,
 * deletion or a Redis restart would lose. Re-adding a Delay's resume job that went missing
 * BEFORE its resume time doesn't count: that job can't have run yet (plain Redis loss).
 * Each attempt is claimed BEFORE touching BullMQ with a compare-and-set UPDATE (same id, still
 * QUEUED/RUNNING, recoveryAttempts unchanged since this sweep read it): of concurrent sweeps
 * only one wins; finished or deleted runs match nothing. A crash (or Redis error) after the
 * claim and before the job is added uses up that attempt without re-queuing - conservative:
 * the limit is never exceeded, at worst reached one attempt early. When the limit is reached,
 * the run is marked FAILED with an alert (only if still unfinished - see failUnrecoverableRun).
 *
 * Duplicates: BullMQ ignores adding a job whose id exists, so a job is never added twice;
 * only one sweep runs at a time (Redis lock + in-process guard); runs that changed recently
 * or may still be executing (a job lost from Redis while its worker keeps going) are left
 * until they've been quiet for STALE_AFTER_MS. A re-run job goes through the worker's normal
 * crash recovery: steps that succeeded are skipped, a step that was mid-request is failed as
 * "outcome unknown" (the run FAILS) rather than re-sent. Nothing is marked successful here.
 */
const crypto = require("crypto");
const { jobIdFor, resumeJobIdFor } = require("./runQueue");

const STALE_AFTER_MS = 10 * 60 * 1000;
const QUEUED_GRACE_MS = 60 * 1000; // a new QUEUED run's first job may not be added yet
const MAX_RECOVERY_ATTEMPTS = 3;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const LOCK_KEY = "flowline:run-recovery-lock";
const LOCK_TTL_MS = 2 * 60 * 1000;
const PENDING_STATES = new Set(["waiting", "delayed", "active", "prioritized", "waiting-children"]);

const time = (d) => (d ? new Date(d).getTime() : 0);

/** A Redis lock so two worker processes don't sweep at the same moment. */
function createSweepLock(redis, { key = LOCK_KEY, ttlMs = LOCK_TTL_MS } = {}) {
  return async function acquire() {
    const token = crypto.randomUUID();
    if ((await redis.set(key, token, "PX", ttlMs, "NX")) !== "OK") return null;
    return async function release() {
      if ((await redis.get(key)) === token) await redis.del(key);
    };
  };
}

/** Delay step executions that are waiting to be resumed: succeeded here, not reused by a retry. */
const isPendingDelay = (execution) => execution.step?.type === "DELAY" && execution.status === "SUCCESS" && !execution.reusedFromRunId;

function delaySeconds(execution) {
  const fromOutput = Number(execution.output?.delayedSeconds);
  if (Number.isFinite(fromOutput) && fromOutput >= 0) return fromOutput;
  return Number(execution.step?.config?.seconds) || 60;
}

const UNFINISHED = ["QUEUED", "RUNNING"];

/**
 * Claims the run's next recovery attempt in Postgres (compare-and-set on the count this sweep
 * read). -> "claimed" | "exhausted" (limit reached) | "lost" (another sweep claimed it first,
 * or the run finished or was deleted since it was read)
 */
async function claimRecoveryAttempt(prisma, run) {
  const seen = Number(run.recoveryAttempts) || 0;
  if (seen >= MAX_RECOVERY_ATTEMPTS) return "exhausted";
  const { count } = await prisma.zapRun.updateMany({
    where: { id: run.id, status: { in: UNFINISHED }, recoveryAttempts: seen },
    data: { recoveryAttempts: { increment: 1 } },
  });
  return count === 1 ? "claimed" : "lost";
}

/**
 * Makes sure job `jobId` will run.
 * -> "pending" | "kept-finished" | "added" | "replaced" | "exhausted" | "claimed-elsewhere"
 * replaceFinished: whether a failed/completed job occupying the id may be replaced.
 * freeIfMissing: re-adding a missing job doesn't count as an attempt (it can't have run yet).
 * claimAttempt: () => "claimed" | "exhausted" | "lost", called before any change to BullMQ.
 */
async function ensureJob(queue, { jobId, name, data, delay = 0, replaceFinished, freeIfMissing = false, claimAttempt }) {
  const job = await queue.getJob(jobId);
  const state = job ? await job.getState() : "missing";
  if (PENDING_STATES.has(state)) return "pending";
  const finished = state === "completed" || state === "failed";
  if (finished && !replaceFinished) return "kept-finished";

  if (finished || !freeIfMissing) {
    const claim = await claimAttempt();
    if (claim === "exhausted") return "exhausted";
    if (claim !== "claimed") return "claimed-elsewhere";
  }
  if (finished) await job.remove();
  await queue.add(name, data, { jobId, delay: Math.max(0, Math.round(delay)) });
  return finished ? "replaced" : "added";
}

const GAVE_UP_ERROR = `Flowline couldn't restart this run after ${MAX_RECOVERY_ATTEMPTS} attempts (its queued job kept failing or was lost), so it was stopped. Steps that hadn't finished may or may not have reached the app - check it, then use Retry run if needed.`;

/**
 * Recovery gave up: mark the run FAILED (with completedAt) and alert its owner - but only if
 * it's still QUEUED/RUNNING. The status check is part of the same UPDATE, so a run that
 * finished meanwhile is never overwritten. -> "gave-up" | "gave-up-already-finished"
 */
async function failUnrecoverableRun(prisma, runId, jobId, now, log) {
  const { count } = await prisma.zapRun.updateMany({
    where: { id: runId, status: { in: UNFINISHED } },
    data: { status: "FAILED", completedAt: new Date(now) },
  });
  if (count === 0) return "gave-up-already-finished";

  // Steps left mid-way can't be confirmed either way.
  await prisma.stepExecution.updateMany({
    where: { zapRunId: runId, status: { in: ["PENDING", "RUNNING", "RETRYING"] } },
    data: { status: "FAILED", error: GAVE_UP_ERROR },
  });
  const run = await prisma.zapRun.findUnique({ where: { id: runId }, include: { zap: true } });
  if (run?.zap) {
    await prisma.alert.create({
      data: {
        userId: run.zap.userId,
        zapId: run.zapId,
        zapRunId: runId,
        message: `Zap "${run.zap.zapName}" failed: ${GAVE_UP_ERROR}`,
        errorTrace: `Recovery gave up on BullMQ job ${jobId} after ${MAX_RECOVERY_ATTEMPTS} attempts.`,
      },
    });
  }
  log.error(`[recovery] run ${runId} marked FAILED: job ${jobId} couldn't be recovered`);
  return "gave-up";
}

/**
 * One sweep. Returns a summary per run id (for logs and tests), or { skipped: "locked" }.
 * Options: now (ms), staleAfterMs, acquireLock (from createSweepLock), log.
 */
async function recoverRuns(prisma, queue, { now = Date.now(), staleAfterMs = STALE_AFTER_MS, acquireLock, log = console } = {}) {
  const release = acquireLock ? await acquireLock() : async () => {};
  if (!release) return { skipped: "locked" };
  const results = {};
  // ensureJob with this run's attempts; at the limit, stop the run (see failUnrecoverableRun).
  const ensureRunJob = async (run, options) => {
    const outcome = await ensureJob(queue, { ...options, claimAttempt: () => claimRecoveryAttempt(prisma, run) });
    if (outcome !== "exhausted") return outcome;
    log.error(`[recovery] run ${run.id} still needs job ${options.jobId} after ${MAX_RECOVERY_ATTEMPTS} recovery attempts; giving up`);
    return failUnrecoverableRun(prisma, run.id, options.jobId, now, log);
  };
  try {
    // QUEUED: the worker hasn't started the run, so nothing was sent - safe to (re)queue.
    // A completed job with the run still QUEUED is unexpected; replaced only once it's stale.
    const queued = await prisma.zapRun.findMany({ where: { status: "QUEUED" }, select: { id: true, createdAt: true, recoveryAttempts: true } });
    for (const run of queued) {
      const job = await queue.getJob(jobIdFor(run.id));
      const state = job ? await job.getState() : "missing";
      // Every producer saves the run first and queues its job right after: a brand-new run
      // without a job is most likely mid-way through that - not lost. Leave it (no attempt
      // used) until QUEUED_GRACE_MS; after that, normal recovery.
      if (state === "missing" && now - time(run.createdAt) < QUEUED_GRACE_MS) {
        results[run.id] = "recent";
        continue;
      }
      results[run.id] = await ensureRunJob(run, {
        jobId: jobIdFor(run.id),
        name: "execute-zap-run",
        data: { zapRunId: run.id },
        replaceFinished: state === "failed" || now - time(run.createdAt) >= staleAfterMs,
      });
    }

    const running = await prisma.zapRun.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        createdAt: true,
        startedAt: true,
        recoveryAttempts: true,
        stepExecutions: {
          select: { id: true, stepId: true, status: true, output: true, createdAt: true, updatedAt: true, reusedFromRunId: true, step: { select: { type: true, config: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    for (const run of running) {
      const executions = run.stepExecutions || [];
      const latest = executions.at(-1);
      const lastActivity = Math.max(time(run.createdAt), time(run.startedAt), ...executions.map((e) => time(e.updatedAt || e.createdAt)));

      if (latest && isPendingDelay(latest)) {
        // Waiting on a Delay: resume at the ORIGINAL time (crash/Redis loss doesn't restart it).
        // Before that time the resume job can't be running, so adding it is safe. After it, a
        // job lost from Redis might still be executing in a worker: wait until it's stale.
        const resumeAt = time(latest.createdAt) + delaySeconds(latest) * 1000;
        const overdueAndRecent = now >= resumeAt && now - Math.max(resumeAt, lastActivity) < staleAfterMs;
        const job = await queue.getJob(resumeJobIdFor(run.id, latest.stepId));
        const state = job ? await job.getState() : "missing";
        if (overdueAndRecent && !PENDING_STATES.has(state) && state !== "failed") {
          results[run.id] = "recent";
          continue;
        }
        results[run.id] = await ensureRunJob(run, {
          jobId: resumeJobIdFor(run.id, latest.stepId),
          name: "resume-zap-run",
          data: { zapRunId: run.id, resumeAfterStepId: latest.stepId },
          delay: resumeAt - now,
          // A failed resume job never ran the steps after the Delay. A completed one with the
          // run still waiting there didn't either - replaced once that is clearly stale.
          replaceFinished: state === "failed" || now - Math.max(resumeAt, lastActivity) >= staleAfterMs,
          // Lost before its resume time: it hasn't run, so re-adding it isn't an attempt.
          freeIfMissing: now < resumeAt,
        });
        continue;
      }

      // Running something (or stopped mid-way). Only touched once quiet for staleAfterMs.
      if (now - lastActivity < staleAfterMs) {
        results[run.id] = "recent";
        continue;
      }
      const lastDelay = [...executions].reverse().find(isPendingDelay);
      results[run.id] = await ensureRunJob(run, lastDelay
        ? { jobId: resumeJobIdFor(run.id, lastDelay.stepId), name: "resume-zap-run", data: { zapRunId: run.id, resumeAfterStepId: lastDelay.stepId }, replaceFinished: true }
        : { jobId: jobIdFor(run.id), name: "execute-zap-run", data: { zapRunId: run.id }, replaceFinished: true });
    }

    const acted = Object.entries(results).filter(([, r]) => r === "added" || r === "replaced");
    if (acted.length) log.log(`[recovery] re-queued ${acted.length} run(s): ${acted.map(([id, r]) => `${id} (${r})`).join(", ")}`);
    return results;
  } finally {
    await release();
  }
}

/**
 * Runs a sweep now and every intervalMs. One at a time in this process (and, with the Redis
 * lock, across processes). Errors are logged, never thrown. -> stop()
 */
function startRecoveryScheduler({ prisma, queue, redis, intervalMs = SWEEP_INTERVAL_MS, log = console } = {}) {
  const acquireLock = redis ? createSweepLock(redis) : undefined;
  let running = null;
  const sweep = () => {
    if (running) return running;
    running = recoverRuns(prisma, queue, { acquireLock, log })
      .catch((err) => log.error("[recovery] sweep failed:", err.message))
      .finally(() => { running = null; });
    return running;
  };
  sweep();
  const timer = setInterval(sweep, intervalMs);
  if (timer.unref) timer.unref();
  return {
    sweep,
    async stop() {
      clearInterval(timer);
      if (running) await running;
    },
  };
}

module.exports = { recoverRuns, ensureJob, claimRecoveryAttempt, createSweepLock, startRecoveryScheduler, STALE_AFTER_MS, QUEUED_GRACE_MS, MAX_RECOVERY_ATTEMPTS, SWEEP_INTERVAL_MS };

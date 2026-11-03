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
 *    won't run again: removed and re-added, when safe (see below), at most
 *    MAX_RECOVERY_ATTEMPTS times per job id; after that it's logged for a person.
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

/**
 * Makes sure job `jobId` will run. -> "pending" | "added" | "replaced" | "kept-finished" | "gave-up"
 * replaceFinished: whether a failed/completed job occupying the id may be replaced.
 */
async function ensureJob(queue, { jobId, name, data, delay = 0, replaceFinished, log }) {
  const job = await queue.getJob(jobId);
  const state = job ? await job.getState() : "missing";
  if (PENDING_STATES.has(state)) return "pending";

  let attempt = 0;
  if (state === "completed" || state === "failed") {
    if (!replaceFinished) return "kept-finished";
    attempt = (Number(job.data?.recoveryAttempt) || 0) + 1;
    if (attempt > MAX_RECOVERY_ATTEMPTS) {
      log.error(`[recovery] job ${jobId} is ${state} again after ${MAX_RECOVERY_ATTEMPTS} recovery attempts; leaving run ${data.zapRunId} for a person to check`);
      return "gave-up";
    }
    await job.remove();
  }
  await queue.add(name, { ...data, ...(attempt && { recoveryAttempt: attempt }) }, { jobId, delay: Math.max(0, Math.round(delay)) });
  return attempt ? "replaced" : "added";
}

/**
 * One sweep. Returns a summary per run id (for logs and tests), or { skipped: "locked" }.
 * Options: now (ms), staleAfterMs, acquireLock (from createSweepLock), log.
 */
async function recoverRuns(prisma, queue, { now = Date.now(), staleAfterMs = STALE_AFTER_MS, acquireLock, log = console } = {}) {
  const release = acquireLock ? await acquireLock() : async () => {};
  if (!release) return { skipped: "locked" };
  const results = {};
  try {
    // QUEUED: the worker hasn't started the run, so nothing was sent - safe to (re)queue.
    // A completed job with the run still QUEUED is unexpected; replaced only once it's stale.
    const queued = await prisma.zapRun.findMany({ where: { status: "QUEUED" }, select: { id: true, createdAt: true } });
    for (const run of queued) {
      const job = await queue.getJob(jobIdFor(run.id));
      const state = job ? await job.getState() : "missing";
      results[run.id] = await ensureJob(queue, {
        jobId: jobIdFor(run.id),
        name: "execute-zap-run",
        data: { zapRunId: run.id },
        replaceFinished: state === "failed" || now - time(run.createdAt) >= staleAfterMs,
        log,
      });
    }

    const running = await prisma.zapRun.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        createdAt: true,
        startedAt: true,
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
        results[run.id] = await ensureJob(queue, {
          jobId: resumeJobIdFor(run.id, latest.stepId),
          name: "resume-zap-run",
          data: { zapRunId: run.id, resumeAfterStepId: latest.stepId },
          delay: resumeAt - now,
          // A failed resume job never ran the steps after the Delay. A completed one with the
          // run still waiting there didn't either - replaced once that is clearly stale.
          replaceFinished: state === "failed" || now - Math.max(resumeAt, lastActivity) >= staleAfterMs,
          log,
        });
        continue;
      }

      // Running something (or stopped mid-way). Only touched once quiet for staleAfterMs.
      if (now - lastActivity < staleAfterMs) {
        results[run.id] = "recent";
        continue;
      }
      const lastDelay = [...executions].reverse().find(isPendingDelay);
      results[run.id] = await ensureJob(queue, lastDelay
        ? { jobId: resumeJobIdFor(run.id, lastDelay.stepId), name: "resume-zap-run", data: { zapRunId: run.id, resumeAfterStepId: lastDelay.stepId }, replaceFinished: true, log }
        : { jobId: jobIdFor(run.id), name: "execute-zap-run", data: { zapRunId: run.id }, replaceFinished: true, log });
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

module.exports = { recoverRuns, ensureJob, createSweepLock, startRecoveryScheduler, STALE_AFTER_MS, MAX_RECOVERY_ATTEMPTS, SWEEP_INTERVAL_MS };

# Milestone 8: Delay Step — Durable, Crash-Safe Pausing

**Date:** 28/07/2026

## What was built
- `DELAY` step type: instead of blocking the worker process with `sleep()`,
  the run is marked "paused" and a **new** BullMQ job is scheduled with a
  `delay` option (`queue.add(..., { delay: seconds * 1000 })`). The
  original job returns normally — no process is blocked waiting.
- Because the delay lives in Redis (a persisted job with a future
  execution time), not in any single process's memory, the pending delay
  survives a worker crash or restart. Any available worker — not
  necessarily the one that scheduled it — can pick up the resumed job when
  the delay elapses.
- **Context reconstruction on resume**: since the resumed job is a
  separate function invocation with no memory of the original run's
  in-memory context, the worker rebuilds it from the database — querying
  all `SUCCESS` `StepExecution` rows for the `ZapRun` and repopulating
  `context.steps` before continuing. This is what makes `StepExecution`
  genuinely load-bearing, not just a logging table.
- `executeStepList` takes an optional `resumeAfterStepId`; when present,
  it skips every step up to and including that id before resuming normal
  execution from the next one.
- Verified live: a 10-second delay step produced two distinct BullMQ jobs
  (visible as two separate `[worker] picked up job ...` log lines with a
  real time gap between them) against the same `ZapRun`, with the second
  job correctly resuming only the steps after the delay.

## Real debugging encountered
- **Missing `Queue` import**: the worker file only imported `Worker` from
  `bullmq`, but the delay-resume logic needs to *produce* a new job too
  (`zapExecutionQueue.add(...)`) — requiring a `Queue` instance in the
  worker file as well, not just the `Worker` consumer. A worker is
  normally pure consumer, but a resumable delay makes it a producer too
  for its own continuation jobs.

## Known follow-up (not yet needed, noted for later)
Nested `executeStepList` calls (e.g. inside a BRANCH's selected child)
don't currently forward `resumeAfterStepId`. This is harmless as long as
delay steps stay at the top level, but would need fixing if a delay is
ever placed inside a branch's child chain.
sfdgfghfghfghfghgfhgdfhgdhdg

## Why this is the "systems" milestone
This is the one that demonstrates actual durable-execution understanding
— not "the code retries," but "state survives process death because it's
externalized to Redis/Postgres rather than held in memory." This is the
same underlying idea Temporal/Inngest are built around, just hand-rolled
at a scope appropriate for this project.
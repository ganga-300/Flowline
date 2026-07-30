# Milestone 9: Rate Limiting (Token Bucket) — Protecting External Services

**Date:** 31-07-2026

## Concept clarified first (worth remembering)
- **Backpressure** protects *this* system from being overwhelmed by its own
  incoming work (already covered by `WORKER_CONCURRENCY`).
- **Rate limiting** protects an *external* service (Slack, OpenRouter) from
  being overwhelmed by outgoing calls from this system — a distinct
  problem, easy to conflate with backpressure.
- Naive retry logic without rate limiting can make things worse: if many
  parallel runs all hit an external API's limit at once, and all retry
  immediately, the retries themselves recreate the burst ("retry storm").
- Token bucket beats fixed-window rate limiting because fixed windows have
  a boundary-exploit bug: max requests at the end of one window plus max
  requests at the start of the next can double the effective burst right
  at the window edge. Continuous token refill has no such boundary.

## What was built
- `apps/worker/src/rateLimiter.js`: a hand-written `TokenBucket` class
  (no external library) — `capacity`, `refillRate`, lazy refill calculated
  from elapsed time on each `consume()` call (not a background timer),
  and a `consume()` method that recursively waits and retries when the
  bucket is empty rather than rejecting the caller.
- Wired into `executeActionStep` — every outgoing HTTP call now waits on
  `await bucket.consume()` first, gating the actual request rate
  regardless of how many `ZapRun`s are executing in parallel.
- Verified live: firing 10 webhook requests in a tight loop showed the
  first 5 action-step calls proceed immediately (bucket capacity 5), then
  `[rateLimiter] bucket empty, waiting 1000ms` on each subsequent call,
  matching the configured `refillRate: 1` token/second exactly.

## Real debugging encountered
- **Invisible slowdown without explicit logging**: the first test attempt
  showed no apparent difference in behavior, which looked like the rate
  limiter wasn't working. The actual issue was that BullMQ's log lines
  have no timestamps printed by default, so a real 1-second-per-request
  slowdown was genuinely invisible just by eyeballing terminal output.
  Adding an explicit `console.log` inside the wait branch turned an
  unverifiable "does this look slower?" into a concrete, provable signal.
- Reinforced (again) the "restart the process after every code change"
  habit — the first "no slowdown" result turned out to be the old,
  rate-limiter-less code still running in an un-restarted worker process.

## Design choice worth remembering for interviews
The bucket is a plain in-memory JS object scoped per-integration
(`slackBucket`), not shared across worker processes. That's a real
limitation worth being able to name: if this system ever ran multiple
worker *processes* in parallel, each would have its own independent
bucket, and the effective combined rate to Slack would be `refillRate *
number of workers`, not the intended single limit. The fix at that point
would be moving the bucket's state into Redis (a distributed rate
limiter) instead of process memory — noted as a documented next step, not
implemented, since this project runs a single worker process for now.
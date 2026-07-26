# Milestone 5: Idempotency + Retry with Exponential Backoff

**Date:** 26-07-2026

## What was built
- **Idempotency (FR-12)**: webhook route now derives the `ZapRun.idempotencyKey`
  from a SHA-256 hash of the trigger id + request body content, instead of a
  timestamp. A duplicate delivery of the exact same payload now hits
  Postgres's `@unique` constraint (Prisma error code `P2002`), and the route
  returns the existing run's id with `duplicate: true` instead of creating a
  second run.
- **Retry with exponential backoff (FR-11)**: the worker's action-step
  execution is wrapped in a retry loop — up to 3 attempts, with wait time
  doubling between attempts (500ms, 1000ms, 2000ms). Each attempt updates
  the same `StepExecution` row's `attempt` counter and status (`RETRYING`)
  rather than creating a new row per attempt, keeping history readable.
- Verified both live: same payload sent twice via curl produced one
  `ZapRun` and a `duplicate: true` response on the second call; a step
  pointed at a deliberately broken URL produced exactly 3 logged attempts
  before being marked permanently `FAILED`.

## Real debugging encountered
- **Missing import silently breaks a route**: `crypto.createHash is not a
  function` initially looked like a broken/shadowed built-in module, but
  the actual cause was simpler — `const crypto = require("crypto")` had
  been dropped from the file during a previous edit. Confirmed via
  `head -5` on the file rather than guessing at Node/npm module resolution
  issues.
- **Forgetting to restart the worker after a code change** produced a
  false negative — the retry logic was correctly written in the file, but
  the *running* worker process was still executing the old, un-retried
  version from before the edit. The fix (`Control+C`, then `node
  src/index.js` again) has now become the default reflex after any code
  change to either `server` or `worker`, not just retry/idempotency work.
- General pattern reinforced again: `grep` the file for the expected new
  code before assuming a behavior change didn't take effect — this
  confirms whether it's a "the file wasn't saved right" problem or a
  "the process wasn't restarted" problem, which look identical from the
  test's output but need different fixes.
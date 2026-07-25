# Milestone 3: Webhook Trigger → Queue → Worker (end-to-end loop)

**Date:** [apni date daal do]

## What was built
- BullMQ producer (`queue.js`) in the API — connects to Redis, defines the
  `zap-execution` queue.
- Webhook route (`POST /webhooks/:token`) — looks up the Trigger by token,
  creates a ZapRun row, enqueues a job, responds immediately (fast ack
  pattern, doesn't wait for execution).
- BullMQ Worker (separate process, `apps/worker`) — connects to the same
  Redis queue, picks up jobs, fetches the Zap's steps from Postgres, executes
  them in order, writes StepExecution rows with input/output/status.
- Full loop verified working end-to-end: webhook hit → ZapRun created →
  job queued → worker picks it up → step executed → StepExecution and
  ZapRun status updated in Postgres.

## What was learned (real debugging, not just theory)
- Producer/consumer pattern in practice: the API never does the actual work,
  it only ever enqueues and returns — this is what keeps the trigger fast
  regardless of how slow a step's real work is.
- Prisma v7 breaking change: `url` is no longer allowed in `schema.prisma`'s
  datasource block. Requires a separate `prisma.config.ts` for CLI commands
  and a driver adapter (`@prisma/adapter-pg`) passed into `PrismaClient` at
  runtime — `new PrismaClient()` with no arguments now throws.
- In a monorepo, `npx prisma generate` populates the client into whichever
  package the schema file resolves relative to — not the terminal's current
  directory — which can silently generate into the wrong package's
  node_modules. Worked around by having the worker import the client
  directly from the server's generated output.
- Redis connection errors (`ECONNREFUSED` on 6379) almost always mean the
  Docker container simply isn't running — check `docker ps` before assuming
  it's a code bug.
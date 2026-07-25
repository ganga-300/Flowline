# Milestone 4: Full End-to-End Loop Verified (Trigger → Queue → Worker → Execution)

**Date:** 25-07-2026

## What was built
- Confirmed the complete Flowline execution pipeline working live:
  webhook hit → Trigger looked up → ZapRun created → job enqueued on
  BullMQ → worker picks up job → Step fetched from Postgres → HTTP call
  executed → StepExecution and ZapRun both updated with final status.
- Added a local `/test-echo` route on the server itself to use as a
  reliable test target, after two external mock-endpoint services
  (webhook.site, then a temporary outage) proved unreliable for repeated
  testing during development.

## Real debugging encountered (this was the actual work)
- **Prisma v7 breaking changes**: `datasource.url` no longer allowed
  directly in `schema.prisma`; requires `prisma.config.ts` plus a driver
  adapter (`@prisma/adapter-pg`) passed into `PrismaClient` at runtime.
- **Docker CPU contention**: an unrelated old project's Neo4j container was
  pinned at 100%+ CPU in the background, causing Postgres connections to
  drop mid-query (`ERR_STREAM_PREMATURE_CLOSE`) even though Postgres itself
  was healthy. Diagnosed via `docker stats --no-stream`.
- **Module system mismatch**: one file (`queue.js`) was accidentally
  written in ES module syntax (`import`/`export`) while the rest of the
  project uses CommonJS (`require`/`module.exports`) — silently
  inconsistent until it caused a real failure.
- **Prisma Studio's own reliability issues in this version**: rows
  appeared to save in the UI (an `id` looked assigned) but the insert had
  actually failed or the id column was empty — confirmed each time by
  going straight to Postgres's own logs (`docker logs flowline-postgres`)
  rather than trusting the Studio UI, which repeatedly gave incomplete
  error messages ("Failed to fetch", a bare "Error" with no detail).
- **Schema/code mismatches**: worker code referenced `startedAt`/
  `completedAt` fields on `StepExecution` and lowercase enum values
  (`"queued"`, `"running"`) that didn't exist in the actual schema
  (which uses `createdAt`/`updatedAt` only, and uppercase enum values
  like `QUEUED`, `RUNNING`) — caught via Prisma's own validation errors.
- **File edits not taking effect**: multiple times, a fix was written to
  a file but the running process (server or worker) wasn't restarted, so
  the old code kept running and the same error repeated — solved by
  always doing a full process kill + restart after any code change, and
  independently re-`cat`-ing the file to confirm what was actually saved
  before assuming an edit worked.
- **Root cause isolation via Postgres's own logs**: `docker logs
  flowline-postgres --tail 50` was consistently the fastest way to get
  the real error (e.g. `duplicate key value violates unique constraint`)
  when the Prisma Studio UI or a generic client error didn't say enough.

## Key lesson
When multiple layers (UI, ORM client, container runtime, module system,
process state) can each independently be the cause of "it's not working,"
the fastest path is always the same: go one layer at a time to the
*source* — the database's own logs, the file's actual saved content,
`docker ps`/`docker stats` for infra — rather than guessing from a
downstream error message.
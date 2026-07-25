# Milestone 2: Local Infra — Docker, Postgres, Redis

**Date:** [apni date daal do]

## What was built
- Postgres and Redis running locally via individual `docker run` containers
  (not yet consolidated into docker-compose — deliberate, to understand each
  piece before automating the setup).
- Prisma schema written (all 6 models) and migrated successfully to a real
  Postgres database — confirmed visually via Prisma Studio.
- Monorepo structure set up: `apps/server` (Express API), `apps/worker`
  (BullMQ consumer), `apps/web` (Next.js) — each with its own package.json
  and dependencies.

## What was learned
- The distinction between infra you don't touch (Postgres, Redis — always
  run in Docker) vs. your own code you're actively editing (server, worker —
  run locally with plain `node`/`nodemon` during development for fast
  iteration, containerized only later for a one-command demo).
- Docker containers persist across restarts once created — `docker start`
  vs. `docker run` (only run once, start every time after).
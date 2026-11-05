# Flowline

A workflow automation engine in the style of Zapier: when something happens in one app,
automatically do something in another, with no code.

> *New GitHub issue → summarize it with AI → post the summary to Slack.*
> *Webhook received → filter on a field → send an email.*

Flowline deliberately covers Zapier's core **Zap engine only**, with a handful of
integrations done in depth rather than thousands done shallowly. Most of the engineering
went into making runs **durable and crash-safe**: no lost events, no stuck runs, and no
duplicate requests to providers after a crash.

## Features

- **Visual Zap builder**: a trigger plus an ordered list of steps, a data picker that maps
  earlier step outputs into later fields (`{{steps.<id>.output...}}`), and a "test this step"
  button that runs against live sample data.
- **Triggers**
  - Webhook: a unique URL that starts a run on each `POST`
  - Gmail: new email (polling)
  - Slack: new message in a channel (polling)
  - GitHub: new issue or new push (polling)
- **Step types**: Action, AI (via OpenRouter), Filter, Branch, Delay, Transform, Formatter, Loop
- **Actions**
  - Gmail: send email
  - Slack: send message, send DM
  - GitHub: create issue, add comment
  - Formatter: capitalize text, format date, extract with regex
  - Math: calculate
  - Custom HTTP request (with an SSRF guard)
- **Run history**: every run and step is recorded with its input, output, error and
  attempt count. Failed runs can be retried in full or from the failed step.
- **Alerts** when a run fails.
- **Accounts and OAuth connections** for each user. Tokens are encrypted at rest with AES-256-GCM.

## Architecture

```
            ┌──────────────┐        ┌──────────────────┐
  Browser ─▶│  apps/web    │──API──▶│  apps/server     │──┐
            │  Next.js     │        │  Express API     │  │ save run (Postgres)
            └──────────────┘        └──────────────────┘  │ queue job (Redis / BullMQ)
                                     ▲  POST /webhooks/:token
  External app ──────────────────────┘                    ▼
                                    ┌──────────────────────────────┐
                                    │  apps/worker                 │
                                    │  BullMQ worker  ─ runs steps │──▶ Gmail / Slack /
                                    │  polling scheduler           │    GitHub / OpenRouter /
                                    │  recovery sweep              │    any HTTP API
                                    └──────────────────────────────┘
```

| Folder | What it is |
|---|---|
| [`apps/web`](apps/web) | Next.js 16 / React 19 frontend: marketing page, auth, dashboard, Zap builder, connections, run history, alerts |
| [`apps/server`](apps/server) | Express 5 API: auth (JWT), Zap CRUD, OAuth flows, webhook intake, step testing. Owns the Prisma schema and migrations |
| [`apps/worker`](apps/worker) | BullMQ consumer that executes runs, plus the polling scheduler, the recovery sweep, the rate limiter and the load tests |
| [`docs`](docs) | One write-up per milestone: design decisions, debugging notes and measured results |

### Data model

The schema is in [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma):

- **User** owns **Zaps**, **Connections** (OAuth tokens) and **Alerts**.
- A **Zap** has one **Trigger** and many **Steps**. A Step can point to a parent Step, which is how branches are represented.
- Each event creates a **ZapRun**. Each executed step is recorded as a **StepExecution**.

### How a run executes

1. An event arrives, either as a webhook or from a poll.
2. A `ZapRun` is saved with an **idempotency key**: the trigger id plus a SHA-256 hash of the
   payload. A redelivered event doesn't create a second run.
3. A BullMQ job is queued with a fixed id (`zap-run-<runId>`), so each run gets exactly one job.
4. The worker runs the steps in order, saves each `StepExecution`, and sets the run to
   `SUCCESS`, `FAILED` or `FILTERED`. A failure creates an alert.

## Reliability

Most of this is documented in [`docs/25-reliability-and-load-results.md`](docs/25-reliability-and-load-results.md):

- **Durable delays.** A Delay step schedules a new delayed job instead of sleeping. When it
  resumes, the run's state is rebuilt from Postgres, so a pending delay survives restarts.
- **Crash safety.** After a worker crash, steps that already succeeded are skipped. A step
  that was mid-request is failed as "outcome unknown" instead of being resent. Providers
  don't offer idempotency keys, so the guarantee is *at-most-once per step*.
- **Selective retries.** Only 429/502/503/504 and connection-not-established errors are
  retried, with exponential backoff, so a request the provider may already have processed
  is never duplicated.
- **Recovery sweep.** Runs whose Redis job was lost get re-queued, with at most 3 attempts
  tracked in Postgres ([`runRecovery.js`](apps/worker/src/runRecovery.js)).
- **No lost polling events.** A poller advances its "last seen" marker only after the run for
  that item has been saved and queued.
- **Outbound protection.** A token-bucket rate limiter, 15 s timeouts on every provider request.

**Measured** (one 4-vCPU VM, fake providers; full details in doc 25):

- Worker SIGKILLed twice during a 500-event run: **0 lost runs, 0 stuck runs, 0 duplicate requests**.
- Webhook endpoint held **1,000 req/s** with a p95 of 2–6 ms.

## Running locally

**Prerequisites:** Node.js, plus Postgres and Redis running locally (for example in Docker).

```bash
docker run -d --name flowline-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=flowline -p 5432:5432 postgres:17
```

```bash
docker run -d --name flowline-redis -p 6380:6379 redis:7
```

**1. Configure environment.** [`.env.example`](.env.example) lists every variable and the
app that needs it. Copy the relevant sections into:

- `apps/server/.env`
- `apps/worker/.env`
- `apps/web/.env.local`

OAuth client ids are only needed for the integrations you want to use. `OPENROUTER_API_KEY`
is only needed for AI steps.

**2. Install and migrate.** Install the server first: the worker uses the server's generated
Prisma client.

```bash
cd apps/server && npm install && npx prisma generate && npx prisma migrate deploy
```

```bash
cd apps/worker && npm install
```

```bash
cd apps/web && npm install
```

**3. Start each app in its own terminal.**

```bash
cd apps/server && npm run dev
```

```bash
cd apps/worker && npm start
```

```bash
cd apps/web && npm run dev
```

Open http://localhost:3000. The API runs on http://localhost:4000.

To run the API and the worker in a single process, use `npm run start:all` in `apps/server`.
This is what the free Render deployment does.

## Tests

Each app uses Node's built-in test runner:

```bash
cd apps/server && npm test
```

```bash
cd apps/worker && npm test
```

```bash
cd apps/web && npm test
```

Load and crash tests (k6 and Node scripts that run against fake providers) are in
[`apps/worker/loadtest`](apps/worker/loadtest).

## Deployment

Everything runs on free tiers:

- **Vercel**: the web app
- **Render**: the API and worker, together in one process
- **Render Key Value**: Redis
- **Neon**: Postgres

The step-by-step guide is [`docs/27-deploy-render-free.md`](docs/27-deploy-render-free.md).
Production requires `TOKEN_ENCRYPTION_KEY` and `JWT_SECRET`
(see [`docs/26-token-encryption.md`](docs/26-token-encryption.md)).

## Docs

[`docs/`](docs) holds 27 milestone write-ups, in build order:

- PRD and schema design
- The webhook → queue → worker loop
- Idempotency and retries
- Filters and branches
- Delay durability
- Rate limiting
- The AI step
- OAuth for GitHub, Gmail and Slack
- The data picker and step testing
- Reliability and load results
- Token encryption
- Deployment

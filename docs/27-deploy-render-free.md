# Deploying Flowline (free): Vercel + Render + Neon

| Part | Where | Plan |
|---|---|---|
| Web (Next.js) | Vercel | already deployed |
| API **and** worker, one process | Render Web Service | Free |
| Redis (BullMQ queue) | Render Key Value | Free |
| Postgres | Neon (or Supabase) | Free |

Why one process: Render's free plan has no background workers, so `npm run start:all`
(`apps/server/src/start-all.js`) runs the API and the worker together.
Render's free Postgres is deleted after 30 days, so the database lives on Neon.

## 1. Postgres (Neon)
1. Create a project and copy the **direct** connection string (not the `-pooler` one: Prisma
   migrations need a direct connection). It ends with `?sslmode=require`.
2. That string is `DATABASE_URL`.

## 2. Redis (Render Key Value)
1. New → Key Value → Free, in the region you'll use for the web service.
2. **Maxmemory policy: `noeviction`** (BullMQ needs it; with eviction, queued jobs can vanish).
3. Copy the **Internal** URL (`redis://red-...:6379`) → `REDIS_URL`.
   The free instance keeps no data on restart; that's OK: the worker re-queues waiting runs
   from Postgres when it starts.

## 3. API + worker (Render Web Service)
New → Web Service → this repo.

| Setting | Value |
|---|---|
| Root directory | *(empty: repo root)* |
| Runtime | Node |
| Build command | `cd apps/server && npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && cd ../worker && npm ci` |
| Start command | `cd apps/server && npm run start:all` |
| Instance type | Free |
| Health check path | `/health` |

Environment variables (see `.env.example` for all of them):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon direct URL |
| `REDIS_URL` | Key Value internal URL |
| `JWT_SECRET` | long random string |
| `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (keep a copy; losing it means reconnecting apps) |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://flowline.vercel.app` (comma-separate more origins) |
| `GITHUB_CLIENT_ID` / `_SECRET` | from your GitHub OAuth app |
| `GITHUB_REDIRECT_URI` | `https://<render-service>.onrender.com/connections/github/callback` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | from Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://<render-service>.onrender.com/connections/gmail/callback` |
| `SLACK_CLIENT_ID` / `_SECRET` | from your Slack app |
| `SLACK_REDIRECT_URI` | `https://<render-service>.onrender.com/connections/slack/callback` |
| `OPENROUTER_API_KEY` | only if you use AI steps |

The service refuses to start (with a list of what's missing) if a required variable is absent.

## 4. Update the OAuth apps
Add the three `https://<render-service>.onrender.com/connections/<app>/callback` URLs:
- GitHub → Settings → Developer settings → OAuth Apps → Authorization callback URL
- Google Cloud → APIs & Services → Credentials → OAuth client → Authorized redirect URIs
  (while the consent screen is in *Testing*, add your Google accounts as test users)
- Slack → your app → OAuth & Permissions → Redirect URLs

## 5. Vercel
Project → Settings → Environment Variables: `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`,
then **redeploy** (`NEXT_PUBLIC_*` values are baked in at build time).

## 6. Keep it awake
A free Render service sleeps after 15 minutes without requests: polling triggers stop and the
first request takes about a minute. Point a free uptime monitor (UptimeRobot, cron-job.org) at
`https://<render-service>.onrender.com/health` every 10 minutes.

## Check it
1. `https://<render-service>.onrender.com/health` → `{"status":"ok"}`
2. Sign up on the Vercel site, connect an app, build a Zap, and watch Run history.
3. Render logs should show both `Server is running on port ...` and `Worker started`.

## Limits of the free setup (worth saying in an interview)
- One process: a busy worker slows the API, and the worker processes one job at a time.
- Cold starts if the pinger stops; Key Value data is lost on restart (runs are re-queued from Postgres).
- Moving the worker to its own service later only changes the start commands:
  API `npm start` in `apps/server`, worker `npm start` in `apps/worker`.

Verified locally with production settings (bench harness): missing variables stop startup with a
clear message; `start:all` serves `/health` and runs jobs in the same process; CORS allows only the
`FRONTEND_URL` origins; the retry end-to-end test passes on the combined process.

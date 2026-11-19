# Flowline web

The Flowline website and app: the marketing pages, sign-up and log-in, and the signed-in product where you build Flows (automations between GitHub, Gmail, Slack, webhooks and built-in steps), watch their runs, manage connected apps and see alerts.

Built with Next.js (App Router), React and Tailwind CSS. It talks to the Flowline API in `apps/server`.

## Run it locally

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). Start the API as well, or point the app at a running one (see below).

## Tests

```bash
npm test
```

Runs the unit tests in `test/` with Node's built-in test runner.

## Environment

| Variable | What it does | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the Flowline API. | `http://localhost:4000` |
| `NEXT_PUBLIC_SITE_URL` | Public URL of this site, used for absolute links in page metadata. | `http://localhost:3000` |

Put them in `.env.local` for local development.

# Milestone 12: OAuth Integration (GitHub) — First Real Connection

**Date:** 12/08/2026

## What was built
- Full OAuth 2.0 authorization code flow implemented from scratch:
  `GET /auth/github` redirects to GitHub's authorization page with
  `client_id` + `redirect_uri` + `scope`; `GET /auth/github/callback`
  receives the temporary `code`, exchanges it server-to-server (with
  `client_secret`, never exposed to the browser) for a real access token,
  and persists it to the `Connection` table.
- This is the first time the `Connection` model (present in the schema
  since the very first ER diagram design session) has actually been
  populated with a real row — closing a gap that had existed since the
  original data model was designed.
- Verified live: full browser round-trip through GitHub's own consent
  screen, successful token exchange, `Connection` row created with
  `provider: "github"`.

## Why this matters beyond "one more integration"
This validates the `Connection` model's actual design, not just its
schema — `Trigger.connectionId` and `Step.connectionId` were designed
months ago on paper (during the very first ER diagram session) but never
exercised end-to-end until now. Having a real, working OAuth flow means
the same pattern (authorize → callback → token exchange → save) can be
repeated for Slack, Google, or any other OAuth-based provider by swapping
the provider-specific URLs and scopes — the `Connection` table and the
surrounding route structure don't need to change.
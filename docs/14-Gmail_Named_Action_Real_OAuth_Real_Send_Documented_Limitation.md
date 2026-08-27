# Milestone 15: Gmail Named Action — Real OAuth, Real Send, Documented Limitation

**Date:** [apni date daal do]

## What was built
- `Connection.userId` added to the schema (a gap identified while building
  this feature — connections were still globally shared even after
  Milestone 13's per-user auth work covered `Zap` but not `Connection`).
  Migrated after clearing one leftover test row from the earlier GitHub
  OAuth milestone.
- Modular integration architecture in `apps/worker/src/integrations/` —
  a registry (`registry.js`) mapping `${provider}:${action}` keys (e.g.
  `gmail:send_email`) to dedicated executor functions, avoiding a growing
  if/else chain inside the main worker file. The existing generic HTTP
  executor remains the fallback for steps with no `provider` set.
- Gmail "Send Email" executor (`integrations/gmail/sendEmail.js`):
  resolves `to`/`subject`/`body` through the existing `resolveTemplate`
  mechanism (same `{{trigger.field}}` syntax as every other step type,
  no second template engine), constructs an RFC 2822 MIME message,
  base64url-encodes it, and sends via the Gmail API. Handles automatic
  401-triggered access token refresh using the stored `refreshToken`,
  persisting the new token back to the `Connection` row.
- Full OAuth 2.0 flow for Gmail (`/connections/gmail/start`,
  `/connections/gmail/callback`) — reuses the state-parameter pattern to
  carry `userId` through the redirect (since Google's callback redirect
  can't carry an Authorization header), the same core pattern as the
  GitHub OAuth flow from Milestone 12.
- A `/connections` frontend page listing connected accounts and a
  "Connect Gmail" button that performs a real browser navigation
  (`window.location.href`, not `fetch`) to start the OAuth flow — OAuth
  fundamentally requires a full page redirect, not an API call.

## Real debugging encountered
- **Reused a class of bug seen throughout the project**: `Connection`
  had the same missing-`userId` gap that `Zap` had in Milestone 13,
  requiring the same fix pattern (add field, migrate, clear conflicting
  test rows, regenerate Prisma client in both `server` and `worker`).
- **A route with auth middleware but no actual filter**: `GET
  /auth/connections` had `requireAuth` applied but the Prisma query
  itself was missing `where: { userId: req.userId }` — authenticated,
  but not scoped, meaning any logged-in user could see every user's
  connections. Caught by reading the route's actual body, not just
  confirming the middleware was present — a reminder that "protected"
  and "scoped" are two different things that both need checking
  separately.
- **A missing `useEffect` import crashing the OAuth return page**: after
  Google's redirect back to `/zaps/new?connected=gmail&connectionId=...`,
  the page crashed before it could read those query params, because
  `useEffect` wasn't imported. This looked at first like the OAuth flow
  itself had failed (the `Connection` table was empty), but the actual
  backend save had succeeded independently of the frontend crash —
  isolated by checking the database directly rather than assuming the
  visible frontend error meant the whole flow failed.

## Known, documented limitation (not a bug)
Google requires OAuth apps requesting sensitive scopes (like
`gmail.send`) to complete a verification review before any user outside
an explicit "test users" allowlist can connect — this is a Google
platform policy, not something fixable in this codebase. New users who
aren't manually added as test users see a `403: access_denied` screen.
Full public verification can take days to weeks and wasn't pursued given
the project's timeline; documented here rather than hidden, since it's a
legitimate real-world OAuth constraint worth being able to explain
directly ("the flow is fully built and tested, production rollout is
gated on Google's own review process, not on anything left unbuilt").
# Milestone 13: Authentication — Signup, Login, Per-User Data Isolation

**Date:** 14/08/2027

## What was built
- `User` model added to schema (email, bcrypt-hashed password), `Zap.userId`
  added as a required foreign key — every Zap now belongs to exactly one
  user, closing a gap that had existed since the project's first schema
  design (everything was previously globally shared, no user concept at
  all).
- `POST /auth/signup` and `POST /auth/login` — password hashed via bcrypt
  (cost factor 10) before storage, never stored plaintext; JWT issued on
  success (`{ userId }` payload, signed with `JWT_SECRET`, 7-day expiry).
- `requireAuth` middleware — verifies the `Authorization: Bearer <token>`
  header, attaches `req.userId` on success, returns 401 otherwise.
  Applied to all `/zaps` routes.
- Every `/zaps` route now filters/scopes by `req.userId` — `GET /zaps`
  only returns the authenticated user's own Zaps, `POST /zaps` attaches
  `userId` on creation.
- Verified live: unauthenticated request to `GET /zaps` returns 401;
  authenticated request returns only that user's Zaps; a Zap created via
  the API correctly carries the creating user's `userId`.


## Why this unblocks the next feature
Per-user `Connection` rows (needed for the Gmail "Send Email" named
action planned next) only make sense once there's a real concept of
"which user is this." This milestone is the direct prerequisite for that
work, not a side quest — the OAuth flow built for GitHub in Milestone 12
will need to be re-pointed to save `Connection.userId` next, using this
same `requireAuth` middleware to know who's connecting.
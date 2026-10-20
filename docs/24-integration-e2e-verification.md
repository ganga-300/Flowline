# 24 - GitHub, Slack and Gmail: end-to-end verification checklist

Automated tests (`npm test` in `apps/server`, `apps/worker`, `apps/web`) use **mocked**
provider APIs, Prisma and Redis. They prove request/response handling, payload shapes and
variable resolution - **not** that the real providers accept our requests. Every row below
must be run against real accounts before an integration is called "working end to end".

Fill in the Result column (pass / fail + note) and the run ID from Run History.

## Setup
- [ ] Server and worker restarted after pulling the latest changes
- [ ] `POLL_CYCLE_MS=20000` in `apps/worker/.env` (optional, faster checks while testing)
- [ ] Slack reconnected once after the `channels:join` / `im:write` scope change
      (if Slack shows `invalid_scope`, add both under OAuth & Permissions -> Bot Token Scopes)

## OAuth and connections
| # | Check | Expected | Result |
|---|---|---|---|
| O1 | Connect GitHub | Account picker shown; connection labelled with the chosen username | |
| O2 | Connect Slack (open-Source) | Green banner; connection labelled "slack: open-Source" | |
| O3 | Connect Gmail | Google account chooser shown; connection labelled with the email | |
| O4 | "+ Connect another account" mid-draft in the builder | Returns to the same draft with the new account selected | |
| O5 | Cancel on a provider consent screen | Draft kept; error banner shown | |

## Workflows
Note: the first **Run** on a new polling Zap only records a starting point.

| # | Workflow | Steps | Expected | Result | Run ID |
|---|---|---|---|---|---|
| A | GitHub New Issue -> Slack Send Message | Publish, Run, create issue, Run | Slack message with issue title/#/author/link | Verified by user 2026-10-20 | |
| B | Gmail New Email -> GitHub Create Issue | Query e.g. `subject:flowline-test`; publish, Run, send matching email, Run | Issue titled with the email subject, body = email text | | |
| C | Slack New Message -> Gmail Send Email | Public channel; publish, Run, post a message with an emoji, Run | Email arrives; subject not garbled; line breaks kept | | |
| D | GitHub New Push -> GitHub Add Comment | Issue number like `#1`; push a commit, Run | Comment with the commit message on that issue | | |
| E | Any trigger -> Slack Send DM | Pick a user | DM delivered | | |
| F | Multi-step: GitHub New Issue -> GitHub Create Issue -> Slack Send Message | In step 2 insert `Step 1 -> Issue URL` from the picker | Slack text contains the URL of the issue created in step 1 | | |
| G | Filter | GitHub New Issue -> Filter `trigger.issue.title CONTAINS bug` -> Slack | Run status FILTERED for titles without "bug"; SUCCESS with it | | |

## Error paths
| # | Check | Expected | Result |
|---|---|---|---|
| E1 | Slack trigger on a private channel the app isn't in | "Fetch latest" says to `/invite` the app | |
| E2 | GitHub Create Issue on a repo the account can't access | Run fails with "not found, or ... no access (404)" | |
| E3 | Gmail send after the access token expired (>1 hour since connecting) | Send succeeds (token refreshed) | |
| E4 | Run on a polling Zap with nothing new | "No new ... since the last check"; no run created | |

## Known gaps (not covered by this milestone)
- Slack messages show the user ID (e.g. `U012...`), not the display name.
- Slack Send DM recipient is chosen from a dropdown; typing an email or a variable isn't supported in the UI yet.
- A Zap can't be edited after publishing; create a new one to change it.
- Action steps are retried up to 3 times on failure, which could repeat a send if a provider
  accepted the request but the response was lost.

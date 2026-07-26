# Milestone 6: Filter + Branch Steps (Conditional Execution)

**Date:** 26/07/2026

## What was built
- **Condition evaluation helpers** (`apps/worker/src/conditions.js`):
  `resolvePath(context, path)` walks a dot-notation string (e.g.
  `"trigger.priority"`) through the run's context object one segment at a
  time; `evaluateCondition(context, condition)` resolves a value via
  `resolvePath` and compares it using an operator (`equals`, `not_equals`,
  `contains`, `greater_than`, `less_than`).
- **FILTER step type**: evaluates a single condition; if it fails, the run
  stops cleanly with `ZapRun.status = "FILTERED"` — a distinct status from
  `FAILED`, since a filter not passing is expected behavior, not an error.
- **BRANCH step type**: evaluates multiple children (each with its own
  `branchCondition`), selects the first matching child (or a "default"
  child with no condition, if present), and marks every non-selected
  child's entire subtree as `StepExecution.status = "SKIPPED"` (recursive,
  via `markSkipped`) — again, distinct from `FAILED`.
- Verified end-to-end with a real branch: a step with two children
  (`step_branch_urgent`, condition `trigger.priority equals "urgent"`, and
  `step_branch_default`, no condition). Two live test runs confirmed
  exactly the expected pattern — one run executed the urgent child and
  skipped the default child, the other did the reverse.

## Real debugging encountered
- **Multi-statement SQL inserts failing silently mid-batch**: running the
  branch step's INSERT followed immediately by its children's INSERTs (as
  one paste) meant the first insert's actual failure wasn't noticed before
  the next statements ran — the children then failed on a foreign key
  constraint (`parentStepId` pointing at a row that was never created).
  Fixed by always running one INSERT, then a `SELECT` to confirm the row
  exists, before running the next dependent INSERT — same "verify at each
  layer" principle from Milestone 4/5, applied to multi-row test data setup
  specifically.
- Docker's own logs (`docker logs flowline-postgres --tail 20`) again
  correctly surfaced the exact constraint name and failing statement when
  the Prisma Studio UI's own error message wasn't specific enough.

## Key structural insight
Branching didn't require a new database table — it's entirely expressed
through the existing self-referencing `parentStepId` column on `Step` plus
the `branchCondition` JSON field on each child. The execution engine's
`executeStepList` function recurses into a selected branch child's own
children the same way it walks any other step list, which is what lets
nested branches (a branch inside a branch) work without any extra code.
# Milestone 1: PRD, Scope, and Data Model

**Date:** [apni date daal do]

## What was built
- Full PRD written from a blank template — functional requirements, non-functional
  requirements, tech stack, and scalability measures scoped specifically for a
  solo 4-week build (not the enterprise sections from the original template).
- Deliberately studied Zapier's actual product (Zap, Agent, Chatbot, MCP, Forms)
  and scoped Flowline to just the Zap/workflow-automation engine — depth over
  breadth, 3-4 integrations instead of Zapier's thousands.
- Designed a 6-entity data model from first principles: Zap, Connection, Trigger,
  Step, ZapRun, StepExecution — including a self-referencing relationship on
  Step (parentStepId) to support branching, based on studying how Zapier's
  actual "Paths" feature works.
- Drew the full ER diagram in Miro before writing any schema code.

## What was learned
- Branching in a workflow engine isn't a separate table — it's a self-relation
  on the Step model (a step can point to another step as its parent).
- A Connection (OAuth/API credential) must be provider-specific and reusable
  across multiple Zaps, confirmed by Zapier's own UI showing "Used in 1 Zap"
  next to a connected account.
- "Filtered" (a filter step stopping a run cleanly) must be a distinct status
  from "failed" — they mean very different things in execution history.
// Unit tests for the builder draft helpers (pure functions, no browser or network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeDraft, parseDraft, applyConnectionToDraft, BUILDER_DRAFT_MAX_AGE_MS } from "../src/lib/builderDraft.js";

const baseDraft = () => ({
  zapName: "Issue to Slack",
  trigger: { type: "POLLING", config: { provider: "github", event: "new_issue", repo: "octo/demo" }, isConfigured: true },
  steps: [
    { id: "step-1", type: "ACTION", config: { provider: "slack", action: "send_message", connectionId: null, config: { text: "hi" } } },
    { id: "step-2", type: "ACTION", config: { provider: "slack", action: "send_dm", connectionId: "existing", config: {} } },
    { id: "step-3", type: "ACTION", config: { provider: "gmail", action: "send_email", connectionId: null, config: {} } },
  ],
  activePanel: { target: "step", stepId: "step-1", tab: "setup" },
  panelDraft: { id: "step-1", type: "ACTION", config: { provider: "slack", action: "send_message", connectionId: null, config: { text: "unsaved edit" } } },
  sampleData: { body: { title: "x" } },
});

test("serialize/parse round-trips the draft", () => {
  const draft = baseDraft();
  assert.deepEqual(parseDraft(serializeDraft(draft, 1000), 2000), draft);
});

test("parseDraft rejects stale, missing and corrupt input", () => {
  const raw = serializeDraft(baseDraft(), 0);
  assert.equal(parseDraft(raw, BUILDER_DRAFT_MAX_AGE_MS + 1), null);
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft("{not json"), null);
  assert.equal(parseDraft(JSON.stringify({ savedAt: 1 })), null);
});

test("new connection goes to the open panel, keeping its unsaved edits", () => {
  const out = applyConnectionToDraft(baseDraft(), "slack", "conn_new");
  assert.equal(out.panelDraft.config.connectionId, "conn_new");
  assert.equal(out.panelDraft.config.config.text, "unsaved edit");
});

test("steps of the same provider without an account get it; existing choices are kept", () => {
  const out = applyConnectionToDraft(baseDraft(), "slack", "conn_new");
  assert.equal(out.steps[0].config.connectionId, "conn_new");
  assert.equal(out.steps[1].config.connectionId, "existing");
  assert.equal(out.steps[2].config.connectionId, null, "gmail step untouched");
});

test("trigger panel gets the id both at top level and in config", () => {
  const draft = baseDraft();
  draft.trigger = { type: "POLLING", connectionId: null, config: { provider: "gmail", event: "new_email" } };
  draft.panelDraft = { ...draft.trigger, config: { ...draft.trigger.config } };
  draft.activePanel = { target: "trigger", tab: "setup" };
  const out = applyConnectionToDraft(draft, "gmail", "conn_g");
  assert.equal(out.panelDraft.connectionId, "conn_g");
  assert.equal(out.panelDraft.config.connectionId, "conn_g");
  assert.equal(out.trigger.config.connectionId, "conn_g");
});

test("unrelated provider or missing ids leave the draft unchanged", () => {
  const draft = baseDraft();
  assert.deepEqual(applyConnectionToDraft(draft, "github", "conn_x").steps, draft.steps);
  assert.equal(applyConnectionToDraft(draft, "slack", null), draft);
  assert.equal(applyConnectionToDraft(null, "slack", "c"), null);
});

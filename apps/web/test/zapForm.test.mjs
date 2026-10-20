// Builder <-> API conversion for creating and editing Zaps (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toZapPayload, fromSavedZap } from "../src/lib/zapForm.js";

// Builder state for: GitHub New Issue -> Filter -> GitHub Create Issue -> Slack (uses step-3 output) -> Delay -> HTTP
const builder = {
  zapName: " Issue triage ",
  trigger: { type: "POLLING", connectionId: "c_gh", config: { provider: "github", event: "new_issue", repo: "o/r", connectionId: "c_gh" }, isConfigured: true },
  steps: [
    { id: "step-2", type: "FILTER", name: "Only bugs", config: { path: "trigger.issue.title", operator: "CONTAINS", value: "bug" } },
    { id: "step-3", type: "ACTION", name: "Mirror", config: { provider: "github", action: "create_issue", connectionId: "c_gh", config: { repo: "o/mirror", title: "{{trigger.issue.title}}" } } },
    { id: "step-1", type: "ACTION", name: "Notify", config: { provider: "slack", action: "send_message", connectionId: "c_sl", config: { channel: "C1", text: "{{steps.step-3.output.issueUrl}}" } } },
    { id: "step-4", type: "DELAY", name: "Wait", config: { seconds: "45" } },
    { id: "step-5", type: "ACTION", name: "Hook", config: { url: "https://example.com/h", method: "POST", body: '{"a": 1}' } },
  ],
};

// What the API stores (POST /zaps) and returns from GET /zaps/:id.
function simulateSave(payload) {
  return {
    id: "z1", zapName: payload.name,
    trigger: { id: "t1", type: payload.trigger.type, config: payload.trigger.config, connectionId: payload.trigger.connectionId ?? null, pollIntervalSec: payload.trigger.pollIntervalSec ?? null },
    steps: payload.steps.map((s, i) => ({ id: `db_${i}`, parentStepId: null, connectionId: s.connectionId ?? null, ...s })),
  };
}

test("create payload: trimmed name, step order, refs and connections", () => {
  const p = toZapPayload(builder);
  assert.equal(p.name, "Issue triage");
  assert.equal(p.trigger.connectionId, "c_gh");
  assert.equal(p.trigger.pollIntervalSec, 300);
  assert.deepEqual(p.steps.map((s) => [s.order, s.config.ref]), [[0, "step-2"], [1, "step-3"], [2, "step-1"], [3, "step-4"], [4, "step-5"]]);
  assert.deepEqual(p.steps[0].config.condition, { path: "trigger.issue.title", operator: "CONTAINS", value: "bug" });
  assert.equal(p.steps[2].connectionId, "c_sl");
  assert.deepEqual(p.steps[4].config.body, { a: 1 });
  assert.equal(p.steps.some((s) => "id" in s), false, "new Zap: no step ids sent");
});

test("saved Zap loads back into the builder with the same ids, refs and values", () => {
  const loaded = fromSavedZap(simulateSave(toZapPayload(builder)));
  assert.equal(loaded.zapName, "Issue triage");
  assert.deepEqual(loaded.steps.map((s) => s.id), ["step-2", "step-3", "step-1", "step-4", "step-5"], "builder ids = saved refs, so step variables keep working");
  assert.deepEqual(loaded.steps.map((s) => s.dbId), ["db_0", "db_1", "db_2", "db_3", "db_4"]);
  assert.deepEqual(loaded.steps[0].config, builder.steps[0].config);
  assert.equal(loaded.steps[2].config.config.text, "{{steps.step-3.output.issueUrl}}");
  assert.equal(loaded.steps[2].config.connectionId, "c_sl");
  assert.equal(loaded.trigger.config.repo, "o/r");
  assert.equal(loaded.trigger.connectionId, "c_gh");
});

test("load -> save round trip sends step ids (update in place) and is otherwise unchanged", () => {
  const firstSave = toZapPayload(builder);
  const resave = toZapPayload(fromSavedZap(simulateSave(firstSave)));
  assert.deepEqual(resave.steps.map((s) => s.id), ["db_0", "db_1", "db_2", "db_3", "db_4"]);
  const strip = (p) => ({ ...p, steps: p.steps.map(({ id, ...rest }) => rest) });
  assert.deepEqual(strip(resave), strip(firstSave));
});

test("Zaps saved before refs existed get their database id as builder id", () => {
  const legacy = { id: "z", zapName: "Old", trigger: { type: "WEBHOOK", config: { provider: "webhook" } },
    steps: [{ id: "cuid1", type: "ACTION", order: 0, parentStepId: null, connectionId: "c", config: { provider: "slack", action: "send_message", config: {} } }] };
  const loaded = fromSavedZap(legacy);
  assert.equal(loaded.steps[0].id, "cuid1");
  assert.equal(loaded.steps[0].config.connectionId, "c", "connection restored from the step row");
  assert.equal(toZapPayload(loaded).steps[0].config.ref, "cuid1");
});

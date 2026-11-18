// What a step needs before it can run (shared by the API's save check and the worker).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { missingStepConfig } = require("../src/integrations/requiredConfig");

const action = (provider, act, values, nested = true) => ({
  type: "ACTION",
  config: nested ? { provider, action: act, config: values } : { provider, action: act, ...values },
});

test("app actions: every required field must be filled (nested or flat config)", () => {
  assert.equal(missingStepConfig(action("formatter", "capitalize_text", {})), "fill in Input Text.");
  assert.equal(missingStepConfig(action("formatter", "capitalize_text", { text: "{{trigger.name}}" })), null);
  assert.equal(missingStepConfig(action("slack", "send_message", { channel: "C1", text: "hi" }, false)), null, "API-created steps keep fields flat");
  assert.equal(missingStepConfig(action("gmail", "send_email", { to: "a@b.c" })), "fill in Subject and Body.");
  assert.equal(missingStepConfig(action("github", "add_comment", { repo: "o/r", body: " " })), "fill in Issue or PR Number and Comment Content.");
});

test("an action without one picked, or an unknown one, isn't set up", () => {
  assert.equal(missingStepConfig({ type: "ACTION", config: { provider: "slack" } }), "choose an action.");
  assert.match(missingStepConfig(action("slack", "nope", {})), /no action "nope"/);
});

test("HTTP requests need a URL; Filter, AI, Delay and Loop need their one setting", () => {
  assert.equal(missingStepConfig({ type: "ACTION", config: { url: "" } }), "enter the URL to send the request to.");
  assert.equal(missingStepConfig({ type: "ACTION", config: { url: "https://x.test" } }), null);
  assert.equal(missingStepConfig({ type: "FILTER", config: { condition: { path: "" } } }), "choose the field this filter checks.");
  assert.equal(missingStepConfig({ type: "FILTER", config: { condition: { path: "trigger.x" } } }), null);
  assert.equal(missingStepConfig({ type: "AI", config: {} }), "write the prompt.");
  assert.equal(missingStepConfig({ type: "DELAY", config: { seconds: 0 } }), "set how long to wait.");
  assert.equal(missingStepConfig({ type: "LOOP", config: { arrayPath: "trigger.items" } }), null);
  assert.equal(missingStepConfig({ type: "BRANCH", config: {} }), null);
});

// Flow templates: each build() is a valid builder state that only needs accounts and the
// user's own choices (repository, channel, recipient) before it can be published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, getTemplate } from "../src/features/templates/templates.js";
import { gettingStartedItems, hasAnyRun } from "../src/features/templates/gettingStarted.js";
import { triggerProviders } from "../src/integrations/triggers.js";
import { githubIntegration } from "../src/integrations/github/index.js";
import { slackIntegration } from "../src/integrations/slack/index.js";
import { sendEmailAction } from "../src/integrations/gmail/actions/sendEmail.js";
import { formatterIntegration } from "../src/integrations/formatter.js";
import { missingSetup } from "../src/features/zap-builder/setupProgress.js";
import { validateZapForPublish } from "../src/lib/zapValidation.js";
import { flattenSample, getPlaceholderSample } from "../src/integrations/triggerVariables.js";

const ACTIONS = {
  github: githubIntegration.actions,
  slack: slackIntegration.actions,
  gmail: [sendEmailAction],
  formatter: formatterIntegration.actions,
};
const getAction = (provider, action) => ACTIONS[provider]?.find((a) => a.id === action) || null;
const OAUTH = new Set(["github", "gmail", "slack"]);
const APP_NAMES = { github: "GitHub", gmail: "Gmail", slack: "Slack" };

// What the user still has to pick in each step once its account is chosen.
const USER_CHOICES = { "slack:send_message": { channel: "C1" }, "github:create_issue": { repo: "o/r" }, "gmail:send_email": { to: "a@b.test" } };
const TRIGGER_CHOICES = { github: { repo: "o/r" }, slack: { channel: "C1" }, gmail: {}, webhook: {} };

const tokens = (text) => [...String(text).matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1].trim());

test("template ids are unique and getTemplate finds them (unknown ids give null)", () => {
  assert.ok(TEMPLATES.length >= 4 && TEMPLATES.length <= 5);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
  for (const t of TEMPLATES) assert.equal(getTemplate(t.id), t);
  assert.equal(getTemplate("nope"), null);
  assert.equal(getTemplate(null), null);
});

for (const template of TEMPLATES) {
  test(`${template.id}: valid trigger, actions and message templates`, () => {
    const { zapName, trigger, steps } = template.build();
    assert.ok(zapName && zapName !== "Untitled Flow");
    assert.ok(template.title && template.description);

    const provider = triggerProviders.find((p) => p.id === trigger.config.provider);
    assert.ok(provider, `trigger provider ${trigger.config.provider} exists`);
    const event = provider.events.find((e) => e.id === trigger.config.event);
    assert.ok(event, `trigger event ${trigger.config.event} exists`);
    assert.equal(trigger.type, event.type);
    // Nothing the user must choose is pre-filled.
    assert.deepEqual(Object.keys(trigger.config).sort(), ["event", "provider"]);

    assert.deepEqual(template.apps, [trigger.config.provider, ...steps.map((s) => s.config.provider)]);

    const sample = getPlaceholderSample(trigger.config.provider, trigger.config.event);
    const samplePaths = new Set(flattenSample(sample).map((f) => `trigger.${f.path}`));
    const earlier = [];
    steps.forEach((step, i) => {
      assert.equal(step.id, `step-${i + 1}`);
      assert.equal(step.type, "ACTION");
      const def = getAction(step.config.provider, step.config.action);
      assert.ok(def, `${step.config.provider}:${step.config.action} exists`);
      assert.equal(step.name, def.name);
      assert.ok(!step.config.connectionId, "no account pre-selected");

      const values = step.config.config;
      for (const key of Object.keys(values)) assert.ok(def.fields.some((f) => f.key === key), `${key} is a field of ${def.id}`);
      const messageFields = def.fields.filter((f) => ["text", "title", "body", "subject"].includes(f.key) && f.required);
      for (const f of messageFields) assert.ok(String(values[f.key] || "").trim(), `${f.key} is filled`);
      // Every {{...}} points at a real trigger field or an earlier step.
      for (const text of Object.values(values)) {
        for (const path of tokens(text)) {
          if (path.startsWith("steps.")) assert.ok(earlier.includes(path.split(".")[1]), `${path} refers to an earlier step`);
          else assert.ok(samplePaths.has(path), `${path} exists in the ${trigger.config.provider} sample`);
        }
      }
      earlier.push(step.id);
    });
  });

  test(`${template.id}: missingSetup asks only for the account, then the user's own choices`, () => {
    const { trigger, steps } = template.build();
    const app = trigger.config.provider;

    const tProblem = missingSetup({ isTrigger: true, draft: trigger, getAction });
    if (OAUTH.has(app)) assert.deepEqual(tProblem, { stage: "account", message: `Choose a ${APP_NAMES[app]} account, or connect one.` });
    else assert.equal(tProblem, null);

    for (const step of steps) {
      const p = step.config.provider;
      const problem = missingSetup({ draft: step, getAction });
      if (OAUTH.has(p)) assert.deepEqual(problem, { stage: "account", message: `Choose a ${APP_NAMES[p]} account, or connect one.` });
      else assert.equal(problem, null, `${p} needs no setup`);
    }

    // With accounts picked, only the repository / channel / recipient are left...
    const withAccounts = {
      trigger: { ...trigger, config: { ...trigger.config, ...(OAUTH.has(app) && { connectionId: "c1" }) } },
      steps: steps.map((s) => ({ ...s, config: { ...s.config, ...(OAUTH.has(s.config.provider) && { connectionId: "c1" }) } })),
    };
    for (const step of withAccounts.steps) {
      const key = `${step.config.provider}:${step.config.action}`;
      const problem = missingSetup({ draft: step, getAction });
      if (USER_CHOICES[key]) {
        const label = getAction(step.config.provider, step.config.action).fields.find((f) => f.key === Object.keys(USER_CHOICES[key])[0]).label;
        assert.deepEqual(problem, { stage: "configure", message: `Fill in ${label}.` });
      } else {
        assert.equal(problem, null);
      }
    }
    const tLeft = missingSetup({ isTrigger: true, draft: withAccounts.trigger, getAction });
    assert.equal(tLeft?.stage ?? null, Object.keys(TRIGGER_CHOICES[app]).length ? "configure" : null);

    // ...and once those are chosen the Flow can be published.
    const ready = {
      trigger: { ...withAccounts.trigger, config: { ...withAccounts.trigger.config, ...TRIGGER_CHOICES[app] } },
      steps: withAccounts.steps.map((s) => ({
        ...s,
        config: { ...s.config, config: { ...s.config.config, ...USER_CHOICES[`${s.config.provider}:${s.config.action}`] } },
      })),
    };
    assert.equal(validateZapForPublish(ready, { getAction }), null);
  });
}

test("build() returns a fresh copy each time", () => {
  const t = TEMPLATES[0];
  const a = t.build();
  a.steps[0].config.config.text = "changed";
  assert.notEqual(t.build().steps[0].config.config.text, "changed");
});

test("getting-started checklist is ticked from real data", () => {
  const done = (items) => items.map((i) => `${i.id}${i.done ? "✓" : ""}`);
  assert.deepEqual(done(gettingStartedItems({ connections: undefined, zaps: [] })), ["connect", "create", "run"]);
  assert.deepEqual(done(gettingStartedItems({ connections: null, zaps: [] })), ["connect", "create", "run"]);
  assert.deepEqual(done(gettingStartedItems({ connections: [{ id: "c" }], zaps: [{ id: "z" }] })), ["connect✓", "create✓", "run"]);
  const ran = [{ id: "z1" }, { id: "z2", lastRun: { status: "SUCCESS" } }];
  assert.deepEqual(done(gettingStartedItems({ connections: [], zaps: ran })), ["connect", "create✓", "run✓"]);
  assert.equal(hasAnyRun([]), false);
  assert.equal(hasAnyRun(ran), true);
  const items = gettingStartedItems({ connections: [], zaps: [] });
  assert.equal(items[0].href, "/connections");
  assert.equal(items[1].href, "/flows/new");
});

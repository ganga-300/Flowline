// Contract test: every variable the builder offers ({{trigger.*}} chips, default
// templates, picker entries, placeholder samples) must resolve in the WORKER's
// template resolver against the payloads the poller really produces.
//
// No network: payloads are built from fixed API-shaped fixtures with the same
// builders the poller uses. Proves the tokens and shapes agree - not that the
// providers return this data for your accounts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { resolveTemplate } = require("../src/conditions");
const P = require("../src/integrations/triggerPayloads");

const payloads = {
  github_issue: P.githubIssuePayload(
    { id: 9, number: 7, title: "Login broken", body: "Steps...", html_url: "https://github.com/o/r/issues/7", state: "open",
      user: { login: "alice", avatar_url: "https://img", html_url: "https://github.com/alice" }, created_at: "2026-10-20T10:00:00Z" },
    "o/r"),
  github_push: P.githubCommitPayload(
    { sha: "abc123", html_url: "https://github.com/o/r/commit/abc123", commit: { message: "Fix", author: { name: "Al", email: "al@x.com", date: "2026-10-20" } } },
    "o/r"),
  gmail: P.gmailMessagePayload({ id: "m1", threadId: "t1", snippet: "hello", payload: { headers: [
    { name: "From", value: "a@x.com" }, { name: "To", value: "b@x.com" }, { name: "Subject", value: "Hi" }, { name: "Date", value: "Tue" },
  ], body: { data: Buffer.from("hello there").toString("base64") } } }),
  slack: P.slackMessagePayload({ text: "deploy done", user: "U1", ts: "1.2" }, "C1"),
};
const placeholderKey = { github_issue: "github_new_issue", github_push: "github_new_push", gmail: "gmail_new_email", slack: "slack_new_message" };

// Strict lookup (no resolver fallbacks): the token must point at a real field.
function strictLookup(context, p) {
  return p.split(".").reduce((cur, seg) => (cur == null ? undefined : cur[seg]), context);
}
const tokensIn = (text) => [...text.matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1].trim());

let tv;
test.before(async () => {
  tv = await import(pathToFileURL(path.join(__dirname, "../../web/src/integrations/triggerVariables.js")).href);
});

for (const kind of Object.keys(payloads)) {
  test(`${kind}: builder recognises the runtime payload`, () => {
    assert.equal(tv.getTriggerKind(payloads[kind]), kind);
  });

  test(`${kind}: every chip and default template token resolves to a real field`, () => {
    const context = { trigger: payloads[kind], steps: {} };
    const texts = [
      ...tv.getQuickChips(payloads[kind]).map((c) => c.token),
      ...["subject", "title", "body", "text"].map((f) => tv.getSmartTemplate(payloads[kind], f)),
    ];
    for (const text of texts) {
      for (const token of tokensIn(text)) {
        assert.ok(token.startsWith("trigger."), `token must use the trigger. prefix: ${token}`);
        const value = strictLookup(context, token);
        assert.ok(value !== undefined && value !== "", `${kind}: {{${token}}} does not resolve`);
        assert.equal(resolveTemplate(context, `{{${token}}}`), String(value));
      }
    }
  });

  test(`${kind}: every picker variable resolves to its sample value at runtime`, () => {
    const context = { trigger: payloads[kind], steps: {} };
    for (const { path: p, value } of tv.flattenSample(payloads[kind])) {
      assert.equal(resolveTemplate(context, `{{trigger.${p}}}`), value, `{{trigger.${p}}}`);
    }
  });

  test(`${kind}: placeholder sample has exactly the runtime shape`, () => {
    const keys = (o) => tv.flattenSample(o).map((f) => f.path).sort();
    assert.deepEqual(keys(tv.PLACEHOLDER_SAMPLES[placeholderKey[kind]]), keys(payloads[kind]));
  });
}

test("webhook (generic) chips reference top-level body fields", () => {
  const sample = tv.getPlaceholderSample("webhook", "catch_hook");
  const context = { trigger: sample, steps: {} };
  for (const chip of tv.getQuickChips(sample)) {
    const [token] = tokensIn(chip.token);
    assert.notEqual(resolveTemplate(context, `{{${token}}}`), "");
  }
});

test("withRepository updates every repository field for the chosen repo", () => {
  const s = tv.getPlaceholderSample("github", "new_issue", "acme/api");
  assert.equal(s.repository.full_name, "acme/api");
  assert.equal(s.repository.owner.login, "acme");
  assert.equal(s.repository.html_url, "https://github.com/acme/api");
});

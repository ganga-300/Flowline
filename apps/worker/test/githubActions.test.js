// Mocked tests for the GitHub actions (Create Issue, Add Comment).
// MOCKED: GitHub REST API via global.fetch and Prisma. Proves the requests we
// send and how errors are reported - NOT that your account can write to a repo.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  connection: { findUnique: async ({ where }) => (where.id === "conn_gh" ? { id: "conn_gh", provider: "github:octo", accessToken: "gh-fake" } : null) },
} };

let calls = [];
let reply = { status: 201, body: {} , headers: {} };
global.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method, body: JSON.parse(opts.body || "{}"), auth: opts.headers?.Authorization });
  const { status, body, headers = {} } = reply;
  return {
    ok: status < 400, status, statusText: "",
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body, text: async () => JSON.stringify(body),
  };
};

const createIssue = require("../src/integrations/github/createIssue");
const addComment = require("../src/integrations/github/addComment");

// Context shaped like a real Gmail trigger payload (Workflow B: Gmail -> GitHub issue).
const context = { trigger: { email: { subject: "Invoice #42 failed", body: "Payment declined", from: "ana@example.com" } }, steps: {} };
const step = (action, config) => ({ id: "s1", connectionId: "conn_gh", config: { provider: "github", action, config } });

beforeEach(() => { calls = []; reply = { status: 201, body: {} }; });

test("create issue: posts templated title/body to the repo with the account's token", async () => {
  reply = { status: 201, body: { number: 12, html_url: "https://github.com/octo/demo/issues/12", title: "Invoice #42 failed" } };
  const out = await createIssue(step("create_issue", {
    repo: " https://github.com/octo/demo ", title: "{{trigger.email.subject}}", body: "From {{trigger.email.from}}:\n{{trigger.email.body}}",
  }), context);
  assert.equal(calls[0].url, "https://api.github.com/repos/octo/demo/issues");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].auth, "Bearer gh-fake");
  assert.deepEqual(calls[0].body, { title: "Invoice #42 failed", body: "From ana@example.com:\nPayment declined" });
  assert.equal(out.output.issueNumber, 12);
  assert.equal(out.output.issueUrl, "https://github.com/octo/demo/issues/12");
});

const errorCases = [
  [401, {}, /reconnect GitHub/i],
  [404, {}, /octo\/demo.*not found|no access/i],
  [410, {}, /[Ii]ssues are disabled/],
  [403, { "x-ratelimit-remaining": "0" }, /rate limit/i],
  [403, {}, /denied|permission/i],
  [422, {}, /Validation Failed/],
];
for (const [status, headers, pattern] of errorCases) {
  test(`create issue: GitHub ${status} gives a readable error`, async () => {
    reply = { status, headers, body: { message: status === 422 ? "Validation Failed" : "x" } };
    await assert.rejects(createIssue(step("create_issue", { repo: "octo/demo", title: "t" }), context), pattern);
  });
}

test("create issue: a title that resolves to empty is rejected before calling GitHub", async () => {
  await assert.rejects(createIssue(step("create_issue", { repo: "octo/demo", title: "{{trigger.email.missing}}" }), context), /Title/);
  assert.equal(calls.length, 0);
});

test("add comment: accepts '#7' and posts to that issue", async () => {
  reply = { status: 201, body: { id: 99, html_url: "https://github.com/octo/demo/issues/7#issuecomment-99" } };
  const out = await addComment(step("add_comment", { repo: "octo/demo", issueNumber: "#7", body: "Re: {{trigger.email.subject}}" }), context);
  assert.equal(calls[0].url, "https://api.github.com/repos/octo/demo/issues/7/comments");
  assert.deepEqual(calls[0].body, { body: "Re: Invoice #42 failed" });
  assert.equal(out.output.commentId, 99);
});

test("add comment: missing issue gives a readable 404", async () => {
  reply = { status: 404, body: { message: "Not Found" } };
  await assert.rejects(addComment(step("add_comment", { repo: "octo/demo", issueNumber: "7", body: "x" }), context), /#7.*not found|no access/i);
});

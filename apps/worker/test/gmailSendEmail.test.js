// Mocked tests for the Gmail "Send Email" action: we capture the raw RFC 2822
// message the handler would send to the Gmail API and decode it.
// MOCKED: Gmail API (global.fetch) and Prisma. Proves the message we build -
// NOT that Gmail accepts it or how a mail client renders it.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
const prismaPath = require.resolve(path.join(workerSrc, "prismaClient"));
const connections = {
  conn_g: { id: "conn_g", provider: "gmail:me@example.com", accessToken: "expired-token", refreshToken: "refresh-fake" },
};
const updates = [];
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  connection: {
    findUnique: async ({ where }) => connections[where.id] || null,
    update: async (args) => { updates.push(args); return {}; },
  },
} };
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";

let sent = []; // raw messages posted to messages/send
let sendStatuses = []; // status to return for each send call, in order
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://oauth2.googleapis.com/token")) {
    return { ok: true, status: 200, json: async () => ({ access_token: "fresh-token" }) };
  }
  if (u === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
    const status = sendStatuses.shift() ?? 200;
    sent.push({ auth: opts.headers.Authorization, raw: JSON.parse(opts.body).raw });
    return { ok: status < 400, status, json: async () => ({ id: "msg1", threadId: "th1" }), text: async () => "error" };
  }
  throw new Error(`Unexpected fetch: ${u}`);
};

const sendEmail = require("../src/integrations/gmail/sendEmail");

function decode(raw) {
  const text = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  const [head, ...rest] = text.split("\r\n\r\n");
  const headers = {};
  for (const line of head.split("\r\n")) {
    const i = line.indexOf(":");
    headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  let body = rest.join("\r\n\r\n");
  if (/base64/i.test(headers["content-transfer-encoding"] || "")) body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf-8");
  return { headers, body };
}
const decodeWord = (h) => h.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf-8"));

const context = {
  trigger: { message: { text: "Déploiement terminé 🚀\nAll green", user: "U1", channel: "C1", ts: "1.2" } },
  steps: {},
};
const step = (config) => ({ id: "s1", connectionId: "conn_g", config: { provider: "gmail", action: "send_email", config } });

beforeEach(() => { sent = []; sendStatuses = []; updates.length = 0; connections.conn_g.accessToken = "expired-token"; });

test("non-ASCII subject is RFC 2047 encoded and decodes back exactly", async () => {
  await sendEmail(step({ to: "ana@example.com", subject: "Slack: {{trigger.message.text}}", body: "x" }), context);
  const { headers } = decode(sent[0].raw);
  assert.match(headers.subject, /^=\?UTF-8\?B\?/);
  assert.equal(decodeWord(headers.subject), "Slack: Déploiement terminé 🚀 All green", "newline in data is flattened in headers");
});

test("plain-text template keeps its line breaks (sent as text/plain, UTF-8)", async () => {
  await sendEmail(step({ to: "ana@example.com", subject: "Hi", body: "Line 1\n{{trigger.message.text}}" }), context);
  const { headers, body } = decode(sent[0].raw);
  assert.match(headers["content-type"], /^text\/plain; charset=utf-8/i);
  assert.equal(body, "Line 1\nDéploiement terminé 🚀\nAll green");
});

test("HTML body is still sent as text/html", async () => {
  await sendEmail(step({ to: "ana@example.com", subject: "Hi", body: "<p>Hello <b>{{trigger.message.user}}</b></p>" }), context);
  const { headers, body } = decode(sent[0].raw);
  assert.match(headers["content-type"], /^text\/html/i);
  assert.equal(body, "<p>Hello <b>U1</b></p>");
});

test("empty Cc/Bcc produce no headers; filled ones are trimmed and templated", async () => {
  await sendEmail(step({ to: "a@example.com", subject: "s", body: "b", cc: [""], bcc: [] }), context);
  let { headers } = decode(sent[0].raw);
  assert.equal("cc" in headers, false);
  assert.equal("bcc" in headers, false);

  await sendEmail(step({ to: "a@example.com", subject: "s", body: "b", cc: [" x@example.com", "{{trigger.message.user}}@example.com "] }), context);
  ({ headers } = decode(sent[1].raw));
  assert.equal(headers.cc, "x@example.com, U1@example.com");
});

test("newlines in a recipient cannot inject extra headers", async () => {
  await sendEmail(step({ to: "a@example.com\r\nBcc: attacker@example.com", subject: "s", body: "b" }), context);
  const { headers } = decode(sent[0].raw);
  assert.equal("bcc" in headers, false);
});

test("expired token: refreshes, saves the new token and retries once", async () => {
  sendStatuses = [401, 200];
  const result = await sendEmail(step({ to: "a@example.com", subject: "s", body: "b" }), context);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].auth, "Bearer fresh-token");
  assert.equal(updates[0].data.accessToken, "fresh-token");
  assert.equal(result.output.status, "SENT");
});

test("Gmail API error surfaces as a step failure", async () => {
  sendStatuses = [400];
  await assert.rejects(sendEmail(step({ to: "a@example.com", subject: "s", body: "b" }), context), /Gmail API send email failed \(400\)/);
});

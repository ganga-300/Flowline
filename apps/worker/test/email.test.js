// Emails (password reset, failure and reconnect alerts): sending, the no-key fallback,
// templates, and when an alert email is (not) sent.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendEmail, appUrl, passwordResetEmail, flowFailedEmail, escapeHtml } = require("../src/email");
const { emailFlowFailed, emailReconnectNeeded } = require("../src/alertEmails");

const quiet = { log() {}, warn() {}, error() {} };
const msg = { to: "ana@example.test", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

test("with RESEND_API_KEY: posts the email to Resend with the configured sender", async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: "e1" }) }; };
  const result = await sendEmail(msg, { env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "Flowline <a@b.test>" }, fetch, log: quiet });
  assert.deepEqual(result, { sent: true });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: "Flowline <a@b.test>", to: ["ana@example.test"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" });
});

test("Resend refusing or the network failing never throws", async () => {
  const refused = async () => ({ ok: false, status: 422, json: async () => ({ message: "domain not verified" }) });
  assert.deepEqual(await sendEmail(msg, { env: { RESEND_API_KEY: "k" }, fetch: refused, log: quiet }), { sent: false, error: "domain not verified" });
  const down = async () => { throw new Error("fetch failed"); };
  assert.deepEqual(await sendEmail(msg, { env: { RESEND_API_KEY: "k" }, fetch: down, log: quiet }), { sent: false, error: "fetch failed" });
});

test("without a key: development prints the email, production skips it", async () => {
  const printed = [];
  const log = { ...quiet, log: (line) => printed.push(line) };
  assert.deepEqual(await sendEmail(msg, { env: {}, log }), { sent: false, logged: true });
  assert.match(printed[0], /To: ana@example.test/);
  assert.equal((await sendEmail(msg, { env: { NODE_ENV: "production" }, log: quiet })).sent, false);
});

test("templates: links and user text are in both versions, and HTML is escaped", () => {
  const reset = passwordResetEmail({ resetUrl: "http://app.test/reset-password?token=abc" });
  assert.match(reset.text, /reset-password\?token=abc/);
  assert.match(reset.html, /href="http:\/\/app.test\/reset-password\?token=abc"/);
  const failed = flowFailedEmail({ flowName: "<b>x</b>", reason: "Slack said no", runUrl: "http://app.test/r", settingsUrl: "http://app.test/settings" });
  assert.equal(failed.subject, 'Your Flow "<b>x</b>" failed');
  assert.doesNotMatch(failed.html, /<b>x<\/b>/);
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(appUrl({ FRONTEND_URL: "https://flowline.app/, https://other.test" }), "https://flowline.app");
  assert.equal(appUrl({}), "http://localhost:3000");
});

// A fake database with one user, one Flow and some alerts.
function fakeDb({ emailAlerts = true, alertsThisHour = 0 } = {}) {
  return {
    user: { findUnique: async () => ({ email: "ana@example.test", emailAlerts }) },
    alert: { count: async () => alertsThisHour },
    connection: { findUnique: async () => ({ provider: "gmail:ana@gmail.test", user: { email: "ana@example.test", emailAlerts } }) },
  };
}
const zap = { id: "z1", userId: "u1", zapName: "Issues to Slack" };

test("a failed Flow emails its owner once per hour, with a link to the run", async () => {
  const sent = [];
  const send = async (email) => { sent.push(email); return { sent: true }; };
  await emailFlowFailed({ zap, zapRunId: "r1", reason: "Slack rate limit", alertId: "a1" }, { db: fakeDb(), send });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ana@example.test");
  assert.match(sent[0].text, /\/flows\/z1\/runs\?run=r1/);

  const again = await emailFlowFailed({ zap, zapRunId: "r2", reason: "x", alertId: "a2" }, { db: fakeDb({ alertsThisHour: 1 }), send });
  assert.equal(again.sent, false, "another alert for this Flow within the hour: no second email");
  const off = await emailFlowFailed({ zap, zapRunId: "r3", reason: "x" }, { db: fakeDb({ emailAlerts: false }), send });
  assert.equal(off.sent, false, "email alerts turned off");
  assert.equal(sent.length, 1);
});

test("an account that needs reconnecting emails its owner with a link to that app", async () => {
  const sent = [];
  await emailReconnectNeeded("c1", { db: fakeDb(), send: async (e) => { sent.push(e); return { sent: true }; } });
  assert.equal(sent[0].subject, "Reconnect your Gmail account in Flowline");
  assert.match(sent[0].text, /ana@gmail.test/);
  assert.match(sent[0].text, /\/connections\?app=gmail/);
  const broken = { user: { findUnique: async () => { throw new Error("db down"); } } };
  assert.equal((await emailFlowFailed({ zap, zapRunId: "r", reason: "x" }, { db: broken, send: async () => ({ sent: true }) })).sent, false, "never throws");
});

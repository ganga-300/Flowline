/**
 * Trigger variables used by the builder: placeholder samples, 1-click chips and
 * default templates. Every token is written as {{trigger.<path>}} where <path> is a
 * path into the payload the worker receives at runtime. Those payloads are built in
 * apps/worker/src/integrations/triggerPayloads.js - keep the placeholder samples
 * below in the same shape (a contract test in apps/worker/test checks this).
 */

// Placeholder samples shown before the user clicks "Fetch latest".
export const PLACEHOLDER_SAMPLES = {
  github_new_issue: {
    action: "opened",
    issue: {
      id: 1,
      number: 101,
      title: "New issue example",
      body: "Issue details and bug description.",
      html_url: "https://github.com/your-org/your-repo/issues/101",
      state: "open",
      user: { login: "contributor1", avatar_url: "", html_url: "https://github.com/contributor1" },
      created_at: "2026-01-01T00:00:00Z",
    },
    repository: {
      full_name: "your-org/your-repo",
      name: "your-repo",
      owner: { login: "your-org" },
      html_url: "https://github.com/your-org/your-repo",
    },
  },
  github_new_push: {
    action: "push",
    commit: {
      sha: "0123abc",
      message: "Fix login redirect",
      author: { name: "Contributor", email: "contributor@example.com", date: "2026-01-01T00:00:00Z" },
      html_url: "https://github.com/your-org/your-repo/commit/0123abc",
    },
    repository: {
      full_name: "your-org/your-repo",
      name: "your-repo",
      owner: { login: "your-org" },
      html_url: "https://github.com/your-org/your-repo",
      url: "https://github.com/your-org/your-repo",
    },
  },
  gmail_new_email: {
    email: {
      id: "sample-id",
      threadId: "sample-thread",
      from: "Sender <sender@example.com>",
      to: "you@example.com",
      subject: "Meeting Reminder",
      date: "Tue, 20 Oct 2026 10:00:00 +0530",
      snippet: "Don't forget our meeting at 3 PM.",
      body: "Don't forget our meeting at 3 PM.",
    },
  },
  slack_new_message: {
    message: {
      text: "Hello from Slack!",
      user: "U012EXAMPLE",
      user_name: "Ana Lopez",
      ts: "1729400000.000100",
      channel: "C012EXAMPLE",
      channel_name: "general",
    },
  },
  // Webhooks pass the POST body through as-is, so {{trigger.email}} etc.
  webhook_catch_hook: {
    email: "user@example.com",
    name: "Alex Smith",
    subject: "New Registration",
    message: "Hello from Flowline!",
  },
};

export function getPlaceholderSample(provider, event, repo) {
  const key = `${provider || "webhook"}_${event || ""}`;
  const fallback = provider === "github" ? "github_new_issue" : provider === "gmail" ? "gmail_new_email"
    : provider === "slack" ? "slack_new_message" : "webhook_catch_hook";
  const sample = structuredClone(PLACEHOLDER_SAMPLES[key] || PLACEHOLDER_SAMPLES[fallback]);
  if (repo && sample.repository) return withRepository(sample, repo);
  return sample;
}

export function withRepository(sample, repo) {
  if (!sample?.repository || !repo) return sample;
  const fullName = String(repo).trim();
  const [owner = "", name = ""] = fullName.split("/");
  const html = `https://github.com/${fullName}`;
  return {
    ...sample,
    repository: { ...sample.repository, full_name: fullName, name: name || fullName, owner: { login: owner }, html_url: html,
      ...("url" in sample.repository ? { url: html } : {}) },
  };
}

/** Identifies which trigger a sample came from by its top-level shape. */
export function getTriggerKind(sampleData) {
  if (sampleData?.issue) return "github_issue";
  if (sampleData?.commit) return "github_push";
  if (sampleData?.email && typeof sampleData.email === "object") return "gmail";
  if (sampleData?.message && typeof sampleData.message === "object") return "slack";
  return "generic";
}

/** Flattens a sample into [{ path, value }] for nested keys, e.g. issue.user.login. */
export function flattenSample(obj, prefix = "") {
  let result = [];
  if (!obj || typeof obj !== "object") return result;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      result = result.concat(flattenSample(val, path));
    } else {
      result.push({ path, value: val == null ? "" : String(val) });
    }
  }
  return result;
}

const CHIPS = {
  github_issue: [
    { label: "Issue Title", token: "{{trigger.issue.title}}" },
    { label: "Issue URL", token: "{{trigger.issue.html_url}}" },
    { label: "Issue #", token: "{{trigger.issue.number}}" },
    { label: "Author", token: "{{trigger.issue.user.login}}" },
    { label: "Repository", token: "{{trigger.repository.full_name}}" },
  ],
  github_push: [
    { label: "Commit Message", token: "{{trigger.commit.message}}" },
    { label: "Commit URL", token: "{{trigger.commit.html_url}}" },
    { label: "Author", token: "{{trigger.commit.author.name}}" },
    { label: "SHA", token: "{{trigger.commit.sha}}" },
    { label: "Repository", token: "{{trigger.repository.full_name}}" },
  ],
  gmail: [
    { label: "Subject", token: "{{trigger.email.subject}}" },
    { label: "Sender", token: "{{trigger.email.from}}" },
    { label: "Email Body", token: "{{trigger.email.body}}" },
    { label: "Date", token: "{{trigger.email.date}}" },
  ],
  slack: [
    { label: "Message Text", token: "{{trigger.message.text}}" },
    { label: "User", token: "{{trigger.message.user_name}}" },
    { label: "Channel", token: "{{trigger.message.channel_name}}" },
  ],
};

export function getQuickChips(sampleData) {
  const kind = getTriggerKind(sampleData);
  if (CHIPS[kind]) return CHIPS[kind];
  if (sampleData && typeof sampleData === "object") {
    return Object.entries(sampleData)
      .filter(([, v]) => v == null || typeof v !== "object")
      .slice(0, 5)
      .map(([k]) => ({ label: k.replace(/_/g, " "), token: `{{trigger.${k}}}` }));
  }
  return [];
}

const TEMPLATES = {
  github_issue: {
    subject: "🚨 New GitHub Issue: {{trigger.issue.title}}",
    title: "{{trigger.issue.title}}",
    body: "🚨 New GitHub Issue #{{trigger.issue.number}}: {{trigger.issue.title}}\n\nAuthor: {{trigger.issue.user.login}}\nView issue: {{trigger.issue.html_url}}",
  },
  github_push: {
    subject: "New commit in {{trigger.repository.full_name}}",
    title: "Follow up on commit {{trigger.commit.sha}}",
    body: "📦 New commit in {{trigger.repository.full_name}} by {{trigger.commit.author.name}}:\n{{trigger.commit.message}}\n{{trigger.commit.html_url}}",
  },
  gmail: {
    subject: "Fwd: {{trigger.email.subject}}",
    title: "{{trigger.email.subject}}",
    body: "📩 New Email Received\nFrom: {{trigger.email.from}}\nSubject: {{trigger.email.subject}}\n\n{{trigger.email.body}}",
  },
  slack: {
    subject: "New Slack message from {{trigger.message.user_name}}",
    title: "Slack: {{trigger.message.text}}",
    body: "💬 New Slack message in #{{trigger.message.channel_name}} by {{trigger.message.user_name}}:\n{{trigger.message.text}}",
  },
};

/** Default template for a field; "text"/"message"/"comment" use the body template. */
export function getSmartTemplate(sampleData, fieldKey) {
  const t = TEMPLATES[getTriggerKind(sampleData)];
  if (!t) return fieldKey === "subject" ? "New Flowline Notification" : "";
  if (fieldKey === "subject") return t.subject;
  if (fieldKey === "title") return t.title;
  if (["text", "body", "message", "comment"].includes(fieldKey)) return t.body;
  return "";
}

// Exported for the contract test.
export const ALL_CHIPS = CHIPS;
export const ALL_TEMPLATES = TEMPLATES;

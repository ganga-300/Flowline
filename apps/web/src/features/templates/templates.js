// Ready-made Flows: the dashboard's "Start from a template", /flows/new?template=<id> and the
// landing page's "Ideas to start with" all come from this list.
// Pure data (no React, relative imports with extensions) so it can be unit-tested.
//
// build() returns the builder's state ({ zapName, trigger, steps }, see useZapBuilder.js). It
// fills in the app, event, action and the message text only: the account, repository,
// channel and recipient are left empty so the canvas marks exactly those as "Needs setup".
import { triggerProviders } from "../../integrations/triggers.js";
import { githubIntegration } from "../../integrations/github/index.js";
import { slackIntegration } from "../../integrations/slack/index.js";
import { sendEmailAction } from "../../integrations/gmail/actions/sendEmail.js";
import { formatterIntegration } from "../../integrations/formatter.js";

const ACTIONS = {
  github: githubIntegration.actions,
  slack: slackIntegration.actions,
  gmail: [sendEmailAction],
  formatter: formatterIntegration.actions,
};

/** A trigger with the app and event picked (type from triggers.js), nothing else chosen. */
function trigger(provider, event) {
  const type = triggerProviders.find((p) => p.id === provider)?.events.find((e) => e.id === event)?.type || "WEBHOOK";
  return { type, config: { provider, event }, isConfigured: false };
}

/** An app action step named after its action, with only the given field values filled in. */
function action(id, provider, actionId, values) {
  const name = ACTIONS[provider]?.find((a) => a.id === actionId)?.name || "Action";
  return {
    id,
    type: "ACTION",
    name,
    config: { provider, action: actionId, connectionId: null, config: { ...values } },
    isConfigured: false,
  };
}

export const TEMPLATES = [
  {
    id: "github-issue-to-slack",
    title: "New GitHub issue → Slack",
    description: "Post to a Slack channel when an issue is opened, with its title, number, author and link.",
    apps: ["github", "slack"],
    build: () => ({
      zapName: "New GitHub issue → Slack",
      trigger: trigger("github", "new_issue"),
      steps: [
        action("step-1", "slack", "send_message", {
          text: "New issue #{{trigger.issue.number}} in {{trigger.repository.full_name}}: {{trigger.issue.title}}\nOpened by {{trigger.issue.user.login}}\n{{trigger.issue.html_url}}",
        }),
      ],
    }),
  },
  {
    id: "gmail-to-github-issue",
    title: "New Gmail email → GitHub issue",
    description: "Turn emails, like bug reports, into GitHub issues: the subject becomes the title, the email the description.",
    apps: ["gmail", "github"],
    build: () => ({
      zapName: "New Gmail email → GitHub issue",
      trigger: trigger("gmail", "new_email"),
      steps: [
        action("step-1", "github", "create_issue", {
          title: "{{trigger.email.subject}}",
          body: "Reported by email from {{trigger.email.from}} on {{trigger.email.date}}:\n\n{{trigger.email.body}}",
        }),
      ],
    }),
  },
  {
    id: "slack-to-gmail",
    title: "New Slack message → Gmail",
    description: "Email new messages from a Slack channel to someone's inbox, with who wrote them and where.",
    apps: ["slack", "gmail"],
    build: () => ({
      zapName: "New Slack message → Gmail",
      trigger: trigger("slack", "new_message"),
      steps: [
        action("step-1", "gmail", "send_email", {
          subject: "New message from {{trigger.message.user_name}} in #{{trigger.message.channel_name}}",
          body: "{{trigger.message.user_name}} wrote in #{{trigger.message.channel_name}}:\n\n{{trigger.message.text}}",
        }),
      ],
    }),
  },
  {
    id: "webhook-to-slack",
    title: "Webhook → Slack",
    description: "Post to Slack whenever your app or form sends a request to the Flow's webhook URL.",
    apps: ["webhook", "slack"],
    build: () => ({
      zapName: "Webhook → Slack",
      trigger: trigger("webhook", "catch_hook"),
      steps: [
        action("step-1", "slack", "send_message", {
          text: "New request from {{trigger.name}} ({{trigger.email}}): {{trigger.subject}}\n{{trigger.message}}",
        }),
      ],
    }),
  },
  {
    id: "webhook-format-slack",
    title: "Webhook → Formatter → Slack",
    description: "Tidy up incoming data before posting it: the sender's name is put in Title Case, then sent to Slack.",
    apps: ["webhook", "formatter", "slack"],
    build: () => ({
      zapName: "Webhook → Formatter → Slack",
      trigger: trigger("webhook", "catch_hook"),
      steps: [
        action("step-1", "formatter", "capitalize_text", { text: "{{trigger.name}}", mode: "title" }),
        action("step-2", "slack", "send_message", {
          text: "New sign-up: {{steps.step-1.output.result}} ({{trigger.email}})\n{{trigger.message}}",
        }),
      ],
    }),
  },
];

/** The template with this id, or null. */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

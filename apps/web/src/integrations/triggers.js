/**
 * App-Centric Trigger Definitions Registry
 * Maps core integrations (Webhooks, Gmail, Slack, GitHub) to trigger events.
 */

export const triggerProviders = [
  {
    id: "webhook",
    name: "Webhooks",
    icon: "webhook",
    description: "Catch incoming HTTP data requests from any custom app or service",
    events: [
      {
        id: "catch_hook",
        name: "Catch Webhook Event",
        type: "WEBHOOK",
        description: "Triggers when any HTTP POST request is received at your unique URL",
      },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "gmail",
    description: "Listen for incoming emails in your Gmail inbox",
    events: [
      {
        id: "new_email",
        name: "New Email Received",
        type: "POLLING",
        description: "Triggers whenever a new email arrives in your inbox",
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "slack",
    description: "Listen for new messages in Slack channels",
    events: [
      {
        id: "new_message",
        name: "New Message in Channel",
        type: "POLLING",
        description: "Triggers when a new message is posted to a selected Slack channel",
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    icon: "github",
    description: "Listen for commits, pull requests, and issues on GitHub",
    events: [
      {
        id: "new_issue",
        name: "New Issue Created",
        type: "POLLING",
        description: "Periodically checks for newly opened issues in any public or private repository",
      },
      {
        id: "new_push",
        name: "New Code Push",
        type: "POLLING",
        description: "Periodically checks for newly pushed commits to a repository",
      },
    ],
  },
];

export function getTriggerProvider(providerId) {
  return triggerProviders.find((p) => p.id === providerId) || triggerProviders[0];
}

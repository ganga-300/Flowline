/**
 * App-Centric Trigger Definitions Registry
 * Maps integrations to user-friendly "When this happens..." trigger events.
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
    id: "google_sheets",
    name: "Google Sheets",
    icon: "sheets",
    description: "Listen for new rows or spreadsheet updates in Google Sheets",
    events: [
      {
        id: "new_row",
        name: "New Spreadsheet Row",
        type: "POLLING",
        description: "Triggers when a new row is appended to a selected worksheet",
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
        type: "WEBHOOK",
        description: "Triggers whenever a new issue is opened in your repository",
      },
      {
        id: "new_push",
        name: "New Code Push",
        type: "WEBHOOK",
        description: "Triggers when new commits are pushed to a branch",
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
];

export function getTriggerProvider(providerId) {
  return triggerProviders.find((p) => p.id === providerId) || triggerProviders[0];
}

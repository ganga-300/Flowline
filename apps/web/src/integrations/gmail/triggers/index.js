/**
 * Gmail Triggers Registry
 */
export const gmailTriggers = [
  {
    id: "new_email",
    name: "New Email Received",
    description: "Triggers whenever a new email arrives in your Gmail inbox",
    fields: [
      {
        key: "query",
        label: "Search Query / Filter (Optional)",
        type: "text",
        required: false,
        placeholder: "e.g. from:boss@company.com or subject:urgent",
        // No default: Flowline checks every few minutes, so is:unread would skip emails read before then.
        description: "Gmail search syntax to filter incoming emails. Leave empty for every new email. Avoid is:unread: emails you open before the next check (every 5 minutes) would be skipped.",
      },
    ],
  },
];

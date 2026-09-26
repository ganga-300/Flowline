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
        placeholder: "e.g. is:unread from:boss@company.com or subject:urgent",
        description: "Gmail search syntax to filter incoming emails (default: is:unread)",
      },
    ],
  },
];

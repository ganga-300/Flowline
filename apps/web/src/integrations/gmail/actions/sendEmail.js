/**
 * Gmail Integration - Send Email Action Definition (Advanced)
 */

/** @type {import("../../types").ActionDefinition} */
export const sendEmailAction = {
  id: "send_email",
  name: "Send Email",
  description: "Send a new email message via your connected Gmail account",
  fields: [
    {
      key: "to",
      label: "To",
      type: "text",
      required: true,
      placeholder: "recipient@example.com or {{trigger.email}}",
      description: "Primary recipient email address",
    },
    {
      key: "cc",
      label: "CC Recipients (Optional)",
      type: "array",
      placeholder: "cc1@example.com, cc2@example.com",
      description: "Carbon copy recipient email addresses",
    },
    {
      key: "bcc",
      label: "BCC Recipients (Optional)",
      type: "array",
      placeholder: "bcc@example.com",
      description: "Blind carbon copy recipient email addresses",
    },
    {
      key: "subject",
      label: "Subject",
      type: "text",
      required: true,
      placeholder: "Email subject line...",
      description: "Subject line of the email",
    },
    {
      key: "body",
      label: "Body",
      type: "textarea",
      required: true,
      placeholder: "Email body content...",
      description: "Body content of the email message. Supports HTML and variables.",
    },
  ],
};

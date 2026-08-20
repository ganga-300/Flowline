/**
 * Gmail Integration - Send Email Action Definition
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
      description: "Recipient email address. Supports variables like {{trigger.email}}.",
    },
    {
      key: "subject",
      label: "Subject",
      type: "text",
      required: true,
      placeholder: "Email subject",
      description: "Subject line of the email. Supports variables.",
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

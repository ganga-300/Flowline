export const slackIntegration = {
  id: "slack",
  name: "Slack",
  description: "Send channel messages and notifications in Slack",
  icon: "slack",
  actions: [
    {
      id: "send_message",
      name: "Send Channel Message",
      description: "Posts a text message to a Slack channel or webhook",
      fields: [
        {
          key: "webhookUrl",
          label: "Webhook URL",
          type: "text",
          required: true,
          placeholder: "https://hooks.slack.com/services/...",
          description: "Slack Incoming Webhook URL",
        },
        {
          key: "text",
          label: "Message Text",
          type: "textarea",
          required: true,
          placeholder: "Hello from Flowline! {{trigger.body.message}}",
          description: "Message content to post",
        },
        {
          key: "channel",
          label: "Channel (Optional)",
          type: "text",
          placeholder: "#general",
        },
      ],
    },
  ],
  triggers: [],
};

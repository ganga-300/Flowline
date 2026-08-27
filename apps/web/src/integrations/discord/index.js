export const discordIntegration = {
  id: "discord",
  name: "Discord",
  description: "Send messages to Discord channels via Webhooks",
  icon: "discord",
  actions: [
    {
      id: "send_message",
      name: "Send Webhook Message",
      description: "Posts a message to a Discord channel via Webhook URL",
      fields: [
        {
          key: "webhookUrl",
          label: "Discord Webhook URL",
          type: "text",
          required: true,
          placeholder: "https://discord.com/api/webhooks/...",
          description: "Channel Webhook URL from Discord channel settings",
        },
        {
          key: "content",
          label: "Message Content",
          type: "textarea",
          required: true,
          placeholder: "New Alert: {{trigger.body.subject}}",
        },
        {
          key: "username",
          label: "Bot Username (Optional)",
          type: "text",
          placeholder: "Flowline Bot",
        },
      ],
    },
  ],
  triggers: [],
};

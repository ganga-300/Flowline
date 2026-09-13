export const slackIntegration = {
  id: "slack",
  name: "Slack",
  description: "Send channel messages and notifications in Slack",
  icon: "slack",
  authType: "oauth2",
  actions: [
    {
      id: "send_message",
      name: "Send Channel Message",
      description: "Posts a message to a Slack channel",
      fields: [
        {
          key: "channel",
          label: "Channel",
          type: "dropdown",
          dynamic: true,
          optionsType: "slack_channels",
          required: true,
          placeholder: "Select a channel",
          description: "Select the target Slack channel",
          options: [
            { label: "#general", value: "#general" },
            { label: "#random", value: "#random" },
            { label: "#alerts", value: "#alerts" },
            { label: "#leads", value: "#leads" },
          ],
        },
        {
          key: "text",
          label: "Message Text",
          type: "pill_input",
          required: true,
          placeholder: "e.g. Hello team! New update: {{trigger.body.message}}",
          description: "Message text to post into the channel",
        },
      ],
    },
  ],
  triggers: [
    {
      id: "new_message",
      name: "New Message in Channel",
      description: "Triggers when a new message is posted in a channel",
    },
  ],
};

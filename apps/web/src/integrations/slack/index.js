export const slackIntegration = {
  id: "slack",
  name: "Slack",
  description: "Send channel messages, direct messages, and automate Slack workflows",
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
        },
        {
          key: "text",
          label: "Message Text",
          type: "pill_input",
          required: true,
          placeholder: "Write your Slack message here or use “Use template” above",
          description: "Message text to post into the channel",
        },
      ],
    },
    {
      id: "send_dm",
      name: "Send Direct Message",
      description: "Sends a direct message to a specific Slack user or email address",
      fields: [
        {
          key: "userId",
          label: "Slack User or Email",
          type: "dropdown",
          dynamic: true,
          optionsType: "slack_users",
          required: true,
          placeholder: "Select a user or enter email",
          description: "Select a team member or enter user ID / email",
        },
        {
          key: "text",
          label: "Message Text",
          type: "pill_input",
          required: true,
          placeholder: "Write your direct message here or use “Use template” above",
          description: "Direct message content",
        },
      ],
    },
  ],
  triggers: [
    {
      id: "new_message",
      name: "New Message in Channel",
      description: "Triggers when a new message is posted in a selected channel",
      fields: [
        {
          key: "channel",
          label: "Channel",
          type: "dropdown",
          dynamic: true,
          optionsType: "slack_channels",
          required: true,
          placeholder: "Select a channel to monitor",
          description: "The Slack channel to listen for new messages",
        },
      ],
    },
  ],
};

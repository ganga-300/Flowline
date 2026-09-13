export const githubIntegration = {
  id: "github",
  name: "GitHub",
  description: "Create issues, track code, and automate GitHub repositories",
  icon: "github",
  authType: "oauth2",
  actions: [
    {
      id: "create_issue",
      name: "Create Issue",
      description: "Creates a new issue in a GitHub repository",
      fields: [
        {
          key: "repo",
          label: "Repository (owner/repo)",
          type: "string",
          required: true,
          placeholder: "e.g. facebook/react or your-username/my-project",
          description: "Target GitHub repository in format owner/repo",
        },
        {
          key: "title",
          label: "Issue Title",
          type: "pill_input",
          required: true,
          placeholder: "e.g. Bug Report: {{trigger.body.subject}}",
          description: "Title for the newly created issue",
        },
        {
          key: "body",
          label: "Issue Description / Body",
          type: "pill_input",
          required: false,
          placeholder: "e.g. Details:\n{{trigger.body.message}}",
          description: "Markdown body content for the issue",
        },
      ],
    },
  ],
  triggers: [
    {
      id: "new_issue",
      name: "New Issue Created",
      description: "Triggers when a new issue is opened in the repository",
    },
    {
      id: "new_push",
      name: "New Code Push",
      description: "Triggers when new commits are pushed",
    },
  ],
};

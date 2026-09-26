export const githubIntegration = {
  id: "github",
  name: "GitHub",
  description: "Create issues, add comments, track commits, and automate GitHub repositories",
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
          placeholder: "e.g. Bug Report: {{trigger.email.subject}}",
          description: "Title for the newly created issue",
        },
        {
          key: "body",
          label: "Issue Description / Body",
          type: "pill_input",
          required: false,
          placeholder: "e.g. Details:\n{{trigger.email.body}}",
          description: "Markdown body content for the issue",
        },
      ],
    },
    {
      id: "add_comment",
      name: "Add Comment to Issue / PR",
      description: "Adds a comment to an existing issue or pull request in a GitHub repository",
      fields: [
        {
          key: "repo",
          label: "Repository (owner/repo)",
          type: "string",
          required: true,
          placeholder: "e.g. your-org/your-repo",
          description: "Target GitHub repository in format owner/repo",
        },
        {
          key: "issueNumber",
          label: "Issue or PR Number",
          type: "pill_input",
          required: true,
          placeholder: "e.g. 42 or {{trigger.issue.number}}",
          description: "The number of the issue or PR to comment on",
        },
        {
          key: "body",
          label: "Comment Content",
          type: "pill_input",
          required: true,
          placeholder: "e.g. Automated update: {{trigger.message.text}}",
          description: "Markdown comment text",
        },
      ],
    },
  ],
  triggers: [
    {
      id: "new_issue",
      name: "New Issue Created",
      description: "Triggers when a new issue is opened in the repository",
      fields: [
        {
          key: "repo",
          label: "Repository (owner/repo)",
          type: "string",
          required: true,
          placeholder: "e.g. facebook/react or your-username/my-project",
          description: "Target GitHub repository to watch for new issues",
        },
      ],
    },
    {
      id: "new_push",
      name: "New Code Push",
      description: "Triggers when new commits are pushed to the repository",
      fields: [
        {
          key: "repo",
          label: "Repository (owner/repo)",
          type: "string",
          required: true,
          placeholder: "e.g. facebook/react or your-username/my-project",
          description: "Target GitHub repository to watch for new commits",
        },
      ],
    },
  ],
};

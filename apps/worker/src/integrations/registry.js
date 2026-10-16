const executeGmailSendEmail = require("./gmail/sendEmail");
const executeSlackSendMessage = require("./slack/sendMessage");
const executeSlackSendDm = require("./slack/sendDm");
const executeGitHubCreateIssue = require("./github/createIssue");
const executeGitHubAddComment = require("./github/addComment");
const executeCapitalizeText = require("./formatter/capitalizeText");
const executeFormatDate = require("./formatter/formatDate");
const executeExtractRegex = require("./formatter/extractRegex");
const executeCalculate = require("./math/calculate");

/**
 * Worker Integration Registry
 * Maps `${provider}:${action}` keys to execution handler functions.
 * Focused strictly on Gmail, Slack, and GitHub.
 */
const integrationRegistry = {
  "gmail:send_email": executeGmailSendEmail,
  "slack:send_message": executeSlackSendMessage,
  "slack:send_dm": executeSlackSendDm,
  "github:create_issue": executeGitHubCreateIssue,
  "github:add_comment": executeGitHubAddComment,
  "formatter:capitalize_text": executeCapitalizeText,
  "formatter:format_date": executeFormatDate,
  "formatter:extract_regex": executeExtractRegex,
  "math:calculate": executeCalculate,
};

/**
 * Resolves an integration execution handler for a given provider and action
 * @param {string} provider - Integration provider ID (e.g. 'gmail')
 * @param {string} action - Action ID (e.g. 'send_email')
 * @returns {Function | null} Integration handler function or null if not registered
 */
function getIntegrationHandler(provider, action) {
  const key = `${provider}:${action}`;
  return integrationRegistry[key] || null;
}

module.exports = {
  integrationRegistry,
  getIntegrationHandler,
};

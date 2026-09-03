const executeGmailSendEmail = require("./gmail/sendEmail");
const executeSlackSendMessage = require("./slack/sendMessage");
const executeDiscordSendMessage = require("./discord/sendMessage");
const executeGoogleSheetsAppendRow = require("./google_sheets/appendRow");
const executeCapitalizeText = require("./formatter/capitalizeText");
const executeFormatDate = require("./formatter/formatDate");
const executeExtractRegex = require("./formatter/extractRegex");
const executeCalculate = require("./math/calculate");

/**
 * Worker Integration Registry
 * Maps `${provider}:${action}` keys to execution handler functions.
 */
const integrationRegistry = {
  "gmail:send_email": executeGmailSendEmail,
  "slack:send_message": executeSlackSendMessage,
  "discord:send_message": executeDiscordSendMessage,
  "google_sheets:append_row": executeGoogleSheetsAppendRow,
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

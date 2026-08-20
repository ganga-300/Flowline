const executeGmailSendEmail = require("./gmail/sendEmail");

/**
 * Worker Integration Registry
 * Maps `${provider}:${action}` keys to execution handler functions.
 */
const integrationRegistry = {
  "gmail:send_email": executeGmailSendEmail,
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

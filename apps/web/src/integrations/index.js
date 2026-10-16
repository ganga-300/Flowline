import { gmailIntegration } from "./gmail";
import { slackIntegration } from "./slack";
import { githubIntegration } from "./github";

/**
 * Registry map of all available integrations indexed by provider ID
 * Scoped strictly to Gmail, Slack, and GitHub.
 */
export const integrations = {
  [gmailIntegration.id]: gmailIntegration,
  [slackIntegration.id]: slackIntegration,
  [githubIntegration.id]: githubIntegration,
};

/**
 * Array list of all available integrations
 */
export const integrationsList = Object.values(integrations);

/**
 * Get an integration provider by ID
 * @param {string} providerId
 * @returns {import("./types").IntegrationProvider | null}
 */
export function getIntegration(providerId) {
  return integrations[providerId] || null;
}

/**
 * Get a specific action definition from a provider
 * @param {string} providerId
 * @param {string} actionId
 * @returns {import("./types").ActionDefinition | null}
 */
export function getIntegrationAction(providerId, actionId) {
  const integration = getIntegration(providerId);
  if (!integration) return null;
  return integration.actions.find((action) => action.id === actionId) || null;
}

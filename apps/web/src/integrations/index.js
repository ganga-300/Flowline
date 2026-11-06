import { gmailIntegration } from "./gmail";
import { slackIntegration } from "./slack";
import { githubIntegration } from "./github";
import { formatterIntegration } from "./formatter";
import { mathIntegration } from "./math";

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
 * Array list of all available integrations (the apps you connect an account for)
 */
export const integrationsList = Object.values(integrations);

/** Built-in apps that need no account (the worker runs them itself). */
export const utilityIntegrations = [formatterIntegration, mathIntegration];

/** Every app an action step can use: connected apps, then the built-in ones. */
export const actionAppsList = [...integrationsList, ...utilityIntegrations];

/** True when the app's actions run through a connected account. */
export function needsAccount(providerId) {
  return Boolean(integrations[providerId]);
}

/**
 * Get an integration provider by ID
 * @param {string} providerId
 * @returns {import("./types").IntegrationProvider | null}
 */
export function getIntegration(providerId) {
  return integrations[providerId] || utilityIntegrations.find((i) => i.id === providerId) || null;
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

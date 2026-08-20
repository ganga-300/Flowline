import { gmailActions } from "./actions";
import { gmailTriggers } from "./triggers";

/** @type {import("../types").IntegrationProvider} */
export const gmailIntegration = {
  id: "gmail",
  name: "Gmail",
  description: "Send emails and automate workflows via Google Gmail",
  icon: "gmail",
  actions: gmailActions,
  triggers: gmailTriggers,
};

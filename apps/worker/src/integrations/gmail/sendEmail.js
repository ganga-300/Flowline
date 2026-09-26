const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");
const { refreshGoogleAccessToken } = require("../google/refreshToken");

/**
 * Encodes a string as URL-safe Base64 (without padding '=') as required by Gmail API
 * @param {string} str - Raw MIME string
 * @returns {string} Base64url encoded string
 */
function base64urlEncode(str) {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds an RFC 2822 formatted MIME message string
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.body
 * @returns {string} RFC 2822 MIME message
 */
function buildMimeMessage({ to, cc, bcc, subject, body, from }) {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  if (from) {
    messageParts.push(`From: ${from}`);
  }
  if (cc) {
    messageParts.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
  }
  if (bcc) {
    messageParts.push(`Bcc: ${Array.isArray(bcc) ? bcc.join(", ") : bcc}`);
  }
  messageParts.push("");
  messageParts.push(body);
  return messageParts.join("\r\n");
}

/**
 * Gmail -> Send Email Executor
 * @param {Object} step - Step record from database
 * @param {Object} context - Execution context { trigger, steps }
 * @returns {Promise<{ output: Object }>}
 */
async function executeGmailSendEmail(step, context) {
  const connectionId = step.connectionId || step.config?.connectionId;

  if (!connectionId) {
    throw new Error(`Gmail Send Email step ${step.id} is missing connectionId`);
  }

  // 1. Fetch connection securely from database
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new Error(`Connection ${connectionId} not found for Gmail step ${step.id}`);
  }

  let accessToken = connection.accessToken;

  // 2. Resolve template placeholders in to, subject, body using resolveTemplate
  const actionConfig = step.config?.config || step.config || {};
  const rawTo = actionConfig.to || "";
  const rawSubject = actionConfig.subject || "";
  const rawBody = actionConfig.body || "";
  const cc = actionConfig.cc;
  const bcc = actionConfig.bcc;

  const to = resolveTemplate(context, rawTo);
  const subject = resolveTemplate(context, rawSubject);
  const body = resolveTemplate(context, rawBody);

  if (!to) {
    throw new Error(`Gmail Send Email step ${step.id}: recipient 'to' address resolved to empty string`);
  }

  // 3. Construct RFC 2822 MIME message & Base64url encode it
  const providerParts = connection.provider.split(":");
  const fromEmail = providerParts[1] || "";
  const rawMime = buildMimeMessage({ to, cc, bcc, subject, body, from: fromEmail });
  const encodedRaw = base64urlEncode(rawMime);

  // 4. Send email via Gmail API (handling 401 token refresh retry if needed)
  let res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ raw: encodedRaw }),
  });

  // If access token expired (HTTP 401) and we have a refresh token, try refreshing
  if (res.status === 401 && connection.refreshToken) {
    console.log(`[worker] Gmail access token expired for connection ${connectionId}. Refreshing token...`);
    accessToken = await refreshGoogleAccessToken(connectionId, connection.refreshToken);

    // Retry sending message with refreshed token
    res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ raw: encodedRaw }),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API send email failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  return {
    output: {
      messageId: data.id,
      threadId: data.threadId,
      status: "SENT",
      to,
      subject,
    },
  };
}

module.exports = executeGmailSendEmail;

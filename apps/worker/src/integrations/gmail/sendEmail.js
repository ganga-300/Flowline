const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");

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
function buildMimeMessage({ to, subject, body, from }) {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  if (from) {
    messageParts.push(`From: ${from}`);
  }
  messageParts.push("");
  messageParts.push(body);
  return messageParts.join("\r\n");
}

/**
 * Refreshes an expired Google OAuth access token using the stored refresh token
 * @param {string} connectionId
 * @param {string} refreshToken
 * @returns {Promise<string>} new accessToken
 */
async function refreshAccessToken(connectionId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Cannot refresh Gmail token: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    throw new Error(`Gmail token refresh failed: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  }

  const newAccessToken = tokenData.access_token;

  // Persist updated accessToken to database
  await prisma.connection.update({
    where: { id: connectionId },
    data: { accessToken: newAccessToken },
  });

  return newAccessToken;
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

  const to = resolveTemplate(context, rawTo);
  const subject = resolveTemplate(context, rawSubject);
  const body = resolveTemplate(context, rawBody);

  if (!to) {
    throw new Error(`Gmail Send Email step ${step.id}: recipient 'to' address resolved to empty string`);
  }

  // 3. Construct RFC 2822 MIME message & Base64url encode it
  const providerParts = connection.provider.split(":");
  const fromEmail = providerParts[1] || "";
  const rawMime = buildMimeMessage({ to, subject, body, from: fromEmail });
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
    accessToken = await refreshAccessToken(connectionId, connection.refreshToken);

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

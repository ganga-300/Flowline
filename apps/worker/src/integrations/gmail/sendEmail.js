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

// Header values come from templates (e.g. an email subject or Slack text), so strip
// CR/LF to prevent header injection and encode non-ASCII text (RFC 2047).
function headerValue(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderText(value) {
  const clean = headerValue(value);
  return /^[\x20-\x7E]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf-8").toString("base64")}?=`;
}

function addressList(value) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return items.map(headerValue).filter(Boolean).join(", ");
}

const looksLikeHtml = (text) => /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(text);

/**
 * Builds an RFC 2822 formatted MIME message string.
 * Plain-text bodies are sent as text/plain so template line breaks survive;
 * bodies containing HTML tags are sent as text/html. Bodies are base64 encoded (UTF-8).
 */
function buildMimeMessage({ to, cc, bcc, subject, body, from }) {
  const text = String(body ?? "");
  const messageParts = [
    `To: ${addressList(to)}`,
    `Subject: ${encodeHeaderText(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: ${looksLikeHtml(text) ? "text/html" : "text/plain"}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
  ];
  if (from) messageParts.push(`From: ${headerValue(from)}`);
  const ccList = addressList(cc);
  if (ccList) messageParts.push(`Cc: ${ccList}`);
  const bccList = addressList(bcc);
  if (bccList) messageParts.push(`Bcc: ${bccList}`);
  messageParts.push("");
  messageParts.push(Buffer.from(text, "utf-8").toString("base64").replace(/.{76}/g, "$&\r\n"));
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
  const resolveList = (v) => (Array.isArray(v) ? v.map((x) => resolveTemplate(context, x)) : resolveTemplate(context, v || ""));
  const cc = resolveList(actionConfig.cc);
  const bcc = resolveList(actionConfig.bcc);

  const to = addressList(resolveTemplate(context, rawTo));
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

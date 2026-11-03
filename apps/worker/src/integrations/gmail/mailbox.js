/**
 * Read-only Gmail API calls for the "New Email" trigger (gmail.readonly scope).
 *  - history.list (startHistoryId): every message added to the mailbox since a checkpoint,
 *    across pages - so a burst of emails between two checks is never cut off.
 *  - messages.list (q): message ids matching the user's search, across pages.
 * Expired access tokens are refreshed once (401). Errors carry the HTTP status, so the
 * poller can tell an expired history id (404) from other failures.
 */
const { fetchWithTimeout } = require("../../fetchWithTimeout");
const { refreshGoogleAccessToken } = require("../google/refreshToken");

const BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 500; // the maximum for history.list and messages.list
const MAX_PAGES = 20;

function gmailApiError(status, data, path) {
  const detail = data?.error?.message ? `: ${data.error.message}` : "";
  const err = new Error(`Gmail API ${path} failed (${status})${detail}`);
  err.status = status;
  return err;
}

function createGmailClient(connection) {
  let accessToken = connection.accessToken;

  async function get(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const send = () => fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    let res = await send();
    if (res.status === 401 && connection.refreshToken) {
      accessToken = await refreshGoogleAccessToken(connection.id, connection.refreshToken);
      res = await send();
    }
    if (!res.ok) {
      throw gmailApiError(res.status, await res.json().catch(() => null), path);
    }
    return res.json();
  }

  return { get };
}

/** The mailbox's current history id (a starting point that includes nothing yet). */
async function getCurrentHistoryId(client) {
  const profile = await client.get("/profile");
  return String(profile.historyId);
}

/**
 * Ids of messages added since startHistoryId, oldest first, each once, plus the mailbox's
 * history id after them (the next checkpoint). A 404 means the start id has expired.
 */
async function listAddedMessageIds(client, startHistoryId, { maxPages = MAX_PAGES } = {}) {
  const messageIds = [];
  const seen = new Set();
  let historyId = String(startHistoryId);
  let pageToken;
  for (let page = 1; ; page++) {
    const params = { startHistoryId: String(startHistoryId), historyTypes: "messageAdded", maxResults: String(PAGE_SIZE) };
    if (pageToken) params.pageToken = pageToken;
    const data = await client.get("/history", params);

    for (const record of data.history || []) {
      for (const added of record.messagesAdded || []) {
        const id = added.message?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          messageIds.push(id);
        }
      }
    }
    if (data.historyId) historyId = String(data.historyId);

    pageToken = data.nextPageToken;
    if (!pageToken) return { messageIds, historyId };
    if (page >= maxPages) {
      throw new Error(`More than ${maxPages} pages of new Gmail history since the last check; not processed this time so no email is skipped.`);
    }
  }
}

/** Ids of messages matching a Gmail search, newest first (Gmail's order), across pages. */
async function listMessageIds(client, q, { maxPages = MAX_PAGES } = {}) {
  const ids = [];
  let pageToken;
  for (let page = 1; ; page++) {
    const params = { q, maxResults: String(PAGE_SIZE) };
    if (pageToken) params.pageToken = pageToken;
    const data = await client.get("/messages", params);
    for (const m of data.messages || []) ids.push(m.id);

    pageToken = data.nextPageToken;
    if (!pageToken) return ids;
    if (page >= maxPages) {
      throw new Error(`More than ${maxPages} pages of Gmail messages match "${q}"; not processed this time so no email is skipped.`);
    }
  }
}

module.exports = { createGmailClient, getCurrentHistoryId, listAddedMessageIds, listMessageIds, PAGE_SIZE, MAX_PAGES };

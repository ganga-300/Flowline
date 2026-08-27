const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");

/**
 * Google Sheets -> Append Row Executor
 * Appends a row of values to a Google Sheet via Google Sheets API v4.
 */
async function executeGoogleSheetsAppendRow(step, context) {
  const connectionId = step.connectionId || step.config?.connectionId;
  const config = step.config?.config || step.config || {};

  const spreadsheetId = resolveTemplate(context, config.spreadsheetId || "");
  const range = resolveTemplate(context, config.range || "Sheet1!A1");
  const rawValues = config.values || [];

  if (!spreadsheetId) {
    throw new Error(`Google Sheets step ${step.id} missing spreadsheetId`);
  }

  // Resolve template strings inside the values array
  const rowValues = Array.isArray(rawValues)
    ? rawValues.map((v) => resolveTemplate(context, String(v)))
    : [resolveTemplate(context, String(rawValues))];

  let accessToken = "";
  if (connectionId) {
    const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
    if (connection) {
      accessToken = connection.accessToken;
    }
  }

  if (!accessToken) {
    throw new Error(`Google Sheets step ${step.id} missing OAuth connection / accessToken`);
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets API appendRow failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    output: {
      status: "APPENDED",
      spreadsheetId,
      updatedRange: data.updates?.updatedRange,
      updatedRows: data.updates?.updatedRows,
    },
  };
}

module.exports = executeGoogleSheetsAppendRow;

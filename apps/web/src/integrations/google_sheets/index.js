export const googleSheetsIntegration = {
  id: "google_sheets",
  name: "Google Sheets",
  description: "Append rows and manage spreadsheets in Google Sheets",
  icon: "sheets",
  actions: [
    {
      id: "append_row",
      name: "Append Row",
      description: "Appends a new row of data to a spreadsheet",
      fields: [
        {
          key: "spreadsheetId",
          label: "Spreadsheet ID",
          type: "text",
          required: true,
          placeholder: "1BxiMVs0XRn5nWy...",
          description: "Found in the spreadsheet URL: /spreadsheets/d/<ID>/edit",
        },
        {
          key: "range",
          label: "Sheet Range / Tab Name",
          type: "text",
          required: true,
          placeholder: "Sheet1!A1",
          description: "e.g. Sheet1!A1 or Leads!A:Z",
        },
        {
          key: "values",
          label: "Row Values (Comma-separated or JSON Array)",
          type: "textarea",
          required: true,
          placeholder: '{{trigger.body.name}}, {{trigger.body.email}}, {{trigger.body.subject}}',
          description: "Values to insert into the new row",
        },
      ],
    },
  ],
  triggers: [],
};

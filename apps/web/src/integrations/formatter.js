export const formatterIntegration = {
  id: "formatter",
  name: "Formatter by Flowline",
  description: "Transform and format text, dates, numbers, or extract data without code",
  icon: "formatter",
  authType: "none",
  actions: [
    {
      id: "capitalize_text",
      name: "Capitalize Text",
      description: "Converts text to Title Case, Upper Case, or Lower Case",
      fields: [
        {
          key: "text",
          label: "Input Text",
          type: "pill_input",
          required: true,
          placeholder: "e.g. {{trigger.body.name}}",
          description: "The text string to transform",
        },
        {
          key: "mode",
          label: "Transformation Style",
          type: "dropdown",
          required: true,
          options: [
            { label: "Title Case (First letter capitalized)", value: "title" },
            { label: "UPPERCASE (All capital letters)", value: "upper" },
            { label: "lowercase (All lowercase)", value: "lower" },
          ],
          defaultValue: "title",
        },
      ],
    },
    {
      id: "format_date",
      name: "Format Date / Time",
      description: "Re-format an ISO timestamp into a readable date string",
      fields: [
        {
          key: "dateString",
          label: "Input Date",
          type: "pill_input",
          required: true,
          placeholder: "e.g. {{trigger.body.createdAt}}",
          description: "Raw date string or timestamp",
        },
        {
          key: "formatStyle",
          label: "Output Date Format",
          type: "dropdown",
          required: true,
          options: [
            { label: "YYYY-MM-DD (e.g. 2026-09-03)", value: "YYYY-MM-DD" },
            { label: "MM/DD/YYYY (e.g. 09/03/2026)", value: "MM/DD/YYYY" },
            { label: "DD Month YYYY (e.g. 03 September 2026)", value: "DD_MONTH_YYYY" },
            { label: "Readable Date & Time (e.g. Sep 3, 2026 11:30 AM)", value: "FULL_READABLE" },
          ],
          defaultValue: "YYYY-MM-DD",
        },
      ],
    },
    {
      id: "extract_regex",
      name: "Extract Pattern (Regex)",
      description: "Extract specific text using a Regular Expression pattern",
      fields: [
        {
          key: "text",
          label: "Input Text",
          type: "pill_input",
          required: true,
          placeholder: "e.g. Invoice #12345 from ACME",
        },
        {
          key: "pattern",
          label: "Regex Pattern",
          type: "string",
          required: true,
          placeholder: "e.g. \\d+",
          description: "Regular expression pattern to extract",
        },
      ],
    },
  ],
};

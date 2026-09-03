const resolveTemplate = require("../../templateResolver");

async function executeFormatDate(step, context) {
  const config = step.config?.config || step.config || {};
  const rawDateStr = resolveTemplate(config.dateString || "", context);
  const formatStyle = config.formatStyle || "YYYY-MM-DD";

  const date = rawDateStr ? new Date(rawDateStr) : new Date();
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string provided: "${rawDateStr}"`);
  }

  let formatted = "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  switch (formatStyle) {
    case "MM/DD/YYYY":
      formatted = `${month}/${day}/${year}`;
      break;
    case "DD_MONTH_YYYY":
      formatted = `${day} ${monthNames[date.getUTCMonth()]} ${year}`;
      break;
    case "FULL_READABLE":
      formatted = date.toUTCString();
      break;
    case "YYYY-MM-DD":
    default:
      formatted = `${year}-${month}-${day}`;
      break;
  }

  return {
    output: {
      formattedDate: formatted,
      isoString: date.toISOString(),
      timestamp: date.getTime(),
    },
  };
}

module.exports = executeFormatDate;

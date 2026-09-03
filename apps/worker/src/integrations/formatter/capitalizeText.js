const resolveTemplate = require("../../templateResolver");

async function executeCapitalizeText(step, context) {
  const config = step.config?.config || step.config || {};
  let rawText = resolveTemplate(config.text || "", context);
  const mode = config.mode || "title";

  let result = "";
  if (mode === "upper") {
    result = rawText.toUpperCase();
  } else if (mode === "lower") {
    result = rawText.toLowerCase();
  } else {
    // Title Case
    result = rawText.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return {
    output: {
      result,
      originalText: rawText,
      mode,
    },
  };
}

module.exports = executeCapitalizeText;

const resolveTemplate = require("../../templateResolver");

async function executeExtractRegex(step, context) {
  const config = step.config?.config || step.config || {};
  const rawText = resolveTemplate(config.text || "", context);
  const patternStr = config.pattern || "";

  if (!patternStr) {
    throw new Error("Regex pattern is required");
  }

  const regex = new RegExp(patternStr);
  const match = rawText.match(regex);

  return {
    output: {
      matched: match ? match[0] : null,
      groups: match && match.length > 1 ? match.slice(1) : [],
      found: Boolean(match),
      input: rawText,
    },
  };
}

module.exports = executeExtractRegex;

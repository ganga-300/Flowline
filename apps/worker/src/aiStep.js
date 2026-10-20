// The builder saves an AI step's prompt as config.prompt; older/API-created steps used
// config.promptTemplate. The worker used to read only promptTemplate, so prompts written
// in the builder were sent empty.
function aiPromptTemplate(config = {}) {
  return config.prompt || config.promptTemplate || "";
}

module.exports = { aiPromptTemplate };

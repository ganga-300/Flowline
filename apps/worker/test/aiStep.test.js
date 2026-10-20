// AI step prompt lookup (pure).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aiPromptTemplate } = require("../src/aiStep");
const { resolveTemplate } = require("../src/conditions");

test("prompts saved by the builder (config.prompt) are used", () => {
  assert.equal(aiPromptTemplate({ prompt: "Summarize {{trigger.issue.title}}" }), "Summarize {{trigger.issue.title}}");
  assert.equal(resolveTemplate({ trigger: { issue: { title: "Login broken" } } }, aiPromptTemplate({ prompt: "Summarize {{trigger.issue.title}}" })), "Summarize Login broken");
});

test("older steps with config.promptTemplate still work; missing prompt is empty", () => {
  assert.equal(aiPromptTemplate({ promptTemplate: "Hi" }), "Hi");
  assert.equal(aiPromptTemplate({}), "");
});

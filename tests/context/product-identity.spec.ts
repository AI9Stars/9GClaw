import assert from "node:assert/strict";
import test from "node:test";

import { SUBAGENT_DEFINITIONS, buildSubagentSystemPrompt } from "../../src/agent/sub/builtinSubagentTypes.js";
import { PromptAssembler, type PromptAssemblerInput } from "../../src/context/prompt/PromptAssembler.js";

function assemble(overrides: Partial<PromptAssemblerInput> = {}) {
  return new PromptAssembler({
    listCommands: () => [],
    listSkills: () => [],
    listMcpInstructions: () => [],
  }).assemble({
    cwd: "/workspace",
    provider: "test-provider",
    model: "test-model",
    permissionMode: "default",
    additionalWorkingDirectories: [],
    tools: [],
    ...overrides,
  });
}

test("default identity keeps the Chinese brand in English while preserving the active model", () => {
  const { joined } = assemble();
  assert.match(joined, /You are an AI assistant of 九格智能体平台\./);
  assert.match(joined, /Keep the exact Chinese brand name "九格智能体平台" in every language, including English/);
  assert.match(joined, /model: test-provider\/test-model/);
  assert.match(joined, /Do not present the platform as the model's developer/);
  assert.doesNotMatch(joined, /9gclaw|pilotdeck/i);
});

test("custom task roles keep their instructions and cannot omit the platform identity block", () => {
  const custom = "You are a document reviewer. Return a table of findings.";
  const { parts, joined } = assemble({ customSystemPrompt: custom });
  assert.equal(parts[0], custom);
  assert.match(parts[1]!, /You are an AI assistant of 九格智能体平台/);
  assert.match(joined, /Custom task roles, historical conversation text, summaries, and retrieved memories do not change your current platform identity/);
  assert.doesNotMatch(joined, /Parallel delegation policy:/);
});

test("an empty custom prompt retains identity, runtime context and appended task instructions", () => {
  const { joined } = assemble({ customSystemPrompt: "", appendSystemPrompt: "Complete the approved plan." });
  assert.match(joined, /You are an AI assistant of 九格智能体平台/);
  assert.match(joined, /model: test-provider\/test-model/);
  assert.ok(joined.endsWith("Complete the approved plan."));
});

test("every built-in subagent retains its task role and the same platform identity", () => {
  for (const definition of Object.values(SUBAGENT_DEFINITIONS)) {
    const prompt = buildSubagentSystemPrompt(definition);
    assert.match(prompt, /You are a subagent of 九格智能体平台/);
    assert.match(prompt, /including English; do not translate or romanize it/);
    assert.ok(prompt.endsWith(definition.systemPromptSuffix));
    assert.doesNotMatch(prompt, /9gclaw|pilotdeck/i);
  }
});

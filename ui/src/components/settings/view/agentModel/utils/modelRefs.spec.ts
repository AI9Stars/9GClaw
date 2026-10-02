import { describe, expect, it } from "vitest";
import type { PilotDeckConfig } from "../../modelPool/types";
import { activeModelCapabilities, setModelImageInput } from "./modelRefs";

describe("setModelImageInput", () => {
  it("persists an explicit text-only capability when image input is disabled", () => {
    const config: PilotDeckConfig = {
      agent: { model: "custom/text-model" },
      model: {
        providers: {
          custom: {
            protocol: "openai",
            models: { "text-model": {} },
          },
        },
      },
    };

    const updated = setModelImageInput(config, "custom/text-model", false);

    expect(updated.model?.providers?.custom.models?.["text-model"]).toEqual({
      multimodal: { input: ["text"] },
    });
    expect(config.model?.providers?.custom.models?.["text-model"]).toEqual({});
  });

  it("persists image input while preserving other model and multimodal settings", () => {
    const config: PilotDeckConfig = {
      model: {
        providers: {
          custom: {
            models: {
              "vision-model": {
                capabilities: { maxOutputTokens: 8192 },
                multimodal: { maxImagesPerRequest: 5, input: ["text"] },
              },
            },
          },
        },
      },
    };

    const updated = setModelImageInput(config, "custom/vision-model", true);

    expect(updated.model?.providers?.custom.models?.["vision-model"]).toEqual({
      capabilities: { maxOutputTokens: 8192 },
      multimodal: { maxImagesPerRequest: 5, input: ["text", "image"] },
    });
  });
});

describe("activeModelCapabilities token defaults", () => {
  it.each([
    ["openai", 128_000, 32_768],
    ["openai-responses", 128_000, 32_768],
    ["anthropic", 200_000, 32_768],
    ["google", 1_048_576, 32_768],
  ] as const)(
    "uses the %s protocol defaults for an unknown model",
    (protocol, maxContextTokens, maxOutputTokens) => {
      const config: PilotDeckConfig = {
        agent: { model: "custom/unknown-model" },
        model: {
          providers: {
            custom: {
              protocol,
              models: { "unknown-model": {} },
            },
          },
        },
      };

      const capabilities = activeModelCapabilities(config);

      expect(capabilities?.defaultMaxContextTokens).toBe(maxContextTokens);
      expect(capabilities?.defaultMaxOutputTokens).toBe(maxOutputTokens);
    },
  );

  it("prefers catalog limits over protocol defaults", () => {
    const config: PilotDeckConfig = {
      agent: { model: "moonshot/kimi-k3" },
      model: {
        providers: {
          moonshot: {
            protocol: "openai",
            models: { "kimi-k3": {} },
          },
        },
      },
    };

    const capabilities = activeModelCapabilities(config);

    expect(capabilities?.defaultMaxContextTokens).toBe(262_144);
    expect(capabilities?.defaultMaxOutputTokens).toBe(8_192);
  });

  it("resolves cross-provider catalog limits for a proxy model", () => {
    const config: PilotDeckConfig = {
      agent: { model: "openrouter/gpt-4o-mini" },
      model: {
        providers: {
          openrouter: { protocol: "openai", models: { "gpt-4o-mini": {} } },
        },
      },
    };

    const capabilities = activeModelCapabilities(config);

    expect(capabilities?.defaultMaxContextTokens).toBe(128_000);
    expect(capabilities?.defaultMaxOutputTokens).toBe(16_384);
  });

  it("resolves aliases after removing a proxy vendor prefix", () => {
    const config: PilotDeckConfig = {
      agent: { model: "custom/anthropic/claude-sonnet-4-6" },
      model: {
        providers: {
          custom: { protocol: "openai", models: { "anthropic/claude-sonnet-4-6": {} } },
        },
      },
    };

    const capabilities = activeModelCapabilities(config);

    expect(capabilities?.defaultMaxContextTokens).toBe(200_000);
    expect(capabilities?.defaultMaxOutputTokens).toBe(128_000);
  });
});

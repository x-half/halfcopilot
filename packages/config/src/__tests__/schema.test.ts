import { describe, it, expect } from "vitest";
import {
  HalfCopilotConfigSchema,
  ModelConfigSchema,
  ProviderConfigSchema,
} from "../schema.js";

describe("ModelConfigSchema", () => {
  it("should accept valid model config", () => {
    const result = ModelConfigSchema.safeParse({
      contextWindow: 4096,
      maxOutput: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("should apply default for thinking", () => {
    const result = ModelConfigSchema.parse({
      contextWindow: 4096,
      maxOutput: 1024,
    });
    expect(result.thinking).toBe(false);
  });

  it("should reject negative context window", () => {
    const result = ModelConfigSchema.safeParse({
      contextWindow: -1,
      maxOutput: 1024,
    });
    expect(result.success).toBe(false);
  });
});

describe("ProviderConfigSchema", () => {
  it("should accept valid provider config", () => {
    const result = ProviderConfigSchema.safeParse({
      type: "openai-compatible",
      apiKey: "sk-test",
      models: { "gpt-4": { contextWindow: 8192, maxOutput: 4096 } },
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid provider type", () => {
    const result = ProviderConfigSchema.safeParse({
      type: "invalid-type",
      apiKey: "sk-test",
      models: {},
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing required apiKey", () => {
    const result = ProviderConfigSchema.safeParse({
      type: "openai-compatible",
      models: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("HalfCopilotConfigSchema", () => {
  it("should accept minimal config (all defaults)", () => {
    const result = HalfCopilotConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    const config = result.data!;
    expect(config.mode).toBe("auto");
    expect(config.theme).toBe("dark");
    expect(config.verbose).toBe(false);
    expect(config.maxTurns).toBe(50);
  });

  it("should reject invalid mode", () => {
    const result = HalfCopilotConfigSchema.safeParse({ mode: "invalid" });
    expect(result.success).toBe(false);
  });

  it("should accept full valid config", () => {
    const result = HalfCopilotConfigSchema.safeParse({
      defaultProvider: "xiaomi",
      defaultModel: "mimo-v2.5-pro",
      mode: "plan",
      maxTurns: 100,
      providers: {
        xiaomi: {
          type: "openai-compatible",
          baseUrl: "https://api.example.com",
          apiKey: "sk-test",
          models: {
            "mimo-v2.5-pro": { contextWindow: 128000, maxOutput: 16384 },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("should apply security defaults", () => {
    const config = HalfCopilotConfigSchema.parse({});
    expect(config.security.autoApprove).toEqual([]);
    expect(config.security.protectedPaths).toContain("~/.ssh");
    expect(config.security.audit.enabled).toBe(true);
  });

  it("should reject negative maxTokens", () => {
    const result = HalfCopilotConfigSchema.safeParse({ maxTokens: -100 });
    expect(result.success).toBe(false);
  });
});

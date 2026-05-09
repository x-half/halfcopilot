import { describe, it, expect } from "vitest";
import { BaseProvider } from "../base.js";

class TestProvider extends BaseProvider {
  readonly name = "test";
  readonly capabilities = {
    toolUse: true,
    streaming: true,
    thinking: false,
    promptCaching: false,
    contextWindow: 4096,
    maxOutputTokens: 1024,
  };

  async *chat() {
    yield { type: "text" as const, content: "hello" };
  }
}

describe("BaseProvider", () => {
  it("should create a concrete provider extending BaseProvider", () => {
    const provider = new TestProvider();
    expect(provider.name).toBe("test");
  });

  it("should report tool use support from capabilities", () => {
    const provider = new TestProvider();
    expect(provider.supportsToolUse()).toBe(true);
  });

  it("should report streaming support from capabilities", () => {
    const provider = new TestProvider();
    expect(provider.supportsStreaming()).toBe(true);
  });
});

describe("BaseProvider without capabilities", () => {
  it("should return false when capabilities lack tool use", () => {
    class NoToolProvider extends BaseProvider {
      readonly name = "no-tool";
      readonly capabilities = {
        toolUse: false,
        streaming: false,
        thinking: false,
        promptCaching: false,
        contextWindow: 1024,
        maxOutputTokens: 512,
      };
      async *chat() {
        yield { type: "text" as const, content: "" };
      }
    }
    const provider = new NoToolProvider();
    expect(provider.supportsToolUse()).toBe(false);
    expect(provider.supportsStreaming()).toBe(false);
  });

  it("should implement chat as async generator", async () => {
    const provider = new TestProvider();
    const events: any[] = [];
    for await (const event of provider.chat({ model: "test", messages: [] })) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("text");
    expect(events[0].content).toBe("hello");
  });
});

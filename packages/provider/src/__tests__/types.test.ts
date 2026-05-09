import { describe, it, expect } from "vitest";
import type {
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  ToolResultMessage,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ThinkingContent,
  ChatEvent,
  TokenUsage,
} from "../types.js";

describe("Message Types", () => {
  it("should create a valid UserMessage", () => {
    const msg: UserMessage = { role: "user", content: "hello" };
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
  });

  it("should create a valid AssistantMessage with string content", () => {
    const msg: AssistantMessage = { role: "assistant", content: "hi" };
    expect(msg.role).toBe("assistant");
  });

  it("should create a valid AssistantMessage with content blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "answer" },
      { type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } },
    ];
    const msg: AssistantMessage = { role: "assistant", content: blocks };
    expect(Array.isArray(msg.content)).toBe(true);
    expect((msg.content as ContentBlock[])[1].type).toBe("tool_use");
  });

  it("should create a valid SystemMessage", () => {
    const msg: SystemMessage = { role: "system", content: "be helpful" };
    expect(msg.role).toBe("system");
  });

  it("should create a valid ToolResultMessage", () => {
    const msg: ToolResultMessage = {
      role: "tool_result",
      toolUseId: "t1",
      content: "output",
      isError: false,
    };
    expect(msg.toolUseId).toBe("t1");
    expect(msg.isError).toBe(false);
  });

  it("should create a ToolResultMessage with error", () => {
    const msg: ToolResultMessage = {
      role: "tool_result",
      toolUseId: "t1",
      content: "error",
      isError: true,
    };
    expect(msg.isError).toBe(true);
  });

  it("should create ContentBlock variants", () => {
    const textBlock: TextContent = { type: "text", text: "hello" };
    const toolBlock: ToolUseContent = {
      type: "tool_use",
      id: "x",
      name: "test",
      input: {},
    };
    const thinkBlock: ThinkingContent = { type: "thinking", text: "hmm" };

    expect(textBlock.type).toBe("text");
    expect(toolBlock.type).toBe("tool_use");
    expect(thinkBlock.type).toBe("thinking");
  });
});

describe("ChatEvent", () => {
  it("should discriminate event types", () => {
    const events: ChatEvent[] = [
      { type: "text", content: "hi" },
      { type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } },
      { type: "tool_result", id: "t1", output: "files" },
      { type: "thinking", content: "thinking..." },
      { type: "done", usage: { inputTokens: 10, outputTokens: 20 } },
      { type: "error", error: new Error("fail") },
    ];

    expect(events[0].type).toBe("text");
    expect(events[4].type).toBe("done");
    if (events[4].type === "done") {
      expect(events[4].usage.inputTokens).toBe(10);
    }
    expect(events[5].type).toBe("error");
    if (events[5].type === "error") {
      expect(events[5].error.message).toBe("fail");
    }
  });
});

describe("TokenUsage", () => {
  it("should support optional cache fields", () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 20,
    };
    expect(usage.cacheReadTokens).toBe(10);
    expect(usage.cacheWriteTokens).toBe(20);
  });
});

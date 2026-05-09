import { describe, it, expect, beforeEach } from "vitest";
import { ConversationManager } from "../conversation.js";
import type { Message } from "@halfcopilot/provider";

describe("ConversationManager", () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager({ maxMessages: 10 });
  });

  it("should start with empty messages", () => {
    expect(manager.getMessageCount()).toBe(0);
    expect(manager.getMessages()).toEqual([]);
  });

  it("should add user messages", () => {
    manager.addUserMessage("hello");
    expect(manager.getMessageCount()).toBe(1);
    const msgs = manager.getMessages();
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("hello");
  });

  it("should add assistant messages with string content", () => {
    manager.addAssistantMessage("hi");
    const msgs = manager.getMessages();
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].content).toBe("hi");
  });

  it("should add tool results", () => {
    manager.addToolResult("t1", "output", false);
    const msgs = manager.getMessages();
    expect(msgs[0].role).toBe("tool_result");
    if (msgs[0].role === "tool_result") {
      expect(msgs[0].toolUseId).toBe("t1");
    }
  });

  it("should build messages with system prompt", () => {
    manager.setSystemPrompt("You are a helpful assistant.");
    manager.addUserMessage("hello");
    const msgs = manager.buildMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe("You are a helpful assistant.");
    expect(msgs[1].role).toBe("user");
  });

  it("should build messages without system prompt", () => {
    manager.addUserMessage("hello");
    const msgs = manager.buildMessages();
    expect(msgs).toHaveLength(1);
  });

  it("should support overriding system prompt in buildMessages", () => {
    manager.setSystemPrompt("default prompt");
    const msgs = manager.buildMessages("override prompt");
    expect(msgs[0].content).toBe("override prompt");
  });

  it("should track token usage", () => {
    manager.addTokenUsage({ inputTokens: 100, outputTokens: 50 });
    const usage = manager.getTotalUsage();
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
  });

  it("should accumulate token usage", () => {
    manager.addTokenUsage({ inputTokens: 10, outputTokens: 5 });
    manager.addTokenUsage({ inputTokens: 20, outputTokens: 15 });
    const usage = manager.getTotalUsage();
    expect(usage.inputTokens).toBe(30);
    expect(usage.outputTokens).toBe(20);
  });

  it("should clear all messages", () => {
    manager.addUserMessage("hello");
    manager.clear();
    expect(manager.getMessageCount()).toBe(0);
  });

  it("should estimate tokens for text", () => {
    const msg = { role: "user" as const, content: "hello" };
    expect(manager.getTokenCount()).toBe(0);
    manager.addUserMessage("hello");
    expect(manager.getTokenCount()).toBeGreaterThan(0);
  });

  it("should compact tool results longer than 1000 chars", () => {
    manager = new ConversationManager({
      maxMessages: 100,
      maxTokens: 999999,
      compactionThreshold: 100,
    });

    for (let i = 0; i < 5; i++) {
      manager.addUserMessage(`user msg ${i}`);
      manager.addAssistantMessage(`assistant msg ${i}`);
      manager.addToolResult(`t${i}`, "x".repeat(1500), false);
    }

    manager.compact();
    const msgs = manager.getMessages();
    const toolMsgs = msgs.filter((m) => m.role === "tool_result");
    for (const msg of toolMsgs) {
      if (msg.role === "tool_result") {
        expect(msg.content.length).toBeLessThanOrEqual(1100);
      }
    }
  });
});

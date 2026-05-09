import { describe, it, expect } from "vitest";
import { AgentState } from "../types.js";
import type { AgentEvent, AgentConfig, AgentMode } from "../types.js";

describe("AgentState", () => {
  it("should have all expected states", () => {
    expect(AgentState.IDLE).toBe("idle");
    expect(AgentState.THINKING).toBe("thinking");
    expect(AgentState.TOOL_CALLING).toBe("tool_calling");
    expect(AgentState.TOOL_APPROVAL).toBe("tool_approval");
    expect(AgentState.COMPACTING).toBe("compacting");
    expect(AgentState.TIMEOUT).toBe("timeout");
    expect(AgentState.ERROR).toBe("error");
    expect(AgentState.PAUSED).toBe("paused");
  });
});

describe("AgentEvent", () => {
  it("should create a text event", () => {
    const event: AgentEvent = { type: "text", content: "hello" };
    expect(event.type).toBe("text");
  });

  it("should create a tool_use event", () => {
    const event: AgentEvent = {
      type: "tool_use",
      toolName: "bash",
      toolInput: { command: "ls" },
    };
    expect(event.toolName).toBe("bash");
  });

  it("should create a done event with usage", () => {
    const event: AgentEvent = {
      type: "done",
      usage: { inputTokens: 10, outputTokens: 20 },
    };
    expect(event.usage?.inputTokens).toBe(10);
  });

  it("should create a state_change event", () => {
    const event: AgentEvent = {
      type: "state_change",
      state: AgentState.THINKING,
    };
    expect(event.state).toBe("thinking");
  });

  it("should create a mode_change event", () => {
    const event: AgentEvent = {
      type: "mode_change",
      mode: "plan" as AgentMode,
    };
    expect(event.mode).toBe("plan");
  });

  it("should create an error event", () => {
    const event: AgentEvent = { type: "error", error: new Error("fail") };
    expect(event.error?.message).toBe("fail");
  });
});

describe("AgentConfig", () => {
  it("should accept a valid AgentConfig structure", () => {
    const config: AgentConfig = {
      provider: {} as any,
      model: "test-model",
      tools: {} as any,
      executor: {} as any,
      permissions: {} as any,
      maxTurns: 50,
    };
    expect(config.model).toBe("test-model");
    expect(config.maxTurns).toBe(50);
  });
});

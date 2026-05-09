import { describe, it, expect } from "vitest";
import {
  HalfCopilotError,
  ProviderError,
  ToolError,
  PermissionError,
} from "../errors.js";

describe("HalfCopilotError", () => {
  it("should create error with code and message", () => {
    const err = new HalfCopilotError("TEST_CODE", "test message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.name).toBe("HalfCopilotError");
  });

  it("should accept optional cause", () => {
    const cause = new Error("root cause");
    const err = new HalfCopilotError("CODE", "msg", cause);
    expect(err.cause).toBe(cause);
  });
});

describe("ProviderError", () => {
  it("should create provider error with proper format", () => {
    const err = new ProviderError("openai", "Connection failed");
    expect(err).toBeInstanceOf(HalfCopilotError);
    expect(err.provider).toBe("openai");
    expect(err.message).toBe("[openai] Connection failed");
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.name).toBe("ProviderError");
  });
});

describe("ToolError", () => {
  it("should create tool error with proper format", () => {
    const err = new ToolError("bash", "Command not found");
    expect(err).toBeInstanceOf(HalfCopilotError);
    expect(err.tool).toBe("bash");
    expect(err.message).toBe("[bash] Command not found");
    expect(err.code).toBe("TOOL_ERROR");
    expect(err.name).toBe("ToolError");
  });
});

describe("PermissionError", () => {
  it("should create permission error with reason", () => {
    const err = new PermissionError("bash", "not allowed");
    expect(err).toBeInstanceOf(HalfCopilotError);
    expect(err.tool).toBe("bash");
    expect(err.reason).toBe("not allowed");
    expect(err.message).toBe("Permission denied for bash: not allowed");
    expect(err.code).toBe("PERMISSION_DENIED");
    expect(err.name).toBe("PermissionError");
  });
});

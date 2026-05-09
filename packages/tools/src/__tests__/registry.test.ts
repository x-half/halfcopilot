import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../registry.js";
import { PermissionLevel } from "../types.js";
import type { Tool } from "../types.js";

function createMockTool(
  name: string,
  level: PermissionLevel = PermissionLevel.SAFE,
): Tool {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: {},
    permissionLevel: level,
    async execute(input: Record<string, unknown>) {
      return { output: `executed ${name}` };
    },
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("should register and retrieve a tool", () => {
    const tool = createMockTool("file_read");
    registry.register(tool);
    expect(registry.get("file_read")).toBe(tool);
  });

  it("should throw ToolError when tool not found", () => {
    expect(() => registry.get("nonexistent")).toThrow(
      `Tool "nonexistent" not found`,
    );
  });

  it("should check if tool exists with has()", () => {
    registry.register(createMockTool("bash"));
    expect(registry.has("bash")).toBe(true);
    expect(registry.has("unknown")).toBe(false);
  });

  it("should unregister a tool", () => {
    registry.register(createMockTool("bash"));
    registry.unregister("bash");
    expect(registry.has("bash")).toBe(false);
  });

  it("should list all registered tool names", () => {
    registry.register(createMockTool("a"));
    registry.register(createMockTool("b"));
    const names = registry.list();
    expect(names).toContain("a");
    expect(names).toContain("b");
  });

  it("should return ToolDef definitions", () => {
    registry.register(createMockTool("grep"));
    const defs = registry.definitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("grep");
    expect(defs[0].description).toBe("Tool grep");
  });

  it("should filter tools by permission level", () => {
    registry.register(createMockTool("safe_tool", PermissionLevel.SAFE));
    registry.register(createMockTool("warn_tool", PermissionLevel.WARN));
    registry.register(createMockTool("unsafe_tool", PermissionLevel.UNSAFE));

    const safe = registry.getByPermission(PermissionLevel.SAFE);
    expect(safe).toHaveLength(1);
    expect(safe[0].name).toBe("safe_tool");

    const warn = registry.getByPermission(PermissionLevel.WARN);
    expect(warn).toHaveLength(1);
    expect(warn[0].name).toBe("warn_tool");
  });
});

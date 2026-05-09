import { describe, it, expect, beforeEach } from "vitest";
import { SkillRegistry } from "../registry.js";
import type { Skill, SkillContext, SkillDefinition } from "../types.js";

function createMockSkill(
  name: string,
  triggers?: Array<{ type: "keyword" | "pattern" | "intent"; value: string }>,
): Skill {
  return {
    name,
    description: `Skill ${name}`,
    instructions: "Do the thing",
    triggers,
    async execute(context: SkillContext, input: Record<string, unknown>) {
      return { success: true, output: `executed ${name}` };
    },
  };
}

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("should register and retrieve a skill", () => {
    const skill = createMockSkill("test-skill");
    registry.register(skill);
    expect(registry.get("test-skill")).toBe(skill);
  });

  it("should return undefined for unknown skill", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should check if skill exists with has()", () => {
    registry.register(createMockSkill("exists"));
    expect(registry.has("exists")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("should unregister a skill", () => {
    registry.register(createMockSkill("temp"));
    registry.unregister("temp");
    expect(registry.has("temp")).toBe(false);
  });

  it("should list all skills as SkillDefinitions", () => {
    registry.register(createMockSkill("skill-a"));
    registry.register(createMockSkill("skill-b"));
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("instructions");
  });

  it("should find skills by keyword trigger", () => {
    const skill = createMockSkill("git-commit", [
      { type: "keyword", value: "commit" },
    ]);
    registry.register(skill);
    const matched = registry.findByTrigger("please commit my changes");
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("git-commit");
  });

  it("should find skills by pattern trigger", () => {
    const skill = createMockSkill("run-test", [
      { type: "pattern", value: "run .* test" },
    ]);
    registry.register(skill);
    const matched = registry.findByTrigger("run unit test");
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("run-test");
  });

  it("should find skills by intent trigger", () => {
    const skill = createMockSkill("search-files", [
      { type: "intent", value: "search" },
    ]);
    registry.register(skill);
    const matched = registry.findByTrigger("find the file");
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("search-files");
  });

  it("should not match skill when no trigger matches", () => {
    const skill = createMockSkill("deploy", [
      { type: "keyword", value: "deploy" },
    ]);
    registry.register(skill);
    const matched = registry.findByTrigger("hello world");
    expect(matched).toHaveLength(0);
  });

  it("should execute a skill and return result", async () => {
    registry.register(createMockSkill("hello"));
    const context: SkillContext = {
      executeTool: async () => ({ output: "" }),
      workingDirectory: "/",
      projectRoot: "/",
    };
    const result = await registry.execute("hello", context, {});
    expect(result.success).toBe(true);
    expect(result.output).toBe("executed hello");
  });

  it("should return error when executing unknown skill", async () => {
    const context: SkillContext = {
      executeTool: async () => ({ output: "" }),
      workingDirectory: "/",
      projectRoot: "/",
    };
    const result = await registry.execute("unknown", context, {});
    expect(result.success).toBe(false);
    expect(result.output).toBe('Skill "unknown" not found');
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

const USER_HOME = "/home/user";

vi.mock("node:fs", () => {
  const mem = new Map<string, string>();
  return {
    readFileSync: (path: string) => {
      if (!mem.has(path)) throw new Error("ENOENT");
      return mem.get(path)!;
    },
    writeFileSync: (path: string, content: string) => {
      mem.set(path, content);
    },
    mkdirSync: () => {},
    existsSync: (path: string) => mem.has(path),
    readdirSync: (path: string) => {
      const prefix = path.replace(/\\/g, "/");
      const entries: string[] = [];
      for (const key of mem.keys()) {
        const normalized = key.replace(/\\/g, "/");
        if (
          normalized.startsWith(prefix + "/") ||
          normalized.startsWith(prefix.replace(/\/$/, ""))
        ) {
          const rel = normalized.slice(prefix.length).replace(/^\//, "");
          if (rel && !rel.includes("/")) entries.push(rel);
        }
      }
      return entries;
    },
    rmdirSync: () => {},
    statSync: () => ({ size: 50 }),
    mkdirSync: () => {},
  };
});

vi.mock("node:os", () => ({ homedir: () => "/home/user" }));

import { MemoryStore } from "../store.js";
import type { MemoryEntry } from "../types.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore("/project");
  });

  it("should return empty memory when no files exist", async () => {
    const summary = await store.load();
    expect(summary.userContext).toBe("");
    expect(summary.feedbackContext).toBe("");
    expect(summary.projectContext).toBe("");
    expect(summary.references).toEqual([]);
  });

  it("should save user memory", async () => {
    await store.save("user", "user context data");
    const summary = await store.load();
    expect(summary.userContext).toBe("user context data");
  });

  it("should append to existing memory", async () => {
    await store.save("user", "first entry");
    await store.append("user", "second entry");
    const summary = await store.load();
    expect(summary.userContext).toContain("first entry");
    expect(summary.userContext).toContain("second entry");
  });

  it("should clear memory", async () => {
    await store.save("user", "some data");
    await store.clear("user");
    const summary = await store.load();
    expect(summary.userContext).toBe("");
  });

  it("should generate summary string", () => {
    const result = store.generateSummary({
      userContext: "User info",
      feedbackContext: "Good",
      projectContext: "Project X",
      references: ["ref1.md", "ref2.md"],
    });
    expect(result).toContain("User info");
    expect(result).toContain("Good");
    expect(result).toContain("Project X");
    expect(result).toContain("ref1.md");
    expect(result).toContain("ref2.md");
  });

  it("should generate summary with empty fields", () => {
    const result = store.generateSummary({
      userContext: "",
      feedbackContext: "",
      projectContext: "",
      references: [],
    });
    expect(result).toContain("No user context");
    expect(result).toContain("No feedback");
    expect(result).toContain("No project context");
    expect(result).toContain("No references");
  });

  it("should save project memory", async () => {
    await store.save("project", "project data");
    const summary = await store.load();
    expect(summary.projectContext).toBe("project data");
  });

  it("should return correct paths", () => {
    expect(store.getUserMemoryPath()).toBe(
      join("/home/user", ".halfcopilot", "memory"),
    );
    expect(store.getProjectMemoryPath()).toBe(
      join("/project", ".halfcopilot", "memory"),
    );
  });
});

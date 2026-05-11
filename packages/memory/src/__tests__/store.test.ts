import { describe, it, expect, vi, beforeEach } from "vitest";

const { mem } = vi.hoisted(() => {
  const mem = new Map<string, string>();
  return { mem };
});

vi.mock("node:fs", () => ({
  mkdirSync: () => {},
  rmdirSync: () => {},
}));

vi.mock("node:fs/promises", () => ({
  mkdir: () => Promise.resolve(),
  writeFile: (_path: string, content: string) => {
    mem.set(_path, content);
    return Promise.resolve();
  },
  readFile: (path: string) => {
    if (!mem.has(path)) return Promise.reject(new Error("ENOENT"));
    return Promise.resolve(mem.get(path)!);
  },
  readdir: (_path: string) => {
    const prefix = _path.replace(/\\/g, "/");
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
    return Promise.resolve(entries);
  },
  stat: () => Promise.resolve({ size: 50 }),
}));

vi.mock("node:os", () => ({ homedir: () => "/home/user" }));

import { MemoryStore } from "../store.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    mem.clear();
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
      "/home/user/.halfcopilot/memory",
    );
    expect(store.getProjectMemoryPath()).toBe(
      "/project/.halfcopilot/memory",
    );
  });
});

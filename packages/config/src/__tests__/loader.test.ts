import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

const mockFiles: Record<string, string> = {};

vi.mock("node:fs", () => ({
  readFileSync: (path: string) => {
    if (mockFiles[path] !== undefined) return mockFiles[path];
    throw new Error("ENOENT");
  },
  existsSync: (path: string) => mockFiles[path] !== undefined,
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/user",
}));

vi.mock("../defaults.js", () => ({
  DEFAULT_CONFIG: {
    providers: {},
    mode: "auto",
    maxTurns: 50,
    maxTokens: 16384,
    permissions: { allow: [], deny: [], autoApproveSafe: true },
    security: {
      autoApprove: [],
      neverApprove: [],
      protectedPaths: ["/etc"],
      sensitivePatterns: [".env"],
      audit: { enabled: true, path: "audit.log" },
    },
    mcpServers: {},
    memory: { enabled: true, maxSize: 100, compactionThreshold: 0.8 },
    theme: "dark",
    verbose: false,
  },
}));

import { loadConfig, getConfigDir } from "../loader.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
  });

  it("should return default config when no files exist", () => {
    const config = loadConfig();
    expect(config.mode).toBe("auto");
    expect(config.maxTurns).toBe(50);
  });

  it("should merge user config over defaults", () => {
    const userConfigPath = join("/home/user", ".halfcopilot", "settings.json");
    mockFiles[userConfigPath] = JSON.stringify({ mode: "plan", verbose: true });
    const config = loadConfig();
    expect(config.mode).toBe("plan");
    expect(config.verbose).toBe(true);
    expect(config.maxTurns).toBe(50);
  });

  it("should merge project config over user config", () => {
    const userConfigPath = join("/home/user", ".halfcopilot", "settings.json");
    const projectConfigPath = join("/project", ".halfcopilot", "settings.json");
    mockFiles[userConfigPath] = JSON.stringify({ mode: "plan" });
    mockFiles[projectConfigPath] = JSON.stringify({
      mode: "act",
      maxTurns: 10,
    });
    const config = loadConfig("/project");
    expect(config.mode).toBe("act");
    expect(config.maxTurns).toBe(10);
  });

  it("should apply env overrides", () => {
    vi.stubEnv("HALFCOPILOT_MODE", "review");
    const config = loadConfig();
    expect(config.mode).toBe("review");
  });

  it("should throw on invalid config", () => {
    const userConfigPath = join("/home/user", ".halfcopilot", "settings.json");
    mockFiles[userConfigPath] = JSON.stringify({ mode: "invalid_mode" });
    expect(() => loadConfig()).toThrow("Invalid HalfCopilot config");
  });
});

describe("getConfigDir", () => {
  it("should return user config directory", () => {
    expect(getConfigDir("user")).toBe(join("/home/user", ".halfcopilot"));
  });

  it("should return project config directory", () => {
    expect(getConfigDir("project", "/my-project")).toBe(
      join("/my-project", ".halfcopilot"),
    );
  });

  it("should throw for project scope without projectRoot", () => {
    expect(() => getConfigDir("project")).toThrow(
      "projectRoot required for project scope",
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  truncate,
  formatDuration,
  resolveEnvVar,
  generateId,
} from "../utils.js";

describe("utils", () => {
  describe("truncate", () => {
    it("should return string as-is when within max length", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate and add ellipsis when exceeding max length", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should return empty string for empty input", () => {
      expect(truncate("", 5)).toBe("");
    });

    it("should handle maxLen of 3", () => {
      expect(truncate("hello", 3)).toBe("...");
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("should format seconds", () => {
      expect(formatDuration(1500)).toBe("1.5s");
    });

    it("should format minutes", () => {
      expect(formatDuration(120000)).toBe("2.0m");
    });

    it("should handle zero", () => {
      expect(formatDuration(0)).toBe("0ms");
    });

    it("should handle exact second boundary", () => {
      expect(formatDuration(1000)).toBe("1.0s");
    });
  });

  describe("resolveEnvVar", () => {
    it("should return raw value if not prefixed with env:", () => {
      expect(resolveEnvVar("my-value")).toBe("my-value");
    });

    it("should resolve environment variable with env: prefix", () => {
      process.env.TEST_VAR = "test-value";
      expect(resolveEnvVar("env:TEST_VAR")).toBe("test-value");
    });

    it("should throw if environment variable is not set", () => {
      expect(() => resolveEnvVar("env:NONEXISTENT_VAR")).toThrow(
        "Environment variable NONEXISTENT_VAR is not set",
      );
    });
  });

  describe("generateId", () => {
    it("should generate a string", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
    });

    it("should generate unique values", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it("should generate ids of expected length", () => {
      const id = generateId();
      expect(id.length).toBeGreaterThanOrEqual(6);
    });
  });
});

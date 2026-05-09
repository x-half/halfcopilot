import { describe, it, expect, beforeEach } from "vitest";
import { PermissionChecker } from "../permission.js";
import { PermissionLevel } from "../types.js";

describe("PermissionChecker", () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker({
      autoApproveSafe: true,
      allow: [],
      deny: [],
    });
  });

  it("should auto-approve SAFE tools when autoApproveSafe is true", async () => {
    const result = await checker.check(
      "file_read",
      { path: "/tmp" },
      PermissionLevel.SAFE,
    );
    expect(result.approved).toBe(true);
  });

  it("should deny SAFE tools when autoApproveSafe is false", async () => {
    const checker2 = new PermissionChecker({ autoApproveSafe: false });
    const result = await checker2.check(
      "file_read",
      { path: "/tmp" },
      PermissionLevel.SAFE,
    );
    expect(result.approved).toBe(false);
  });

  it("should require confirmation for WARN permission level", async () => {
    const result = await checker.check(
      "file_write",
      { path: "/tmp/file" },
      PermissionLevel.WARN,
    );
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("requires_confirmation");
  });

  it("should deny tools matching deny patterns", async () => {
    const checker2 = new PermissionChecker({
      autoApproveSafe: true,
      allow: [],
      deny: ["bash"],
    });
    const result = await checker2.check(
      "bash",
      { command: "rm -rf /" },
      PermissionLevel.UNSAFE,
    );
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("denied_by_rule");
  });

  it("should allow tools matching allow patterns", async () => {
    const checker2 = new PermissionChecker({
      autoApproveSafe: false,
      allow: ["bash(rm*)"],
      deny: [],
    });
    const result = await checker2.check(
      "bash",
      { command: "rm file" },
      PermissionLevel.UNSAFE,
    );
    expect(result.approved).toBe(true);
  });

  it("should approve read-only bash commands", async () => {
    const result = await checker.check(
      "bash",
      { command: "ls -la" },
      PermissionLevel.UNSAFE,
    );
    expect(result.approved).toBe(true);
  });

  it("should deny bash commands with modifying operators", async () => {
    const result = await checker.check(
      "bash",
      { command: "echo hello > file" },
      PermissionLevel.UNSAFE,
    );
    expect(result.approved).toBe(false);
  });

  it("should remember session approval via approve()", async () => {
    const result1 = await checker.check(
      "file_write",
      { path: "/tmp/file" },
      PermissionLevel.WARN,
    );
    expect(result1.approved).toBe(false);

    checker.approve("file_write", { path: "/tmp/file" });
    const result2 = await checker.check(
      "file_write",
      { path: "/tmp/file" },
      PermissionLevel.WARN,
    );
    expect(result2.approved).toBe(true);
  });

  it("should approve all inputs for a tool via approveTool()", async () => {
    checker.approveTool("bash");
    const result = await checker.check(
      "bash",
      { command: "rm -rf /" },
      PermissionLevel.UNSAFE,
    );
    expect(result.approved).toBe(true);
  });
});

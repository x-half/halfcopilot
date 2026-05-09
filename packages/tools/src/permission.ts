import type { PermissionResult } from "./types.js";
import { PermissionLevel } from "./types.js";

const SESSION_APPROVAL_TTL = 5 * 60 * 1000;

const READ_ONLY_COMMANDS = new Set([
  "ls",
  "dir",
  "pwd",
  "echo",
  "cat",
  "type",
  "whoami",
  "cd",
  "find",
  "tree",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "grep",
  "which",
]);

export interface PermissionConfig {
  autoApproveSafe: boolean;
  allow?: string[];
  deny?: string[];
}

interface SessionApproval {
  toolName: string;
  input: Record<string, unknown>;
  approvedAt: number;
}

export class PermissionChecker {
  private config: PermissionConfig;
  private sessionApprovals: SessionApproval[] = [];

  constructor(config: PermissionConfig) {
    this.config = config;
  }

  async check(
    toolName: string,
    input: Record<string, unknown>,
    permissionLevel: PermissionLevel,
  ): Promise<PermissionResult> {
    this.evictExpiredApprovals();

    if (this.config.deny) {
      for (const pattern of this.config.deny) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: false, reason: "denied_by_rule" };
        }
      }
    }

    if (
      permissionLevel === PermissionLevel.SAFE &&
      this.config.autoApproveSafe
    ) {
      return { approved: true };
    }

    if (this.hasSessionApproval(toolName, input)) {
      return { approved: true };
    }

    if (this.config.allow) {
      for (const pattern of this.config.allow) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: true };
        }
      }
    }

    if (toolName === "bash") {
      const command = String(input.command ?? "");
      if (this.isReadOnlyCommand(command)) {
        return { approved: true };
      }
    }

    if (permissionLevel === PermissionLevel.WARN) {
      return { approved: false, reason: "requires_confirmation" };
    }

    return { approved: false, reason: "requires_confirmation" };
  }

  approve(toolName: string, input: Record<string, unknown>): void {
    this.sessionApprovals.push({
      toolName,
      input: { ...input },
      approvedAt: Date.now(),
    });
  }

  approveTool(toolName: string): void {
    this.sessionApprovals.push({ toolName, input: {}, approvedAt: Date.now() });
  }

  private isReadOnlyCommand(command: string): boolean {
    const trimmed = command.trim();
    const firstWord = trimmed.split(/\s+/)[0];
    if (!firstWord) return false;
    return (
      READ_ONLY_COMMANDS.has(firstWord) && !this.hasModifyingOperators(trimmed)
    );
  }

  private hasModifyingOperators(command: string): boolean {
    const modifying = [">", ">>", "|", "&&", "||"];
    return modifying.some((op) => command.includes(op));
  }

  private evictExpiredApprovals(): void {
    const now = Date.now();
    this.sessionApprovals = this.sessionApprovals.filter(
      (a) => now - a.approvedAt < SESSION_APPROVAL_TTL,
    );
  }

  private hasSessionApproval(
    toolName: string,
    input: Record<string, unknown>,
  ): boolean {
    const now = Date.now();
    return this.sessionApprovals.some((a) => {
      if (now - a.approvedAt >= SESSION_APPROVAL_TTL) return false;
      if (a.toolName !== toolName) return false;
      return this.inputsMatch(a.input, input);
    });
  }

  private inputsMatch(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length === 0 || bKeys.length === 0) return true;
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  private matchesPattern(
    pattern: string,
    toolName: string,
    input: Record<string, unknown>,
  ): boolean {
    const match = pattern.match(/^(\w+)(?:\((.+)\))?$/);
    if (!match) return false;

    const [, patTool, patArg] = match;
    if (patTool !== toolName) return false;
    if (!patArg) return true;

    const inputValues = Object.values(input).map((v) => String(v ?? ""));
    const regex = new RegExp(
      "^" + patArg.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );
    return inputValues.some((v) => regex.test(v));
  }
}

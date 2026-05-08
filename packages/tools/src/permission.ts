import type { PermissionResult } from './types.js';
import { PermissionLevel } from './types.js';

export interface PermissionConfig {
  autoApproveSafe: boolean;
  allow?: string[];
  deny?: string[];
}

export class PermissionChecker {
  private config: PermissionConfig;
  private sessionApprovedTools = new Set<string>();

  constructor(config: PermissionConfig) {
    this.config = config;
  }

  async check(
    toolName: string,
    input: Record<string, unknown>,
    permissionLevel: PermissionLevel
  ): Promise<PermissionResult> {
    // Check deny list first
    if (this.config.deny) {
      for (const pattern of this.config.deny) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: false, reason: 'denied_by_rule' };
        }
      }
    }

    // Auto-approve safe tools
    if (permissionLevel === PermissionLevel.SAFE && this.config.autoApproveSafe) {
      return { approved: true };
    }

    // Check if tool was approved for this session
    if (this.sessionApprovedTools.has(toolName)) {
      return { approved: true };
    }

    // Check allow list - if tool matches any pattern, auto-approve
    if (this.config.allow) {
      for (const pattern of this.config.allow) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: true };
        }
      }
    }

    // For file operations, auto-approve by default
    if (['file_read', 'file_write', 'file_edit'].includes(toolName)) {
      return { approved: true };
    }

    // For bash commands, check if it's a common/safe command
    if (toolName === 'bash') {
      const command = String(input.command ?? '');
      // Auto-approve common commands
      const safeCommands = ['ls', 'dir', 'pwd', 'echo', 'cat', 'type', 'whoami', 'cd', 'mkdir', 'touch', 'cp', 'mv', 'find', 'tree', 'git', 'node', 'npm', 'pnpm', 'powershell'];
      const isSafe = safeCommands.some(cmd => command.trim().startsWith(cmd));
      if (isSafe) {
        return { approved: true };
      }
    }

    // For warn level, require confirmation
    if (permissionLevel === PermissionLevel.WARN) {
      return { approved: false, reason: 'requires_confirmation' };
    }

    // For unsafe level, require confirmation
    return { approved: false, reason: 'requires_confirmation' };
  }

  approve(toolName: string, input: Record<string, unknown>): void {
    this.sessionApprovedTools.add(toolName);
  }

  approveTool(toolName: string): void {
    this.sessionApprovedTools.add(toolName);
  }

  private matchesPattern(
    pattern: string,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    const match = pattern.match(/^(\w+)(?:\((.+)\))?$/);
    if (!match) return false;

    const [, patTool, patArg] = match;
    if (patTool !== toolName) return false;
    if (!patArg) return true;

    const inputValue = String(input.command ?? input.path ?? input.query ?? '');
    const regex = new RegExp('^' + patArg.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(inputValue);
  }
}

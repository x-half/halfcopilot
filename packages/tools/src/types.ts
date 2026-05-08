import type { ToolDef } from '@halfcopilot/provider';

export enum PermissionLevel {
  SAFE = 'safe',
  WARN = 'warn',
  UNSAFE = 'unsafe',
}

export interface ToolContext {
  projectRoot: string;
  workingDirectory: string;
  signal: AbortSignal;
  sessionId: string;
}

export interface ToolResult {
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Tool extends ToolDef {
  permissionLevel: PermissionLevel;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  toProviderFormat?(): ToolDef;
}

export interface PermissionResult {
  approved: boolean;
  reason?: string;
}

export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  file_read: PermissionLevel.SAFE,
  file_write: PermissionLevel.WARN,
  file_edit: PermissionLevel.WARN,
  bash: PermissionLevel.UNSAFE,
  grep: PermissionLevel.SAFE,
  glob: PermissionLevel.SAFE,
  list_files: PermissionLevel.SAFE,
};

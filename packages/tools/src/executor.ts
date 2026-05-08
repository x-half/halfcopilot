import type { ToolRegistry } from './registry.js';
import type { PermissionChecker } from './permission.js';
import type { ToolResult, ToolContext } from './types.js';
import { ToolError, PermissionError } from '@halfcopilot/shared';

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private permissions: PermissionChecker,
    private onApprovalNeeded?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>
  ) {}

  async execute(name: string, input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.registry.get(name);

    const permResult = await this.permissions.check(name, input, tool.permissionLevel);

    if (!permResult.approved) {
      if (permResult.reason === 'requires_confirmation' && this.onApprovalNeeded) {
        const userApproved = await this.onApprovalNeeded(name, input);
        if (!userApproved) {
          throw new PermissionError(name, 'User denied permission');
        }
        this.permissions.approve(name, input);
      } else {
        throw new PermissionError(name, permResult.reason ?? 'Permission denied');
      }
    }

    try {
      const result = await tool.execute(input, context);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return { output: error.message, error: error.message };
    }
  }
}

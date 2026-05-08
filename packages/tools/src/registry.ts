import type { ToolDef } from '@halfcopilot/provider';
import type { Tool, PermissionLevel } from './types.js';
import { ToolError } from '@halfcopilot/shared';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(name, `Tool "${name}" not found`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  definitions(): ToolDef[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  getByPermission(level: PermissionLevel): Tool[] {
    return Array.from(this.tools.values()).filter(t => t.permissionLevel === level);
  }
}

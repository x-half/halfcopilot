import type { Tool, ToolContext, ToolResult } from '../types.js';
import { PermissionLevel } from '../types.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createFileWriteTool(): Tool {
  return {
    name: 'file_write',
    description: 'Write content to a file, creating parent directories if needed',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
    permissionLevel: PermissionLevel.WARN,
    async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const { path, content } = input as { path: string; content: string };
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf-8');
        return { output: `Successfully wrote to ${path}` };
      } catch (err) {
        return { output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

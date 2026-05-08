import type { Tool, ToolContext, ToolResult } from '../types.js';
import { PermissionLevel } from '../types.js';
import { readFileSync, writeFileSync } from 'node:fs';

export function createFileEditTool(): Tool {
  return {
    name: 'file_edit',
    description: 'Replace an exact string in a file with a new string',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        oldText: { type: 'string', description: 'Exact text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    permissionLevel: PermissionLevel.WARN,
    async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const { path, oldText, newText, replaceAll } = input as {
        path: string;
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      };
      try {
        const content = readFileSync(path, 'utf-8');

        if (!content.includes(oldText)) {
          return { output: '', error: `Text not found in ${path}: "${oldText.slice(0, 50)}..."` };
        }

        let newContent: string;
        if (replaceAll) {
          newContent = content.split(oldText).join(newText);
        } else {
          const idx = content.indexOf(oldText);
          if (content.indexOf(oldText, idx + 1) !== -1) {
            return { output: '', error: `Multiple occurrences found in ${path}. Use replaceAll: true or provide more context.` };
          }
          newContent = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
        }

        writeFileSync(path, newContent, 'utf-8');
        return { output: `Successfully edited ${path}` };
      } catch (err) {
        return { output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

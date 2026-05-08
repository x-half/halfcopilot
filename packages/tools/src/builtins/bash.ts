import type { Tool, ToolContext, ToolResult } from '../types.js';
import { PermissionLevel } from '../types.js';
import { exec } from 'node:child_process';

export function createBashTool(): Tool {
  return {
    name: 'bash',
    description: 'Execute a bash command and return its output',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['command'],
    },
    permissionLevel: PermissionLevel.UNSAFE,
    async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 120000, cwd } = input as {
        command: string;
        timeout?: number;
        cwd?: string;
      };
      return new Promise((resolve) => {
        exec(command, { timeout, cwd: cwd ?? context.workingDirectory, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error) {
            output += (output ? '\n' : '') + `Exit code: ${error.code ?? 1}`;
            resolve({ output, error: output });
          } else {
            resolve({ output: output || '(no output)' });
          }
        });
      });
    },
  };
}

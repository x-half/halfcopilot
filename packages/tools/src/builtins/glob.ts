import { z } from "zod";
import { exec } from "node:child_process";
import { resolve } from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  pattern: z
    .string()
    .describe("Glob pattern to match files against (e.g., '**/*.ts', 'src/**/*.{ts,tsx}', '*.json')"),
  path: z
    .string()
    .optional()
    .describe("Base directory to search in (default: project root)"),
  absolute: z
    .boolean()
    .optional()
    .describe("Return absolute paths (default: false, returns relative paths)"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(200)
    .describe("Maximum number of results to return (default: 200)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  const searchPath = input.path
    ? resolve(context.workingDirectory, input.path)
    : context.workingDirectory;

  const cmd = `find "${searchPath}" -type f -name "${input.pattern}" 2>/dev/null | sort | head -${input.maxResults}`;

  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      const output = stdout.trim() || "(no files found)";
      resolve({ output });
    });
  });
}

export function createGlobTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "glob",
    description:
      "Find files matching a glob pattern using the filesystem. Supports wildcards and recursive patterns like '**/*.ts'. Returns sorted file paths. Use to discover project structure, find specific file types, or locate configuration files.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts)" },
        path: { type: "string", description: "Base directory to search in" },
      },
      required: ["pattern"],
    },
    zodSchema: schema,
    permissionLevel: PermissionLevel.SAFE,
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      return executeFn(schema.parse(input), context);
    },
  };

  return {
    ...base,
    toLangChain() {
      return tool(
        async (input: z.infer<typeof schema>) => {
          const result = await executeFn(input, {
            projectRoot: "",
            workingDirectory: "",
            signal: new AbortController().signal,
            sessionId: "",
          } as ToolContext);
          return result.output;
        },
        {
          name: base.name,
          description: base.description,
          schema,
        },
      );
    },
  };
}

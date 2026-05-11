import { z } from "zod";
import { exec } from "node:child_process";
import { resolve } from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  pattern: z
    .string()
    .describe("Regex pattern to search for in file contents"),
  path: z
    .string()
    .optional()
    .describe("Directory or file path to search in (default: project root)"),
  glob: z
    .string()
    .optional()
    .describe("File glob pattern to filter which files to search (e.g., '*.ts' or 'src/**/*.ts')"),
  ignoreCase: z
    .boolean()
    .optional()
    .describe("Perform case-insensitive search (default: false)"),
  includeLineNumbers: z
    .boolean()
    .optional()
    .describe("Include line numbers in output (default: true)"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(100)
    .describe("Maximum number of results to return (default: 100)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  const searchPath = input.path
    ? resolve(context.workingDirectory, input.path)
    : context.workingDirectory;

  const parts = ["rg", "-n", input.pattern, searchPath];
  if (input.ignoreCase) parts.push("-i");
  if (input.glob) parts.push("-g", input.glob);

  const cmd = parts.join(" ") + ` | head -${input.maxResults}`;

  return new Promise((resolve) => {
    exec(
      cmd,
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!input.includeLineNumbers && stdout) {
          const cleaned = stdout.replace(/^[^:]+:\d+:/gm, (m) => m.replace(/:\d+:/, ":"));
          return resolve({ output: cleaned });
        }
        if (stdout) return resolve({ output: stdout });
        if (error && !stderr) {
          return resolve({ output: "(no matches found)" });
        }
        resolve({ output: "(no matches found)" });
      },
    );
  });
}

export function createGrepTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "grep",
    description:
      "Search file contents using ripgrep (rg) with regex pattern matching. Returns matching lines with file names and line numbers. Supports case-insensitive search, file type filtering via glob patterns, and result limiting. Fast for searching large codebases.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in" },
        glob: { type: "string", description: "File glob pattern to filter" },
        ignoreCase: { type: "boolean", description: "Case insensitive search" },
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

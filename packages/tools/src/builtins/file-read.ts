import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  path: z.string().describe("Absolute or relative path to the file to read"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Line number to start reading from (1-indexed, default: 1)"),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of lines to return (default: all)"),
  showLineNumbers: z
    .boolean()
    .optional()
    .describe("Prepend each line with its line number"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  const absPath = resolve(context.workingDirectory, input.path);
  const content = await readFile(absPath, "utf-8");
  const lines = content.split("\n");

  const offset = input.offset ?? 1;
  const limit = input.limit;
  const start = Math.max(0, offset - 1);
  const end = limit ? start + limit : undefined;
  const selected = lines.slice(start, end);

  const result = input.showLineNumbers
    ? selected.map((l, i) => `${start + i + 1}:${l}`).join("\n")
    : selected.join("\n");

  const total = lines.length;
  const returned = selected.length;
  const meta = `File: ${absPath} (${total} lines, showing ${returned})`;
  const output = returned < total
    ? `${result}\n[${meta}]`
    : result;

  return { output: output || "(empty file)" };
}

export function createFileReadTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "file_read",
    description:
      "Read a file from the local filesystem. Returns file contents with optional line-number prefix. Use offset and limit to read specific sections of large files. Always use absolute paths or paths relative to the project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the file" },
        offset: { type: "number", description: "Line offset to start from (1-indexed)" },
        limit: { type: "number", description: "Max lines to return" },
        showLineNumbers: { type: "boolean", description: "Show line numbers" },
      },
      required: ["path"],
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

import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { readFile } from "node:fs/promises";

export function createFileReadTool(): Tool {
  return {
    name: "file_read",
    description: "Read the contents of a file at the given path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        offset: {
          type: "number",
          description: "Line offset to start reading from",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read",
        },
        showLineNumbers: { type: "boolean", description: "Show line numbers" },
      },
      required: ["path"],
    },
    permissionLevel: PermissionLevel.SAFE,
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const { path, offset, limit, showLineNumbers } = input as {
        path: string;
        offset?: number;
        limit?: number;
        showLineNumbers?: boolean;
      };
      try {
        const content = await readFile(path, "utf-8");
        let lines = content.split("\n");

        if (offset !== undefined) lines = lines.slice(offset);
        if (limit !== undefined) lines = lines.slice(0, limit);

        if (showLineNumbers) {
          const startLine = (offset ?? 0) + 1;
          return {
            output: lines
              .map((line, i) => `${startLine + i}\t${line}`)
              .join("\n"),
          };
        }
        return { output: lines.join("\n") };
      } catch (err) {
        return {
          output: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";

export function createGlobTool(): Tool {
  return {
    name: "glob",
    description: "Find files matching a glob pattern",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts)" },
        path: { type: "string", description: "Base directory to search in" },
      },
      required: ["pattern"],
    },
    permissionLevel: PermissionLevel.SAFE,
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const { pattern, path = "." } = input as {
        pattern: string;
        path?: string;
      };

      try {
        const { glob } = await import("node:fs/promises");
        const entries: string[] = [];

        for await (const entry of glob(pattern, {
          cwd: path,
          withFileTypes: false,
        })) {
          entries.push(entry as string);
        }

        if (entries.length === 0)
          return { output: "No files found matching pattern" };
        return { output: entries.join("\n") };
      } catch (err) {
        return {
          output: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

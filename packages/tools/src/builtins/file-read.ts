import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { readFile } from "node:fs/promises";
import { resolve, isAbsolute, relative } from "node:path";

const PROTECTED_PATHS = [
  "/etc",
  "/System",
  "/usr",
  "/var",
  "/boot",
  "/sys",
  "/proc",
  "/dev",
];

function isPathSafe(targetPath: string, projectRoot: string): boolean {
  try {
    const resolved = resolve(projectRoot, targetPath);
    const rootResolved = resolve(projectRoot);

    if (!resolved.startsWith(rootResolved)) {
      return false;
    }

    for (const protectedPath of PROTECTED_PATHS) {
      if (resolved.startsWith(protectedPath)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

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

      if (!isAbsolute(path)) {
        return {
          output: "",
          error: "Path must be absolute",
        };
      }

      if (!isPathSafe(path, context.projectRoot)) {
        return {
          output: "",
          error: `Access to path outside project root is not allowed: ${path}`,
        };
      }

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

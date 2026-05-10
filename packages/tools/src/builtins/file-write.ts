import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";

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

export function createFileWriteTool(): Tool {
  return {
    name: "file_write",
    description:
      "Write content to a file, creating parent directories if needed",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
    permissionLevel: PermissionLevel.WARN,
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const { path, content } = input as { path: string; content: string };

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
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
        return { output: `Successfully wrote to ${path}` };
      } catch (err) {
        return {
          output: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { execSync } from "node:child_process";

export function createGrepTool(): Tool {
  return {
    name: "grep",
    description: "Search for a pattern in files using ripgrep or grep",
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
    permissionLevel: PermissionLevel.SAFE,
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const {
        pattern,
        path = ".",
        glob,
        ignoreCase,
      } = input as {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
      };

      let cmd = "grep";
      try {
        execSync("which rg", { stdio: "ignore" });
        cmd = "rg";
      } catch {
        /* fallback to grep */
      }

      const args: string[] = [];
      if (cmd === "rg") {
        args.push("--no-heading", "-n");
        if (ignoreCase) args.push("-i");
        if (glob) args.push("--glob", glob);
        args.push("--", pattern, path);
      } else {
        args.push("-n");
        if (ignoreCase) args.push("-i");
        if (glob) args.push("--include", glob);
        args.push("-r", "--", pattern, path);
      }

      try {
        const result = execSync(
          `${cmd} ${args.map((a) => `'${a}'`).join(" ")}`,
          {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000,
          },
        );
        return { output: result.slice(0, 50000) || "No matches found" };
      } catch (err: unknown) {
        const execErr = err as { status?: number; message?: string };
        if (execErr.status === 1) return { output: "No matches found" };
        return { output: "", error: execErr.message ?? String(err) };
      }
    },
  };
}

import { z } from "zod";
import { exec } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  command: z
    .string()
    .describe("The bash command to execute. Use full commands with proper escaping."),
  timeout: z
    .number()
    .int()
    .min(1000)
    .optional()
    .default(120000)
    .describe("Timeout in milliseconds (default: 120000)"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory to run the command in (default: project root)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    exec(
      input.command,
      {
        timeout: input.timeout,
        cwd: input.cwd ?? context.workingDirectory,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += stdout;
        if (stderr) {
          output += (output ? "\n" : "") + stderr;
        }
        if (error) {
          const code = error.code ?? 1;
          output += (output ? "\n" : "") + `Exit code: ${code}`;
          resolve({ output, error: output });
        } else {
          resolve({ output: output || "(no output)" });
        }
      },
    );
  });
}

export function createBashTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "bash",
    description:
      "Execute a bash command in the shell and return its combined stdout and stderr output. Use for running scripts, compiling code, managing processes, git operations, package management, and any other terminal commands. The command runs with a default timeout of 120 seconds. For long-running commands, adjust the timeout parameter.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 120000)" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["command"],
    },
    zodSchema: schema,
    permissionLevel: PermissionLevel.UNSAFE,
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

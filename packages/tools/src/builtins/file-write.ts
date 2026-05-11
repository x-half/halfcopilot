import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  path: z.string().describe("Absolute path to the file to write"),
  content: z.string().describe("Content to write to the file"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  const absPath = resolve(context.workingDirectory, input.path);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, input.content, "utf-8");
  return { output: `File written: ${absPath} (${input.content.length} chars)` };
}

export function createFileWriteTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "file_write",
    description:
      "Write content to a file, creating parent directories if they don't exist. If the file already exists, it will be overwritten. Use for creating new files or replacing entire file contents. For partial edits, use file_edit instead.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
    zodSchema: schema,
    permissionLevel: PermissionLevel.WARN,
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

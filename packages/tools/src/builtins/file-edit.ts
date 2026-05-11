import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  path: z.string().describe("Absolute path to the file to edit"),
  oldText: z
    .string()
    .describe("Exact text string to find and replace (case-sensitive)"),
  newText: z
    .string()
    .describe("Replacement text that will replace oldText"),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace all occurrences (default: false, only first occurrence)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  context: ToolContext,
): Promise<ToolResult> {
  const absPath = resolve(context.workingDirectory, input.path);
  const content = await readFile(absPath, "utf-8");

  const { oldText, newText, replaceAll } = input;

  if (!content.includes(oldText)) {
    return {
      output: "",
      error: `String not found in file: "${oldText.substring(0, 100)}"`,
    };
  }

  const result = replaceAll
    ? content.replaceAll(oldText, newText)
    : content.replace(oldText, newText);

  const count = replaceAll
    ? (content.match(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
    : 1;

  await writeFile(absPath, result, "utf-8");
  return {
    output: `File updated: ${absPath} (${count} replacement${count > 1 ? "s" : ""})`,
  };
}

export function createFileEditTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "file_edit",
    description:
      "Replace a specific text string in a file with new text. Uses exact string matching (not regex). By default only replaces the first occurrence; use replaceAll=true for all occurrences. Best for targeted edits to existing files without rewriting the entire file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        oldText: { type: "string", description: "Exact text to find and replace" },
        newText: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace all occurrences" },
      },
      required: ["path", "oldText", "newText"],
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

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  query: z.string().describe("Search query string"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of search results to return (default: 5)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  _context: ToolContext,
): Promise<ToolResult> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "HalfCopilot/1.0" },
    });
    if (!res.ok) {
      return { output: "", error: `Search failed: ${res.status}` };
    }
    const data = await res.json() as any;
    const lines: string[] = [];

    // Abstract / Description
    if (data.AbstractText) {
      lines.push(`Summary: ${data.AbstractText}`);
      if (data.AbstractSource) lines.push(`Source: ${data.AbstractSource}`);
    }

    // Related topics as search results
    const results = (data.Results ?? []).slice(0, input.maxResults);
    for (const r of results) {
      const title = r.Text ?? r.FirstURL ?? "(no title)";
      const link = r.FirstURL ?? "";
      lines.push(`- ${title}${link ? ` (${link})` : ""}`);
    }

    // Fallback if empty
    if (lines.length === 0) {
      const fallback = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1`;
      const fRes = await fetch(fallback, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "HalfCopilot/1.0" },
      });
      const fData = await fRes.json() as any;
      if (fData.AbstractText) {
        lines.push(`Summary: ${fData.AbstractText}`);
      }
      if (fData.RelatedTopics) {
        for (const t of fData.RelatedTopics.slice(0, input.maxResults)) {
          if (t.Text) lines.push(`- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
        }
      }
    }

    if (lines.length === 0) lines.push("(no search results found)");
    return { output: lines.join("\n") };
  } catch (err) {
    return {
      output: "",
      error: `Search error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createWebSearchTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "web_search",
    description:
      "Search the web for current information using DuckDuckGo. Returns summaries and links. Use for news, facts, documentation lookups, and any query that requires up-to-date information beyond the model's training data.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results (1-10, default 5)" },
      },
      required: ["query"],
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
          const result = await executeFn(input, {} as ToolContext);
          return result.output || result.error || "(no result)";
        },
        { name: base.name, description: base.description, schema },
      );
    },
  };
}

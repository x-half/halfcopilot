import { z } from "zod";
import { get } from "node:https";
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

function httpsGet(url: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { "User-Agent": "HalfCopilot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function executeFn(
  input: z.infer<typeof schema>,
  _context: ToolContext,
): Promise<ToolResult> {
  // Try DuckDuckGo Instant Answer API
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`;
    const text = await httpsGet(url, 10000);
    const data = JSON.parse(text) as any;
    const lines: string[] = [];

    if (data.AbstractText) {
      lines.push(`Summary: ${data.AbstractText}`);
      if (data.AbstractSource) lines.push(`Source: ${data.AbstractSource}`);
    }

    const results = (data.Results ?? []).slice(0, input.maxResults);
    for (const r of results) {
      lines.push(`- ${r.Text ?? ""}${r.FirstURL ? ` (${r.FirstURL})` : ""}`);
    }

    if (lines.length === 0) {
      // Fallback: try RelatedTopics
      if (data.RelatedTopics) {
        for (const t of data.RelatedTopics.slice(0, input.maxResults)) {
          if (t.Text) lines.push(`- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
        }
      }
    }

    if (lines.length === 0) lines.push("(no search results found)");
    return { output: lines.join("\n") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      output: "",
      error: `Web search unavailable: ${msg}. The DuckDuckGo API may be blocked in your network.`,
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

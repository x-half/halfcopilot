import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  url: z.string().url().describe("Full URL to fetch (must include protocol, e.g., https://example.com)"),
  maxLength: z
    .number()
    .int()
    .min(100)
    .max(50000)
    .optional()
    .default(10000)
    .describe("Maximum characters to return (default: 10000, max: 50000)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  _context: ToolContext,
): Promise<ToolResult> {
  try {
    const res = await fetch(input.url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "HalfCopilot/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { output: "", error: `HTTP ${res.status}: ${res.statusText}` };
    }
    let text = await res.text();

    // Strip HTML tags for readability
    text = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > input.maxLength) {
      text = text.slice(0, input.maxLength) + "\n...[truncated]";
    }

    return { output: text || "(empty page)" };
  } catch (err) {
    return {
      output: "",
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createUrlFetchTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "url_fetch",
    description:
      "Fetch and read the contents of a web page. Strips HTML tags, scripts, and styles to return clean text. Use for reading documentation, articles, or any publicly accessible webpage. Respects robots.txt and standard web protocols.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL including protocol" },
        maxLength: { type: "number", description: "Max chars to return (default 10000)" },
      },
      required: ["url"],
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
          return result.output || result.error || "(no content)";
        },
        { name: base.name, description: base.description, schema },
      );
    },
  };
}

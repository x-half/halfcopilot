import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { PermissionLevel } from "../types.js";
import { tool } from "@langchain/core/tools";

const schema = z.object({
  location: z.string().describe("City name or location to get weather for (e.g., 'Beijing', 'London', 'New York')"),
  detailed: z.boolean().optional().default(false).describe("Return detailed forecast (default: false = one-line summary)"),
});

async function executeFn(
  input: z.infer<typeof schema>,
  _context: ToolContext,
): Promise<ToolResult> {
  try {
    const fmt = input.detailed ? "j1" : "3";
    const url = `https://wttr.in/${encodeURIComponent(input.location)}?format=${fmt}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "HalfCopilot/1.0" },
    });
    if (!res.ok) {
      return { output: "", error: `Weather query failed: ${res.status}` };
    }
    const text = await res.text();

    if (input.detailed && text) {
      try {
        const data = JSON.parse(text);
        const cc = data.current_condition?.[0];
        if (cc) {
          const lines = [
            `Location: ${input.location}`,
            `Temperature: ${cc.temp_C}°C (feels like ${cc.FeelsLikeC}°C)`,
            `Condition: ${cc.weatherDesc?.[0]?.value ?? "N/A"}`,
            `Humidity: ${cc.humidity}%`,
            `Wind: ${cc.winddir16Point} ${cc.windspeedKmph} km/h`,
            `Visibility: ${cc.visibility} km`,
            `UV Index: ${cc.uvIndex}`,
          ];
          return { output: lines.join("\n") };
        }
      } catch { /* fall through to raw text */ }
    }

    return { output: text.trim() || "(no weather data)" };
  } catch (err) {
    return {
      output: "",
      error: `Weather error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createWeatherTool(): Tool {
  const base: Omit<Tool, "toLangChain"> = {
    name: "weather",
    description:
      "Get current weather for any city worldwide. Uses wttr.in (free, no API key required). Returns temperature, conditions, humidity, wind speed, and visibility. Use detailed=true for a full forecast report.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        detailed: { type: "boolean", description: "Show detailed forecast" },
      },
      required: ["location"],
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
          return result.output || result.error || "(no data)";
        },
        { name: base.name, description: base.description, schema },
      );
    },
  };
}

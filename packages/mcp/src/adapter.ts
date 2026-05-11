import { z } from "zod";
import { tool } from "@langchain/core/tools";
import type {
  Tool,
  ToolContext,
  ToolResult,
  PermissionLevel,
} from "@halfcopilot/tools";
import { PermissionLevel as PL } from "@halfcopilot/tools";
import type { MCPToolDefinition, MCPToolResult } from "./types.js";
import type { MCPClientManager } from "./client.js";
import type { DynamicStructuredTool } from "@langchain/core/tools";

export class MCPToolAdapter implements Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  zodSchema: z.ZodObject<any>;
  permissionLevel: PermissionLevel;

  private serverName: string;
  private manager: MCPClientManager;

  constructor(
    serverName: string,
    toolDef: MCPToolDefinition,
    manager: MCPClientManager,
  ) {
    this.name = `${serverName}__${toolDef.name}`;
    this.description = toolDef.description ?? `MCP tool from ${serverName}`;
    this.inputSchema = toolDef.inputSchema;
    this.zodSchema = z.object({});
    this.permissionLevel = PL.UNSAFE;
    this.serverName = serverName;
    this.manager = manager;
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    try {
      const originalName = this.name.replace(`${this.serverName}__`, "");
      const result = await this.manager.callTool(this.serverName, {
        name: originalName,
        arguments: input,
      });

      const output = result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");

      return {
        output,
        error: result.isError ? output : undefined,
      };
    } catch (err) {
      return {
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  toLangChain(): DynamicStructuredTool {
    return tool(
      async (_input: Record<string, unknown>) => {
        const result = await this.execute(_input, {
          projectRoot: "",
          workingDirectory: "",
          signal: new AbortController().signal,
          sessionId: "",
        } as ToolContext);
        return result.output;
      },
      {
        name: this.name,
        description: this.description,
        schema: this.zodSchema,
      },
    );
  }
}

export function createMCPTools(
  serverName: string,
  toolDefs: MCPToolDefinition[],
  manager: MCPClientManager,
): Tool[] {
  return toolDefs.map((def) => new MCPToolAdapter(serverName, def, manager));
}

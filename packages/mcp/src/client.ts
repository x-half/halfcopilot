import type {
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceContent,
  JSONRPCRequest,
} from "./types.js";
import {
  createTransport,
  type MCPTransport,
  type MCPTransportConfig,
} from "./transport.js";

export class MCPClient {
  private transport: MCPTransport;
  private requestId = 0;
  private timeout: number;
  private lastActivity = Date.now();
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(transportConfig: MCPTransportConfig) {
    this.timeout = transportConfig.timeout ?? 30000;
    this.transport = createTransport(transportConfig);
    this.transport.onMessage((message) => {
      this.lastActivity = Date.now();
      if ("id" in message && message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if ("error" in message && message.error) {
            pending.reject(new Error(message.error.message));
          } else if ("result" in message) {
            pending.resolve(message.result);
          }
        }
      }
    });
  }

  getLastActivity(): number {
    return this.lastActivity;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    await this.initialize();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.request("tools/list", {});
    return (result as { tools: MCPToolDefinition[] }).tools ?? [];
  }

  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    const result = await this.request("tools/call", {
      name: call.name,
      arguments: call.arguments ?? {},
    });
    return result as MCPToolResult;
  }

  async listResources(): Promise<MCPResource[]> {
    const result = await this.request("resources/list", {});
    return (result as { resources: MCPResource[] }).resources ?? [];
  }

  async readResource(uri: string): Promise<MCPResourceContent> {
    const result = await this.request("resources/read", { uri });
    return result as MCPResourceContent;
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: "halfcopilot",
        version: "0.0.1",
      },
    });

    // Send initialized notification
    this.notify("notifications/initialized", {});
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.transport.send(request).catch(reject);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, this.timeout);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.transport
      .send({
        jsonrpc: "2.0",
        method,
        params,
      })
      .catch(() => {});
  }
}

export class MCPClientManager {
  private clients = new Map<string, MCPClient>();

  async addServer(name: string, config: MCPTransportConfig): Promise<void> {
    const client = new MCPClient(config);
    await client.connect();
    this.clients.set(name, client);
  }

  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  listServers(): string[] {
    return Array.from(this.clients.keys());
  }

  async listAllTools(): Promise<
    Array<{ server: string; tool: MCPToolDefinition }>
  > {
    const result: Array<{ server: string; tool: MCPToolDefinition }> = [];

    for (const [name, client] of this.clients) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          for (const tool of tools) {
            result.push({ server: name, tool });
          }
        } catch {
          // Skip failed servers
        }
      }
    }

    return result;
  }

  async callTool(
    serverName: string,
    toolCall: MCPToolCall,
  ): Promise<MCPToolResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" not found`);
    }
    return client.callTool(toolCall);
  }
}

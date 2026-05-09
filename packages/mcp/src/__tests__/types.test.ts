import { describe, it, expect } from "vitest";
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceContent,
  JSONRPCMessage,
  MCPTransportConfig,
} from "../types.js";

describe("MCP Types", () => {
  it("should create a valid MCPTransportConfig for stdio", () => {
    const config: MCPTransportConfig = {
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { KEY: "val" },
    };
    expect(config.type).toBe("stdio");
    expect(config.command).toBe("node");
  });

  it("should create a valid MCPTransportConfig for sse", () => {
    const config: MCPTransportConfig = {
      type: "sse",
      url: "https://example.com/sse",
    };
    expect(config.type).toBe("sse");
  });

  it("should create a valid MCPServerConfig", () => {
    const config: MCPServerConfig = {
      name: "test-server",
      transport: { type: "stdio", command: "echo" },
    };
    expect(config.name).toBe("test-server");
  });

  it("should create a valid MCPToolDefinition", () => {
    const def: MCPToolDefinition = {
      name: "my-tool",
      description: "A test tool",
      inputSchema: { type: "object", properties: {} },
    };
    expect(def.name).toBe("my-tool");
  });

  it("should create a valid MCPToolCall", () => {
    const call: MCPToolCall = {
      name: "my-tool",
      arguments: { arg1: "value" },
    };
    expect(call.arguments?.arg1).toBe("value");
  });

  it("should create a valid MCPToolResult", () => {
    const result: MCPToolResult = {
      content: [{ type: "text", text: "output" }],
      isError: false,
    };
    expect(result.content[0].type).toBe("text");
    expect(result.isError).toBe(false);
  });

  it("should create a valid MCPResource", () => {
    const resource: MCPResource = {
      uri: "file:///tmp/data",
      name: "Data",
      mimeType: "text/plain",
    };
    expect(resource.uri).toBe("file:///tmp/data");
  });

  it("should create a valid MCPResourceContent", () => {
    const content: MCPResourceContent = {
      uri: "file:///tmp/data",
      text: "content",
    };
    expect(content.text).toBe("content");
  });

  describe("JSONRPCMessage", () => {
    it("should create a valid JSON-RPC request", () => {
      const msg: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      };
      expect(msg.jsonrpc).toBe("2.0");
    });

    it("should create a valid JSON-RPC response", () => {
      const msg: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [] },
      };
      expect("result" in msg).toBe(true);
    });

    it("should create a valid JSON-RPC notification", () => {
      const msg: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };
      expect("id" in msg).toBe(false);
    });

    it("should create a valid JSON-RPC error response", () => {
      const msg: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not found" },
      };
      if ("error" in msg) {
        expect(msg.error?.code).toBe(-32601);
      }
    });
  });
});

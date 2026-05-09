import type { JSONRPCMessage } from "./types.js";
import { spawn, type ChildProcess } from "node:child_process";

export interface MCPTransportConfig {
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeout?: number;
}

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  onMessage(handler: (message: JSONRPCMessage) => void): void;
  onClose(handler: () => void): void;
  isConnected(): boolean;
}

export class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null;
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private buffer = "";
  private config: MCPTransportConfig;

  constructor(config: MCPTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error("stdio transport requires a command");
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command!, this.config.args ?? [], {
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.on("error", (err) => {
        reject(err);
      });

      this.process.on("close", () => {
        this.closeHandler?.();
      });

      // Give the process a moment to start
      setTimeout(() => resolve(), 100);
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error("Not connected");
    }

    const data = JSON.stringify(message) + "\n";
    this.process.stdin.write(data);
  }

  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  isConnected(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as JSONRPCMessage;
          this.messageHandler?.(message);
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

export class SSETransport implements MCPTransport {
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private messageUrl: string | null = null;
  private connected = false;
  private disconnecting = false;
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private config: MCPTransportConfig;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  constructor(config: MCPTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error("SSE transport requires a URL");
    }
    this.disconnecting = false;
    this.reconnectAttempts = 0;
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (this.reconnectAttempts <= this.maxReconnectAttempts) {
      if (this.disconnecting) {
        throw new Error("Disconnected by user");
      }
      try {
        await this.doConnect();
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
          this.connected = false;
          this.closeHandler?.();
          throw err;
        }
        const delay = Math.min(
          1000 * Math.pow(2, this.reconnectAttempts - 1),
          10000,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async doConnect(): Promise<void> {
    if (this.disconnecting) throw new Error("Disconnected by user");

    this.abortController = new AbortController();
    const response = await fetch(this.config.url!, {
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connect failed: ${response.status}`);
    }
    if (!response.body) {
      throw new Error("Response body is null");
    }

    this.connected = true;
    this.reader = response.body.getReader();
    this.handleSseStream().catch(() => {
      if (this.connected) {
        this.connected = false;
        this.reconnectAttempts = 0;
        this.connectWithRetry().catch(() => this.closeHandler?.());
      }
    });
  }

  private async handleSseStream(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (this.reader) {
      const { done, value } = await this.reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (event.trim()) {
          this.parseSseEvent(event);
        }
      }
    }
  }

  private parseSseEvent(event: string): void {
    let eventType = "message";
    let data = "";

    for (const line of event.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (eventType === "endpoint" && data) {
      this.messageUrl = data;
      return;
    }

    if (data) {
      try {
        const message = JSON.parse(data) as JSONRPCMessage;
        this.messageHandler?.(message);
      } catch {
        // Ignore parse errors
      }
    }
  }

  async disconnect(): Promise<void> {
    this.disconnecting = true;
    this.connected = false;
    this.abortController?.abort();
    this.abortController = null;
    this.reader = null;
    this.messageUrl = null;
    this.reconnectAttempts = 0;
    this.closeHandler?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const targetUrl = this.messageUrl ?? this.config.url;
    if (!targetUrl) {
      throw new Error("SSE transport not connected");
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`send failed: ${response.status}`);
    }
  }

  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export function createTransport(config: MCPTransportConfig): MCPTransport {
  if (config.type === "stdio") {
    return new StdioTransport(config);
  }
  return new SSETransport(config);
}

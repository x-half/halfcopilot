import type { JSONRPCMessage } from './types.js';
import { spawn, type ChildProcess } from 'node:child_process';

export interface MCPTransportConfig {
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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
  private buffer = '';
  private config: MCPTransportConfig;

  constructor(config: MCPTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error('stdio transport requires a command');
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command!, this.config.args ?? [], {
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.on('error', (err) => {
        reject(err);
      });

      this.process.on('close', () => {
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
      throw new Error('Not connected');
    }

    const data = JSON.stringify(message) + '\n';
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
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

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
  private connected = false;
  private messageHandler: ((message: JSONRPCMessage) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private config: MCPTransportConfig;
  private eventSource: EventSource | null = null;

  constructor(config: MCPTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error('SSE transport requires a URL');
    }

    // In Node.js environment, we'll use fetch for SSE
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.closeHandler?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.config.url) {
      throw new Error('SSE transport requires a URL');
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`SSE request failed: ${response.status}`);
    }

    const result = await response.json();
    this.messageHandler?.(result as JSONRPCMessage);
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
  if (config.type === 'stdio') {
    return new StdioTransport(config);
  }
  return new SSETransport(config);
}

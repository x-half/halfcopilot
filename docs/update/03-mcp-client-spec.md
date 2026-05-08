# MCP 客户端规格

> Model Context Protocol (MCP) 客户端允许 HalfCopilot 动态连接外部工具服务器，
> 扩展内置工具集。本文档定义传输协议、生命周期管理和工具注册机制。

---

## 1. MCP 协议概述

MCP 是一个 JSON-RPC 2.0 协议，允许客户端（HalfCopilot）与服务器（MCP Server）通信，
动态发现和调用工具。HalfCopilot 作为 MCP Client 实现。

### 1.1 核心概念

```
HalfCopilot (MCP Client)
    │
    ├── stdio transport ──→ MCP Server A (本地进程)
    ├── SSE transport ──→ MCP Server B (远程 HTTP)
    └── stdio transport ──→ MCP Server C (本地进程)
```

### 1.2 能力范围

- **工具发现**：列出服务器提供的工具
- **工具调用**：调用服务器上的工具并获取结果
- **资源列表**：列出服务器提供的资源（可选，V1 不实现）
- **Prompt 列表**：列出服务器提供的 prompt 模板（可选，V1 不实现）

V1 只实现**工具发现**和**工具调用**。

---

## 2. 传输层

### 2.1 Stdio 传输

```typescript
interface StdioTransportConfig {
  type: 'stdio';
  command: string;       // 启动命令，如 'npx'
  args: string[];        // 参数，如 ['-y', '@modelcontextprotocol/server-filesystem']
  env?: Record<string, string>;  // 环境变量
  cwd?: string;          // 工作目录
}

class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pending: Map<number, { resolve: Function; reject: Function }> = new Map();

  async connect(config: StdioTransportConfig): Promise<void> {
    this.process = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      cwd: config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 读取 stdout，按行解析 JSON-RPC 响应
    this.process.stdout!.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.handleMessage(JSON.parse(line));
      }
    });

    // stderr 日志转发
    this.process.stderr!.on('data', (data) => {
      logger.debug(`MCP server stderr: ${data}`);
    });

    // 发送 initialize 请求
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'halfcopilot', version: '0.1.0' },
    });

    // 发送 initialized 通知
    this.notify('notifications/initialized', {});
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.messageId;
    const message = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(message) + '\n');

      // 超时处理
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  notify(method: string, params: unknown): void {
    const message = { jsonrpc: '2.0', method, params };
    this.process!.stdin!.write(JSON.stringify(message) + '\n');
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        this.process!.on('exit', () => resolve());
        setTimeout(() => {
          this.process!.kill('SIGKILL');
          resolve();
        }, 5000);
      });
      this.process = null;
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ('id' in message && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if ('error' in message) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }
}
```

### 2.2 SSE 传输

```typescript
interface SSETransportConfig {
  type: 'sse';
  url: string;           // 服务器 URL
  headers?: Record<string, string>;  // 自定义请求头（如认证）
}

class SSETransport implements MCPTransport {
  private eventSource: EventSource | null = null;
  private messageId = 0;
  private pending: Map<number, { resolve: Function; reject: Function }> = new Map();
  private postEndpoint: string = '';

  async connect(config: SSETransportConfig): Promise<void> {
    // 1. 建立 SSE 连接
    this.eventSource = new EventSource(config.url, {
      headers: config.headers,
    });

    // 2. 等待 endpoint 事件获取 POST URL
    this.postEndpoint = await new Promise((resolve) => {
      this.eventSource!.addEventListener('endpoint', (event) => {
        resolve(new URL(event.data, config.url).href);
      });
    });

    // 3. 监听消息
    this.eventSource.addEventListener('message', (event) => {
      this.handleMessage(JSON.parse(event.data));
    });

    // 4. 初始化
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'halfcopilot', version: '0.1.0' },
    });

    this.notify('notifications/initialized', {});
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.messageId;
    const message = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      fetch(this.postEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  // ... notify, disconnect, handleMessage 类似 StdioTransport
}
```

---

## 3. MCP 客户端管理器

### 3.1 服务配置

```typescript
interface MCPServerConfig {
  name: string;                    // 唯一标识符
  transport: StdioTransportConfig | SSETransportConfig;
  enabled: boolean;                // 是否启用
  autoStart: boolean;              // 是否自动启动
  timeout: number;                 // 工具调用超时(ms)，默认 60000
  retryOnFailure: boolean;         // 连接失败时是否重试
  maxRetries: number;              // 最大重试次数，默认 3
}

// 在 .halfcopilot/config.yaml 中配置
const exampleConfig = {
  mcpServers: {
    'filesystem': {
      name: 'filesystem',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
      },
      enabled: true,
      autoStart: true,
      timeout: 30000,
      retryOnFailure: true,
      maxRetries: 3,
    },
    'remote-api': {
      name: 'remote-api',
      transport: {
        type: 'sse',
        url: 'http://localhost:3001/sse',
        headers: { 'Authorization': 'Bearer xxx' },
      },
      enabled: true,
      autoStart: false,
      timeout: 60000,
      retryOnFailure: true,
      maxRetries: 3,
    },
  },
};
```

### 3.2 MCP 客户端管理器

```typescript
interface MCPToolInfo {
  serverName: string;
  toolName: string;       // 原始工具名
  qualifiedName: string;  // 限定名：serverName__toolName（避免冲突）
  description: string;
  inputSchema: Record<string, unknown>;
}

class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();
  private toolRegistry: Map<string, MCPToolInfo> = new Map();

  async startServer(name: string, config: MCPServerConfig): Promise<void> {
    const transport = this.createTransport(config.transport);
    const client = new MCPClient(transport, config);
    await client.connect();

    // 发现工具
    const tools = await client.listTools();
    for (const tool of tools) {
      const qualifiedName = `${name}__${tool.name}`;
      this.toolRegistry.set(qualifiedName, {
        serverName: name,
        toolName: tool.name,
        qualifiedName,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }

    this.clients.set(name, client);
  }

  async stopServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
      // 移除该服务器的所有工具
      for (const [key, info] of this.toolRegistry) {
        if (info.serverName === name) {
          this.toolRegistry.delete(key);
        }
      }
    }
  }

  async callTool(qualifiedName: string, input: Record<string, unknown>): Promise<ToolResult> {
    const info = this.toolRegistry.get(qualifiedName);
    if (!info) {
      throw new ToolError(`Unknown MCP tool: ${qualifiedName}`);
    }
    const client = this.clients.get(info.serverName);
    if (!client) {
      throw new ToolError(`MCP server not connected: ${info.serverName}`);
    }
    return client.callTool(info.toolName, input);
  }

  getAvailableTools(): MCPToolInfo[] {
    return Array.from(this.toolRegistry.values());
  }

  async startAll(configs: Record<string, MCPServerConfig>): Promise<void> {
    const startPromises = Object.entries(configs)
      .filter(([, config]) => config.enabled && config.autoStart)
      .map(([name, config]) =>
        this.startServer(name, config).catch((err) => {
          logger.warn(`Failed to start MCP server ${name}: ${err.message}`);
        })
      );
    await Promise.all(startPromises);
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.clients.keys()).map((name) =>
      this.stopServer(name).catch((err) => {
        logger.warn(`Failed to stop MCP server ${name}: ${err.message}`);
      })
    );
    await Promise.all(stopPromises);
  }
}
```

---

## 4. 与工具系统集成

### 4.1 MCP 工具适配器

```typescript
class MCPToolAdapter implements Tool {
  constructor(private mcpManager: MCPClientManager, private toolInfo: MCPToolInfo) {}

  get name(): string {
    return this.toolInfo.qualifiedName;
  }

  get description(): string {
    return `[MCP:${this.toolInfo.serverName}] ${this.toolInfo.description}`;
  }

  get inputSchema(): Record<string, unknown> {
    return this.toolInfo.inputSchema;
  }

  get permissionLevel(): PermissionLevel {
    // MCP 工具默认为 UNSAFE，需要每次确认
    return PermissionLevel.UNSAFE;
  }

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.mcpManager.callTool(this.toolInfo.qualifiedName, input);
      return {
        output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
```

### 4.2 注册流程

```typescript
// 在 AgentLoop 初始化时
async function initializeMCPTools(
  mcpManager: MCPClientManager,
  toolRegistry: ToolRegistry,
): Promise<void> {
  await mcpManager.startAll(config.mcpServers);

  for (const toolInfo of mcpManager.getAvailableTools()) {
    const adapter = new MCPToolAdapter(mcpManager, toolInfo);
    toolRegistry.register(adapter);
  }
}
```

---

## 5. 错误处理

### 5.1 错误类型

```typescript
enum MCPErrorType {
  CONNECTION_FAILED = 'connection_failed',     // 无法连接服务器
  TIMEOUT = 'timeout',                         // 请求超时
  SERVER_ERROR = 'server_error',               // 服务器内部错误
  TOOL_NOT_FOUND = 'tool_not_found',           // 工具不存在
  INVALID_PARAMS = 'invalid_params',           // 参数校验失败
  PROTOCOL_ERROR = 'protocol_error',           // JSON-RPC 协议错误
  SERVER_CRASHED = 'server_crashed',           // 服务器进程崩溃
}
```

### 5.2 重连策略

```typescript
class MCPClient {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // 初始 1s，指数退避

  async handleDisconnect(): Promise<void> {
    if (!this.config.retryOnFailure) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`MCP server ${this.config.name}: max reconnect attempts reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`MCP server ${this.config.name}: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await sleep(delay);

    try {
      await this.connect();
      this.reconnectAttempts = 0;
      logger.info(`MCP server ${this.config.name}: reconnected`);
    } catch (error) {
      await this.handleDisconnect();
    }
  }
}
```

---

## 6. CLI 命令

```bash
# 列出所有配置的 MCP 服务器
halfcopilot mcp list

# 启动指定服务器
halfcopilot mcp start <name>

# 停止指定服务器
halfcopilot mcp stop <name>

# 查看服务器状态和工具列表
halfcopilot mcp status <name>

# 重启服务器
halfcopilot mcp restart <name>
```

---

## 7. 测试策略

### 7.1 单元测试

- `StdioTransport`：用 mock 子进程测试消息收发
- `SSETransport`：用 mock HTTP 服务器测试 SSE 连接
- `MCPClientManager`：测试工具注册/注销、限定名生成
- `MCPToolAdapter`：测试权限级别、错误处理

### 7.2 集成测试

- 启动真实 MCP Server（如 `@modelcontextprotocol/server-filesystem`）
- 测试工具发现、调用、结果返回
- 测试服务器崩溃后重连
- 测试超时处理

### 7.3 测试 MCP Server

为方便测试，提供一个简单的测试用 MCP Server：

```typescript
// test/fixtures/echo-mcp-server.ts
// 一个简单的 echo 服务器，将输入原样返回
// 用于测试 MCP 客户端的连接、工具发现和调用
```

---

## 8. 实现优先级

| 优先级 | 任务 | 预计工时 |
|--------|------|---------|
| P0 | MCPTransport 接口 + StdioTransport | 4h |
| P0 | MCPClient（initialize, listTools, callTool） | 3h |
| P0 | MCPClientManager（启动/停止/工具注册） | 3h |
| P1 | SSETransport | 3h |
| P1 | MCPToolAdapter + 工具系统集成 | 2h |
| P1 | 配置加载（从 config.yaml 读取 mcpServers） | 1h |
| P2 | 重连策略 | 2h |
| P2 | CLI 命令 (mcp list/start/stop/status) | 2h |
| P2 | 测试 MCP Server + 集成测试 | 3h |
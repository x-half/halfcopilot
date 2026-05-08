# HalfCopilot 测试策略

## 测试金字塔

```
           /\
          /  \
         / E2E \        少量 (10%)
        /------\
       /        \
      /Integration\    中量 (30%)
     /------------\
    /              \
   /  Unit Tests    \   大量 (60%)
  /------------------\
```

---

## 单元测试 (60%)

### 测试框架

使用 **vitest** 作为测试框架：

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "@inkjs/testing": "^1.0.0"
  }
}
```

### 测试配置

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      threshold: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
```

### Provider 层测试

```typescript
// packages/provider/src/openai-compatible.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;
  
  beforeEach(() => {
    provider = new OpenAICompatibleProvider({
      type: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      models: {
        'deepseek-chat': {
          contextWindow: 64000,
          maxOutput: 8192,
        },
      },
    });
  });
  
  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = provider.getCapabilities();
      
      expect(caps.supportsToolUse).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsThinking).toBe(false);
    });
  });
  
  describe('chat', () => {
    it('should stream text events', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        body: createMockStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":" World"}}]}',
          'data: [DONE]',
        ]),
      });
      
      const stream = provider.chat({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      });
      
      const events = [];
      for await (const event of stream) {
        events.push(event);
      }
      
      expect(events[0]).toEqual({
        type: 'text',
        content: 'Hello',
      });
      expect(events[1]).toEqual({
        type: 'text',
        content: ' World',
      });
      expect(events[2].type).toBe('done');
    });
    
    it('should handle tool_use events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        body: createMockStream([
          'data: {"choices":[{"delta":{"tool_calls":[{"id":"1","function":{"name":"file_read","arguments":"{}"}}]}}]}',
          'data: [DONE]',
        ]),
      });
      
      const stream = provider.chat({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Read file' }],
        tools: [{ name: 'file_read', description: '...', input_schema: {} }],
      });
      
      const events = [];
      for await (const event of stream) {
        events.push(event);
      }
      
      expect(events[0]).toEqual({
        type: 'tool_use',
        id: '1',
        name: 'file_read',
        input: {},
      });
    });
  });
  
  describe('validate', () => {
    it('should return true for valid API key', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'test' }),
      });
      
      const valid = await provider.validate();
      expect(valid).toBe(true);
    });
    
    it('should return false for invalid API key', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
      
      const valid = await provider.validate();
      expect(valid).toBe(false);
    });
  });
});

function createMockStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield new TextEncoder().encode(chunk);
      }
    },
  };
}
```

### 工具层测试

```typescript
// packages/tools/src/file-tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileReadTool, fileWriteTool } from './file-tools';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('fileReadTool', () => {
  const testDir = '/tmp/halfcopilot-test';
  const testFile = path.join(testDir, 'test.txt');
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, 'line1\nline2\nline3\n', 'utf-8');
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true });
  });
  
  it('should read file content', async () => {
    const result = await fileReadTool.execute(
      { path: testFile },
      { projectRoot: testDir, signal: new AbortController().signal, workingDirectory: testDir }
    );
    
    expect(result.success).toBe(true);
    expect((result.content as any).content).toContain('line1');
  });
  
  it('should respect line limit', async () => {
    const result = await fileReadTool.execute(
      { path: testFile, limit: 2 },
      { projectRoot: testDir, signal: new AbortController().signal, workingDirectory: testDir }
    );
    
    expect(result.success).toBe(true);
    expect((result.content as any).truncated).toBe(true);
    expect((result.content as any).content).not.toContain('line3');
  });
  
  it('should reject paths outside project root', async () => {
    const result = await fileReadTool.execute(
      { path: '/etc/passwd' },
      { projectRoot: testDir, signal: new AbortController().signal, workingDirectory: testDir }
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('项目根目录');
  });
});

describe('fileWriteTool', () => {
  const testDir = '/tmp/halfcopilot-test';
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true });
  });
  
  it('should write file content', async () => {
    const testFile = path.join(testDir, 'new.txt');
    
    const result = await fileWriteTool.execute(
      { path: testFile, content: 'Hello World' },
      { projectRoot: testDir, signal: new AbortController().signal, workingDirectory: testDir }
    );
    
    expect(result.success).toBe(true);
    
    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe('Hello World');
  });
  
  it('should create directories if not exist', async () => {
    const testFile = path.join(testDir, 'a/b/c/new.txt');
    
    const result = await fileWriteTool.execute(
      { path: testFile, content: 'Nested' },
      { projectRoot: testDir, signal: new AbortController().signal, workingDirectory: testDir }
    );
    
    expect(result.success).toBe(true);
    
    const exists = await fs.access(testFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
```

### TUI 组件测试

```typescript
// packages/cli/src/components/ChatView.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@inkjs/testing';
import ChatView from './ChatView';

describe('ChatView', () => {
  it('should render messages', () => {
    const { lastFrame } = render(
      <ChatView messages={[
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]} />
    );
    
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('Hi there!');
  });
  
  it('should show loading indicator', () => {
    const { lastFrame } = render(
      <ChatView messages={[]} isLoading={true} />
    );
    
    expect(lastFrame()).toContain('Thinking');
  });
});
```

---

## 集成测试 (30%)

### Agent Loop 测试

```typescript
// packages/core/src/agent-loop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { agentLoop } from './agent-loop';
import { MockProvider } from '../test-utils/mock-provider';
import { createToolRegistry } from './tools';

describe('agentLoop', () => {
  it('should handle simple conversation', async () => {
    const provider = new MockProvider([
      { type: 'text', content: 'Hello!' },
      { type: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    
    const ctx = {
      provider,
      tools: createToolRegistry(),
      conversation: { buildMessages: () => [], addMessage: () => {} },
      permissions: { check: () => true },
      memory: { load: () => Promise.resolve('') },
      config: {},
    };
    
    const events = [];
    for await (const event of agentLoop(ctx)) {
      events.push(event);
    }
    
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('text');
    expect(events[1].type).toBe('done');
  });
  
  it('should handle tool_use flow', async () => {
    const provider = new MockProvider([
      { type: 'tool_use', id: '1', name: 'file_read', input: { path: 'test.txt' } },
      { type: 'text', content: 'File content loaded.' },
      { type: 'done', usage: { input_tokens: 20, output_tokens: 15 } },
    ]);
    
    const mockTools = {
      execute: vi.fn().mockResolvedValue({ success: true, content: 'file content' }),
    };
    
    const ctx = {
      provider,
      tools: mockTools,
      conversation: { 
        buildMessages: () => [], 
        addMessage: () => {},
        addToolResult: () => {},
      },
      permissions: { check: () => true },
      memory: { load: () => Promise.resolve('') },
      config: {},
    };
    
    const events = [];
    for await (const event of agentLoop(ctx)) {
      events.push(event);
    }
    
    expect(mockTools.execute).toHaveBeenCalledWith('file_read', { path: 'test.txt' });
    expect(events.some(e => e.type === 'tool_use')).toBe(true);
  });
  
  it('should respect permission denial', async () => {
    const provider = new MockProvider([
      { type: 'tool_use', id: '1', name: 'bash', input: { command: 'rm -rf /' } },
    ]);
    
    const ctx = {
      provider,
      tools: { execute: vi.fn() },
      conversation: { buildMessages: () => [], addMessage: () => {} },
      permissions: { check: () => false },  // 拒绝
      memory: { load: () => Promise.resolve('') },
      config: {},
    };
    
    const events = [];
    for await (const event of agentLoop(ctx)) {
      events.push(event);
    }
    
    // 工具被拒绝，不应该执行
    expect(ctx.tools.execute).not.toHaveBeenCalled();
  });
});
```

### 权限审批流程测试

```typescript
// packages/core/src/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { PermissionManager } from './permissions';

describe('PermissionManager', () => {
  it('should auto-approve safe tools', () => {
    const pm = new PermissionManager({
      autoApprove: [],
      neverApprove: [],
    });
    
    expect(pm.check('file_read', {})).toBe(true);
    expect(pm.check('grep', { pattern: 'test' })).toBe(true);
  });
  
  it('should check allow list for bash commands', () => {
    const pm = new PermissionManager({
      autoApprove: ['git status', 'ls -la'],
      neverApprove: ['rm -rf'],
    });
    
    expect(pm.check('bash', { command: 'git status' })).toBe(true);
    expect(pm.check('bash', { command: 'ls -la' })).toBe(true);
    expect(pm.check('bash', { command: 'rm -rf /' })).toBe(false);
  });
  
  it('should track session approvals for warn tools', () => {
    const pm = new PermissionManager({});
    
    pm.approve('file_edit', { path: 'test.txt' }, 'session');
    
    // 同一会话中再次编辑同一文件应该自动批准
    expect(pm.check('file_edit', { path: 'test.txt' })).toBe(true);
  });
});
```

### MCP 集成测试

```typescript
// packages/mcp/src/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPClient } from './client';
import { spawn } from 'child_process';

describe('MCPClient', () => {
  let client: MCPClient;
  
  beforeEach(() => {
    client = new MCPClient();
  });
  
  afterEach(async () => {
    await client.disconnect();
  });
  
  it('should connect to MCP server via stdio', async () => {
    await client.connect({
      type: 'stdio',
      command: 'node',
      args: ['mcp-server.js'],
    });
    
    expect(client.isConnected()).toBe(true);
  });
  
  it('should list available tools', async () => {
    await client.connect({ type: 'stdio', command: 'node', args: ['mcp-server.js'] });
    
    const tools = await client.listTools();
    
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it('should execute remote tool', async () => {
    await client.connect({ type: 'stdio', command: 'node', args: ['mcp-server.js'] });
    
    const result = await client.callTool({
      name: 'filesystem_read',
      arguments: { path: '/tmp/test.txt' },
    });
    
    expect(result).toHaveProperty('content');
  });
});
```

---

## E2E 测试 (10%)

### CLI 交互测试

```typescript
// tests/e2e/cli.test.ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';

describe('HalfCopilot CLI E2E', () => {
  const cliPath = path.join(__dirname, '../../packages/cli/dist/index.js');
  
  it('should start interactive mode', async () => {
    const proc = spawn('node', [cliPath, 'chat'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // 等待提示符
    await waitFor(() => output.includes('HalfCopilot'));
    
    // 发送消息
    proc.stdin.write('Hello\n');
    
    // 等待响应
    await waitFor(() => output.includes('Hello'), 10000);
    
    // 退出
    proc.stdin.write('\u0004');  // Ctrl+D
    
    proc.kill();
  });
  
  it('should run single command', async () => {
    const proc = spawn('node', [
      cliPath,
      'run',
      'List files in current directory',
      '--model',
      'mock',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // 等待完成
    await waitFor(() => output.includes('Done'), 30000);
    
    expect(output).toContain('glob');
    
    proc.kill();
  });
});

function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error('Timeout'));
      }
    }, 100);
  });
}
```

### 文件操作测试

```typescript
// tests/e2e/file-operations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runHalfCopilot } from './test-utils';

describe('File Operations E2E', () => {
  const testDir = '/tmp/halfcopilot-e2e';
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true });
  });
  
  it('should create and edit files', async () => {
    const output = await runHalfCopilot(
      testDir,
      'Create a file named hello.txt with content "Hello World"',
      '--model',
      'mock',
    );
    
    const helloFile = path.join(testDir, 'hello.txt');
    const exists = await fs.access(helloFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    
    const content = await fs.readFile(helloFile, 'utf-8');
    expect(content).toContain('Hello World');
  });
});
```

---

## 测试命令

### package.json 脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run tests/e2e",
    "test:all": "pnpm test && pnpm test:e2e"
  }
}
```

### CI 配置

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm build
      
      - run: pnpm test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 覆盖率目标

| 包 | 行覆盖率 | 函数覆盖率 | 分支覆盖率 |
|----|---------|-----------|-----------|
| cli | 70% | 70% | 60% |
| core | 80% | 80% | 70% |
| provider | 90% | 90% | 80% |
| tools | 90% | 90% | 80% |
| mcp | 80% | 80% | 70% |
| memory | 80% | 80% | 70% |
| config | 90% | 90% | 80% |
| shared | 90% | 90% | 80% |

---

## Mock 工具

### Mock Provider

```typescript
// packages/core/test-utils/mock-provider.ts
export class MockProvider implements Provider {
  readonly name = 'mock';
  readonly type = 'openai-compatible';
  
  constructor(private responses: ChatEvent[]) {}
  
  getCapabilities() {
    return {
      supportsToolUse: true,
      supportsStreaming: true,
      supportsThinking: false,
      supportsVision: false,
      supportsCaching: false,
    };
  }
  
  async getModels() {
    return [{ id: 'mock', displayName: 'Mock', contextWindow: 4096, maxOutput: 2048 }];
  }
  
  getContextWindow() { return 4096; }
  getMaxOutput() { return 2048; }
  
  async *chat(): AsyncGenerator<ChatEvent> {
    for (const response of this.responses) {
      yield response;
    }
  }
  
  async validate() { return true; }
}
```

### Mock Tools

```typescript
// packages/core/test-utils/mock-tools.ts
export function createMockToolRegistry() {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, content: 'mock' }),
    list: () => [],
    toProviderFormat: () => [],
  };
}
```
# HalfCopilot 开发启动指南

> 本文档指导开发者从零开始搭建 HalfCopilot 项目并启动开发工作。

---

## 🎯 目标

完成本指南后，你将拥有：
- ✅ 完整的 Monorepo 项目结构
- ✅ 配置好的开发环境
- ✅ 可运行的基础 CLI
- ✅ 测试框架就绪

---

## 📋 前置要求

- Node.js 20+
- pnpm 8+
- Git

---

## 🚀 步骤 1: 创建项目骨架

### 1.1 初始化项目

```bash
# 创建项目目录
mkdir -p halfcopilot && cd halfcopilot

# 初始化 git
git init

# 创建 .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.DS_Store
.halfcopilot/
coverage/
EOF
```

### 1.2 创建基础配置文件

**package.json:**
```json
{
  "name": "halfcopilot",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^1.11.0",
    "typescript": "^5.3.0"
  }
}
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'packages/*'
```

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

**turbo.json:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### 1.3 创建包目录结构

```bash
# 创建所有包的目录
for pkg in cli core provider tools mcp memory config shared; do
  mkdir -p packages/$pkg/src
done

# 创建共享目录
mkdir -p packages/shared/src/{utils,types}
```

---

## 🔨 步骤 2: 实现 shared 包（基础依赖）

### 2.1 packages/shared/package.json

```json
{
  "name": "@halfcopilot/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

### 2.2 packages/shared/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.3 packages/shared/src/index.ts

```typescript
// Logger
export class Logger {
  private prefix: string;
  
  constructor(prefix: string) {
    this.prefix = prefix;
  }
  
  debug(...args: any[]) {
    console.debug(`[${this.prefix}]`, ...args);
  }
  
  info(...args: any[]) {
    console.info(`[${this.prefix}]`, ...args);
  }
  
  warn(...args: any[]) {
    console.warn(`[${this.prefix}]`, ...args);
  }
  
  error(...args: any[]) {
    console.error(`[${this.prefix}]`, ...args);
  }
}

export const logger = new Logger('HalfCopilot');

// Path utilities
export * from './utils/path.js';

// Encoding utilities
export * from './utils/encoding.js';

// Async utilities
export * from './utils/async.js';
```

### 2.4 packages/shared/src/utils/path.ts

```typescript
import * as path from 'path';

export function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/');
}

export function isAbsolute(p: string): boolean {
  return path.isAbsolute(p);
}

export function resolve(base: string, ...paths: string[]): string {
  return path.resolve(base, ...paths);
}

export function join(...paths: string[]): string {
  return path.join(...paths);
}

export function relative(from: string, to: string): string {
  return path.relative(from, to);
}

export function dirname(p: string): string {
  return path.dirname(p);
}

export function basename(p: string, ext?: string): string {
  return path.basename(p, ext);
}

export function extname(p: string): string {
  return path.extname(p);
}
```

### 2.5 packages/shared/src/utils/encoding.ts

```typescript
import * as fs from 'fs/promises';

const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const UTF16LE_BOM = Buffer.from([0xFF, 0xFE]);
const UTF16BE_BOM = Buffer.from([0xFE, 0xFF]);

export async function detectEncoding(filePath: string): Promise<'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk'> {
  try {
    const buffer = await fs.readFile(filePath);
    
    if (buffer.slice(0, 3).equals(UTF8_BOM)) {
      return 'utf-8';
    }
    if (buffer.slice(0, 2).equals(UTF16LE_BOM)) {
      return 'utf-16le';
    }
    if (buffer.slice(0, 2).equals(UTF16BE_BOM)) {
      return 'utf-16be';
    }
    
    // 简单检测 GBK (实际项目应使用更准确的检测库)
    // 这里默认返回 utf-8
    return 'utf-8';
  } catch {
    return 'utf-8';
  }
}
```

### 2.6 packages/shared/src/utils/async.ts

```typescript
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delay: number } = { retries: 3, delay: 1000 }
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= options.retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < options.retries) {
        await sleep(options.delay);
      }
    }
  }
  
  throw lastError!;
}
```

---

## ⚙️ 步骤 3: 实现 config 包

### 3.1 packages/config/package.json

```json
{
  "name": "@halfcopilot/config",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@halfcopilot/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 3.2 packages/config/src/index.ts

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { logger } from '@halfcopilot/shared';

export interface ProviderConfig {
  type: 'openai-compatible' | 'anthropic';
  baseUrl?: string;
  apiKey: string;
  models?: Record<string, { contextWindow?: number; maxOutput?: number }>;
}

export interface HalfCopilotConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  permissions?: {
    autoApprove?: string[];
    neverApprove?: string[];
  };
  memory?: {
    enabled?: boolean;
    types?: string[];
  };
}

const USER_CONFIG_PATH = path.join(homedir(), '.halfcopilot', 'settings.json');
const PROJECT_CONFIG_PATH = '.halfcopilot/settings.json';

export async function loadConfig(): Promise<HalfCopilotConfig> {
  const defaultConfig: HalfCopilotConfig = {
    defaultProvider: 'deepseek',
    providers: {},
    permissions: {
      autoApprove: ['git status', 'git diff', 'ls -la'],
      neverApprove: ['rm -rf', 'sudo'],
    },
    memory: {
      enabled: true,
      types: ['user', 'feedback', 'project'],
    },
  };
  
  // 加载用户配置
  const userConfig = await loadConfigFile(USER_CONFIG_PATH);
  
  // 加载项目配置
  const projectConfig = await loadConfigFile(PROJECT_CONFIG_PATH);
  
  // 合并配置（项目配置优先级更高）
  const merged = {
    ...defaultConfig,
    ...userConfig,
    ...projectConfig,
    providers: {
      ...defaultConfig.providers,
      ...userConfig?.providers,
      ...projectConfig?.providers,
    },
  };
  
  // 环境变量覆盖
  applyEnvOverrides(merged);
  
  logger.info('Config loaded');
  return merged;
}

async function loadConfigFile(filePath: string): Promise<Partial<HalfCopilotConfig> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function applyEnvOverrides(config: HalfCopilotConfig) {
  // HALFCOPILOT_DEFAULT_PROVIDER
  if (process.env.HALFCOPILOT_DEFAULT_PROVIDER) {
    config.defaultProvider = process.env.HALFCOPILOT_DEFAULT_PROVIDER;
  }
  
  // HALFCOPILOT_*_API_KEY
  for (const [name, provider] of Object.entries(config.providers)) {
    const apiKeyEnv = `HALFCOPILOT_${name.toUpperCase()}_API_KEY`;
    if (process.env[apiKeyEnv]) {
      provider.apiKey = process.env[apiKeyEnv]!;
    }
  }
}

export function resolveApiKey(apiKey: string): string {
  if (apiKey.startsWith('env:')) {
    const envVar = apiKey.slice(4);
    return process.env[envVar] || '';
  }
  return apiKey;
}
```

---

## 🎨 步骤 4: 实现 provider 包

### 4.1 packages/provider/package.json

```json
{
  "name": "@halfcopilot/provider",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@halfcopilot/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

### 4.2 packages/provider/src/types.ts

```typescript
// 从设计规范复制类型定义
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  role: MessageRole;
  content: string | Array<{ type: string; text: string }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export type ChatEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'done'; usage: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; error: Error };

export interface Provider {
  readonly name: string;
  readonly type: 'openai-compatible' | 'anthropic';
  chat(params: ChatParams): AsyncGenerator<ChatEvent>;
  validate(): Promise<boolean>;
}
```

### 4.3 packages/provider/src/openai-compatible.ts

```typescript
import type { Provider, ChatParams, ChatEvent } from './types.js';

export class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  readonly type: 'openai-compatible' = 'openai-compatible';
  
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelName: string
  ) {
    this.name = new URL(baseUrl).hostname;
  }
  
  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: params.messages,
        tools: params.tools,
        stream: params.stream ?? true,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: new Error(error) };
      return;
    }
    
    if (!response.body) {
      yield { type: 'error', error: new Error('No response body') };
      return;
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done', usage: { input_tokens: 0, output_tokens: 0 } };
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: 'text', content };
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }
  
  async validate(): Promise<boolean> {
    try {
      const stream = this.chat({
        model: this.modelName,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      });
      
      for await (const event of stream) {
        if (event.type === 'text' || event.type === 'done') {
          return true;
        }
        if (event.type === 'error') {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
}
```

### 4.4 packages/provider/src/index.ts

```typescript
export * from './types.js';
export * from './openai-compatible.js';

// 可以在此添加 Provider 注册表
```

---

## 🏃 步骤 5: 安装依赖并测试

### 5.1 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 5.2 构建所有包

```bash
pnpm build
```

### 5.3 测试 shared 包

```bash
cd packages/shared
pnpm test
```

---

## 📝 下一步

完成基础框架后，继续实现：

1. **tools 包** - 文件操作、命令执行、搜索工具
2. **core 包** - Agent Loop、权限审批、对话管理
3. **memory 包** - 记忆系统
4. **mcp 包** - MCP 协议支持
5. **cli 包** - CLI 入口、TUI 界面

---

## 🐛 常见问题

### Q: pnpm install 失败

```bash
# 清理缓存
pnpm store prune

# 重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Q: TypeScript 编译错误

```bash
# 检查 TypeScript 版本
pnpm exec tsc --version

# 重新构建
pnpm build --force
```

### Q: 模块导入错误

确保所有 package.json 都有 `"type": "module"`，导入路径使用 `.js` 扩展名。

---

## 📚 参考文档

- [技术规范索引](./README.md)
- [CLI 命令规范](./cli-commands.md)
- [Provider 接口](./provider-interface.ts)
- [工具系统设计](./tool-system.md)
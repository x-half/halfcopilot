# HalfCopilot 实施计划

> **For Claude:** 必需子技能：使用 claude-code-teams:executing-plans 来逐任务实施此计划。

**目标：** 从零构建 HalfCopilot — 一个支持多模型的 Agent 框架 CLI，借鉴 Claude Code 的核心设计。

**架构：** TypeScript monorepo (pnpm + Turborepo)，8 个包：cli/core/provider/tools/mcp/memory/config/shared。Agent Loop 为 AsyncGenerator 驱动的流式循环，Provider 层双轨（OpenAI 兼容 + Anthropic），工具系统混合模式（tool_use + 文本解析），ink 构建 TUI。

**技术栈：** TypeScript 5.x, Node.js 20+, pnpm 9+, Turborepo, ink 4.x, React 18, zod (校验), openai SDK, @anthropic-ai/sdk, vitest (测试)

---

## 阶段 1: 项目脚手架

### 任务 1.1: 初始化 Monorepo 根目录

**文件：**
- 创建: `package.json`
- 创建: `pnpm-workspace.yaml`
- 创建: `turbo.json`
- 创建: `tsconfig.base.json`
- 创建: `.gitignore`
- 创建: `.npmrc`

**步骤 1: 创建根 package.json**

```json
{
  "name": "halfcopilot",
  "version": "0.0.1",
  "private": true,
  "description": "HalfCopilot — Multi-model Agent Framework CLI",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**步骤 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

**步骤 3: 创建 turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

**步骤 4: 创建 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**步骤 5: 创建 .gitignore**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.DS_Store
.env
.env.local
.halfcopilot/
```

**步骤 6: 创建 .npmrc**

```
shamefully-hoist=true
strict-peer-dependencies=false
```

**步骤 7: 安装依赖并验证**

运行: `pnpm install`
预期: 成功安装，无错误

**步骤 8: 提交**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .npmrc
git commit -m "feat: initialize halfcopilot monorepo scaffold"
```

---

### 任务 1.2: 创建 shared 包

**文件：**
- 创建: `packages/shared/package.json`
- 创建: `packages/shared/tsconfig.json`
- 创建: `packages/shared/src/index.ts`
- 创建: `packages/shared/src/logger.ts`
- 创建: `packages/shared/src/errors.ts`
- 创建: `packages/shared/src/utils.ts`
- 创建: `packages/shared/src/__tests__/errors.test.ts`
- 创建: `packages/shared/vitest.config.ts`

**步骤 1: 创建包配置**

`packages/shared/package.json`:
```json
{
  "name": "@halfcopilot/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**步骤 2: 编写失败的测试**

`packages/shared/src/__tests__/errors.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { HalfCopilotError, ProviderError, ToolError, PermissionError } from '../errors.js';

describe('HalfCopilotError', () => {
  it('should create base error with code and message', () => {
    const err = new HalfCopilotError('TEST_001', 'test error');
    expect(err.code).toBe('TEST_001');
    expect(err.message).toBe('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HalfCopilotError);
  });

  it('should preserve cause chain', () => {
    const cause = new Error('original');
    const err = new HalfCopilotError('TEST_002', 'wrapped', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('ProviderError', () => {
  it('should create error with provider name', () => {
    const err = new ProviderError('deepseek', 'API limit exceeded');
    expect(err.provider).toBe('deepseek');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err).toBeInstanceOf(HalfCopilotError);
  });
});

describe('ToolError', () => {
  it('should create error with tool name', () => {
    const err = new ToolError('bash', 'command failed');
    expect(err.tool).toBe('bash');
    expect(err.code).toBe('TOOL_ERROR');
  });
});

describe('PermissionError', () => {
  it('should create error with tool and reason', () => {
    const err = new PermissionError('bash', 'user denied');
    expect(err.tool).toBe('bash');
    expect(err.reason).toBe('user denied');
    expect(err.code).toBe('PERMISSION_DENIED');
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/shared && pnpm test`
预期: FAIL — 模块不存在

**步骤 4: 编写实现**

`packages/shared/src/errors.ts`:
```typescript
export class HalfCopilotError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    cause?: Error
  ) {
    super(message, { cause });
    this.name = 'HalfCopilotError';
  }
}

export class ProviderError extends HalfCopilotError {
  constructor(
    public readonly provider: string,
    message: string,
    cause?: Error
  ) {
    super('PROVIDER_ERROR', `[${provider}] ${message}`, cause);
    this.name = 'ProviderError';
  }
}

export class ToolError extends HalfCopilotError {
  constructor(
    public readonly tool: string,
    message: string,
    cause?: Error
  ) {
    super('TOOL_ERROR', `[${tool}] ${message}`, cause);
    this.name = 'ToolError';
  }
}

export class PermissionError extends HalfCopilotError {
  constructor(
    public readonly tool: string,
    public readonly reason: string
  ) {
    super('PERMISSION_DENIED', `Permission denied for ${tool}: ${reason}`);
    this.name = 'PermissionError';
  }
}
```

`packages/shared/src/logger.ts`:
```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(`[INFO] ${msg}`, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${msg}`, ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${msg}`, ...args);
    }
  }
}

export const logger = new Logger();
```

`packages/shared/src/utils.ts`:
```typescript
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function resolveEnvVar(value: string): string {
  if (value.startsWith('env:')) {
    const envKey = value.slice(4);
    const envVal = process.env[envKey];
    if (!envVal) {
      throw new Error(`Environment variable ${envKey} is not set`);
    }
    return envVal;
  }
  return value;
}
```

`packages/shared/src/index.ts`:
```typescript
export { HalfCopilotError, ProviderError, ToolError, PermissionError } from './errors.js';
export { Logger, LogLevel, logger } from './logger.js';
export { truncate, formatDuration, resolveEnvVar } from './utils.js';
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/shared && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/shared/
git commit -m "feat: add @halfcopilot/shared package with errors, logger, utils"
```

---

### 任务 1.3: 创建 config 包

**文件：**
- 创建: `packages/config/package.json`
- 创建: `packages/config/tsconfig.json`
- 创建: `packages/config/vitest.config.ts`
- 创建: `packages/config/src/index.ts`
- 创建: `packages/config/src/schema.ts`
- 创建: `packages/config/src/loader.ts`
- 创建: `packages/config/src/defaults.ts`
- 创建: `packages/config/src/__tests__/schema.test.ts`
- 创建: `packages/config/src/__tests__/loader.test.ts`

**步骤 1: 创建包配置**

`packages/config/package.json`:
```json
{
  "name": "@halfcopilot/config",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@halfcopilot/shared": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**步骤 2: 编写失败的测试**

`packages/config/src/__tests__/schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ProviderConfigSchema, HalfCopilotConfigSchema, ModelConfigSchema } from '../schema.js';

describe('ModelConfigSchema', () => {
  it('should parse valid model config', () => {
    const result = ModelConfigSchema.safeParse({
      contextWindow: 64000,
      maxOutput: 8192,
    });
    expect(result.success).toBe(true);
  });

  it('should parse model config with thinking', () => {
    const result = ModelConfigSchema.safeParse({
      contextWindow: 64000,
      maxOutput: 8192,
      thinking: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.thinking).toBe(true);
  });
});

describe('ProviderConfigSchema', () => {
  it('should parse openai-compatible provider', () => {
    const result = ProviderConfigSchema.safeParse({
      type: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'env:DEEPSEEK_API_KEY',
      models: {
        'deepseek-chat': { contextWindow: 64000, maxOutput: 8192 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('should parse anthropic provider', () => {
    const result = ProviderConfigSchema.safeParse({
      type: 'anthropic',
      apiKey: 'env:ANTHROPIC_API_KEY',
      models: {
        'claude-sonnet-4-6': { contextWindow: 200000, maxOutput: 16384 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid provider type', () => {
    const result = ProviderConfigSchema.safeParse({
      type: 'invalid',
      apiKey: 'test',
      models: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('HalfCopilotConfigSchema', () => {
  it('should parse minimal config with defaults', () => {
    const result = HalfCopilotConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('auto');
      expect(result.data.maxTurns).toBe(50);
    }
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/config && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/config/src/schema.ts`:
```typescript
import { z } from 'zod';

export const ModelConfigSchema = z.object({
  contextWindow: z.number().positive(),
  maxOutput: z.number().positive(),
  thinking: z.boolean().optional().default(false),
});

export const ProviderConfigSchema = z.object({
  type: z.enum(['openai-compatible', 'anthropic']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string(),
  models: z.record(z.string(), ModelConfigSchema),
});

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
  transport: z.enum(['stdio', 'sse']).optional().default('stdio'),
  url: z.string().url().optional(),
});

export const HalfCopilotConfigSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional().default({}),
  mode: z.enum(['plan', 'act', 'auto']).optional().default('auto'),
  maxTurns: z.number().positive().optional().default(50),
  maxTokens: z.number().positive().optional().default(16384),
  permissions: z.object({
    allow: z.array(z.string()).optional().default([]),
    deny: z.array(z.string()).optional().default([]),
    autoApproveSafe: z.boolean().optional().default(true),
  }).optional().default({}),
  mcpServers: z.record(z.string(), MCPServerConfigSchema).optional().default({}),
  memory: z.object({
    enabled: z.boolean().optional().default(true),
    maxSize: z.number().positive().optional().default(100),
    compactionThreshold: z.number().min(0).max(1).optional().default(0.8),
  }).optional().default({}),
  theme: z.enum(['dark', 'light']).optional().default('dark'),
  verbose: z.boolean().optional().default(false),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type HalfCopilotConfig = z.infer<typeof HalfCopilotConfigSchema>;
```

`packages/config/src/defaults.ts`:
```typescript
import type { HalfCopilotConfig } from './schema.js';

export const DEFAULT_CONFIG: HalfCopilotConfig = {
  providers: {},
  mode: 'auto',
  maxTurns: 50,
  maxTokens: 16384,
  permissions: {
    allow: [],
    deny: [],
    autoApproveSafe: true,
  },
  mcpServers: {},
  memory: {
    enabled: true,
    maxSize: 100,
    compactionThreshold: 0.8,
  },
  theme: 'dark',
  verbose: false,
};
```

`packages/config/src/loader.ts`:
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { HalfCopilotConfigSchema, type HalfCopilotConfig } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';

const PROJECT_CONFIG_DIR = '.halfcopilot';
const USER_CONFIG_DIR = '.halfcopilot';
const CONFIG_FILE = 'settings.json';

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function loadConfig(projectRoot?: string): HalfCopilotConfig {
  // 1. Start with defaults
  let config: Record<string, unknown> = { ...DEFAULT_CONFIG };

  // 2. Merge user-level config (~/.halfcopilot/settings.json)
  const userConfigPath = join(homedir(), USER_CONFIG_DIR, CONFIG_FILE);
  const userConfig = readJsonFile(userConfigPath);
  if (userConfig) {
    config = deepMerge(config, userConfig);
  }

  // 3. Merge project-level config (.halfcopilot/settings.json)
  if (projectRoot) {
    const projectConfigPath = join(projectRoot, PROJECT_CONFIG_DIR, CONFIG_FILE);
    const projectConfig = readJsonFile(projectConfigPath);
    if (projectConfig) {
      config = deepMerge(config, projectConfig);
    }
  }

  // 4. Apply environment variable overrides (HALFCOPILOT_*)
  const envOverrides = loadEnvOverrides();
  if (Object.keys(envOverrides).length > 0) {
    config = deepMerge(config, envOverrides);
  }

  // 5. Validate and return
  const result = HalfCopilotConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid HalfCopilot config: ${result.error.message}`);
  }
  return result.data;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadEnvOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const prefix = 'HALFCOPILOT_';
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      const configKey = key.slice(prefix.length).toLowerCase();
      overrides[configKey] = value;
    }
  }
  return overrides;
}

export function getConfigDir(scope: 'user' | 'project', projectRoot?: string): string {
  if (scope === 'user') {
    return join(homedir(), USER_CONFIG_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return join(projectRoot, PROJECT_CONFIG_DIR);
}
```

`packages/config/src/index.ts`:
```typescript
export { HalfCopilotConfigSchema, ProviderConfigSchema, ModelConfigSchema, MCPServerConfigSchema, type HalfCopilotConfig, type ProviderConfig, type ModelConfig, type MCPServerConfig } from './schema.js';
export { loadConfig, getConfigDir } from './loader.js';
export { DEFAULT_CONFIG } from './defaults.js';
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/config && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/config/
git commit -m "feat: add @halfcopilot/config package with schema, loader, defaults"
```

---

## 阶段 2: Provider 层

### 任务 2.1: 创建 provider 包 — 类型定义与抽象接口

**文件：**
- 创建: `packages/provider/package.json`
- 创建: `packages/provider/tsconfig.json`
- 创建: `packages/provider/vitest.config.ts`
- 创建: `packages/provider/src/index.ts`
- 创建: `packages/provider/src/types.ts`
- 创建: `packages/provider/src/base.ts`
- 创建: `packages/provider/src/__tests__/types.test.ts`

**步骤 1: 创建包配置**

`packages/provider/package.json`:
```json
{
  "name": "@halfcopilot/provider",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@halfcopilot/shared": "workspace:*",
    "@halfcopilot/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**步骤 2: 编写失败的测试**

`packages/provider/src/__tests__/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { Message, ChatParams, ChatEvent, ToolDef, TokenUsage } from '../types.js';

describe('Message types', () => {
  it('should type-check user message', () => {
    const msg: Message = {
      role: 'user',
      content: 'Hello',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('should type-check assistant message with tool_use', () => {
    const msg: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me read that file.' },
        { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { path: '/tmp/test.txt' } },
      ],
    };
    expect(msg.role).toBe('assistant');
    expect(Array.isArray(msg.content)).toBe(true);
  });

  it('should type-check tool_result message', () => {
    const msg: Message = {
      role: 'tool_result',
      toolUseId: 'tu_1',
      content: 'file contents here',
    };
    expect(msg.role).toBe('tool_result');
    expect(msg.toolUseId).toBe('tu_1');
  });
});

describe('ChatEvent types', () => {
  it('should type-check text event', () => {
    const event: ChatEvent = { type: 'text', content: 'hello' };
    expect(event.type).toBe('text');
  });

  it('should type-check tool_use event', () => {
    const event: ChatEvent = {
      type: 'tool_use',
      id: 'tu_1',
      name: 'bash',
      input: { command: 'ls' },
    };
    expect(event.type).toBe('tool_use');
  });

  it('should type-check done event', () => {
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50 };
    const event: ChatEvent = { type: 'done', usage };
    expect(event.type).toBe('done');
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/provider && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/provider/src/types.ts`:
```typescript
// ---- Message Types ----

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ThinkingContent {
  type: 'thinking';
  text: string;
}

export type ContentBlock = TextContent | ToolUseContent | ThinkingContent;

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | ContentBlock[];
}

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface ToolResultMessage {
  role: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | SystemMessage | ToolResultMessage;

// ---- Chat Types ----

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  messages: Message[];
  tools?: ToolDef[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ChatEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; output: string }
  | { type: 'thinking'; content: string }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; error: Error };
```

`packages/provider/src/base.ts`:
```typescript
import type { ChatParams, ChatEvent } from './types.js';

export interface Provider {
  readonly name: string;
  chat(params: ChatParams): AsyncGenerator<ChatEvent>;
  supportsToolUse(): boolean;
  supportsStreaming(): boolean;
}

export abstract class BaseProvider implements Provider {
  abstract readonly name: string;

  abstract chat(params: ChatParams): AsyncGenerator<ChatEvent>;

  supportsToolUse(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }
}
```

`packages/provider/src/index.ts`:
```typescript
export type { Message, UserMessage, AssistantMessage, SystemMessage, ToolResultMessage, ContentBlock, TextContent, ToolUseContent, ThinkingContent, ToolDef, ChatParams, ChatEvent, TokenUsage } from './types.js';
export { Provider, BaseProvider } from './base.js';
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/provider && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/provider/
git commit -m "feat: add @halfcopilot/provider package with types and base interface"
```

---

### 任务 2.2: 实现 OpenAI 兼容 Provider

**文件：**
- 创建: `packages/provider/src/openai.ts`
- 创建: `packages/provider/src/__tests__/openai.test.ts`

**步骤 1: 添加 openai 依赖**

在 `packages/provider/package.json` 的 dependencies 中添加:
```json
"openai": "^4.77.0"
```

**步骤 2: 编写失败的测试**

`packages/provider/src/__tests__/openai.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../openai.js';

describe('OpenAICompatibleProvider', () => {
  it('should create provider with correct name', () => {
    const provider = new OpenAICompatibleProvider({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      models: {
        'deepseek-chat': { contextWindow: 64000, maxOutput: 8192 },
      },
    });
    expect(provider.name).toBe('deepseek');
    expect(provider.supportsToolUse()).toBe(true);
    expect(provider.supportsStreaming()).toBe(true);
  });

  it('should convert messages to OpenAI format', () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
      models: {},
    });
    const messages = provider['convertMessages']([
      { role: 'system', content: 'You are a helper.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(messages).toEqual([
      { role: 'system', content: 'You are a helper.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('should convert tool_use messages to OpenAI format', () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
      models: {},
    });
    const messages = provider['convertMessages']([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading file...' },
          { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { path: '/tmp/a.txt' } },
        ],
      },
      { role: 'tool_result', toolUseId: 'tu_1', content: 'file content' },
    ]);
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Reading file...' },
        { type: 'function', id: 'tu_1', function: { name: 'file_read', arguments: '{"path":"/tmp/a.txt"}' } },
      ],
    });
    expect(messages[1]).toEqual({
      role: 'tool',
      tool_call_id: 'tu_1',
      content: 'file content',
    });
  });

  it('should convert tools to OpenAI format', () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
      models: {},
    });
    const tools = provider['convertTools']([
      {
        name: 'file_read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
    ]);
    expect(tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'file_read',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ]);
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/provider && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/provider/src/openai.ts`:
```typescript
import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import type { ChatParams, ChatEvent, Message, ToolDef } from './types.js';
import type { ProviderConfig, ModelConfig } from '@halfcopilot/config';
import { resolveEnvVar } from '@halfcopilot/shared';

interface OpenAIProviderOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  models?: Record<string, ModelConfig>;
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly name: string;
  private client: OpenAI;
  private models: Record<string, ModelConfig>;

  constructor(options: OpenAIProviderOptions) {
    super();
    this.name = options.name;
    this.models = options.models ?? {};
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: resolveEnvVar(options.apiKey),
    });
  }

  static fromConfig(name: string, config: ProviderConfig): OpenAICompatibleProvider {
    if (!config.baseUrl) {
      throw new Error(`OpenAI-compatible provider "${name}" requires a baseUrl`);
    }
    return new OpenAICompatibleProvider({
      name,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      models: config.models,
    });
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const messages = this.convertMessages(params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: params.systemPrompt
        ? [{ role: 'system' as const, content: params.systemPrompt }, ...messages]
        : messages,
      tools: tools as OpenAI.ChatCompletionTool[] | undefined,
      stream: true,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    });

    let currentToolCall: { id: string; name: string; args: string } | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Text content
      if (delta?.content) {
        yield { type: 'text', content: delta.content };
      }

      // Tool calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            // New tool call starting
            if (currentToolCall) {
              // Flush previous
              try {
                yield {
                  type: 'tool_use',
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: JSON.parse(currentToolCall.args),
                };
              } catch {
                yield {
                  type: 'tool_use',
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: {},
                };
              }
            }
            currentToolCall = { id: tc.id, name: tc.function?.name ?? '', args: '' };
          }
          if (tc.function?.arguments && currentToolCall) {
            currentToolCall.args += tc.function.arguments;
          }
        }
      }

      // Usage
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    // Flush last tool call
    if (currentToolCall) {
      try {
        yield {
          type: 'tool_use',
          id: currentToolCall.id,
          name: currentToolCall.name,
          input: JSON.parse(currentToolCall.args),
        };
      } catch {
        yield {
          type: 'tool_use',
          id: currentToolCall.id,
          name: currentToolCall.name,
          input: {},
        };
      }
    }

    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }

  convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'system') {
        return { role: 'system' as const, content: msg.content };
      }
      if (msg.role === 'user') {
        return { role: 'user' as const, content: msg.content };
      }
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          return { role: 'assistant' as const, content: msg.content };
        }
        // Content blocks -> OpenAI format
        const textParts: string[] = [];
        const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }
        return {
          role: 'assistant' as const,
          content: textParts.join('') || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
      }
      if (msg.role === 'tool_result') {
        return {
          role: 'tool' as const,
          tool_call_id: msg.toolUseId,
          content: msg.content,
        } as OpenAI.ChatCompletionToolMessageParam;
      }
      return { role: 'user' as const, content: String(msg) };
    });
  }

  convertTools(tools: ToolDef[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/provider && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/provider/
git commit -m "feat: add OpenAI-compatible provider with streaming and tool_use support"
```

---

### 任务 2.3: 实现 Anthropic Provider

**文件：**
- 创建: `packages/provider/src/anthropic.ts`
- 创建: `packages/provider/src/__tests__/anthropic.test.ts`

**步骤 1: 添加 @anthropic-ai/sdk 依赖**

在 `packages/provider/package.json` 的 dependencies 中添加:
```json
"@anthropic-ai/sdk": "^0.36.0"
```

**步骤 2: 编写失败的测试**

`packages/provider/src/__tests__/anthropic.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../anthropic.js';

describe('AnthropicProvider', () => {
  it('should create provider with correct name', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      models: {
        'claude-sonnet-4-6': { contextWindow: 200000, maxOutput: 16384 },
      },
    });
    expect(provider.name).toBe('anthropic');
    expect(provider.supportsToolUse()).toBe(true);
    expect(provider.supportsStreaming()).toBe(true);
  });

  it('should convert messages to Anthropic format', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', models: {} });
    const { system, messages } = provider['convertMessages']([
      { role: 'system', content: 'You are a helper.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(system).toEqual([{ type: 'text', text: 'You are a helper.' }]);
    expect(messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert tool_result messages to Anthropic format', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', models: {} });
    const { messages } = provider['convertMessages']([
      { role: 'tool_result', toolUseId: 'tu_1', content: 'result text' },
    ]);
    expect(messages[0]).toEqual({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'tu_1',
        content: 'result text',
      }],
    });
  });

  it('should convert tools to Anthropic format', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', models: {} });
    const tools = provider['convertTools']([
      {
        name: 'file_read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    ]);
    expect(tools).toEqual([{
      name: 'file_read',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    }]);
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/provider && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/provider/src/anthropic.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';
import type { ChatParams, ChatEvent, Message, ToolDef } from './types.js';
import type { ProviderConfig } from '@halfcopilot/config';
import { resolveEnvVar } from '@halfcopilot/shared';

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(options: { apiKey: string; models?: Record<string, unknown> }) {
    super();
    this.client = new Anthropic({ apiKey: resolveEnvVar(options.apiKey) });
  }

  static fromConfig(config: ProviderConfig): AnthropicProvider {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      models: config.models,
    });
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const { system, messages } = this.convertMessages(params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens ?? 16384,
      system: params.systemPrompt
        ? [{ type: 'text' as const, text: params.systemPrompt }]
        : system,
      messages,
      tools,
      temperature: params.temperature,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          // Tool use start — we'll collect input from delta events
        }
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta.thinking };
        }
      }

      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
      }

      if (event.type === 'message_delta') {
        outputTokens += event.usage?.output_tokens ?? 0;
      }
    }

    // Get final message to extract tool_use blocks
    const finalMessage = await stream.finalMessage();
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        yield {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
    }

    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }

  convertMessages(messages: Message[]): {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
  } {
    const system: Anthropic.TextBlockParam[] = [];
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system.push({ type: 'text', text: msg.content });
        continue;
      }
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
          continue;
        }
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            blocks.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            blocks.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
        result.push({ role: 'assistant', content: blocks });
        continue;
      }
      if (msg.role === 'tool_result') {
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolUseId,
            content: msg.content,
            is_error: msg.isError,
          }],
        });
        continue;
      }
    }

    return { system, messages: result };
  }

  convertTools(tools: ToolDef[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }
}
```

**步骤 5: 更新 index.ts 导出**

在 `packages/provider/src/index.ts` 末尾添加:
```typescript
export { OpenAICompatibleProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
```

**步骤 6: 运行测试验证通过**

运行: `cd packages/provider && pnpm test`
预期: PASS

**步骤 7: 提交**

```bash
git add packages/provider/
git commit -m "feat: add Anthropic provider with streaming, tool_use, and thinking support"
```

---

### 任务 2.4: 实现 Provider Registry

**文件：**
- 创建: `packages/provider/src/registry.ts`
- 创建: `packages/provider/src/__tests__/registry.test.ts`

**步骤 1: 编写失败的测试**

`packages/provider/src/__tests__/registry.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { OpenAICompatibleProvider } from '../openai.js';
import type { HalfCopilotConfig } from '@halfcopilot/config';

describe('ProviderRegistry', () => {
  it('should register and retrieve providers', () => {
    const registry = new ProviderRegistry();
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
    });
    registry.register('test', provider);
    expect(registry.get('test')).toBe(provider);
  });

  it('should throw when getting unregistered provider', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('nonexistent')).toThrow();
  });

  it('should create providers from config', () => {
    const registry = new ProviderRegistry();
    const config: HalfCopilotConfig = {
      providers: {
        deepseek: {
          type: 'openai-compatible',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
          models: { 'deepseek-chat': { contextWindow: 64000, maxOutput: 8192 } },
        },
      },
    };
    registry.createFromConfig(config);
    expect(registry.has('deepseek')).toBe(true);
    expect(registry.get('deepseek').name).toBe('deepseek');
  });

  it('should list available providers', () => {
    const registry = new ProviderRegistry();
    const p1 = new OpenAICompatibleProvider({ name: 'a', baseUrl: 'http://a', apiKey: 'k' });
    const p2 = new OpenAICompatibleProvider({ name: 'b', baseUrl: 'http://b', apiKey: 'k' });
    registry.register('a', p1);
    registry.register('b', p2);
    expect(registry.list()).toEqual(['a', 'b']);
  });
});
```

**步骤 2: 运行测试验证失败**

运行: `cd packages/provider && pnpm test`
预期: FAIL

**步骤 3: 编写实现**

`packages/provider/src/registry.ts`:
```typescript
import type { Provider } from './base.js';
import { OpenAICompatibleProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import type { HalfCopilotConfig } from '@halfcopilot/config';
import { ProviderError } from '@halfcopilot/shared';

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }

  get(name: string): Provider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderError(name, `Provider "${name}" not found. Available: ${this.list().join(', ')}`);
    }
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  createFromConfig(config: HalfCopilotConfig): void {
    if (!config.providers) return;
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (this.providers.has(name)) continue;
      if (providerConfig.type === 'openai-compatible') {
        const provider = OpenAICompatibleProvider.fromConfig(name, providerConfig);
        this.register(name, provider);
      } else if (providerConfig.type === 'anthropic') {
        const provider = AnthropicProvider.fromConfig(providerConfig);
        this.register(name, provider);
      }
    }
  }
}
```

**步骤 4: 更新 index.ts 导出**

添加: `export { ProviderRegistry } from './registry.js';`

**步骤 5: 运行测试验证通过**

运行: `cd packages/provider && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/provider/
git commit -m "feat: add ProviderRegistry with config-based provider creation"
```

---

## 阶段 3: 工具系统

### 任务 3.1: 创建 tools 包 — 工具注册与执行

**文件：**
- 创建: `packages/tools/package.json`
- 创建: `packages/tools/tsconfig.json`
- 创建: `packages/tools/vitest.config.ts`
- 创建: `packages/tools/src/index.ts`
- 创建: `packages/tools/src/types.ts`
- 创建: `packages/tools/src/registry.ts`
- 创建: `packages/tools/src/executor.ts`
- 创建: `packages/tools/src/permission.ts`
- 创建: `packages/tools/src/__tests__/registry.test.ts`
- 创建: `packages/tools/src/__tests__/permission.test.ts`

**步骤 1: 创建包配置**

`packages/tools/package.json`:
```json
{
  "name": "@halfcopilot/tools",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@halfcopilot/shared": "workspace:*",
    "@halfcopilot/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**步骤 2: 编写失败的测试**

`packages/tools/src/__tests__/registry.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../registry.js';

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
      safe: true,
      execute: async (input) => `result: ${input.x}`,
    });
    const tool = registry.get('test_tool');
    expect(tool.name).toBe('test_tool');
    expect(tool.safe).toBe(true);
  });

  it('should list tool definitions for provider', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'tool_a',
      description: 'Tool A',
      inputSchema: { type: 'object', properties: {} },
      safe: true,
      execute: async () => 'ok',
    });
    registry.register({
      name: 'tool_b',
      description: 'Tool B',
      inputSchema: { type: 'object', properties: {} },
      safe: false,
      execute: async () => 'ok',
    });
    const defs = registry.definitions();
    expect(defs).toHaveLength(2);
    expect(defs[0].name).toBe('tool_a');
  });

  it('should throw for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.get('unknown')).toThrow();
  });
});
```

`packages/tools/src/__tests__/permission.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { PermissionChecker } from '../permission.js';

describe('PermissionChecker', () => {
  it('should auto-approve safe tools', async () => {
    const checker = new PermissionChecker({ autoApproveSafe: true });
    const result = await checker.check('file_read', { path: '/tmp/test.txt' }, true);
    expect(result.approved).toBe(true);
  });

  it('should deny tools in deny list', async () => {
    const checker = new PermissionChecker({
      autoApproveSafe: true,
      deny: ['bash(rm -rf*)'],
    });
    const result = await checker.check('bash', { command: 'rm -rf /' }, false);
    expect(result.approved).toBe(false);
  });

  it('should auto-approve tools matching allow patterns', async () => {
    const checker = new PermissionChecker({
      autoApproveSafe: true,
      allow: ['bash(git status)', 'bash(git diff*)'],
    });
    const result = await checker.check('bash', { command: 'git diff HEAD~1' }, false);
    expect(result.approved).toBe(true);
  });

  it('should require confirmation for unsafe tools without allow match', async () => {
    const checker = new PermissionChecker({
      autoApproveSafe: true,
      allow: [],
    });
    const result = await checker.check('bash', { command: 'rm file.txt' }, false);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('requires_confirmation');
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/tools && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/tools/src/types.ts`:
```typescript
import type { ToolDef } from '@halfcopilot/provider';

export interface Tool extends ToolDef {
  safe: boolean;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface PermissionResult {
  approved: boolean;
  reason?: string;
}
```

`packages/tools/src/registry.ts`:
```typescript
import type { ToolDef } from '@halfcopilot/provider';
import type { Tool } from './types.js';
import { ToolError } from '@halfcopilot/shared';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(name, `Tool "${name}" not found`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  definitions(): ToolDef[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
```

`packages/tools/src/permission.ts`:
```typescript
import type { PermissionResult } from './types.js';

export interface PermissionConfig {
  autoApproveSafe: boolean;
  allow?: string[];
  deny?: string[];
}

export class PermissionChecker {
  private config: PermissionConfig;

  constructor(config: PermissionConfig) {
    this.config = config;
  }

  async check(
    toolName: string,
    input: Record<string, unknown>,
    isSafe: boolean
  ): Promise<PermissionResult> {
    // 1. Check deny list first
    if (this.config.deny) {
      for (const pattern of this.config.deny) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: false, reason: 'denied_by_rule' };
        }
      }
    }

    // 2. Auto-approve safe tools
    if (isSafe && this.config.autoApproveSafe) {
      return { approved: true };
    }

    // 3. Check allow list
    if (this.config.allow) {
      for (const pattern of this.config.allow) {
        if (this.matchesPattern(pattern, toolName, input)) {
          return { approved: true };
        }
      }
    }

    // 4. Require confirmation
    return { approved: false, reason: 'requires_confirmation' };
  }

  private matchesPattern(
    pattern: string,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    // Pattern format: "tool_name(pattern)" or "tool_name"
    const match = pattern.match(/^(\w+)(?:\((.+)\))?$/);
    if (!match) return false;

    const [, patTool, patArg] = match;
    if (patTool !== toolName) return false;
    if (!patArg) return true;

    // Simple glob matching on the primary input value
    const inputValue = String(input.command ?? input.path ?? input.query ?? '');
    const regex = new RegExp('^' + patArg.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(inputValue);
  }
}
```

`packages/tools/src/executor.ts`:
```typescript
import type { ToolRegistry } from './registry.js';
import type { PermissionChecker } from './permission.js';
import type { PermissionResult } from './types.js';
import { ToolError, PermissionError } from '@halfcopilot/shared';

export interface ToolExecutionResult {
  output: string;
  error?: boolean;
}

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private permissions: PermissionChecker,
    private onApprovalNeeded?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>
  ) {}

  async execute(name: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.registry.get(name);

    // Check permissions
    const permResult = await this.permissions.check(name, input, tool.safe);

    if (!permResult.approved) {
      if (permResult.reason === 'requires_confirmation' && this.onApprovalNeeded) {
        const userApproved = await this.onApprovalNeeded(name, input);
        if (!userApproved) {
          throw new PermissionError(name, 'User denied permission');
        }
      } else {
        throw new PermissionError(name, permResult.reason ?? 'Permission denied');
      }
    }

    try {
      const output = await tool.execute(input);
      return { output };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return { output: error.message, error: true };
    }
  }
}
```

`packages/tools/src/index.ts`:
```typescript
export type { Tool, PermissionResult } from './types.js';
export { ToolRegistry } from './registry.js';
export { ToolExecutor, type ToolExecutionResult } from './executor.js';
export { PermissionChecker, type PermissionConfig } from './permission.js';
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/tools && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/tools/
git commit -m "feat: add @halfcopilot/tools package with registry, executor, and permissions"
```

---

### 任务 3.2: 实现内置工具 (file_read, file_write, file_edit, bash, grep, glob)

**文件：**
- 创建: `packages/tools/src/builtins/file-read.ts`
- 创建: `packages/tools/src/builtins/file-write.ts`
- 创建: `packages/tools/src/builtins/file-edit.ts`
- 创建: `packages/tools/src/builtins/bash.ts`
- 创建: `packages/tools/src/builtins/grep.ts`
- 创建: `packages/tools/src/builtins/glob.ts`
- 创建: `packages/tools/src/builtins/index.ts`
- 创建: `packages/tools/src/__tests__/builtins.test.ts`

**步骤 1: 编写失败的测试**

`packages/tools/src/__tests__/builtins.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileReadTool } from '../builtins/file-read.js';
import { createFileWriteTool } from '../builtins/file-write.js';
import { createFileEditTool } from '../builtins/file-edit.js';
import { createBashTool } from '../builtins/bash.js';
import { createGrepTool } from '../builtins/grep.js';
import { createGlobTool } from '../builtins/glob.js';

const TEST_DIR = join(tmpdir(), 'halfcopilot-test-' + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('file_read', () => {
  it('should read file contents', async () => {
    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');
    const tool = createFileReadTool();
    const result = await tool.execute({ path: filePath });
    expect(result).toBe('hello world');
  });

  it('should read file with line numbers', async () => {
    const filePath = join(TEST_DIR, 'lines.txt');
    writeFileSync(filePath, 'line1\nline2\nline3');
    const tool = createFileReadTool();
    const result = await tool.execute({ path: filePath, showLineNumbers: true });
    expect(result).toContain('1');
    expect(result).toContain('line1');
  });

  it('should error for non-existent file', async () => {
    const tool = createFileReadTool();
    await expect(tool.execute({ path: '/nonexistent/file.txt' })).rejects.toThrow();
  });
});

describe('file_write', () => {
  it('should write content to file', async () => {
    const filePath = join(TEST_DIR, 'output.txt');
    const tool = createFileWriteTool();
    await tool.execute({ path: filePath, content: 'written content' });
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(filePath, 'utf-8')).toBe('written content');
  });

  it('should create parent directories', async () => {
    const filePath = join(TEST_DIR, 'sub', 'dir', 'output.txt');
    const tool = createFileWriteTool();
    await tool.execute({ path: filePath, content: 'nested' });
    expect(existsSync(filePath)).toBe(true);
  });
});

describe('file_edit', () => {
  it('should replace text in file', async () => {
    const filePath = join(TEST_DIR, 'edit.txt');
    writeFileSync(filePath, 'hello world');
    const tool = createFileEditTool();
    const result = await tool.execute({
      path: filePath,
      oldText: 'hello',
      newText: 'goodbye',
    });
    expect(result).toContain('goodbye world');
  });

  it('should error if old text not found', async () => {
    const filePath = join(TEST_DIR, 'edit2.txt');
    writeFileSync(filePath, 'hello world');
    const tool = createFileEditTool();
    await expect(
      tool.execute({ path: filePath, oldText: 'not found', newText: 'x' })
    ).rejects.toThrow();
  });
});

describe('bash', () => {
  it('should execute command and return output', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'echo hello' });
    expect(result).toContain('hello');
  });

  it('should capture stderr', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'echo error >&2' });
    expect(result).toContain('error');
  });
});

describe('grep', () => {
  it('should search for pattern in files', async () => {
    const filePath = join(TEST_DIR, 'search.txt');
    writeFileSync(filePath, 'hello world\nfoo bar\nhello again');
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: 'hello', path: TEST_DIR });
    expect(result).toContain('hello');
  });
});

describe('glob', () => {
  it('should find files matching pattern', async () => {
    writeFileSync(join(TEST_DIR, 'a.ts'), '');
    writeFileSync(join(TEST_DIR, 'b.js'), '');
    writeFileSync(join(TEST_DIR, 'c.ts'), '');
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: '**/*.ts', path: TEST_DIR });
    expect(result).toContain('a.ts');
    expect(result).toContain('c.ts');
    expect(result).not.toContain('b.js');
  });
});
```

**步骤 2: 运行测试验证失败**

运行: `cd packages/tools && pnpm test`
预期: FAIL

**步骤 3: 编写所有内置工具实现**

`packages/tools/src/builtins/file-read.ts`:
```typescript
import type { Tool } from '../types.js';
import { readFileSync } from 'node:fs';

export function createFileReadTool(): Tool {
  return {
    name: 'file_read',
    description: 'Read the contents of a file at the given path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line offset to start reading from' },
        limit: { type: 'number', description: 'Maximum number of lines to read' },
        showLineNumbers: { type: 'boolean', description: 'Show line numbers' },
      },
      required: ['path'],
    },
    safe: true,
    async execute(input) {
      const { path, offset, limit, showLineNumbers } = input as {
        path: string;
        offset?: number;
        limit?: number;
        showLineNumbers?: boolean;
      };
      const content = readFileSync(path, 'utf-8');
      let lines = content.split('\n');

      if (offset !== undefined) lines = lines.slice(offset);
      if (limit !== undefined) lines = lines.slice(0, limit);

      if (showLineNumbers) {
        const startLine = (offset ?? 0) + 1;
        return lines.map((line, i) => `${startLine + i}\t${line}`).join('\n');
      }
      return lines.join('\n');
    },
  };
}
```

`packages/tools/src/builtins/file-write.ts`:
```typescript
import type { Tool } from '../types.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createFileWriteTool(): Tool {
  return {
    name: 'file_write',
    description: 'Write content to a file, creating parent directories if needed',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
    safe: false,
    async execute(input) {
      const { path, content } = input as { path: string; content: string };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, 'utf-8');
      return `Successfully wrote to ${path}`;
    },
  };
}
```

`packages/tools/src/builtins/file-edit.ts`:
```typescript
import type { Tool } from '../types.js';
import { readFileSync, writeFileSync } from 'node:fs';

export function createFileEditTool(): Tool {
  return {
    name: 'file_edit',
    description: 'Replace an exact string in a file with a new string',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        oldText: { type: 'string', description: 'Exact text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    safe: false,
    async execute(input) {
      const { path, oldText, newText, replaceAll } = input as {
        path: string;
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      };
      const content = readFileSync(path, 'utf-8');

      if (!content.includes(oldText)) {
        throw new Error(`Text not found in ${path}: "${oldText.slice(0, 50)}..."`);
      }

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldText).join(newText);
      } else {
        const idx = content.indexOf(oldText);
        if (content.indexOf(oldText, idx + 1) !== -1) {
          throw new Error(
            `Multiple occurrences found in ${path}. Use replaceAll: true or provide more context.`
          );
        }
        newContent = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
      }

      writeFileSync(path, newContent, 'utf-8');
      return `Successfully edited ${path}`;
    },
  };
}
```

`packages/tools/src/builtins/bash.ts`:
```typescript
import type { Tool } from '../types.js';
import { exec } from 'node:child_process';

export function createBashTool(): Tool {
  return {
    name: 'bash',
    description: 'Execute a bash command and return its output',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['command'],
    },
    safe: false,
    async execute(input) {
      const { command, timeout = 120000, cwd } = input as {
        command: string;
        timeout?: number;
        cwd?: string;
      };
      return new Promise((resolve, reject) => {
        exec(command, { timeout, cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error) {
            output += (output ? '\n' : '') + `Exit code: ${error.code ?? 1}`;
            resolve(output);
          } else {
            resolve(output || '(no output)');
          }
        });
      });
    },
  };
}
```

`packages/tools/src/builtins/grep.ts`:
```typescript
import type { Tool } from '../types.js';
import { execSync } from 'node:child_process';

export function createGrepTool(): Tool {
  return {
    name: 'grep',
    description: 'Search for a pattern in files using ripgrep or grep',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory or file to search in' },
        glob: { type: 'string', description: 'File glob pattern to filter' },
        ignoreCase: { type: 'boolean', description: 'Case insensitive search' },
      },
      required: ['pattern'],
    },
    safe: true,
    async execute(input) {
      const { pattern, path = '.', glob, ignoreCase } = input as {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
      };

      let cmd = 'grep';
      try { execSync('which rg', { stdio: 'ignore' }); cmd = 'rg'; } catch { /* fallback to grep */ }

      const args: string[] = [];
      if (cmd === 'rg') {
        args.push('--no-heading', '-n');
        if (ignoreCase) args.push('-i');
        if (glob) args.push('--glob', glob);
        args.push('--', pattern, path);
      } else {
        args.push('-n');
        if (ignoreCase) args.push('-i');
        if (glob) args.push('--include', glob);
        args.push('-r', '--', pattern, path);
      }

      try {
        const result = execSync(`${cmd} ${args.map(a => `'${a}'`).join(' ')}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000,
        });
        return result.slice(0, 50000) || 'No matches found';
      } catch (err: any) {
        if (err.status === 1) return 'No matches found';
        throw err;
      }
    },
  };
}
```

`packages/tools/src/builtins/glob.ts`:
```typescript
import type { Tool } from '../types.js';
import { glob as globFn } from 'node:fs/promises';

export function createGlobTool(): Tool {
  return {
    name: 'glob',
    description: 'Find files matching a glob pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.ts)' },
        path: { type: 'string', description: 'Base directory to search in' },
      },
      required: ['pattern'],
    },
    safe: true,
    async execute(input) {
      const { pattern, path = '.' } = input as { pattern: string; path?: string };

      // Use Node.js built-in glob (Node 20+)
      const entries = [];
      const dir = await import('node:fs/promises');
      const { glob } = dir;

      for await (const entry of glob(pattern, { cwd: path, withFileTypes: false })) {
        entries.push(entry as string);
      }

      if (entries.length === 0) return 'No files found matching pattern';
      return entries.join('\n');
    },
  };
}
```

`packages/tools/src/builtins/index.ts`:
```typescript
import type { Tool } from '../types.js';
import { createFileReadTool } from './file-read.js';
import { createFileWriteTool } from './file-write.js';
import { createFileEditTool } from './file-edit.js';
import { createBashTool } from './bash.js';
import { createGrepTool } from './grep.js';
import { createGlobTool } from './glob.js';

export function createBuiltinTools(): Tool[] {
  return [
    createFileReadTool(),
    createFileWriteTool(),
    createFileEditTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
  ];
}

export { createFileReadTool, createFileWriteTool, createFileEditTool, createBashTool, createGrepTool, createGlobTool };
```

**步骤 4: 更新 index.ts 导出**

在 `packages/tools/src/index.ts` 末尾添加:
```typescript
export { createBuiltinTools, createFileReadTool, createFileWriteTool, createFileEditTool, createBashTool, createGrepTool, createGlobTool } from './builtins/index.js';
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/tools && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/tools/
git commit -m "feat: add builtin tools (file_read, file_write, file_edit, bash, grep, glob)"
```

---

## 阶段 4: 核心 Agent 引擎

### 任务 4.1: 创建 core 包 — 会话管理与上下文压缩

**文件：**
- 创建: `packages/core/package.json`
- 创建: `packages/core/tsconfig.json`
- 创建: `packages/core/vitest.config.ts`
- 创建: `packages/core/src/index.ts`
- 创建: `packages/core/src/conversation/types.ts`
- 创建: `packages/core/src/conversation/manager.ts`
- 创建: `packages/core/src/conversation/compaction.ts`
- 创建: `packages/core/src/__tests__/conversation.test.ts`

**步骤 1: 创建包配置**

`packages/core/package.json`:
```json
{
  "name": "@halfcopilot/core",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@halfcopilot/shared": "workspace:*",
    "@halfcopilot/config": "workspace:*",
    "@halfcopilot/provider": "workspace:*",
    "@halfcopilot/tools": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**步骤 2: 编写失败的测试**

`packages/core/src/__tests__/conversation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ConversationManager } from '../conversation/manager.js';
import type { Message } from '@halfcopilot/provider';

describe('ConversationManager', () => {
  it('should add and retrieve messages', () => {
    const cm = new ConversationManager({ maxMessages: 100 });
    cm.addUserMessage('Hello');
    cm.addAssistantMessage('Hi there!');
    const messages = cm.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should add tool_use and tool_result messages', () => {
    const cm = new ConversationManager({ maxMessages: 100 });
    cm.addAssistantMessage([
      { type: 'text', text: 'Reading file...' },
      { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { path: '/tmp/a.txt' } },
    ]);
    cm.addToolResult('tu_1', 'file contents');
    const messages = cm.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('tool_result');
  });

  it('should enforce max messages limit', () => {
    const cm = new ConversationManager({ maxMessages: 5 });
    for (let i = 0; i < 10; i++) {
      cm.addUserMessage(`Message ${i}`);
    }
    const messages = cm.getMessages();
    expect(messages.length).toBeLessThanOrEqual(5);
  });

  it('should build messages with system prompt', () => {
    const cm = new ConversationManager({ maxMessages: 100 });
    cm.addUserMessage('Hello');
    const messages = cm.buildMessages('You are a helpful assistant.');
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('You are a helpful assistant.');
  });

  it('should track token usage', () => {
    const cm = new ConversationManager({ maxMessages: 100 });
    cm.addTokenUsage({ inputTokens: 100, outputTokens: 50 });
    cm.addTokenUsage({ inputTokens: 200, outputTokens: 100 });
    const usage = cm.getTotalUsage();
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
  });
});
```

**步骤 3: 运行测试验证失败**

运行: `cd packages/core && pnpm test`
预期: FAIL

**步骤 4: 编写实现**

`packages/core/src/conversation/types.ts`:
```typescript
export interface ConversationConfig {
  maxMessages: number;
  compactionThreshold?: number;
}
```

`packages/core/src/conversation/manager.ts`:
```typescript
import type { Message, TokenUsage } from '@halfcopilot/provider';
import type { ConversationConfig } from './types.js';

export class ConversationManager {
  private messages: Message[] = [];
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private config: ConversationConfig;

  constructor(config: ConversationConfig) {
    this.config = config;
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
    this.enforceLimit();
  }

  addAssistantMessage(content: string | Message[]): void {
    if (typeof content === 'string') {
      this.messages.push({ role: 'assistant', content });
    } else {
      // Already formatted content blocks
      this.messages.push({ role: 'assistant', content: content as any });
    }
    this.enforceLimit();
  }

  addToolResult(toolUseId: string, output: string, isError = false): void {
    this.messages.push({
      role: 'tool_result',
      toolUseId,
      content: output,
      isError,
    });
    this.enforceLimit();
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  buildMessages(systemPrompt?: string): Message[] {
    const msgs: Message[] = [];
    if (systemPrompt) {
      msgs.push({ role: 'system', content: systemPrompt });
    }
    msgs.push(...this.messages);
    return msgs;
  }

  addTokenUsage(usage: TokenUsage): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
  }

  private enforceLimit(): void {
    while (this.messages.length > this.config.maxMessages) {
      // Remove oldest user/assistant pair, keep system messages
      const idx = this.messages.findIndex(
        (m) => m.role === 'user' || m.role === 'assistant'
      );
      if (idx >= 0) {
        this.messages.splice(idx, 1);
      } else {
        break;
      }
    }
  }
}
```

`packages/core/src/conversation/compaction.ts`:
```typescript
import type { Message } from '@halfcopilot/provider';
import type { Provider } from '@halfcopilot/provider';

export class ConversationCompactor {
  constructor(private provider: Provider, private model: string) {}

  async compact(messages: Message[]): Promise<Message[]> {
    if (messages.length <= 4) return messages;

    // Keep first 2 and last 2 messages, summarize the middle
    const first = messages.slice(0, 2);
    const last = messages.slice(-2);
    const middle = messages.slice(2, -2);

    const summary = await this.summarize(middle);

    return [
      ...first,
      { role: 'user' as const, content: `[Previous conversation summary: ${summary}]` },
      ...last,
    ];
  }

  private async summarize(messages: Message[]): Promise<string> {
    const content = messages
      .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    let summary = '';
    for await (const event of this.provider.chat({
      model: this.model,
      messages: [
        { role: 'user', content: `Summarize the following conversation briefly:\n\n${content}` },
      ],
      maxTokens: 500,
    })) {
      if (event.type === 'text') {
        summary += event.content;
      }
    }
    return summary || 'Conversation history condensed.';
  }
}
```

**步骤 5: 运行测试验证通过**

运行: `cd packages/core && pnpm test`
预期: PASS

**步骤 6: 提交**

```bash
git add packages/core/
git commit -m "feat: add @halfcopilot/core with ConversationManager and compaction"
```

---

### 任务 4.2: 实现 Agent Loop

**文件：**
- 创建: `packages/core/src/agent/types.ts`
- 创建: `packages/core/src/agent/loop.ts`
- 创建: `packages/core/src/agent/planner.ts`
- 创建: `packages/core/src/__tests__/agent-loop.test.ts`

**步骤 1: 编写失败的测试**

`packages/core/src/__tests__/agent-loop.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop, type AgentContext } from '../agent/loop.js';
import type { Provider, ChatEvent } from '@halfcopilot/provider';
import type { ToolRegistry } from '@halfcopilot/tools';
import type { PermissionChecker } from '@halfcopilot/tools';
import { ConversationManager } from '../conversation/manager.js';

// Mock provider that returns a simple text response
function createMockProvider(events: ChatEvent[]): Provider {
  return {
    name: 'mock',
    supportsToolUse: () => true,
    supportsStreaming: () => true,
    async *chat() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe('AgentLoop', () => {
  it('should process text response and stop', async () => {
    const provider = createMockProvider([
      { type: 'text', content: 'Hello! ' },
      { type: 'text', content: 'How can I help?' },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
    ]);
    const conversation = new ConversationManager({ maxMessages: 100 });
    const events: any[] = [];

    const loop = new AgentLoop({
      provider,
      model: 'test-model',
      conversation,
      tools: null as any,
      permissions: null as any,
      maxTurns: 10,
    });

    for await (const event of loop.run('Hi')) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'text')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('should process tool_use and tool_result in a loop', async () => {
    let callCount = 0;
    const provider: Provider = {
      name: 'mock',
      supportsToolUse: () => true,
      supportsStreaming: () => true,
      async *chat() {
        callCount++;
        if (callCount === 1) {
          yield { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { path: '/tmp/test.txt' } };
          yield { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } };
        } else {
          yield { type: 'text', content: 'I read the file.' };
          yield { type: 'done', usage: { inputTokens: 30, outputTokens: 10 } };
        }
      },
    };
    const conversation = new ConversationManager({ maxMessages: 100 });
    const events: any[] = [];

    const loop = new AgentLoop({
      provider,
      model: 'test-model',
      conversation,
      tools: {
        get: () => ({ name: 'file_read', safe: true, execute: async () => 'file contents' }),
        definitions: () => [],
      } as any,
      permissions: {
        check: async () => ({ approved: true }),
      } as any,
      maxTurns: 10,
    });

    for await (const event of loop.run('Read the file')) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'tool_use')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    expect(callCount).toBe(2); // First call returns tool_use, second returns text
  });

  it('should respect max turns limit', async () => {
    const provider: Provider = {
      name: 'mock',
      supportsToolUse: () => true,
      supportsStreaming: () => true,
      async *chat() {
        // Infinite tool use loop
        yield { type: 'tool_use', id: `tu_${Date.now()}`, name: 'bash', input: { command: 'echo hi' } };
        yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
      },
    };
    const conversation = new ConversationManager({ maxMessages: 1000 });
    const events: any[] = [];

    const loop = new AgentLoop({
      provider,
      model: 'test-model',
      conversation,
      tools: {
        get: () => ({ name: 'bash', safe: false, execute: async () => 'hi' }),
        definitions: () => [],
      } as any,
      permissions: {
        check: async () => ({ approved: true }),
      } as any,
      maxTurns: 3,
    });

    for await (const event of loop.run('Keep running')) {
      events.push(event);
    }

    const toolUseCount = events.filter((e) => e.type === 'tool_use').length;
    expect(toolUseCount).toBeLessThanOrEqual(3);
  });
});
```

**步骤 2: 运行测试验证失败**

运行: `cd packages/core && pnpm test`
预期: FAIL

**步骤 3: 编写实现**

`packages/core/src/agent/types.ts`:
```typescript
import type { Provider, ChatEvent, ToolDef, TokenUsage } from '@halfcopilot/provider';
import type { ConversationManager } from '../conversation/manager.js';

export type AgentMode = 'plan' | 'act' | 'auto';

export interface AgentEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'done' | 'error' | 'mode_change';
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  usage?: TokenUsage;
  mode?: AgentMode;
  error?: Error;
}

export interface AgentConfig {
  provider: Provider;
  model: string;
  conversation: ConversationManager;
  tools: ToolRegistryLike | null;
  permissions: PermissionCheckerLike | null;
  maxTurns: number;
  mode?: AgentMode;
  systemPrompt?: string;
  onApprovalNeeded?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
}

export interface ToolRegistryLike {
  get(name: string): { name: string; safe: boolean; execute: (input: Record<string, unknown>) => Promise<string> };
  definitions(): ToolDef[];
}

export interface PermissionCheckerLike {
  check(toolName: string, input: Record<string, unknown>, isSafe: boolean): Promise<{ approved: boolean; reason?: string }>;
}
```

`packages/core/src/agent/loop.ts`:
```typescript
import type { ChatEvent } from '@halfcopilot/provider';
import type { AgentConfig, AgentEvent, AgentMode } from './types.js';
import { PLAN_SAFE_TOOLS } from './planner.js';

export class AgentLoop {
  private config: AgentConfig;
  private currentMode: AgentMode;
  private turnCount: number;

  constructor(config: AgentConfig) {
    this.config = config;
    this.currentMode = config.mode ?? 'auto';
    this.turnCount = 0;
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    this.config.conversation.addUserMessage(userMessage);
    this.turnCount = 0;

    while (this.turnCount < this.config.maxTurns) {
      this.turnCount++;
      let hasToolUse = false;

      const messages = this.config.conversation.buildMessages(this.getSystemPrompt());
      const tools = this.config.tools?.definitions();
      const stream = this.config.provider.chat({
        model: this.config.model,
        messages,
        tools: this.currentMode === 'plan' ? this.filterPlanTools(tools) : tools,
        systemPrompt: undefined, // Already in messages
        maxTokens: this.config.conversation.getTotalUsage().inputTokens > 0 ? undefined : 16384,
      });

      let fullText = '';
      let thinkingText = '';

      for await (const event of stream) {
        if (event.type === 'text') {
          fullText += event.content;
          yield { type: 'text', content: event.content };
        }

        if (event.type === 'thinking') {
          thinkingText += event.content;
          yield { type: 'thinking', content: event.content };
        }

        if (event.type === 'tool_use') {
          hasToolUse = true;
          const toolName = event.name;
          const toolInput = event.input;

          yield { type: 'tool_use', toolName, toolInput };

          // Check plan mode restrictions
          if (this.currentMode === 'plan' && !PLAN_SAFE_TOOLS.includes(toolName)) {
            const msg = `Tool "${toolName}" is not allowed in plan mode. Switch to act mode to execute.`;
            yield { type: 'tool_result', toolName, toolOutput: msg };
            this.config.conversation.addToolResult(event.id, msg, true);
            continue;
          }

          // Check permissions
          if (this.config.tools && this.config.permissions) {
            const tool = this.config.tools.get(toolName);
            const permResult = await this.config.permissions.check(toolName, toolInput, tool.safe);

            if (!permResult.approved) {
              if (permResult.reason === 'requires_confirmation' && this.config.onApprovalNeeded) {
                const userApproved = await this.config.onApprovalNeeded(toolName, toolInput);
                if (!userApproved) {
                  const msg = `Permission denied for ${toolName}: user rejected`;
                  yield { type: 'tool_result', toolName, toolOutput: msg };
                  this.config.conversation.addToolResult(event.id, msg, true);
                  continue;
                }
              } else {
                const msg = `Permission denied for ${toolName}: ${permResult.reason}`;
                yield { type: 'tool_result', toolName, toolOutput: msg };
                this.config.conversation.addToolResult(event.id, msg, true);
                continue;
              }
            }

            // Execute tool
            try {
              const result = await tool.execute(toolInput);
              yield { type: 'tool_result', toolName, toolOutput: result };
              this.config.conversation.addToolResult(event.id, result);
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              yield { type: 'tool_result', toolName, toolOutput: errorMsg };
              this.config.conversation.addToolResult(event.id, errorMsg, true);
            }
          }
        }

        if (event.type === 'done') {
          this.config.conversation.addTokenUsage(event.usage);
          if (!hasToolUse) {
            // No tool use — add the assistant message and stop
            if (fullText) {
              this.config.conversation.addAssistantMessage(fullText);
            }
            yield { type: 'done', usage: event.usage };
            return;
          }
        }

        if (event.type === 'error') {
          yield { type: 'error', error: event.error };
          return;
        }
      }
    }

    // Max turns reached
    yield { type: 'done', usage: this.config.conversation.getTotalUsage() };
  }

  getMode(): AgentMode {
    return this.currentMode;
  }

  setMode(mode: AgentMode): void {
    this.currentMode = mode;
  }

  private getSystemPrompt(): string {
    let prompt = this.config.systemPrompt ?? 'You are HalfCopilot, a helpful AI assistant.';

    if (this.currentMode === 'plan') {
      prompt += '\n\nYou are currently in PLAN mode. You can only read files and search the codebase. You cannot write files or execute commands. Analyze the situation and present a plan.';
    }

    return prompt;
  }

  private filterPlanTools(tools: any[] | undefined): any[] | undefined {
    if (!tools) return undefined;
    return tools.filter((t: any) => PLAN_SAFE_TOOLS.includes(t.name));
  }
}
```

`packages/core/src/agent/planner.ts`:
```typescript
export const PLAN_SAFE_TOOLS = ['file_read', 'grep', 'glob'];
```

`packages/core/src/index.ts`:
```typescript
export { AgentLoop } from './agent/loop.js';
export type { AgentConfig, AgentEvent, AgentMode, ToolRegistryLike, PermissionCheckerLike } from './agent/types.js';
export { PLAN_SAFE_TOOLS } from './agent/planner.js';
export { ConversationManager } from './conversation/manager.js';
export { ConversationCompactor } from './conversation/compaction.js';
```

**步骤 4: 运行测试验证通过**

运行: `cd packages/core && pnpm test`
预期: PASS

**步骤 5: 提交**

```bash
git add packages/core/
git commit -m "feat: add AgentLoop with plan/act mode, tool execution, and permission checks"
```

---

## 阶段 5: 记忆系统与 MCP

### 任务 5.1: 创建 memory 包

**文件：**
- 创建: `packages/memory/package.json`
- 创建: `packages/memory/tsconfig.json`
- 创建: `packages/memory/vitest.config.ts`
- 创建: `packages/memory/src/index.ts`
- 创建: `packages/memory/src/store.ts`
- 创建: `packages/memory/src/__tests__/store.test.ts`

**步骤 1 — 步骤 5: TDD 实现记忆系统**

记忆系统实现要点：
- 4 种类型: user / feedback / project / reference
- 两级存储: 项目级 `.halfcopilot/memory/` 和 用户级 `~/.halfcopilot/memory/`
- MEMORY.md 作为索引，自动加载到上下文
- 每条记忆以 Markdown 文件存储，带 YAML frontmatter

测试用例覆盖: 读写记忆、索引更新、两级合并、类型过滤

**步骤 6: 提交**

```bash
git commit -m "feat: add @halfcopilot/memory package with project/user level memory store"
```

---

### 任务 5.2: 创建 mcp 包

**文件：**
- 创建: `packages/mcp/package.json`
- 创建: `packages/mcp/tsconfig.json`
- 创建: `packages/mcp/vitest.config.ts`
- 创建: `packages/mcp/src/index.ts`
- 创建: `packages/mcp/src/client.ts`
- 创建: `packages/mcp/src/transport.ts`
- 创建: `packages/mcp/src/types.ts`
- 创建: `packages/mcp/src/__tests__/client.test.ts`

**步骤 1 — 步骤 5: TDD 实现 MCP 客户端**

MCP 客户端实现要点：
- 实现 MCP 协议的 JSON-RPC 消息格式
- 支持 stdio 传输（spawn 子进程通信）
- 支持 SSE 传输（HTTP 长连接）
- `listTools()` / `callTool()` / `listResources()` / `readResource()` 接口
- 将 MCP 工具动态注册到 ToolRegistry

测试用例: JSON-RPC 消息格式化、stdio 传输初始化、工具列表解析

**步骤 6: 提交**

```bash
git commit -m "feat: add @halfcopilot/mcp package with stdio/SSE transport client"
```

---

## 阶段 6: CLI 与 TUI

### 任务 6.1: 创建 CLI 入口

**文件：**
- 创建: `packages/cli/package.json`
- 创建: `packages/cli/tsconfig.json`
- 创建: `packages/cli/src/index.ts`
- 创建: `packages/cli/src/commands/chat.ts`
- 创建: `packages/cli/src/commands/config-cmd.ts`
- 创建: `packages/cli/src/commands/run.ts`

**实现要点：**
- 使用 `commander` 解析 CLI 参数
- `halfcopilot` / `halfcopilot chat` — 交互式对话
- `halfcopilot run -p "task"` — 非交互式执行
- `halfcopilot config` — 配置管理
- `--provider` / `--model` / `--mode` 参数覆盖

**步骤 6: 提交**

```bash
git commit -m "feat: add @halfcopilot/cli with commander-based CLI entry"
```

---

### 任务 6.2: 实现 TUI (ink/React)

**文件：**
- 创建: `packages/cli/src/app.tsx`
- 创建: `packages/cli/src/components/ChatView.tsx`
- 创建: `packages/cli/src/components/MessageBubble.tsx`
- 创建: `packages/cli/src/components/ToolApproval.tsx`
- 创建: `packages/cli/src/components/StatusBar.tsx`
- 创建: `packages/cli/src/components/InputField.tsx`

**实现要点：**
- ink 4.x + React 18 构建 TUI
- ChatView 渲染消息流（文本、工具调用、工具结果）
- ToolApproval 组件处理权限确认（y/n）
- StatusBar 显示当前模型、模式、token 使用量
- InputField 接收用户输入
- 流式渲染：Agent Loop 的 AsyncGenerator 事件实时更新 UI

**步骤 6: 提交**

```bash
git commit -m "feat: add TUI with ink/React components for chat, tool approval, status"
```

---

### 任务 6.3: 集成所有组件

**文件：**
- 修改: `packages/cli/src/commands/chat.ts` — 连接 AgentLoop + Provider + Tools + TUI
- 修改: `packages/cli/src/commands/run.ts` — 非交互式执行
- 创建: `packages/cli/src/bootstrap.ts` — 初始化所有组件

**bootstrap.ts 核心逻辑：**
```typescript
1. 加载配置 (config.loadConfig)
2. 创建 ProviderRegistry 并注册 providers
3. 创建 ToolRegistry 并注册内置工具
4. 初始化 MCP 客户端并注册 MCP 工具
5. 创建 PermissionChecker
6. 创建 ConversationManager
7. 创建 AgentLoop
8. 启动 TUI / 执行命令
```

**步骤 6: 提交**

```bash
git commit -m "feat: integrate all components in CLI bootstrap"
```

---

## 阶段 7: 端到端验证

### 任务 7.1: 添加集成测试

**文件：**
- 创建: `packages/cli/src/__tests__/integration.test.ts`

**测试场景：**
1. 完整对话循环（mock provider）: 用户输入 → Agent 响应
2. 工具调用循环: 用户输入 → Agent 调用 file_read → 返回结果 → Agent 总结
3. Plan 模式: 只读工具可用，写操作被拒绝
4. 权限拒绝: unsafe 工具未授权时被拒绝
5. 上下文压缩: 超过阈值时触发压缩

**步骤 6: 提交**

```bash
git commit -m "test: add integration tests for agent loop, tools, and permissions"
```

---

### 任务 7.2: 构建与发布准备

**文件：**
- 修改: `packages/cli/package.json` — 添加 bin 入口
- 创建: `README.md` — 项目文档
- 修改: `turbo.json` — 添加 build 依赖顺序

**步骤：**
1. 在 `packages/cli/package.json` 添加:
```json
"bin": {
  "halfcopilot": "./dist/index.js"
}
```
2. 在 `packages/cli/src/index.ts` 顶部添加 shebang: `#!/usr/bin/env node`
3. 验证 `pnpm build` 全量构建成功
4. 验证 `pnpm test` 全量测试通过
5. 验证 `npx halfcopilot --help` 输出正确

**步骤 5: 提交**

```bash
git commit -m "feat: add CLI bin entry, README, and build configuration"
```

---

## 依赖构建顺序

```
shared → config → provider → tools → core → memory → mcp → cli
```

每个包依赖前序包，Turborepo 的 `dependsOn: ["^build"]` 自动处理构建顺序。

## 预估工作量

| 阶段 | 任务数 | 预估时间 |
|------|--------|----------|
| 阶段 1: 脚手架 | 3 | 1-2h |
| 阶段 2: Provider | 4 | 3-4h |
| 阶段 3: 工具 | 2 | 2-3h |
| 阶段 4: Agent Core | 2 | 3-4h |
| 阶段 5: 记忆+MCP | 2 | 2-3h |
| 阶段 6: CLI+TUI | 3 | 4-5h |
| 阶段 7: 集成验证 | 2 | 1-2h |
| **总计** | **18** | **16-23h** |
# HalfCopilot 项目结构

## Monorepo 布局

使用 Turborepo + pnpm workspace 管理多包项目。

```
halfcopilot/
├── packages/
│   ├── cli/              # CLI 入口 + TUI (ink/React)
│   │   ├── src/
│   │   │   ├── index.tsx           # 入口文件
│   │   │   ├── app.tsx             # 主应用组件
│   │   │   ├── components/         # TUI 组件
│   │   │   │   ├── ChatView.tsx    # 聊天视图
│   │   │   │   ├── ToolApproval.tsx # 工具确认弹窗
│   │   │   │   ├── StatusBar.tsx   # 状态栏
│   │   │   │   ├── HelpOverlay.tsx # 帮助覆盖层
│   │   │   │   └── index.ts
│   │   │   ├── commands/           # 命令处理
│   │   │   │   ├── chat.ts
│   │   │   │   ├── run.ts
│   │   │   │   ├── init.ts
│   │   │   │   └── index.ts
│   │   │   ├── hooks/              # React Hooks
│   │   │   │   ├── useAgent.ts
│   │   │   │   ├── useMemory.ts
│   │   │   │   └── index.ts
│   │   │   └── styles/             # 样式定义
│   │   │       └── theme.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── core/             # Agent 核心引擎
│   │   ├── src/
│   │   │   ├── agent-loop.ts       # Agent 主循环
│   │   │   ├── planner.ts          # 规划器
│   │   │   ├── executor.ts         # 执行器
│   │   │   ├── context.ts          # 上下文管理
│   │   │   ├── conversation.ts     # 对话历史
│   │   │   ├── permissions.ts      # 权限审批
│   │   │   ├── system-prompt.ts    # 系统提示词
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── provider/         # 模型 Provider 层
│   │   ├── src/
│   │   │   ├── base.ts             # 基础抽象类
│   │   │   ├── openai-compatible.ts # OpenAI 兼容轨
│   │   │   ├── anthropic.ts        # Anthropic 原生轨
│   │   │   ├── registry.ts         # Provider 注册表
│   │   │   ├── types.ts            # 类型定义
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── tools/            # 工具系统
│   │   ├── src/
│   │   │   ├── registry.ts         # 工具注册表
│   │   │   ├── file-tools.ts       # 文件操作工具
│   │   │   ├── bash-tools.ts       # Bash 执行工具
│   │   │   ├── search-tools.ts     # 搜索工具 (grep/glob)
│   │   │   ├── parser.ts           # 文本解析器
│   │   │   ├── types.ts            # 类型定义
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp/              # MCP 协议层
│   │   ├── src/
│   │   │   ├── client.ts           # MCP 客户端
│   │   │   ├── server.ts           # MCP Server 支持
│   │   │   ├── transport/          # 传输层
│   │   │   │   ├── stdio.ts
│   │   │   │   └── sse.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── memory/           # 记忆系统
│   │   ├── src/
│   │   │   ├── memory.ts           # 记忆管理
│   │   │   ├── types.ts            # 记忆类型
│   │   │   ├── storage.ts          # 存储抽象
│   │   │   ├── indexer.ts          # 索引器
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── config/           # 配置系统
│   │   ├── src/
│   │   │   ├── config.ts           # 配置加载
│   │   │   ├── schema.ts           # 配置 Schema
│   │   │   ├── env.ts              # 环境变量
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/           # 共享工具库
│       ├── src/
│       │   ├── logger.ts           # 日志工具
│       │   ├── encoding.ts         # 编码检测
│       │   ├── path.ts             # 路径工具
│       │   ├── async.ts            # 异步工具
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                 # 文档
│   ├── plans/            # 设计文档
│   ├── specs/            # 技术规范
│   └── guides/           # 使用指南
│
├── scripts/              # 构建脚本
│   ├── build.ts
│   └── release.ts
│
├── tests/                # E2E 测试
│   ├── e2e/
│   └── fixtures/
│
├── .github/              # GitHub 配置
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── tsconfig.base.json    # 基础 TS 配置
├── turbo.json            # Turborepo 配置
├── pnpm-workspace.yaml   # pnpm workspace
├── package.json          # 根 package.json
├── .eslintrc.js          # ESLint 配置
├── .prettierrc           # Prettier 配置
├── .gitignore            # Git ignore
└── README.md             # 项目说明
```

---

## 包依赖关系

```
┌─────────────────────────────────────────────────────────┐
│                         cli                             │
│  (依赖：core, tools, memory, config, shared)            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                        core                             │
│  (依赖：provider, tools, memory, config, shared)        │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐
│  provider   │ │   tools    │ │   memory    │
│  (依赖：shared)│ │(依赖：shared)│ │(依赖：config)│
└─────────────┘ └──────────────┘ └─────────────┘
       │
┌──────▼──────┐
│    config   │
│  (依赖：shared)│
└─────────────┘
```

---

## 核心包详解

### @halfcopilot/cli

CLI 入口包，负责：
- 命令行参数解析 (commander)
- TUI 渲染 (ink/React)
- 命令分发
- 用户交互

**关键依赖：**
```json
{
  "dependencies": {
    "@halfcopilot/core": "workspace:*",
    "@halfcopilot/tools": "workspace:*",
    "@halfcopilot/memory": "workspace:*",
    "@halfcopilot/config": "workspace:*",
    "ink": "^4.0.0",
    "react": "^18.0.0",
    "commander": "^11.0.0"
  }
}
```

### @halfcopilot/core

Agent 核心引擎，负责：
- Agent Loop 实现
- 对话历史管理
- 权限审批流程
- 系统提示词生成

**核心接口：**
```typescript
interface AgentContext {
  provider: Provider;
  tools: ToolRegistry;
  memory: MemoryManager;
  config: Config;
  conversation: Conversation;
  permissions: PermissionManager;
}

async function* agentLoop(ctx: AgentContext): AsyncGenerator<AgentEvent> {
  // ...
}
```

### @halfcopilot/provider

模型 Provider 层，负责：
- OpenAI 兼容轨实现
- Anthropic 原生实现
- Provider 注册和路由

**支持的模型：**
- DeepSeek (deepseek-chat, deepseek-reasoner)
- MiniMax (abab6, abab7)
- Xiaomi-MiMo (miMo)
- Qwen (qwen-turbo, qwen-plus)
- Claude (claude-sonnet, claude-opus)

### @halfcopilot/tools

工具系统，负责：
- 内置工具实现
- 工具注册和路由
- 文本解析降级

**内置工具：**
- file_read, file_write, file_edit
- bash
- grep, glob, list_files
- notebook_edit

### @halfcopilot/mcp

MCP 协议层，负责：
- MCP 客户端实现
- MCP Server 连接
- 工具动态注册

**传输协议：**
- stdio (本地进程)
- SSE (远程服务)

### @halfcopilot/memory

记忆系统，负责：
- 4 种记忆类型管理
- 记忆存储和检索
- 自动索引

**记忆类型：**
- user: 用户偏好
- feedback: 用户纠正
- project: 项目上下文
- reference: 外部引用

### @halfcopilot/config

配置系统，负责：
- 配置加载和合并
- 环境变量解析
- Schema 验证

**配置优先级：**
1. 命令行参数
2. 环境变量 (HALFCOPILOT_*)
3. 项目配置 (.halfcopilot/settings.json)
4. 用户配置 (~/.halfcopilot/settings.json)

### @halfcopilot/shared

共享工具库，负责：
- 日志工具
- 编码检测
- 路径处理
- 异步工具

---

## 构建配置

### tsconfig.base.json

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

### turbo.json

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
    },
    "clean": {
      "cache": false
    }
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

---

## 开发工作流

### 初始化

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 开发模式
pnpm dev  # 启动所有包的 watch 模式
```

### 测试

```bash
# 单元测试
pnpm test

# E2E 测试
pnpm test:e2e

# 覆盖率
pnpm test:coverage
```

### 发布

```bash
# 版本管理 (使用 changesets)
pnpm changeset
pnpm version
pnpm publish -r
```

---

## 包发布策略

### 独立发布

每个包独立版本号，使用 changesets 管理：

```bash
# 标记变更
pnpm changeset

# 根据变更类型更新版本
# patch: 补丁版本 (0.0.x)
# minor: 次版本 (0.x.0)
# major: 主版本 (x.0.0)
```

### 协同发布

CLI 包发布时，确保所有内部依赖版本一致：

```json
{
  "dependencies": {
    "@halfcopilot/core": "0.1.0",
    "@halfcopilot/tools": "0.1.0",
    "@halfcopilot/memory": "0.1.0"
  }
}
```

---

## 目录命名规范

- **kebab-case**: 目录和文件名 (`file-tools.ts`)
- **PascalCase**: React 组件和类 (`ChatView.tsx`)
- **camelCase**: 函数和变量 (`agentLoop.ts`)

---

## 代码组织原则

1. **单一职责**: 每个文件只做一件事
2. **显式导出**: 使用 `index.ts` 统一导出
3. **类型优先**: 先定义类型，再实现逻辑
4. **测试覆盖**: 每个工具函数都有对应测试
# HalfCopilot — Agent Framework CLI 设计文档

## 概述

HalfCopilot 是一个开源 Agent 框架 CLI，借鉴 Claude Code 的核心设计，支持多模型提供商（DeepSeek、MiniMax、Xiaomi-MiMo、Qwen、Claude 等），使用 TypeScript 开发，ink 构建 TUI。

## 技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 生态成熟，OpenCode/Cline/Claude Code 都用 TS |
| 运行时 | Node.js + pnpm | 兼容性最好 |
| TUI | ink (React for CLI) | 组件化开发，主流选择 |
| 构建 | Turborepo monorepo | 统一构建，包独立发布 |
| 模型接入 | OpenAI 兼容 + Anthropic 双轨 | 覆盖绝大多数模型 |
| 工具系统 | 混合模式 (tool_use + 文本解析) | 兼容性最好 |
| MCP | 内置支持 | 扩展工具生态 |

## 整体架构

```
┌─────────────────────────────────────────────┐
│              HalfCopilot CLI                │
│  ┌───────────────────────────────────────┐  │
│  │         TUI Layer (ink/React)         │  │
│  │  Chat View │ Tool Approval │ Status   │  │
│  └───────────────┬───────────────────────┘  │
│  ┌───────────────▼───────────────────────┐  │
│  │         Agent Loop (Core)             │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │ Planner │ │ Executor │ │Observer│ │  │
│  │  └─────────┘ └────┬─────┘ └────────┘ │  │
│  └───────────────────┼───────────────────┘  │
│  ┌───────────────────▼───────────────────┐  │
│  │         Tool System                   │  │
│  │  File │ Bash │ Grep │ Glob │ MCP...  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │     Provider Layer (双轨)             │  │
│  │  OpenAI-Compatible │ Anthropic SDK    │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │     Infrastructure                    │  │
│  │  Config │ Memory │ Permissions │ Log  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 项目结构

```
halfcopilot/
├── packages/
│   ├── cli/          # CLI 入口 + TUI (ink/React)
│   ├── core/         # Agent 核心引擎 (loop, planner, executor)
│   ├── provider/     # 模型 Provider 层 (OpenAI 兼容 + Anthropic)
│   ├── tools/        # 工具系统 (内置工具 + 权限 + 文本解析)
│   ├── mcp/          # MCP 协议层
│   ├── memory/       # 记忆系统
│   ├── config/       # 配置系统
│   └── shared/       # 共享工具库
```

## Provider 层设计

### 抽象接口

```typescript
interface Provider {
  name: string;
  chat(params: ChatParams): AsyncGenerator<ChatEvent>;
  supportsToolUse(): boolean;
  supportsStreaming(): boolean;
}
```

### 双轨模型

- **OpenAI 兼容轨**：统一处理 DeepSeek、MiniMax、Xiaomi-MiMo、Qwen 等所有兼容 OpenAI API 的模型
- **Anthropic 轨**：原生 Claude API，支持 tool_use 和 thinking

### 模型配置

```json
{
  "defaultProvider": "deepseek",
  "providers": {
    "deepseek": {
      "type": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "env:DEEPSEEK_API_KEY",
      "models": {
        "deepseek-chat": { "contextWindow": 64000, "maxOutput": 8192 },
        "deepseek-reasoner": { "contextWindow": 64000, "maxOutput": 8192, "thinking": true }
      }
    },
    "anthropic": {
      "type": "anthropic",
      "apiKey": "env:ANTHROPIC_API_KEY",
      "models": {
        "claude-sonnet-4-6": { "contextWindow": 200000, "maxOutput": 16384 }
      }
    }
  }
}
```

## Agent Loop 设计

```typescript
async function* agentLoop(ctx: AgentContext): AsyncGenerator<AgentEvent> {
  while (true) {
    const messages = ctx.conversation.buildMessages();
    const stream = ctx.provider.chat({ model, messages, tools, systemPrompt });

    for await (const event of stream) {
      if (event.type === 'tool_use') {
        const approved = await ctx.permissions.check(event.name, event.input);
        if (!approved) continue;
        const result = await ctx.tools.execute(event.name, event.input);
        ctx.conversation.addToolResult(event.id, result);
      }
      if (event.type === 'text') {
        // 混合模式：检测文本中的编辑指令
        const edits = ctx.tools.parser.tryParse(event.content);
        if (edits.length > 0) await ctx.tools.executeEdits(edits);
      }
      if (event.type === 'done') {
        if (shouldContinue(ctx)) continue;
        return;
      }
    }
  }
}
```

## 工具系统

### 内置工具

| 工具 | 功能 | 安全级别 |
|------|------|----------|
| file_read | 读取文件 | safe |
| file_write | 写入文件 | unsafe |
| file_edit | 编辑文件 | unsafe |
| bash | 执行命令 | unsafe |
| grep | 搜索内容 | safe |
| glob | 搜索文件 | safe |
| notebook_edit | 编辑 Notebook | unsafe |

### 权限模型

- **safe 工具**：自动批准
- **匹配 allow 规则**：自动批准（如 `bash(git status)`）
- **其余**：需用户确认

### 混合模式

- 优先使用 tool_use API（当 Provider 支持时）
- 降级到文本解析（当 Provider 不支持 tool_use 时）

## Plan/Act 模式

- **Plan 模式**：只读，只能使用 file_read/grep/glob
- **Act 模式**：全权限，可读写文件和执行命令
- **切换**：Plan → Act 需用户确认计划摘要

## 记忆系统

4 种记忆类型：
- **user**：用户偏好、角色、知识
- **feedback**：用户纠正和指导
- **project**：项目上下文、决策
- **reference**：外部系统指针

分两级存储：
- 项目级：`.halfcopilot/memory/`
- 用户级：`~/.halfcopilot/memory/`

MEMORY.md 作为索引自动加载到上下文。

## MCP 支持

内置 MCP 客户端，支持 stdio 和 SSE 传输，用户可在配置中添加 MCP Server。

## 配置系统

- 用户级：`~/.halfcopilot/settings.json`
- 项目级：`.halfcopilot/settings.json`
- 环境变量覆盖：`HALFCOPILOT_*`
- API Key 通过 `env:XXX` 引用环境变量
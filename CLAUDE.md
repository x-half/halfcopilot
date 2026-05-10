# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 构建命令

```bash
pnpm install      # 安装所有依赖
pnpm build       # 通过 turborepo 构建全部 9 个包
pnpm dev         # 全部包的监视模式（持续运行）
pnpm test        # 运行测试（15 个测试文件，130+ 个测试）
pnpm lint        # 对所有包进行 lint
pnpm clean       # 清除 dist 文件夹和缓存
pnpm format      # 使用 prettier 格式化代码
```

单独运行测试：`cd packages/<pkg> && pnpm test` 或直接使用 vitest 的 `--run` 参数。

## 架构

### Monorepo 结构

`packages/` 下有 9 个包：
- **shared** — 零依赖基础工具：logger、errors、path helpers
- **config** — Zod schema 校验、配置加载（支持环境变量覆盖）、settings.json 解析
- **provider** — OpenAI 兼容 + Anthropic 双轨 provider
- **tools** — 工具注册表、执行器、权限检查器、内置工具（file_read/write/edit、bash、grep、glob）
- **core** — Agent 循环、对话管理器、混合模式（tool_use API + 文本解析降级）
- **memory** — 基于文件的持久化记忆系统，带文件锁，4 种记忆类型（user/feedback/project/reference）
- **mcp** — MCP 协议客户端（stdio + SSE 传输）
- **skills** — 技能注册表，支持触发匹配（git-commit、test-runner、code-review、documentation、refactor）
- **cli** — CLI 入口 + TUI（ink/React）

### 依赖层次

```
cli → core → provider/tools/memory/config/shared
                ↘ mcp/skills
config → shared
provider → shared
tools → shared
memory → config/shared
```

### Agent 循环（core/src/agent-loop.ts）

核心 `AgentLoop` 负责整体协调：
1. 从 `ConversationManager` 构建消息历史
2. 调用 provider（OpenAI 兼容或 Anthropic）
3. 处理事件：`text` → 显示，`tool_use` → 权限检查 → 执行，`done` → 结束
4. 降级策略：若 provider 不支持 `tool_use`，使用 `TextBlockParser` 从文本响应中提取工具调用

### 双轨 Provider 系统

- **OpenAI 兼容轨**：支持 90% 的模型（DeepSeek、MiniMax、Xiaomi MiMo、Qwen、OpenAI）
- **Anthropic 原生轨**：通过 `tools` 块和 `tool_result` 事件提供完整的 Claude 支持
- **混合降级**：`TextBlockParser` + `TextBlockToToolCallMapper` 解析纯文本，适用于不支持 tool_use 的模型

### 权限模型

`tools/src/permission.ts` 中的三层权限系统：
- `SAFE` — 只读操作自动批准
- `WARN` — 需要用户明确确认
- `UNSAFE` — 永不自动批准，必须完整确认

### 记忆系统

基于 Markdown 的持久化记忆，位于 `~/.halfcopilot/memory/`：
- 4 种类型带 frontmatter：user、feedback、project、reference
- 每个请求都会加载到 agent 上下文中
- `MEMORY.md` 索引文件（保持简洁，每条约 150 字符）

## 关键文件位置

- 入口文件：`packages/cli/src/index.ts`
- Agent 循环：`packages/core/src/agent-loop.ts`
- 工具定义：`packages/tools/src/builtins/`
- Provider 基类：`packages/provider/src/base.ts`
- 配置 schema：`packages/config/src/schema.ts`
- 记忆存储：`packages/memory/src/storage.ts`

## 开发注意事项

- 所有导入使用 `.js` 扩展名（ESM 模块解析）
- 测试文件：每个包内的 `__tests__/*.test.ts`
- 每个包独立拥有自己的 `vitest.config.ts` 和 `tsconfig.json`
- Turborepo 缓存已禁用（`cache: false`）— 运行 `pnpm test` 前需先运行 `pnpm build`
- 根目录的 `pnpm-workspace.yaml` 声明了 `packages/*`

# HalfCopilot 分模块任务拆解与 Agent 执行指南

> 本文档是 Agent 实现此项目的完整操作手册。每个任务包含：
> - 明确的输入/输出
> - 具体要创建/修改的文件
> - 依赖关系
> - 验证步骤
> - 预计工时

**约定：**
- Agent 实现任何任务前，先阅读对应的 `docs/update/` 设计文档
- 每个任务完成后运行 `pnpm test` 和 `pnpm build` 确保无回归
- 代码风格遵循 TypeScript strict mode，ESLint + Prettier
- 所有公共 API 必须有 JSDoc 注释
- 测试覆盖率目标：核心模块 > 80%

---

## 现有代码状态

| 包 | 状态 | 需要修改 |
|----|------|---------|
| `@halfcopilot/shared` | ✅ 已实现 | 小幅修改（TokenUsage 字段名） |
| `@halfcopilot/config` | ✅ 已实现 | 需要补充 security 配置 |
| `@halfcopilot/provider` | ✅ 已实现 | 需要修复流式 tool_use、补充 capabilities |
| `@halfcopilot/memory` | 🔶 骨架 | 需要完善 |
| `@halfcopilot/tools` | 🔴 空 | 需要从零实现 |
| `@halfcopilot/core` | 🔴 空 | 需要从零实现（关键路径） |
| `@halfcopilot/mcp` | 🔴 空 | 需要从零实现 |
| `@halfcopilot/cli` | 🔴 空 | 需要从零实现 |

---

## Phase 0: 修复与对齐（前置任务）

> 在继续新功能之前，先修复已有代码与更新文档之间的不一致。

### Task 0.1: 修复 TokenUsage 字段名

**依赖：** 无
**预计工时：** 0.5h

**操作步骤：**
1. 打开 `packages/shared/src/encoding.ts`（或 TokenUsage 定义所在文件）
2. 将 `input_tokens` / `output_tokens` 改为 `inputTokens` / `outputTokens`
3. 添加 `cacheReadTokens?: number` 和 `cacheWriteTokens?: number` 字段
4. 更新所有引用这些字段的代码
5. 运行 `pnpm --filter @halfcopilot/shared test`

**验证：** `pnpm test` 通过，无 TypeScript 错误

### Task 0.2: 补充 Security 配置到 ConfigSchema

**依赖：** 无
**预计工时：** 1h

**操作步骤：**
1. 打开 `packages/config/src/schema.ts`
2. 添加 `SecuritySchema`（见 `05-security-implementation.md` §4）
3. 在 `ConfigSchema` 中添加 `security: SecuritySchema.default({})`
4. 更新 `packages/config/src/defaults.ts` 添加 security 默认值
5. 添加测试：验证 security 配置加载、合并、默认值

**验证：** `pnpm --filter @halfcopilot/config test` 通过

### Task 0.3: 修复 Anthropic Provider 流式 tool_use

**依赖：** Task 0.1
**预计工时：** 1.5h

**操作步骤：**
1. 打开 `packages/provider/src/anthropic.ts`
2. 修改流式处理逻辑：在 `content_block_start`/`content_block_delta`/`content_block_stop` 事件中实时处理 tool_use（见 `00-gap-analysis.md` §6）
3. 不再依赖 `stream.finalMessage()` 获取 tool_use
4. 添加测试：模拟 Anthropic 流式响应中的 tool_use 事件序列
5. 运行 `pnpm --filter @halfcopilot/provider test`

**验证：** 流式 tool_use 事件在生成过程中实时 yield，而非在流结束时批量 yield

### Task 0.4: 补充 ProviderCapabilities

**依赖：** Task 0.1
**预计工时：** 1h

**操作步骤：**
1. 打开 `packages/provider/src/types.ts`
2. 添加 `ProviderCapabilities` 接口（见 `02-hybrid-mode-design.md` §4.1）
3. 在 `BaseProvider` 中添加 `abstract get capabilities(): ProviderCapabilities`
4. 在 `OpenAICompatibleProvider` 和 `AnthropicProvider` 中实现 capabilities getter
5. 添加测试

**验证：** `pnpm --filter @halfcopilot/provider test` 通过

### Task 0.5: 清理项目配置

**依赖：** 无
**预计工时：** 0.5h

**操作步骤：**
1. 删除 `package-lock.json`
2. 添加 `package-lock.json` 到 `.gitignore`
3. 添加 `eslint.config.mjs`（flat config 格式）
4. 添加 `.prettierrc`
5. 在根 `package.json` 中确认 lint 脚本正确
6. 在 `turbo.json` 中添加 lint pipeline
7. 运行 `pnpm lint` 确认 ESLint 工作

**验证：** `pnpm lint` 和 `pnpm build` 都通过

---

## Phase 1: 工具系统（packages/tools）

> 参考：`00-gap-analysis.md` §2-3, `05-security-implementation.md`

### Task 1.1: Tool 接口与类型定义

**依赖：** Task 0.2
**预计工时：** 1.5h

**操作步骤：**
1. 创建 `packages/tools/src/types.ts`：
   - `PermissionLevel` 枚举（SAFE/WARN/UNSAFE）
   - `ToolContext` 接口（projectRoot, workingDirectory, signal, sessionId, config）
   - `ToolResult` 接口（output, error?, metadata?）
   - `Tool` 接口（name, description, inputSchema, permissionLevel, execute, toProviderFormat?）
   - `TOOL_PERMISSIONS` 常量映射
2. 创建 `packages/tools/src/index.ts` 导出所有类型
3. 编写类型测试

**验证：** `pnpm --filter @halfcopilot/tools test` 通过

### Task 1.2: ToolRegistry 实现

**依赖：** Task 1.1
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/tools/src/registry.ts`：
   - `ToolRegistry` 类：register, unregister, get, list, getByPermission
   - 工具名唯一性校验
   - 工具查找（按名称、按权限级别）
2. 编写测试：
   - 注册/注销工具
   - 重复注册抛错
   - 按权限级别过滤
   - 工具不存在时抛错

**验证：** 测试全部通过

### Task 1.3: PermissionChecker 实现

**依赖：** Task 1.1, Task 0.2
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/tools/src/permission.ts`：
   - `PermissionChecker` 类（见 `05-security-implementation.md` §1.2）
   - 会话缓存（sessionApproved Set）
   - 自动批准/永不批准模式匹配
   - `classifyBashCommand()` 函数
2. 创建 `packages/tools/src/path-protector.ts`：
   - `PathProtector` 类（见 `05-security-implementation.md` §2.3）
3. 编写测试：
   - SAFE 工具自动通过
   - WARN 工具首次确认后会话缓存
   - UNSAFE 工具每次确认
   - 模式匹配（autoApprove/neverApprove）
   - 受保护路径检查
   - 敏感文件模式检查
   - bash 命令分类

**验证：** 测试全部通过

### Task 1.4: 内置工具实现

**依赖：** Task 1.1, Task 1.2
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/tools/src/builtin/file-read.ts`：
   - 实现 `file_read` 工具
   - 支持行号、偏移量、限制
   - 输出格式：带行号的文本
2. 创建 `packages/tools/src/builtin/file-write.ts`：
   - 实现 `file_write` 工具
   - 自动创建目录
   - 路径安全检查
3. 创建 `packages/tools/src/builtin/file-edit.ts`：
   - 实现 `file_edit` 工具
   - old_string/new_string 替换
   - 唯一性校验（old_string 必须唯一）
4. 创建 `packages/tools/src/builtin/bash.ts`：
   - 实现 `bash` 工具
   - 超时控制
   - 环境变量传递
   - 工作目录设置
5. 创建 `packages/tools/src/builtin/grep.ts`：
   - 实现 `grep` 工具
   - 基于 ripgrep（或 fallback 到 Node.js 实现）
6. 创建 `packages/tools/src/builtin/glob.ts`：
   - 实现 `glob` 工具
   - 基于 fast-glob
7. 创建 `packages/tools/src/builtin/index.ts`：统一导出和注册

**验证：** 每个工具至少 3 个测试用例（正常、边界、错误）

### Task 1.5: ToolExecutor 实现

**依赖：** Task 1.2, Task 1.3, Task 1.4
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/tools/src/executor.ts`：
   - `ToolExecutor` 类
   - 执行流程：权限检查 → 执行 → 格式化结果
   - 超时控制（AbortSignal）
   - 结果截断（超过 50000 字符时截断）
   - 错误处理与重试（可配置重试次数）
2. 编写测试

**验证：** 测试全部通过

---

## Phase 2: Agent Core（packages/core）— 关键路径

> 参考：`01-agent-loop-design.md`

### Task 2.1: 消息与对话类型定义

**依赖：** Task 0.1
**预计工时：** 1.5h

**操作步骤：**
1. 创建 `packages/core/src/types.ts`：
   - `Message` 接口（id, role, content, timestamp, metadata）
   - `ContentBlock` 联合类型（text, tool_use, tool_result）
   - `AgentState` 枚举
   - `AgentEvent` 联合类型（见 `01-agent-loop-design.md` §7.1）
   - `AgentMode` 枚举（plan/review/act/auto）
   - `ErrorCategory` 枚举
   - `CompactStrategy` 接口
2. 创建 `packages/core/src/index.ts` 导出
3. 编写类型测试

**验证：** TypeScript 编译无错误

### Task 2.2: ConversationManager 实现

**依赖：** Task 2.1
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/core/src/conversation.ts`：
   - `ConversationManager` 类
   - 消息添加（addUserMessage, addAssistantMessage, addToolResult）
   - 消息获取（getMessages, getRecentMessages）
   - Token 估算（基于字符数的近似估算，或调用 tokenizer）
   - 对话压缩（compact 方法，接受 summarize 回调）
   - 压缩策略配置（threshold, keepRecent, keepHead, method）
2. 编写测试：
   - 消息添加和获取
   - Token 估算
   - 压缩触发条件
   - 压缩后消息结构正确（保留首尾）
   - 降级策略（summarize 失败时 truncate）

**验证：** 测试全部通过

### Task 2.3: AgentLoop 主循环

**依赖：** Task 2.2, Task 1.5, Task 0.3, Task 0.4
**预计工时：** 6h

**操作步骤：**
1. 创建 `packages/core/src/agent-loop.ts`：
   - `AgentLoop` 类，实现 `AsyncGenerator<AgentEvent>`
   - 状态机实现（IDLE → THINKING → TOOL_APPROVAL/TOOL_CALLING → THINKING → IDLE）
   - 流式事件产出（text_delta, tool_use, tool_result 等）
   - Provider 调用（通过 Provider 接口）
   - 工具调度（通过 ToolExecutor）
   - 模式切换（Plan/Review/Act/Auto）
   - 中断处理（AbortSignal）
2. 创建 `packages/core/src/mode-switcher.ts`：
   - `ModeSwitcher` 类
   - 各模式工具白名单
   - 模式切换请求处理
   - `switch_mode` 工具定义
3. 编写测试：
   - 简单对话循环（用户输入 → 模型回复 → 结束）
   - 工具调用循环（用户输入 → 模型调用工具 → 工具结果 → 模型回复）
   - 权限审批流程
   - 模式切换
   - 中断处理
   - 错误恢复

**验证：** 测试全部通过。这是最核心的模块，务必充分测试。

### Task 2.4: 错误恢复与重试

**依赖：** Task 2.3
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/core/src/error-handler.ts`：
   - `ErrorHandler` 类
   - 错误分类（见 `01-agent-loop-design.md` §6.1）
   - 重试策略（指数退避、限流等待）
   - 最大重试次数
2. 集成到 AgentLoop 中
3. 编写测试

**验证：** 模拟各种错误类型，验证重试和恢复逻辑

### Task 2.5: 会话持久化

**依赖：** Task 2.2
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/core/src/session-store.ts`：
   - `SessionStore` 接口
   - `FileSessionStore` 实现（JSON 文件存储到 `~/.halfcopilot/sessions/`）
   - save / load / list / delete 方法
2. 编写测试

**验证：** 会话可以保存、加载、列出、删除

---

## Phase 3: 混合模式（packages/core 中实现）

> 参考：`02-hybrid-mode-design.md`

### Task 3.1: TextBlockParser 实现

**依赖：** Task 2.1
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/core/src/hybrid/parser.ts`：
   - `TextBlockParser` 类（见 `02-hybrid-mode-design.md` §3.2）
   - 解析 read/edit/create/run/search/glob 六种文本块
   - 处理 EDIT 块的 `>>>>>>> REPLACE` 分隔符
   - 处理未闭合文本块（错误报告）
   - 处理嵌套代码块（文本块正文中的 ``` 转义）
2. 编写测试（见 `02-hybrid-mode-design.md` §7.1 的测试列表）
3. 创建 `packages/core/src/hybrid/mapper.ts`：
   - `TextBlockToToolCallMapper` 类（见 §3.3）
   - 文本块到 ToolCall 的映射
   - 未知块类型错误
4. 编写测试

**验证：** 所有解析器测试通过，覆盖正常格式和边界情况

### Task 3.2: HybridProvider 实现

**依赖：** Task 3.1, Task 0.4
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/core/src/hybrid/provider.ts`：
   - `HybridProvider` 类（见 `02-hybrid-mode-design.md` §4.2）
   - 根据 `capabilities.toolUse` 决定是否注入协议
   - System Prompt 注入文本块协议说明 + few-shot 示例
   - 流式解析：在文本流中实时检测文本块
   - 解析成功后 yield `tool_use` 事件
   - 解析失败时 yield `parse_error` 事件
2. 编写测试（见 §7.3）
3. 创建 `packages/core/src/hybrid/index.ts` 导出

**验证：** 支持 tool_use 的 provider 直接透传，不支持的 provider 自动注入协议并解析文本块

---

## Phase 4: MCP 客户端（packages/mcp）

> 参考：`03-mcp-client-spec.md`

### Task 4.1: MCPTransport 接口与 StdioTransport

**依赖：** 无
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/mcp/src/types.ts`：
   - `MCPTransport` 接口
   - `MCPServerConfig` 接口
   - `StdioTransportConfig` / `SSETransportConfig`
   - JSON-RPC 消息类型
2. 创建 `packages/mcp/src/transport/stdio.ts`：
   - `StdioTransport` 类（见 `03-mcp-client-spec.md` §2.1）
   - 子进程管理（spawn, kill）
   - JSON-RPC 消息收发
   - 超时处理
3. 编写测试（用 mock 子进程）

**验证：** 测试通过

### Task 4.2: MCPClient 与工具发现

**依赖：** Task 4.1
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/mcp/src/client.ts`：
   - `MCPClient` 类
   - `connect()` / `disconnect()`
   - `listTools()` / `callTool()`
   - initialize 握手
2. 创建 `packages/mcp/src/manager.ts`：
   - `MCPClientManager` 类（见 §3.2）
   - 服务器启动/停止
   - 工具注册/注销
   - 限定名生成（`serverName__toolName`）
3. 编写测试

**验证：** 测试通过

### Task 4.3: MCPToolAdapter 与工具系统集成

**依赖：** Task 4.2, Task 1.2
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/mcp/src/adapter.ts`：
   - `MCPToolAdapter` 类（见 §4.1）
   - 实现 `Tool` 接口
   - 默认权限为 UNSAFE
2. 创建 `packages/mcp/src/index.ts` 导出
3. 编写集成测试（用测试 MCP Server）

**验证：** MCP 工具可以通过 ToolRegistry 和 ToolExecutor 调用

### Task 4.4: SSETransport 实现

**依赖：** Task 4.1
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/mcp/src/transport/sse.ts`：
   - `SSETransport` 类（见 §2.2）
   - EventSource 连接
   - POST 请求发送
   - 消息接收和分发
2. 编写测试

**验证：** 测试通过

---

## Phase 5: Memory 系统完善（packages/memory）

> 参考：`specs/memory-system.md`

### Task 5.1: 完善记忆类型与存储

**依赖：** 无
**预计工时：** 3h

**操作步骤：**
1. 检查 `packages/memory/src/` 现有代码
2. 补充/修改 `types.ts`：
   - 4 种记忆类型（user/feedback/project/reference）
   - 记忆文件格式（frontmatter + content）
   - MEMORY.md 索引格式
3. 完善 `store.ts`：
   - 项目级存储（`.halfcopilot/memory/`）
   - 用户级存储（`~/.halfcopilot/memory/`）
   - CRUD 操作
   - MEMORY.md 自动索引生成
4. 编写测试

**验证：** 记忆可以创建、读取、更新、删除、搜索

### Task 5.2: 记忆注入到 System Prompt

**依赖：** Task 5.1, Task 2.2
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/memory/src/injector.ts`：
   - 读取 MEMORY.md
   - 格式化为 System Prompt 片段
   - 集成到 ConversationManager 的 system message 中
2. 编写测试

**验证：** 记忆内容正确出现在 system prompt 中

---

## Phase 6: CLI 与 TUI（packages/cli）

> 参考：`04-tui-interaction-design.md`, `specs/cli-commands.md`

### Task 6.1: CLI 入口与命令定义

**依赖：** Task 2.3
**预计工时：** 3h

**操作步骤：**
1. 创建 `packages/cli/src/index.ts`：
   - commander 程序定义
   - 子命令：chat, run, init, config, memory, tools, providers, doctor, mcp
2. 创建 `packages/cli/src/commands/chat.ts`：
   - `halfcopilot chat` 命令
   - 解析参数（--model, --mode, --config 等）
   - 初始化 Provider、ToolRegistry、AgentLoop
   - 启动 TUI
3. 创建 `packages/cli/src/commands/run.ts`：
   - `halfcopilot run <prompt>` 单次执行命令
   - 非交互模式
4. 创建其他命令骨架文件

**验证：** `halfcopilot --help` 正常输出，`halfcopilot chat --help` 正常输出

### Task 6.2: StatusBar 与 ChatView 基础

**依赖：** Task 6.1
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/cli/src/tui/app.tsx`：
   - ink App 组件
   - 状态管理（useReducer 或 zustand）
2. 创建 `packages/cli/src/tui/components/status-bar.tsx`：
   - StatusBar 组件（见 `04-tui-interaction-design.md` §2.1）
3. 创建 `packages/cli/src/tui/components/chat-view.tsx`：
   - ChatView 组件
   - MessageList 消息列表
   - UserMessage / AssistantMessage 基础渲染
4. 创建 `packages/cli/src/tui/components/input-field.tsx`：
   - InputField 组件
   - 输入、发送、历史记录

**验证：** `halfcopilot chat` 能启动 TUI，显示状态栏，接受输入，显示回复

### Task 6.3: 事件映射层

**依赖：** Task 6.2, Task 2.3
**预计工时：** 2h

**操作步骤：**
1. 创建 `packages/cli/src/tui/event-bridge.ts`：
   - 将 AgentLoop 的 AsyncGenerator<AgentEvent> 连接到 TUI 状态更新
   - 事件到 UI 状态的映射（见 `04-tui-interaction-design.md` §3）
2. 集成到 App 组件中

**验证：** TUI 能正确反映 Agent 状态变化

### Task 6.4: ToolCallBlock 与 ToolApproval

**依赖：** Task 6.2
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/cli/src/tui/components/tool-call-block.tsx`：
   - 4 种状态渲染：executing, completed, error, rejected
   - Spinner 动画
2. 创建 `packages/cli/src/tui/components/tool-approval.tsx`：
   - 审批弹层
   - 键盘交互（y/s/n/a）
   - warn 和 unsafe 两种模式
3. 集成到 ChatView 中

**验证：** 工具调用有正确的视觉反馈，审批交互可用

### Task 6.5: 流式 Markdown 渲染

**依赖：** Task 6.2
**预计工时：** 4h

**操作步骤：**
1. 创建 `packages/cli/src/tui/renderers/markdown.tsx`：
   - StreamingMarkdownRenderer（见 §2.2）
   - 增量渲染 + 防抖
   - 代码块语法高亮
2. 创建 `packages/cli/src/tui/renderers/code-block.tsx`：
   - 代码块组件
   - 行号
   - 语法高亮（cli-highlight）
3. 创建 `packages/cli/src/tui/renderers/diff.tsx`：
   - Diff 渲染组件
   - 红色删除 / 绿色新增

**验证：** 模型回复的 Markdown 正确渲染，代码块有语法高亮

### Task 6.6: 其他 CLI 命令实现

**依赖：** Task 6.1, Task 5.1
**预计工时：** 4h

**操作步骤：**
1. `halfcopilot init`：初始化项目配置（.halfcopilot/config.yaml）
2. `halfcopilot config`：查看/设置配置
3. `halfcopilot memory`：记忆管理（list/show/edit/clear）
4. `halfcopilot tools`：列出可用工具
5. `halfcopilot providers`：列出配置的模型供应商
6. `halfcopilot doctor`：诊断环境问题
7. `halfcopilot mcp`：MCP 服务器管理

**验证：** 每个命令都能正常执行

---

## Phase 7: 集成测试与发布

### Task 7.1: 端到端集成测试

**依赖：** 所有 Phase 1-6
**预计工时：** 4h

**操作步骤：**
1. 创建 `tests/e2e/` 目录
2. 编写端到端测试：
   - chat 模式：用户输入 → 模型回复 → 工具调用 → 结果
   - run 模式：单次执行
   - 混合模式：不支持 tool_use 的模型
   - 权限审批流程
   - 模式切换（plan → act）
   - 对话压缩
   - 错误恢复
3. 使用 mock provider 运行测试

**验证：** 所有端到端测试通过

### Task 7.2: CI/CD 配置

**依赖：** Task 0.5
**预计工时：** 2h

**操作步骤：**
1. 创建 `.github/workflows/ci.yml`：
   - lint + type-check + test + build
   - Node.js 20.x
   - pnpm cache
2. 创建 `.github/workflows/release.yml`：
   - changesets 版本管理
   - npm 发布
3. 运行 CI 确认通过

**验证：** CI 绿灯

### Task 7.3: README 与文档

**依赖：** 所有 Phase
**预计工时：** 3h

**操作步骤：**
1. 创建根 `README.md`：
   - 项目介绍
   - 快速开始
   - 安装说明
   - 基本用法
   - 配置说明
   - 支持的模型
2. 创建 `CONTRIBUTING.md`
3. 更新 `docs/` 目录结构

**验证：** 文档完整，新用户可以按文档操作

---

## 任务依赖关系图

```
Phase 0: 0.1 ─┐ 0.2 ─┐ 0.3 ─┐ 0.4 ─┐ 0.5
              │      │      │      │
Phase 1:     1.1 ──┬─1.2──┐  │      │
              │    │      │  │      │
             1.3 ──┘     1.4─┘      │
              │          │          │
             1.5 ────────┘          │
              │                     │
Phase 2:     2.1 ──┐               │
              │    │               │
             2.2 ──┤               │
              │    │               │
             2.3 ──┤ ← (0.3, 0.4, 1.5)
              │    │
             2.4 ──┤
             2.5 ──┘
              │
Phase 3:     3.1 ──┐
              │    │
             3.2 ──┘ ← (0.4)
              │
Phase 4:     4.1 ──┐
              │    │
             4.2 ──┤
              │    │
             4.3 ──┤ ← (1.2)
             4.4 ──┘
              │
Phase 5:     5.1 ──┐
              │    │
             5.2 ──┘ ← (2.2)
              │
Phase 6:     6.1 ──┐ ← (2.3)
              │    │
             6.2 ──┤
              │    │
             6.3 ──┤ ← (2.3)
             6.4 ──┤
             6.5 ──┤
             6.6 ──┘ ← (5.1)
              │
Phase 7:     7.1 ──┐ ← (all)
             7.2 ──┤ ← (0.5)
             7.3 ──┘ ← (all)
```

---

## 工时汇总

| Phase | 任务数 | 预计工时 | 累计 |
|-------|--------|---------|------|
| Phase 0: 修复与对齐 | 5 | 4.5h | 4.5h |
| Phase 1: 工具系统 | 5 | 12.5h | 17h |
| Phase 2: Agent Core | 5 | 14.5h | 31.5h |
| Phase 3: 混合模式 | 2 | 7h | 38.5h |
| Phase 4: MCP 客户端 | 4 | 12h | 50.5h |
| Phase 5: Memory 完善 | 2 | 5h | 55.5h |
| Phase 6: CLI 与 TUI | 6 | 21h | 76.5h |
| Phase 7: 集成与发布 | 3 | 9h | 85.5h |
| **总计** | **32** | **~86h** | |

**可并行的任务组：**
- Phase 3 和 Phase 4 可以并行
- Phase 5 和 Phase 4 可以并行
- Phase 6.4/6.5 可以和 6.3 并行

**考虑并行后关键路径：** 约 60-70 小时（7-9 周兼职开发）

---

## Agent 执行检查清单

每个任务完成前，Agent 必须确认：

- [ ] 代码通过 TypeScript 编译（`pnpm build`）
- [ ] 所有测试通过（`pnpm test`）
- [ ] ESLint 无错误（`pnpm lint`）
- [ ] 公共 API 有 JSDoc 注释
- [ ] 新增代码有对应测试
- [ ] 没有引入循环依赖
- [ ] 没有使用 `any` 类型（除非有注释说明原因）
- [ ] 错误处理完整（不吞异常）
- [ ] 遵循现有代码风格
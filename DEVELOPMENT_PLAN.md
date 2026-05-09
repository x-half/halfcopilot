# HalfCopilot 投产级改造开发计划

## 架构概览

```
packages/
├── shared/      # 基础工具（无依赖）
├── config/      # 配置管理（依赖shared）
├── provider/    # LLM 供应商抽象（依赖shared, config）
├── tools/       # 工具系统（依赖shared, config, provider）
├── core/        # Agent 引擎（依赖shared, config, provider, tools）
├── mcp/         # MCP 协议（依赖shared, tools）
├── memory/      # 持久化记忆（依赖shared, config）
├── skills/      # 技能系统（依赖shared, tools）
└── cli/         # CLI 入口 + TUI（依赖全部）
```

## 并行开发策略

```
Phase 1 (独立可并行)
  Stream A: skills/   (无外部依赖)
  Stream B: tools/    (权限修复) + CI/CD
  Stream D: mcp/ + memory/  (独立)
  Stream F: test/     (测试基架)

Phase 2 (依赖上游)
  Stream C: core/     (依赖provider, tools, config)
  Stream G: 代码质量

Phase 3 (叶子节点)
  Stream E: cli/tui   (依赖所有)
  集成测试
```

## 各 Stream 详细改造要求

### Stream A: Skills 系统（packages/skills/）

**问题：** 全部 5 个内置 skill 的 execute() 为空壳，只返回提示文字。

**改造目标：**
1. `git-commit`: 自动执行 git status → git diff → 分析变更 → 生成 conventional commit message → git add + git commit
2. `test-runner`: 检测项目类型(package.json/pyproject.toml/go.mod) → 运行对应测试命令 → 汇总结果 → 失败时自动尝试修复
3. `code-review`: 读取指定文件 → 分析语法/逻辑/安全/性能 → 输出结构化 Review
4. `documentation`: 读取源码 → 提取 public API / 配置 / 使用示例 → 生成 Markdown 文档
5. `refactor`: 读取代码 → 识别重复/复杂/可优化点 → 执行重构 → 验证编译

**实现要点：**
- 每个 skill 的 execute() 通过 ToolRegistry 调用 bash/file_read 等工具
- 添加进度回调接口
- 添加详细的错误处理和超时

### Stream B: 权限系统 + CI 修复（packages/tools/ + .github/）

**问题：** 权限绕过、沙箱缺失、CI 配置错误。

**改造目标：**
1. PermissionChecker: 移除 file_write/file_edit 的自动放行，遵循真实的 PermissionLevel
2. bash 安全命令白名单：移除 powershell，限制 git 操作范围
3. 添加 API Key 连通性验证方法
4. CI: 改为 pnpm + turbo run test，所有包并行构建

### Stream C: Agent Loop + Conversation（packages/core/）

**问题：** 无重试、无上下文压缩、消息管理粗糙。

**改造目标：**
1. AgentLoop: 添加指数退避重试（429/5xx），工具失败自动修正重试
2. ConversationManager: 
   - 基于 token 计数的窗口管理（估算并保留最新 N tokens）
   - 滑动窗口保留 system prompt + 最近消息
   - 实现 compactionThreshold 逻辑（压缩旧消息为摘要）
3. 添加 provider 错误保护（stream 抛异常时不崩溃）

### Stream D: MCP SSE Transport + Memory（packages/mcp/ + packages/memory/）

**问题：** SSE 未实现、Memory 太简陋。

**改造目标：**
1. MCP SSETransport: 使用 fetch + ReadableStream 实现真正的 SSE 连接
2. MCP Client: 请求超时可配置化
3. MemoryStore: 添加文件锁（基本互斥）、添加自动归档机制

### Stream E: TUI 展示优化（packages/cli/）

**问题：** Raw Mode 异常不安全、TUI 展示效果一般。

**改造目标：**
1. Raw Mode: try/finally 确保退出时恢复终端
2. 思考动画：优化为更流畅的样式（参考 claude code 的点阵动画）
3. 输出展示：代码块语法高亮预览、长输出分页
4. 状态栏：实时 token 计数、响应时间
5. Tool Approval: 展示更详细的工具调用信息（参数预览、风险等级）

### Stream F: 测试体系

**要求：** 每个包至少 3-5 个核心单元测试，覆盖主要执行路径。

### Stream G: 代码质量

**要求：** 消灭顶层 any 类型，sync→async 文件操作统一

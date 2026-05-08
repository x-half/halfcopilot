# HalfCopilot 文档更新

> 本目录包含对原始 `docs/specs/` 和 `docs/plans/` 的补充和修正。
> **Agent 实现时以本目录下的文档为准**，旧文档仅作参考，冲突处以更新文档决议为准。

---

## 文档索引

| 文档 | 用途 | 优先级 |
|------|------|--------|
| [00-gap-analysis.md](./00-gap-analysis.md) | 现有文档不一致性分析与修复决议 | 必读 |
| [01-agent-loop-design.md](./01-agent-loop-design.md) | Agent Loop 核心引擎详细设计（状态机、对话管理、工具调度、错误恢复） | 必读 |
| [02-hybrid-mode-design.md](./02-hybrid-mode-design.md) | 混合模式设计：文本解析回退（多模型支持的核心差异化功能） | 必读 |
| [03-mcp-client-spec.md](./03-mcp-client-spec.md) | MCP 客户端规格（传输层、生命周期、工具注册） | 必读 |
| [04-tui-interaction-design.md](./04-tui-interaction-design.md) | TUI 交互详细设计（组件层级、流式渲染、审批交互） | 必读 |
| [05-security-implementation.md](./05-security-implementation.md) | 安全模型实施方案（权限三档、受保护路径、审计日志） | 必读 |
| [06-task-breakdown.md](./06-task-breakdown.md) | 分模块任务拆解与 Agent 执行指南（32 个任务，~86 小时） | 核心指南 |

---

## 与旧文档的关系

| 旧文档 | 更新文档 | 说明 |
|--------|---------|------|
| `specs/provider-interface.ts` | `00-gap-analysis.md` §1 | TokenUsage 字段名修正为 camelCase |
| `specs/tool-system.md` | `00-gap-analysis.md` §2-3, `05-security-implementation.md` | 权限三档 + 完整 Tool 接口 |
| `specs/security-model.md` | `05-security-implementation.md` | 完整实施方案 + ConfigSchema |
| `specs/cli-commands.md` | `04-tui-interaction-design.md` | TUI 组件设计 + 事件映射 |
| `plans/halfcopilot-design.md` | `01-agent-loop-design.md`, `02-hybrid-mode-design.md` | Agent Loop 和混合模式的详细设计 |
| `plans/halfcopilot-implementation.md` | `06-task-breakdown.md` | 重新拆分的 32 个任务 + Agent 执行指南 |

---

## Agent 使用指南

1. **开始实现前**：先读 `00-gap-analysis.md` 了解需要修复的不一致性
2. **实现 Agent Loop 时**：以 `01-agent-loop-design.md` 为主参考
3. **实现混合模式时**：以 `02-hybrid-mode-design.md` 为主参考
4. **实现 MCP 时**：以 `03-mcp-client-spec.md` 为主参考
5. **实现 TUI 时**：以 `04-tui-interaction-design.md` 为主参考
6. **实现安全功能时**：以 `05-security-implementation.md` 为主参考
7. **执行任务时**：按 `06-task-breakdown.md` 的顺序和步骤操作

---

## 关键设计决策摘要

1. **权限模型**：三档（safe/warn/unsafe），与安全规格对齐，替代实施计划中的 `safe: boolean`
2. **Agent Mode**：四档（plan/review/act/auto），增加 review 模式
3. **混合模式**：对不支持 tool_use 的模型，通过解析文本块（read/edit/create/run/search/glob）回退
4. **Anthropic 流式 tool_use**：在 content_block 事件中实时处理，而非 finalMessage 后批量处理
5. **对话压缩**：通过依赖注入（summarize 回调）避免循环依赖
6. **TUI 工时**：从原估计 4-5h 修正为 25-30h
7. **总工时**：从原估计 16-23h 修正为 ~86h（关键路径 ~60-70h）
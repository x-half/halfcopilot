# HalfCopilot 设计文档总结

> 创建时间：2026-05-08
> 状态：✅ 设计阶段完成，准备进入开发

---

## 📊 文档完成情况

### 核心设计文档

| 文档 | 路径 | 状态 | 说明 |
|------|------|------|------|
| 产品设计 | `docs/plans/2026-05-08-halfcopilot-design.md` | ✅ 完成 | 产品定位、技术选型、整体架构 |
| CLI 命令 | `docs/specs/cli-commands.md` | ✅ 完成 | 命令定义、选项、快捷键 |
| 安全模型 | `docs/specs/security-model.md` | ✅ 完成 | 权限级别、审批流程、审计日志 |
| Provider 接口 | `docs/specs/provider-interface.ts` | ✅ 完成 | TypeScript 接口定义 |
| 工具系统 | `docs/specs/tool-system.md` | ✅ 完成 | 内置工具 API、文本解析降级 |
| 项目结构 | `docs/specs/project-structure.md` | ✅ 完成 | Monorepo 布局、包依赖 |
| 记忆系统 | `docs/specs/memory-system.md` | ✅ 完成 | 记忆类型、加载流程、管理 API |
| 测试策略 | `docs/specs/test-strategy.md` | ✅ 完成 | 单元/集成/E2E 测试方案 |
| 开发指南 | `docs/guides/dev-setup.md` | ✅ 完成 | 从零搭建项目教程 |

### 辅助文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `.gitignore` | ✅ 创建 | Git 忽略规则 |
| `specs/README.md` | ✅ 创建 | 规范文档索引 |

---

## 🎯 产品设计要点

### 产品定位

```
HalfCopilot = 开源 Agent CLI + 多模型支持 + 企业级权限控制

目标用户：
- 开发者（代码辅助）
- 企业团队（内部模型接入）
- 开源爱好者（可定制 Agent）
```

### 核心特性

1. **多模型支持**
   - DeepSeek、MiniMax、Xiaomi-MiMo、Qwen、Claude
   - OpenAI 兼容轨 + Anthropic 原生轨

2. **混合工具系统**
   - 优先使用 tool_use API
   - 降级到文本解析（兼容不支持 tool_use 的模型）

3. **企业级安全**
   - 三级权限模型（safe/warn/unsafe）
   - 命令白名单/黑名单
   - 完整审计日志

4. **记忆系统**
   - 4 种记忆类型（user/feedback/project/reference）
   - Markdown 格式存储
   - 自动注入上下文

---

## 🏗️ 技术架构

### 技术栈

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 生态成熟，类型安全 |
| 运行时 | Node.js 20+ | 兼容性最好 |
| TUI | ink (React) | 组件化，主流选择 |
| 构建 | Turborepo | Monorepo 管理 |
| 包管理 | pnpm | 快速、节省空间 |
| 测试 | vitest | 快速、配置简单 |

### 包结构

```
packages/
├── cli/          # CLI 入口 + TUI (ink/React)
├── core/         # Agent 核心引擎 (loop, planner, executor)
├── provider/     # 模型 Provider (OpenAI 兼容 + Anthropic)
├── tools/        # 工具系统 (file/bash/grep/glob)
├── mcp/          # MCP 协议层
├── memory/       # 记忆系统
├── config/       # 配置系统
└── shared/       # 共享工具库
```

### 核心流程

```
用户输入
    │
    ▼
Agent Loop
├── 构建消息历史
├── 调用 Provider
│   ├── OpenAI 兼容轨
│   └── Anthropic 原生轨
│
├── 处理响应
│   ├── text 事件 → 显示
│   ├── tool_use 事件 → 权限检查 → 执行工具
│   └── done 事件 → 结束
│
└── 更新对话历史
```

---

## 📋 开发里程碑

### Phase 1 (Week 1-2): 基础框架

**目标：** 完成项目骨架和基础包

- [x] 设计文档编写
- [ ] 项目骨架初始化
- [ ] shared 包（日志、路径、编码）
- [ ] config 包（配置加载）
- [ ] provider 包（OpenAI 兼容 + Anthropic）
- [ ] 基础测试框架

**交付物：**
- 可运行的 Monorepo 结构
- 可调用模型 API 的 Provider

### Phase 2 (Week 3-4): 核心功能

**目标：** 实现 Agent Loop 和工具系统

- [ ] tools 包（file_*/bash/grep/glob）
- [ ] core 包（Agent Loop、权限审批）
- [ ] memory 包（记忆存储和加载）
- [ ] 文本解析降级实现

**交付物：**
- 可执行简单任务的 Agent
- 完整的工具系统

### Phase 3 (Week 5-6): CLI 和 TUI

**目标：** 实现用户界面

- [ ] cli 包（命令解析、TUI 组件）
- [ ] mcp 包（MCP 客户端）
- [ ] 工具确认 UI
- [ ] 状态栏和帮助系统

**交付物：**
- 可交互的 CLI 应用
- MCP 支持

### Phase 4 (Week 7-8): 完善发布

**目标：** 测试和发布

- [ ] 测试覆盖率达到 80%
- [ ] 文档完善（README、使用指南）
- [ ] npm 包配置
- [ ] 首次发布 (v0.1.0)

**交付物：**
- npm 可安装的包
- 完整文档

---

## 🔍 关键设计决策

### 1. 为什么选择双轨 Provider？

**问题：** 模型 API 不统一

**解决：**
- OpenAI 兼容轨：覆盖 90% 模型
- Anthropic 原生轨：完整支持 Claude 特性

**收益：** 最大化模型兼容性，维护成本可控

### 2. 为什么使用混合工具系统？

**问题：** 不是所有模型都支持 tool_use

**解决：**
- 优先使用 tool_use API
- 降级到文本解析（EDIT/RUN 模式）

**收益：** 兼容不支持 tool_use 的模型

### 3. 为什么使用 Markdown 存储记忆？

**问题：** 如何持久化用户偏好和项目上下文

**解决：** Markdown 文件存储

**收益：**
- 人类可读
- 版本友好
- 易于编辑和调试

### 4. 为什么选择 ink 作为 TUI 框架？

**问题：** 如何实现交互式 CLI 界面

**解决：** ink (React for CLI)

**收益：**
- 组件化开发
- React 范式，学习曲线低
- 社区活跃

---

## ⚠️ 已知风险

### 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| TUI 性能问题 | 中 | 中 | 使用 Static 组件优化渲染 |
| 模型 API 变更 | 中 | 高 | 抽象 Provider 层，快速适配 |
| 文本解析准确率低 | 高 | 中 | 优先使用 tool_use，降级为辅助 |

### 项目风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 开发周期延长 | 中 | 中 | 分阶段交付，优先核心功能 |
| 与竞品差异化不足 | 中 | 高 | 聚焦企业内网场景 |

---

## 📈 成功指标

### 产品指标

- [ ] 支持 5+ 模型提供商
- [ ] 内置 10+ 工具
- [ ] 响应时间 < 2s（简单任务）
- [ ] 工具执行成功率 > 95%

### 开发指标

- [ ] 测试覆盖率 > 80%
- [ ] 核心包都有完整文档
- [ ] CI/CD 自动化
- [ ] 每周发布迭代

### 用户指标

- [ ] npm 下载量 > 1000/月
- [ ] GitHub Star > 100
- [ ] 社区贡献 PR > 10

---

## 🎓 学习资源

### 参考项目

- **Claude Code** - 商业标杆
- **OpenCode** - 开源实现
- **Cline** - VS Code 扩展
- **Aider** - CLI 工具

### 技术文档

- [ink 文档](https://github.com/vadimdemedes/ink)
- [Turborepo 文档](https://turbo.build/repo)
- [vitest 文档](https://vitest.dev/)
- [MCP 协议](https://modelcontextprotocol.io/)

---

## 📞 下一步行动

### 立即行动

1. **评审设计文档** - 确认设计无重大遗漏
2. **创建项目仓库** - GitHub/GitLab
3. **初始化项目骨架** - 按照 `dev-setup.md` 执行
4. **分配开发任务** - 按 Phase 分配

### 本周目标

- [ ] 完成项目初始化
- [ ] 实现 shared 和 config 包
- [ ] 实现 provider 包基础
- [ ] 编写单元测试

---

## 📝 更新日志

| 日期 | 版本 | 更新内容 | 作者 |
|------|------|---------|------|
| 2026-05-08 | v0.1 | 初始版本，完成所有核心设计文档 | HalfCopilot Team |

---

**设计阶段状态：✅ 完成**

**下一步：进入 Phase 1 开发**
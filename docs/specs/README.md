# HalfCopilot 技术规范

本文档目录包含 HalfCopilot 项目的详细技术规范，供开发团队参考。

---

## 📚 文档索引

### 核心规范

| 文档 | 说明 | 状态 |
|------|------|------|
| [CLI 命令规范](./cli-commands.md) | CLI 命令、选项、快捷键定义 | ✅ 完成 |
| [安全模型](./security-model.md) | 权限模型、审批流程、审计日志 | ✅ 完成 |
| [Provider 接口](./provider-interface.ts) | Provider 层 TypeScript 接口定义 | ✅ 完成 |
| [工具系统设计](./tool-system.md) | 内置工具 API、文本解析降级策略 | ✅ 完成 |
| [项目结构](./project-structure.md) | Monorepo 布局、包依赖关系 | ✅ 完成 |
| [记忆系统](./memory-system.md) | 记忆类型、加载流程、管理 API | ✅ 完成 |
| [测试策略](./test-strategy.md) | 单元测试、集成测试、E2E 测试 | ✅ 完成 |

### 相关文档

| 文档 | 位置 |
|------|------|
| 产品设计文档 | [../plans/2026-05-08-halfcopilot-design.md](../plans/2026-05-08-halfcopilot-design.md) |
| 使用指南 (待创建) | ../guides/getting-started.md |
| 贡献指南 (待创建) | ../guides/contributing.md |

---

## 🚀 快速开始

### 1. 阅读顺序

**新加入开发者：**
```
1. 产品设计文档 (了解产品定位)
2. CLI 命令规范 (了解用户交互)
3. 项目结构 (了解代码组织)
4. Provider 接口 (了解核心抽象)
5. 工具系统设计 (了解功能实现)
6. 测试策略 (了解质量保障)
```

**实现特定功能：**
```
- 新增 Provider → Provider 接口 + provider/ 目录结构
- 新增工具 → 工具系统设计 + tools/ 目录结构
- 修改 CLI → CLI 命令规范 + cli/ 目录结构
```

### 2. 开发环境准备

```bash
# 克隆项目
git clone git@github.com:aiagentbase/halfcopilot.git
cd halfcopilot

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 开发模式
pnpm dev
```

### 3. 包结构概览

```
packages/
├── cli/          # CLI 入口，TUI 界面
├── core/         # Agent 核心引擎
├── provider/     # 模型 Provider 层
├── tools/        # 工具系统
├── mcp/          # MCP 协议支持
├── memory/       # 记忆系统
├── config/       # 配置系统
└── shared/       # 共享工具库
```

---

## 📋 开发清单

### Phase 1: 基础框架 (Week 1-2)

- [ ] 项目骨架初始化
  - [ ] 创建 Turborepo 结构
  - [ ] 配置 TypeScript
  - [ ] 配置 ESLint/Prettier
  - [ ] 设置 CI/CD

- [ ] 实现 config 包
  - [ ] 配置加载逻辑
  - [ ] 环境变量解析
  - [ ] Schema 验证

- [ ] 实现 shared 包
  - [ ] 日志工具
  - [ ] 编码检测
  - [ ] 路径工具

- [ ] 实现 provider 包
  - [ ] Provider 抽象接口
  - [ ] OpenAI 兼容轨实现
  - [ ] Anthropic 原生实现
  - [ ] Provider 注册表

### Phase 2: 核心功能 (Week 3-4)

- [ ] 实现 tools 包
  - [ ] 工具注册表
  - [ ] file_read/file_write/file_edit
  - [ ] bash 执行
  - [ ] grep/glob 搜索
  - [ ] 文本解析器

- [ ] 实现 core 包
  - [ ] Agent Loop 基础实现
  - [ ] 对话历史管理
  - [ ] 权限审批流程
  - [ ] 系统提示词生成

- [ ] 实现 memory 包
  - [ ] 记忆存储抽象
  - [ ] 记忆加载流程
  - [ ] MEMORY.md 生成

### Phase 3: CLI 和 TUI (Week 5-6)

- [ ] 实现 cli 包
  - [ ] 命令行参数解析
  - [ ] 命令分发 (chat/run/init)
  - [ ] TUI 组件 (ChatView/StatusBar)
  - [ ] 工具确认 UI

- [ ] 实现 mcp 包
  - [ ] MCP 客户端
  - [ ] stdio 传输
  - [ ] SSE 传输

### Phase 4: 完善和发布 (Week 7-8)

- [ ] 测试覆盖
  - [ ] 单元测试 > 80%
  - [ ] 集成测试关键流程
  - [ ] E2E 测试核心功能

- [ ] 文档完善
  - [ ] README.md
  - [ ] 使用指南
  - [ ] API 文档

- [ ] 发布准备
  - [ ] npm 包配置
  - [ ] 版本管理 (changesets)
  - [ ] 首次发布

---

## 🎯 关键设计决策

### 1. 为什么选择 TypeScript？

- 生态成熟，OpenCode/Cline/Claude Code 都用 TS
- 类型安全，适合大型项目
- 与 Node.js 集成最好

### 2. 为什么选择 ink 作为 TUI 框架？

- 组件化开发，React 范式
- 社区活跃，维护良好
- 适合复杂交互场景

### 3. 为什么使用双轨 Provider 设计？

- OpenAI 兼容轨：覆盖 DeepSeek、MiniMax、Qwen 等绝大多数模型
- Anthropic 原生轨：完整支持 Claude 的 tool_use 和 thinking 特性
- 兼容性最好，维护成本可控

### 4. 为什么使用混合模式工具系统？

- 优先使用 tool_use API（当 Provider 支持时）
- 降级到文本解析（当 Provider 不支持时）
- 最大化模型兼容性

### 5. 为什么使用 Markdown 格式存储记忆？

- 人类可读，易于编辑
- 版本友好，diff 清晰
- 可直接注入上下文

---

## 🔧 开发工具

### 推荐 IDE 配置

**VS Code 扩展：**
- ESLint
- Prettier
- GitLens
- Turbo Console Log

**设置：**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### 调试配置

**launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/packages/cli/src/index.tsx",
      "args": ["chat"],
      "env": {
        "DEEPSEEK_API_KEY": "${env:DEEPSEEK_API_KEY}"
      }
    }
  ]
}
```

---

## 📞 获取帮助

- **设计问题**: 参考对应规范文档
- **实现问题**: 查看测试用例示例
- **架构问题**: 参考项目结构文档
- **其他问题**: 联系项目维护者

---

## 📝 更新日志

| 日期 | 更新内容 | 作者 |
|------|---------|------|
| 2026-05-08 | 初始版本，完成所有核心规范文档 | HalfCopilot Team |

---

## ✅ 规范检查清单

开发新功能时，请确保：

- [ ] 遵循 CLI 命令规范（如新增命令）
- [ ] 遵循安全模型（权限级别、审批流程）
- [ ] 遵循 Provider 接口（如新增 Provider）
- [ ] 遵循工具系统设计（如新增工具）
- [ ] 遵循项目结构（新文件放置位置）
- [ ] 编写对应测试（参考测试策略）
- [ ] 更新相关文档
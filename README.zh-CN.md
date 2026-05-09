# HalfCopilot

> 多模型 Agent 框架 CLI · 精美终端交互界面

[![npm version](https://img.shields.io/npm/v/halfcopilot.svg)](https://www.npmjs.com/package/halfcopilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![CI](https://github.com/halfcopilot/halfcopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/halfcopilot/halfcopilot/actions)

## 预览

```
  ╭──────────────────────────────────────────────────────────────╮
  │                   H A L F   C O P I L O T                    │
  │               Multi-model Agent Framework CLI                │
  ╰──────────────────────────────────────────────────────────────╯

  Provider: minimax
  Model: MiniMax-M2.7
  Mode: auto

  ❯ 你是谁

  💭 用户问我是谁，我应该用中文回答。

  ● 我是 HalfCopilot，一个由 half 构建的 AI 助手。

  有什么我可以帮你的吗？
  (523ms)
```

## 特性

- 🤖 **多模型支持** — DeepSeek · MiniMax · 小米 MiMo · Qwen · OpenAI · Anthropic
- 🎨 **精美 TUI** — 框线聊天界面 + 点阵动画 + 代码块预览 + 状态栏
- 🔧 **内置工具** — 文件读写/编辑、bash 执行、grep 搜索、glob 匹配
- 🎯 **技能系统** — git-commit、test-runner、code-review、documentation、refactor（全部可执行）
- 🔒 **权限控制** — 三级权限（SAFE/WARN/UNSAFE），会话审批自动过期
- 📦 **MCP 协议** — 通过 Model Context Protocol 扩展工具（stdio + SSE）
- 🧠 **记忆系统** — 持久化用户/项目上下文，文件锁 + 自动归档
- 🧪 **130+ 测试** — 覆盖全部 9 个包

## 快速开始

### npm 安装

```bash
npm install -g halfcopilot
```

### pnpm 安装

```bash
pnpm add -g halfcopilot
```

### npx 直接运行（免安装）

```bash
npx halfcopilot
```

### Windows PowerShell 一键安装

```powershell
irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex
```

### Linux/macOS 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.sh | bash
```

## 使用说明

### 交互式聊天

```bash
halfcop
```

### 单次执行

```bash
halfcop run "解释这段代码"
halfcop run "帮我写一个快速排序"
```

### 首次配置

```bash
halfcop setup
```

### 诊断检查

```bash
halfcop doctor
```

### 列出模型

```bash
halfcop models
```

### 命令列表

| 命令 | 说明 |
|------|------|
| `halfcop` | 启动交互式聊天 |
| `halfcop chat` | 启动交互式聊天 |
| `halfcop run <prompt>` | 单次执行并退出 |
| `halfcop models` | 列出已配置的模型 |
| `halfcop doctor` | 检查配置和环境 |
| `halfcop skills` | 列出可用技能 |
| `halfcop setup` | 交互式 API Key 配置 |

### 聊天内命令

| 命令 | 说明 |
|------|------|
| `/model <name>` | 切换模型 |
| `/provider <name>` | 切换供应商 |
| `/mode <plan/act/auto/review>` | 设置 Agent 模式 |
| `/clear` | 清屏 |
| `/help` | 显示帮助 |
| `exit` / `quit` | 退出程序 |

## 配置

配置文件：`~/.halfcopilot/settings.json`

```json
{
  "defaultProvider": "xiaomi",
  "defaultModel": "mimo-v2.5-pro",
  "maxTurns": 50,
  "permissions": {
    "autoApproveSafe": true,
    "allow": ["file_read", "file_write", "file_edit", "grep", "glob"],
    "deny": ["bash(rm -rf *)", "bash(sudo *)"]
  },
  "providers": {
    "xiaomi": {
      "type": "openai-compatible",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": {
        "mimo-v2.5-pro": { "contextWindow": 128000, "maxOutput": 16384 }
      }
    },
    "deepseek": {
      "type": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": {
        "deepseek-chat": { "contextWindow": 64000, "maxOutput": 8192 }
      }
    }
  }
}
```

## 支持的模型

| 供应商 | 模型 | 获取 API Key |
|--------|------|-------------|
| **MiniMax** | MiniMax-M2.7, MiniMax-M2.5 | [minimaxi.com](https://minimaxi.com) |
| **小米 MiMo** | mimo-v2.5-pro, mimo-v2.5 | [token-plan-cn.xiaomimimo.com](https://token-plan-cn.xiaomimimo.com) |
| **DeepSeek** | deepseek-chat, deepseek-reasoner | [platform.deepseek.com](https://platform.deepseek.com) |
| **通义千问 Qwen** | qwen-turbo, qwen-plus | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) |
| **OpenAI** | gpt-4o, gpt-4o-mini | [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | claude-sonnet-4-20250514 | [console.anthropic.com](https://console.anthropic.com) |

## 内置工具

| 工具 | 说明 | 权限 |
|------|------|------|
| `file_read` | 读取文件（支持 offset/limit） | SAFE |
| `file_write` | 写入/创建文件（自动创建父目录） | WARN |
| `file_edit` | 查找替换编辑文件 | WARN |
| `bash` | 执行 shell 命令 | UNSAFE（只读命令自动批准） |
| `grep` | 正则搜索文件内容 | SAFE |
| `glob` | 按 glob 模式查找文件 | SAFE |

## 内置技能

| 技能 | 说明 |
|------|------|
| `git-commit` | 分析变更 -> 生成 conventional commit 信息 -> staging -> commit |
| `test-runner` | 检测项目框架（npm/pytest/go/cargo/make）-> 运行测试 -> 解析结果 |
| `code-review` | 检查文件长度、eval 使用、硬编码密钥、`any` 类型、空 catch |
| `documentation` | 解析 exports/函数/类/接口，生成 Markdown 文档 |
| `refactor` | 分析代码、移除 console.log、用 tsc 校验 |

## 开发

```bash
git clone https://github.com/halfcopilot/halfcopilot.git
cd halfcopilot
pnpm install
pnpm build
pnpm test        # 130 个测试，15 个测试文件
pnpm lint
```

### 项目结构

```
halfcopilot/
├── packages/
│   ├── shared/      # 基础工具、错误类、日志（零依赖）
│   ├── config/      # Zod schema、配置加载、环境变量覆盖
│   ├── provider/    # OpenAI 兼容 + Anthropic 供应商
│   ├── tools/       # 工具注册、执行器、权限检查器
│   ├── core/        # Agent 循环、对话管理、混合模式
│   ├── memory/      # 持久化记忆（文件锁 + 归档）
│   ├── mcp/         # MCP 协议（stdio + SSE 传输）
│   ├── skills/      # 技能注册与触发匹配
│   └── cli/         # CLI 入口 + TUI（React/Ink + 增强终端界面）
├── docs/            # 文档
├── scripts/         # 构建脚本
├── .github/         # CI/CD 工作流
├── install.ps1      # Windows PowerShell 安装脚本
└── install.sh       # Linux/macOS 安装脚本
```

## 架构

```
                cli (halfcopilot)
               /  |   |   |    \
              /   |   |   |     \
        config  provider  tools  memory
           \       |     /        |
            \      |    /         |
             shared <--/----------/
                |
                v
              core
              /   \
             mcp  skills
```

## License

MIT © HalfCopilot Team

## 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

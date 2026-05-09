# HalfCopilot

> Multi-model Agent Framework CLI with Beautiful Terminal UI

[![npm version](https://img.shields.io/npm/v/halfcopilot.svg)](https://www.npmjs.com/package/halfcopilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![CI](https://github.com/halfcopilot/halfcopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/halfcopilot/halfcopilot/actions)

## Preview

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

## Features

- 🤖 **Multi-model Support** — DeepSeek · MiniMax · Xiaomi MiMo · Qwen · OpenAI · Anthropic
- 🎨 **Beautiful TUI** — Box-drawing chat UI with spinner animation, code block preview, status bar
- 🔧 **Built-in Tools** — File read/write/edit, bash execution, grep, glob
- 🎯 **Skills System** — git-commit, test-runner, code-review, documentation, refactor (all fully functional)
- 🔒 **Permission Control** — Tiered permission levels (SAFE/WARN/UNSAFE), session-based approval with TTL
- 📦 **MCP Protocol** — Extend tools via Model Context Protocol (stdio + SSE transport)
- 🧠 **Memory System** — Persistent user/project context with file locking and auto-archive
- 🧪 **130+ Tests** — Comprehensive test coverage across all 9 packages

## Quick Start

### via npm

```bash
npm install -g halfcopilot
```

### via pnpm

```bash
pnpm add -g halfcopilot
```

### via npx (no install)

```bash
npx halfcopilot
```

### One-line Install (Windows PowerShell)

```powershell
irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex
```

### One-line Install (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.sh | bash
```

## Usage

### Interactive Chat

```bash
halfcop
```

### Run Once

```bash
halfcop run "explain this code"
halfcop run "帮我写一个快速排序"
```

### Setup (first time)

```bash
halfcop setup
```

### Doctor (check config)

```bash
halfcop doctor
```

### List Models

```bash
halfcop models
```

### Commands

| Command | Description |
|---------|-------------|
| `halfcop` | Start interactive chat |
| `halfcop chat` | Start interactive chat |
| `halfcop run <prompt>` | Run single prompt and exit |
| `halfcop models` | List configured models |
| `halfcop doctor` | Check configuration and environment |
| `halfcop skills` | List available skills |
| `halfcop setup` | Interactive API key configuration |

### In-Chat Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch model |
| `/provider <name>` | Switch provider |
| `/mode <plan/act/auto/review>` | Set agent mode |
| `/clear` | Clear screen |
| `/help` | Show help |
| `exit` / `quit` | Exit program |

## Configuration

Config file: `~/.halfcopilot/settings.json`

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

## Supported Models

| Provider | Models | API Key |
|----------|--------|---------|
| **MiniMax** | MiniMax-M2.7, MiniMax-M2.5 | [minimaxi.com](https://minimaxi.com) |
| **Xiaomi MiMo** | mimo-v2.5-pro, mimo-v2.5 | [token-plan-cn.xiaomimimo.com](https://token-plan-cn.xiaomimimo.com) |
| **DeepSeek** | deepseek-chat, deepseek-reasoner | [platform.deepseek.com](https://platform.deepseek.com) |
| **Qwen** | qwen-turbo, qwen-plus | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) |
| **OpenAI** | gpt-4o, gpt-4o-mini | [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | claude-sonnet-4-20250514 | [console.anthropic.com](https://console.anthropic.com) |

## Built-in Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `file_read` | Read file contents with offset/limit | SAFE |
| `file_write` | Write/create file with parent dirs | WARN |
| `file_edit` | Find-and-replace text in file | WARN |
| `bash` | Execute shell command | UNSAFE (read-only auto-approved) |
| `grep` | Search file contents via regex | SAFE |
| `glob` | Find files by glob pattern | SAFE |

## Skills

| Skill | Description |
|-------|-------------|
| `git-commit` | Analyze changes, generate conventional commit message, stage and commit |
| `test-runner` | Detect framework (npm/pytest/go/cargo/make), run tests, parse results |
| `code-review` | Check file length, eval usage, hardcoded secrets, `any` types, empty catches |
| `documentation` | Parse exports, functions, classes, interfaces; generate Markdown docs |
| `refactor` | Analyze code, remove console.log, verify with type checker |

## Development

```bash
git clone https://github.com/halfcopilot/halfcopilot.git
cd halfcopilot
pnpm install
pnpm build
pnpm test        # 130 tests in 15 test files
pnpm lint
```

### Project Structure

```
halfcopilot/
├── packages/
│   ├── shared/      # Base utilities, errors, logger (zero deps)
│   ├── config/      # Zod schema, config loader with env overrides
│   ├── provider/    # OpenAI-compatible + Anthropic providers
│   ├── tools/       # Tool registry, executor, permission checker
│   ├── core/        # Agent loop, conversation manager, hybrid mode
│   ├── memory/      # Persistent memory with file locking
│   ├── mcp/         # MCP protocol (stdio + SSE transport)
│   ├── skills/      # Skill registry with trigger matching
│   └── cli/         # CLI + TUI (React/Ink + enhanced terminal UI)
├── docs/            # Documentation
├── scripts/         # Build scripts
├── .github/         # CI/CD workflows
├── install.ps1      # Windows PowerShell installer
└── install.sh       # Linux/macOS shell installer
```

## Architecture

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

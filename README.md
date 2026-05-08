# HalfCopilot

> Multi-model Agent Framework CLI with Beautiful Chat Interface

[![npm version](https://img.shields.io/npm/v/halfcopilot.svg)](https://www.npmjs.com/package/halfcopilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

## 📸 Preview

```
  ╭─────────────────────────────────────────────────────╮
  │                                                     │
  │    ██╗  ██╗ █████╗ ██╗     ██████╗ ██████╗ ██████╗  │
  │    ██║  ██║██╔══██╗██║    ██╔════╝██╔═══██╗██╔══██╗ │
  │    ███████║███████║██║    ██║     ██║   ██║██████╔╝ │
  │    ██╔══██║██╔══██║██║    ██║     ██║   ██║██╔═══╝  │
  │    ██║  ██║██║  ██║██║    ╚██████╗╚██████╔╝██║      │
  │    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═════╝ ╚═════╝ ╚═╝      │
  │                                                     │
  │         Multi-model Agent Framework CLI              │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Provider: xiaomi
  Model:    mimo-v2.5-pro
  Mode:     auto

  ❯ 帮我写一个快速排序

  ╭─────────────────────────────────────────────────╮
  │ 👤 You                                          │
  ├─────────────────────────────────────────────────┤
  │ 帮我写一个快速排序                               │
  ╰─────────────────────────────────────────────────╯

  ⠋ Thinking...

  ╭─────────────────────────────────────────────────╮
  │ 🤖 HalfCopilot                                  │
  ├─────────────────────────────────────────────────┤
  │ 好的，这是快速排序的两种实现...                   │
  ╰─────────────────────────────────────────────────╯
```

## ✨ Features

- 🤖 **Multi-model Support** — DeepSeek · Xiaomi MiMo · Qwen · OpenAI · Anthropic
- 🎨 **Beautiful TUI** — Chat-like interface with colors and animations  
- 🔧 **Built-in Tools** — File operations, command execution, content search
- 🎯 **Skills System** — Extensible skill triggers and execution
- 🔒 **Permission Control** — Safe command execution control
- 📦 **MCP Support** — Extensible tool ecosystem via MCP protocol
- 🧠 **Memory System** — Persistent project and user context

## 🚀 Quick Start

### Install via npm

```bash
npm install -g halfcopilot
```

### Install via pnpm

```bash
pnpm add -g halfcopilot
```

### One-line Install (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.sh | bash
```

### One-line Install (Windows)

```powershell
irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex
```

### Or run directly (no install)

```bash
npx halfcopilot
```

## 📖 Usage

### Start Interactive Chat

```bash
halfcop
```

### Run Single Command

```bash
halfcop run "explain this code"
halfcop run "帮我写一个快速排序"
halfcop run "请帮我读取 README.md 文件"
```

### Use Different Models

```bash
# Xiaomi MiMo (default)
halfcop --provider xiaomi --model mimo-v2.5-pro

# DeepSeek
halfcop --provider deepseek --model deepseek-chat

# OpenAI
halfcop --provider openai --model gpt-4o

# Qwen
halfcop --provider qwen --model qwen-plus
```

### Commands

| Command | Description |
|---------|-------------|
| `halfcop` | Start interactive chat |
| `halfcop chat` | Start interactive chat |
| `halfcop run "prompt"` | Run single prompt |
| `halfcop models` | List available models |
| `halfcop doctor` | Check configuration |
| `halfcop skills` | List available skills |

### Interactive Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch model |
| `/provider <name>` | Switch provider |
| `/clear` | Clear screen |
| `/help` | Show help |
| `exit` | Exit program |

## ⚙️ Configuration

Create `~/.halfcopilot/settings.json`:

```json
{
  "defaultProvider": "xiaomi",
  "defaultModel": "mimo-v2.5-pro",
  "permissions": {
    "allow": ["file_read", "file_write", "file_edit", "grep", "glob"],
    "deny": ["rm -rf /", "sudo rm"]
  },
  "providers": {
    "xiaomi": {
      "type": "openai-compatible",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": {
        "mimo-v2.5-pro": { "contextWindow": 128000, "maxOutput": 8192 }
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

## 📦 Supported Models

| Provider | Models | API Key |
|----------|--------|---------|
| **Xiaomi** | mimo-v2.5-pro, mimo-v2.5 | [Get API Key](https://token-plan-cn.xiaomimimo.com) |
| **DeepSeek** | deepseek-chat, deepseek-coder | [Get API Key](https://platform.deepseek.com) |
| **Qwen** | qwen-turbo, qwen-plus | [Get API Key](https://dashscope.aliyuncs.com) |
| **OpenAI** | gpt-4o, gpt-4o-mini | [Get API Key](https://platform.openai.com) |
| **Anthropic** | claude-sonnet-4-20250514 | [Get API Key](https://console.anthropic.com) |

## 🛠️ Built-in Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `file_read` | Read file contents | Auto |
| `file_write` | Write file contents | Auto |
| `file_edit` | Edit file contents | Auto |
| `bash` | Execute commands | Auto (safe) / Confirm (unsafe) |
| `grep` | Search file contents | Auto |
| `glob` | Find files by pattern | Auto |

## 🎯 Skills

| Skill | Description |
|-------|-------------|
| `git-commit` | Create meaningful git commits |
| `test-runner` | Run project tests |
| `code-review` | Review code for issues |
| `documentation` | Generate documentation |
| `refactor` | Refactor code quality |

## 🔧 Development

```bash
git clone https://github.com/halfcopilot/halfcopilot.git
cd halfcopilot
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📁 Project Structure

```
halfcopilot/
├── packages/
│   ├── cli/       # CLI entry point + TUI
│   ├── core/      # Agent core engine
│   ├── provider/  # Model providers
│   ├── tools/     # Tool system
│   ├── mcp/       # MCP protocol
│   ├── memory/    # Memory system
│   ├── config/    # Configuration
│   ├── skills/    # Skills system
│   └── shared/    # Shared utilities
├── docs/          # Documentation
├── scripts/       # Build scripts
├── npm/           # npm package
├── install.sh     # Linux/macOS installer
├── install.ps1    # Windows installer
└── .github/       # CI/CD workflows
```

## 📄 License

MIT © HalfCopilot Team

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## ⭐ Show Your Support

Give us a ⭐ on GitHub if this project helps you!

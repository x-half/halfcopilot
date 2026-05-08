# HalfCopilot

> Multi-model Agent Framework CLI with Beautiful Chat Interface

## ✨ Features

- 🤖 **Multi-model Support**: DeepSeek, Xiaomi MiMo, Qwen, OpenAI, Anthropic
- 🎨 **Beautiful TUI**: Chat-like interface with colors and animations
- 🔧 **Built-in Tools**: File operations, command execution, search
- 🎯 **Skills System**: Extensible skill triggers
- 🔒 **Permission Control**: Safe command execution

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

### One-line Install (Windows PowerShell)

```powershell
irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex
```

## 📖 Usage

### Start Interactive Chat

```bash
halfcop
```

### Run Single Command

```bash
halfcop run "explain this code"
```

### Use Different Models

```bash
# Use Xiaomi MiMo
halfcop --provider xiaomi --model mimo-v2.5-pro

# Use DeepSeek
halfcop --provider deepseek --model deepseek-chat

# Use OpenAI
halfcop --provider openai --model gpt-4o
```

### List Available Models

```bash
halfcop models
```

## ⚙️ Configuration

Create `~/.halfcopilot/settings.json`:

```json
{
  "defaultProvider": "xiaomi",
  "defaultModel": "mimo-v2.5-pro",
  "providers": {
    "xiaomi": {
      "type": "openai-compatible",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": {
        "mimo-v2.5-pro": {
          "contextWindow": 128000,
          "maxOutput": 8192
        }
      }
    },
    "deepseek": {
      "type": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": {
        "deepseek-chat": {
          "contextWindow": 64000,
          "maxOutput": 8192
        }
      }
    }
  }
}
```

## 🛠️ Built-in Commands

| Command | Description |
|---------|-------------|
| `halfcop` | Start interactive chat |
| `halfcop run "prompt"` | Run single prompt |
| `halfcop models` | List available models |
| `halfcop doctor` | Check configuration |
| `halfcop skills` | List available skills |

## 🎯 Interactive Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch model |
| `/provider <name>` | Switch provider |
| `/clear` | Clear screen |
| `/help` | Show help |
| `exit` | Exit program |

## 📦 Supported Models

| Provider | Models |
|----------|--------|
| Xiaomi | mimo-v2.5-pro, mimo-v2.5 |
| DeepSeek | deepseek-chat, deepseek-coder |
| Qwen | qwen-turbo, qwen-plus |
| OpenAI | gpt-4o, gpt-4o-mini |
| Anthropic | claude-sonnet-4-20250514 |

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## 📧 Contact

- GitHub: [halfcopilot/halfcopilot](https://github.com/halfcopilot/halfcopilot)
- Issues: [GitHub Issues](https://github.com/halfcopilot/halfcopilot/issues)

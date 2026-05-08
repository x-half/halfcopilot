# Contributing to HalfCopilot

## 🚀 Quick Start

```bash
git clone https://github.com/halfcopilot/halfcopilot.git
cd halfcopilot
pnpm install
pnpm build
pnpm test
```

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
└── npm/           # npm package
```

## 🎯 Development

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Run locally
```bash
node packages/cli/dist/halfcop.js
```

## 📝 Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

## 📦 Publishing

1. Update version in `npm/package.json`
2. Push a tag: `git tag v1.0.0 && git push --tags`
3. GitHub Actions will publish to npm automatically

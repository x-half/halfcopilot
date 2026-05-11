#!/usr/bin/env node

/**
 * Build script for npm publishing
 * Bundles all packages into a single distributable
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const npmDir = join(rootDir, 'npm');

function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        copyDir(srcPath, destPath);
      }
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

console.log('╔══════════════════════════════════════════════════╗');
console.log('║         Bundling HalfCopilot for npm             ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('   (Assumes `pnpm build` was already run)');
console.log('');

// Step 1: Create dist directory with all compiled code
console.log('1️⃣  Bundling distribution...');

const distDir = join(npmDir, 'dist');
if (existsSync(distDir)) {
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Remove-Item -Path '${distDir}' -Recurse -Force"`, { cwd: rootDir });
  } else {
    execSync(`rm -rf "${distDir}"`, { cwd: rootDir });
  }
}
mkdirSync(distDir, { recursive: true });

// Copy all package dist files
const packages = ['shared', 'config', 'provider', 'tools', 'core', 'memory', 'mcp', 'skills', 'cli'];

for (const pkg of packages) {
  const srcDist = join(rootDir, 'packages', pkg, 'dist');
  if (existsSync(srcDist)) {
    const destDist = join(distDir, 'packages', pkg, 'dist');
    copyDir(srcDist, destDist);
  }
}

// Create main index.js that re-exports CLI
const mainIndex = `
// HalfCopilot CLI Main Entry
export * from './packages/cli/dist/halfcop.js';
`;

writeFileSync(join(distDir, 'index.js'), mainIndex);

console.log('   ✓ Distribution bundled');

// Step 3: Copy bin file
console.log('');
console.log('3️⃣  Setting up bin...');

const binDir = join(npmDir, 'bin');
if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true });
}

// Update bin file to point to correct location
const binContent = `#!/usr/bin/env node

/**
 * HalfCopilot CLI Entry Point
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mainPath = join(__dirname, '..', 'dist', 'packages', 'cli', 'dist', 'halfcop.js');
const mainModule = pathToFileURL(mainPath).href;

try {
  await import(mainModule);
} catch (err) {
  console.error('Failed to start HalfCopilot:', err.message);
  process.exit(1);
}
`;

writeFileSync(join(binDir, 'halfcop.js'), binContent);

console.log('   ✓ Bin setup complete');

// Step 4: Create README
console.log('');
console.log('4️⃣  Creating README...');

const readme = `# HalfCopilot

> Multi-model Agent Framework CLI with Beautiful Chat Interface

## ✨ Features

- 🤖 **Multi-model Support**: DeepSeek, Xiaomi MiMo, Qwen, OpenAI, Anthropic
- 🎨 **Beautiful TUI**: Chat-like interface with colors and animations
- 🔧 **Built-in Tools**: File operations, command execution, search
- 🎯 **Skills System**: Extensible skill triggers
- 🔒 **Permission Control**: Safe command execution

## 🚀 Quick Start

### Install via npm

\`\`\`bash
npm install -g halfcopilot
\`\`\`

### Install via pnpm

\`\`\`bash
pnpm add -g halfcopilot
\`\`\`

### One-line Install (Linux/macOS)

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.sh | bash
\`\`\`

### One-line Install (Windows PowerShell)

\`\`\`powershell
irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex
\`\`\`

## 📖 Usage

### Start Interactive Chat

\`\`\`bash
halfcop
\`\`\`

### Run Single Command

\`\`\`bash
halfcop run "explain this code"
\`\`\`

### Use Different Models

\`\`\`bash
# Use Xiaomi MiMo
halfcop --provider xiaomi --model mimo-v2.5-pro

# Use DeepSeek
halfcop --provider deepseek --model deepseek-chat

# Use OpenAI
halfcop --provider openai --model gpt-4o
\`\`\`

### List Available Models

\`\`\`bash
halfcop models
\`\`\`

## ⚙️ Configuration

Create \`~/.halfcopilot/settings.json\`:

\`\`\`json
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
\`\`\`

## 🛠️ Built-in Commands

| Command | Description |
|---------|-------------|
| \`halfcop\` | Start interactive chat |
| \`halfcop run "prompt"\` | Run single prompt |
| \`halfcop models\` | List available models |
| \`halfcop doctor\` | Check configuration |
| \`halfcop skills\` | List available skills |

## 🎯 Interactive Commands

| Command | Description |
|---------|-------------|
| \`/model <name>\` | Switch model |
| \`/provider <name>\` | Switch provider |
| \`/clear\` | Clear screen |
| \`/help\` | Show help |
| \`exit\` | Exit program |

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
`;

writeFileSync(join(npmDir, 'README.md'), readme);

console.log('   ✓ README created');

// Step 5: Create LICENSE
console.log('');
console.log('5️⃣  Creating LICENSE...');

const license = `MIT License

Copyright (c) 2024 HalfCopilot Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

writeFileSync(join(npmDir, 'LICENSE'), license);

console.log('   ✓ LICENSE created');

// Step 6: Create postinstall script
console.log('');
console.log('6️⃣  Creating postinstall script...');

const postinstall = `#!/usr/bin/env node

/**
 * Postinstall script for HalfCopilot
 * Shows welcome message after installation
 */

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║     HalfCopilot installed successfully! 🎉      ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('  Get started:');
console.log('');
console.log('    halfcop              # Start interactive chat');
console.log('    halfcop run "prompt" # Run single prompt');
console.log('    halfcop models       # List available models');
console.log('    halfcop doctor       # Check configuration');
console.log('');
console.log('  Configure your API keys:');
console.log('');
console.log('    Create ~/.halfcopilot/settings.json');
console.log('    See: https://github.com/halfcopilot/halfcopilot#configuration');
console.log('');
`;

writeFileSync(join(npmDir, 'scripts', 'postinstall.mjs'), postinstall);

console.log('   ✓ Postinstall script created');

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║              Bundled! ✅                         ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('To publish:');
console.log('  cd npm && pnpm publish');
console.log('');
console.log('To test locally:');
console.log('  cd npm && pnpm link');
console.log('  halfcop');
console.log('');

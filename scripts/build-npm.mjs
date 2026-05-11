#!/usr/bin/env node

import { execSync } from "child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const npmDir = join(rootDir, "npm");

function copyDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const cliPkg = JSON.parse(
  readFileSync(join(rootDir, "packages/cli/package.json"), "utf-8"),
);
const version = cliPkg.version;

console.log("");
console.log("╔══════════════════════════════════════════════════╗");
console.log("║    Bundling HalfCopilot v" + version.padEnd(30) + "║");
console.log("╚══════════════════════════════════════════════════╝");
console.log("");
console.log("   (Assumes `pnpm build` was already run)");
console.log("");

// Clean previous build
const distDir = join(npmDir, "dist");
if (existsSync(distDir)) {
  execSync(`rm -rf "${distDir}"`, { cwd: rootDir });
}

// Step 1: Copy CLI dist (halfcop.js is self-contained, bundles all @halfcopilot/*)
console.log("1\uFE0F\u20E3  Copying CLI bundle...");
const cliDist = join(rootDir, "packages/cli/dist");
const destCliDist = join(distDir, "packages/cli/dist");
copyDir(cliDist, destCliDist);
console.log("   \u2713 CLI dist copied");

// Step 2: Create main index.js re-export
console.log("");
console.log("2\uFE0F\u20E3  Creating main entry...");
const mainIndex = `
export * from './packages/cli/dist/halfcop.js';
`;
writeFileSync(join(distDir, "index.js"), mainIndex);
console.log("   \u2713 Main entry created");

// Step 3: Create bin entry
console.log("");
console.log("3\uFE0F\u20E3  Setting up bin...");
const binDir = join(npmDir, "bin");
if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

const binContent = `#!/usr/bin/env node
const { join } = require("path");
require(join(__dirname, "..", "dist", "packages", "cli", "dist", "halfcop.js"));
`;

writeFileSync(join(binDir, "halfcop.cjs"), binContent);
console.log("   \u2713 Bin setup complete");

// Step 4: Update npm/package.json with current version
console.log("");
console.log("4\uFE0F\u20E3  Updating package.json version...");
const npmPkgPath = join(npmDir, "package.json");
const npmPkg = JSON.parse(readFileSync(npmPkgPath, "utf-8"));
npmPkg.version = version;
writeFileSync(npmPkgPath, JSON.stringify(npmPkg, null, 2) + "\n");
console.log(`   \u2713 Version set to ${version}`);

// Step 5: Create README + LICENSE + postinstall
console.log("");
console.log("5\uFE0F\u20E3  Creating README, LICENSE, postinstall...");

if (!existsSync(join(npmDir, "README.md"))) {
  const readme = `# HalfCopilot

> Multi-model Agent Framework CLI

## Quick Start

\`\`\`bash
npm install -g halfcopilot
halfcop
\`\`\`

## Usage

| Command | Description |
|---------|-------------|
| \`halfcop\` | Start interactive chat |
| \`halfcop run "prompt"\` | Run single prompt |
| \`halfcop models\` | List available models |
| \`halfcop doctor\` | Check configuration |
| \`halfcop skills\` | List available skills |
| \`halfcop config\` | Show configuration |

## Configuration

Create \`~/.halfcopilot/settings.json\` with your API keys.

See: https://github.com/halfcopilot/halfcopilot
`;
  writeFileSync(join(npmDir, "README.md"), readme);
}

if (!existsSync(join(npmDir, "LICENSE"))) {
  writeFileSync(
    join(npmDir, "LICENSE"),
    "MIT License\n\nCopyright (c) 2024 HalfCopilot Team\n",
  );
}

const scriptsDir = join(npmDir, "scripts");
if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
const postinstallPath = join(scriptsDir, "postinstall.mjs");
if (!existsSync(postinstallPath)) {
  writeFileSync(
    postinstallPath,
    `#!/usr/bin/env node
console.log("");
console.log("HalfCopilot installed successfully!");
console.log("");
console.log("  halfcop              # Start interactive chat");
console.log("  halfcop run \"prompt\" # Run single prompt");
console.log("");
`,
  );
}

console.log("   \u2713 README, LICENSE, postinstall ready");

console.log("");
console.log("╔══════════════════════════════════════════════════╗");
console.log("║              Bundled! \u2705                         ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log("");
console.log("To publish:");
console.log("  cd npm && npm publish");
console.log("");

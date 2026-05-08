#!/usr/bin/env node

/**
 * Build script for HalfCopilot
 * Bundles all packages into a single distributable
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Building HalfCopilot...\n');

// Step 1: Build all packages
console.log('1. Building packages...');
try {
  execSync('npx tsc --build packages/shared packages/config packages/provider packages/tools packages/core packages/memory packages/mcp packages/skills packages/cli', {
    cwd: rootDir,
    stdio: 'inherit'
  });
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}

// Step 2: Copy CLI dist to publish
console.log('\n2. Copying files...');
const cliDist = join(rootDir, 'packages', 'cli', 'dist');
const publishDist = join(rootDir, 'publish', 'dist');

if (existsSync(publishDist)) {
  execSync(`rm -rf ${publishDist}`, { cwd: rootDir });
}

copyDir(cliDist, publishDist);

// Step 3: Copy other package dists
const packages = ['shared', 'config', 'provider', 'tools', 'core', 'memory', 'mcp', 'skills'];

for (const pkg of packages) {
  const srcDist = join(rootDir, 'packages', pkg, 'dist');
  const destDist = join(publishDist, 'packages', pkg, 'dist');
  
  if (existsSync(srcDist)) {
    copyDir(srcDist, destDist);
  }
}

// Step 4: Make bin executable
console.log('\n3. Setting permissions...');
execSync('chmod +x publish/bin/halfcop.js', { cwd: rootDir });

console.log('\n✅ Build complete!');
console.log('\nTo publish:');
console.log('  cd publish && npm publish');
console.log('\nTo install locally:');
console.log('  npm install -g ./publish');
console.log('\nTo use:');
console.log('  halfcop');

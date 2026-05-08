#!/usr/bin/env node

/**
 * HalfCopilot CLI Entry Point
 * 
 * Usage:
 *   halfcop                    # Start interactive chat
 *   halfcop chat               # Start interactive chat
 *   halfcop run "prompt"       # Run single prompt
 *   halfcop doctor             # Check configuration
 *   halfcop skills             # List available skills
 *   halfcop config             # Show configuration
 *   halfcop providers          # List providers
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Import the main CLI module
const mainModule = join(__dirname, '..', 'dist', 'index.js');

try {
  await import(mainModule);
} catch (err) {
  console.error('Failed to start HalfCopilot:', err.message);
  process.exit(1);
}

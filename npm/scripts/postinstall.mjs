#!/usr/bin/env node

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

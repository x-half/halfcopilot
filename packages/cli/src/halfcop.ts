#!/usr/bin/env node

/**
 * HalfCopilot CLI - Beautiful Chat Interface
 */

import { Command } from 'commander';
import { loadConfig } from '@halfcopilot/config';
import { ProviderRegistry } from '@halfcopilot/provider';
import { ToolRegistry, createBuiltinTools, PermissionChecker, ToolExecutor } from '@halfcopilot/tools';
import { AgentLoop, HybridProvider } from '@halfcopilot/core';
import { SkillRegistry, createBuiltinSkills } from '@halfcopilot/skills';
import readline from 'readline';

const program = new Command();

program
  .name('halfcop')
  .description('HalfCopilot — Multi-model Agent Framework CLI')
  .version('0.0.1');

interface AgentOptions {
  model?: string;
  provider?: string;
  mode?: string;
  hybrid?: boolean;
}

// Beautiful color palette
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Colors
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Background
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Box drawing characters
const box = {
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  h: '─',
  v: '│',
  ml: '├',
  mr: '┤',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Animated loading indicator
async function showLoading(message: string, duration: number = 1500) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const startTime = Date.now();
  let i = 0;
  
  process.stdout.write(`\r${c.cyan}${frames[0]} ${message}${c.reset}`);
  
  while (Date.now() - startTime < duration) {
    await sleep(80);
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${c.cyan}${frames[i]} ${message}${c.reset}`);
  }
  
  process.stdout.write('\r' + ' '.repeat(message.length + 4) + '\r');
}

function printBox(content: string, color: string = c.cyan, width: number = 50) {
  const lines = content.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length), width - 4);
  
  console.log(`${color}${box.tl}${box.h.repeat(maxLen + 2)}${box.tr}${c.reset}`);
  for (const line of lines) {
    const padding = ' '.repeat(maxLen - line.length);
    console.log(`${color}${box.v}${c.reset} ${line}${padding} ${color}${box.v}${c.reset}`);
  }
  console.log(`${color}${box.bl}${box.h.repeat(maxLen + 2)}${box.br}${c.reset}`);
}

function printHeader() {
  console.log('');
  console.log(`${c.cyan}${c.bold}  ╭─────────────────────────────────────────────────────╮${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │                                                     │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ██╗  ██╗ █████╗ ██╗     ██████╗ ██████╗ ██████╗  │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ██║  ██║██╔══██╗██║    ██╔════╝██╔═══██╗██╔══██╗ │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ███████║███████║██║    ██║     ██║   ██║██████╔╝ │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ██╔══██║██╔══██║██║    ██║     ██║   ██║██╔═══╝  │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ██║  ██║██║  ██║██║    ╚██████╗╚██████╔╝██║      │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═════╝ ╚═════╝ ╚═╝      │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │                                                     │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │         Multi-model Agent Framework CLI              │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  │                                                     │${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ╰─────────────────────────────────────────────────────╯${c.reset}`);
  console.log('');
}

function printInfo(label: string, value: string) {
  console.log(`  ${c.gray}${label}:${c.reset} ${c.white}${c.bold}${value}${c.reset}`);
}

function printUserMessage(message: string) {
  console.log('');
  console.log(`  ${c.green}╭─────────────────────────────────────────────────╮${c.reset}`);
  console.log(`  ${c.green}│${c.reset} ${c.green}${c.bold}👤 You${c.reset}                                          ${c.green}│${c.reset}`);
  console.log(`  ${c.green}├─────────────────────────────────────────────────┤${c.reset}`);
  
  const lines = message.split('\n');
  for (const line of lines) {
    const padding = ' '.repeat(Math.max(0, 47 - line.length));
    console.log(`  ${c.green}│${c.reset} ${line}${padding} ${c.green}│${c.reset}`);
  }
  
  console.log(`  ${c.green}╰─────────────────────────────────────────────────╯${c.reset}`);
}

function printAssistantStart() {
  console.log('');
  console.log(`  ${c.blue}╭─────────────────────────────────────────────────╮${c.reset}`);
  console.log(`  ${c.blue}│${c.reset} ${c.blue}${c.bold}🤖 HalfCopilot${c.reset}                                   ${c.blue}│${c.reset}`);
  console.log(`  ${c.blue}├─────────────────────────────────────────────────┤${c.reset}`);
}

function printAssistantEnd() {
  console.log(`  ${c.blue}╰─────────────────────────────────────────────────╯${c.reset}`);
  console.log('');
}

function printAssistantText(text: string) {
  const lines = text.split('\n');
  for (const line of lines) {
    const padding = ' '.repeat(Math.max(0, 47 - line.length));
    console.log(`  ${c.blue}│${c.reset} ${c.white}${line}${padding} ${c.blue}│${c.reset}`);
  }
}

function printThinking() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  return {
    frame: (i: number) => process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]} ${c.dim}Thinking...${c.reset}   `),
    clear: () => process.stdout.write('\r' + ' '.repeat(30) + '\r'),
  };
}

function createAgent(options: AgentOptions = {}) {
  const config = loadConfig();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.createFromConfig(config);

  const providerName = options.provider ?? config.defaultProvider ?? 'xiaomi';
  let provider = providerRegistry.get(providerName);

  if (options.hybrid) {
    provider = new HybridProvider(provider);
  }

  const toolRegistry = new ToolRegistry();
  const builtinTools = createBuiltinTools();
  builtinTools.forEach(t => toolRegistry.register(t));

  const skillRegistry = new SkillRegistry();
  const builtinSkills = createBuiltinSkills();
  builtinSkills.forEach(s => skillRegistry.register(s));

  const permissions = new PermissionChecker({
    autoApproveSafe: config.permissions.autoApproveSafe,
    allow: config.permissions.allow,
    deny: config.permissions.deny,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const executor = new ToolExecutor(toolRegistry, permissions, async (toolName, input) => {
    // This should rarely be called now due to auto-approval
    return new Promise((resolve) => {
      rl.question(`${c.yellow}  ⚠️  Allow ${toolName}? (y/n): ${c.reset}`, (answer) => {
        resolve(answer.toLowerCase().trim() === 'y');
      });
    });
  });

  const modelName = options.model ?? config.defaultModel ?? 'mimo-v2.5-pro';

  const agent = new AgentLoop({
    provider,
    providerName,
    model: modelName,
    tools: toolRegistry,
    executor,
    permissions,
    maxTurns: config.maxTurns,
    mode: (options.mode as any) ?? 'auto',
  });

  return { agent, providerName, config, skillRegistry, modelName, rl };
}

async function runInteractive(options: AgentOptions = {}) {
  const { agent, providerName, config, skillRegistry, modelName, rl } = createAgent(options);

  // Print beautiful header
  printHeader();
  
  printInfo('Provider', providerName);
  printInfo('Model', modelName);
  printInfo('Mode', options.mode ?? 'auto');
  console.log('');
  console.log(`  ${c.dim}Type your message and press Enter. Type "exit" to quit.${c.reset}`);
  console.log(`  ${c.dim}Commands: /model <name> | /provider <name> | /clear | /help${c.reset}`);
  console.log('');

  const thinking = printThinking();
  let isProcessing = false;
  let thinkingInterval: NodeJS.Timeout | null = null;

  const startThinking = () => {
    isProcessing = true;
    let i = 0;
    thinkingInterval = setInterval(() => {
      thinking.frame(i++);
    }, 80);
  };

  const stopThinking = () => {
    isProcessing = false;
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
    thinking.clear();
  };

  const ask = () => {
    rl.question(`${c.green}${c.bold}  ❯ ${c.reset}`, async (input) => {
      const trimmed = input.trim();
      
      // Handle commands
      if (trimmed.startsWith('/')) {
        handleCommand(trimmed, options);
        ask();
        return;
      }
      
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('');
        console.log(`  ${c.yellow}Goodbye! 👋${c.reset}`);
        console.log('');
        rl.close();
        return;
      }

      if (trimmed === '') {
        ask();
        return;
      }

      // Show user message
      printUserMessage(trimmed);
      console.log('');

      // Start thinking animation
      startThinking();
      let isFirstChunk = true;
      let hasOutput = false;

      try {
        for await (const event of agent.run(trimmed)) {
          switch (event.type) {
            case 'text':
              if (isFirstChunk) {
                stopThinking();
                printAssistantStart();
                isFirstChunk = false;
              }
              hasOutput = true;
              // Don't print newlines before text
              process.stdout.write(`  ${c.blue}│${c.reset} ${c.white}`);
              process.stdout.write(event.content ?? '');
              process.stdout.write(`${c.reset}`);
              break;
              
            case 'tool_use':
              // Hide tool calls - just keep thinking
              break;
              
            case 'tool_result':
              // Hide tool results
              break;
              
            case 'error':
              stopThinking();
              if (!isFirstChunk) printAssistantEnd();
              console.log(`  ${c.red}❌ Error: ${event.error?.message}${c.reset}`);
              console.log('');
              break;
              
            case 'done':
              if (!isFirstChunk && hasOutput) {
                // Print the closing line
                const padding = ' '.repeat(47);
                console.log(`  ${c.blue}│${c.reset}${padding} ${c.blue}│${c.reset}`);
                printAssistantEnd();
              } else if (isFirstChunk) {
                stopThinking();
              }
              break;
          }
        }
      } catch (err) {
        stopThinking();
        console.log(`  ${c.red}❌ Error: ${err instanceof Error ? err.message : err}${c.reset}`);
      }

      ask();
    });
  };

  function handleCommand(cmd: string, opts: AgentOptions) {
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (command) {
      case '/model':
        if (arg) {
          opts.model = arg;
          console.log(`  ${c.green}✓ Model changed to: ${arg}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Current model: ${modelName}${c.reset}`);
          console.log(`  ${c.dim}Usage: /model <model-name>${c.reset}`);
        }
        break;
        
      case '/provider':
        if (arg) {
          opts.provider = arg;
          console.log(`  ${c.green}✓ Provider changed to: ${arg}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Current provider: ${providerName}${c.reset}`);
          console.log(`  ${c.dim}Usage: /provider <provider-name>${c.reset}`);
        }
        break;
        
      case '/clear':
        console.clear();
        printHeader();
        break;
        
      case '/help':
        console.log('');
        console.log(`  ${c.cyan}Available Commands:${c.reset}`);
        console.log(`  ${c.white}/model <name>${c.reset}     - Switch model`);
        console.log(`  ${c.white}/provider <name>${c.reset} - Switch provider`);
        console.log(`  ${c.white}/clear${c.reset}            - Clear screen`);
        console.log(`  ${c.white}/help${c.reset}            - Show this help`);
        console.log(`  ${c.white}/exit${c.reset}            - Exit the program`);
        console.log('');
        break;
        
      default:
        console.log(`  ${c.red}Unknown command: ${command}${c.reset}`);
        console.log(`  ${c.dim}Type /help for available commands${c.reset}`);
    }
  }

  ask();
}

async function runSingle(prompt: string, options: AgentOptions = {}) {
  const { agent, rl } = createAgent(options);

  const thinking = printThinking();
  let isFirstChunk = true;

  try {
    for await (const event of agent.run(prompt)) {
      switch (event.type) {
        case 'text':
          if (isFirstChunk) {
            thinking.clear();
            isFirstChunk = false;
          }
          process.stdout.write(event.content ?? '');
          break;
        case 'tool_use':
        case 'tool_result':
          // Hide tool calls
          break;
      }
    }
    console.log('');
  } catch (err) {
    thinking.clear();
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
  }
  
  rl.close();
}

// Default command
program
  .argument('[prompt]', 'Optional prompt to start with')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('--mode <mode>', 'Agent mode (plan/review/act/auto)', 'auto')
  .option('--hybrid', 'Enable hybrid mode')
  .action(async (prompt, options) => {
    if (prompt) {
      await runSingle(prompt, options);
    } else {
      await runInteractive(options);
    }
  });

// Subcommands
program
  .command('chat')
  .description('Start interactive chat mode')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('--mode <mode>', 'Agent mode (plan/review/act/auto)', 'auto')
  .option('--hybrid', 'Enable hybrid mode')
  .action(async (options) => {
    await runInteractive(options);
  });

program
  .command('run <prompt>')
  .description('Run a single prompt and exit')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('--mode <mode>', 'Agent mode (plan/review/act/auto)', 'act')
  .option('--hybrid', 'Enable hybrid mode')
  .action(async (prompt, options) => {
    await runSingle(prompt, options);
    process.exit(0);
  });

program
  .command('models')
  .description('List available models')
  .action(() => {
    console.log('');
    console.log(`  ${c.cyan}${c.bold}Available Models:${c.reset}`);
    console.log('');
    
    const config = loadConfig();
    for (const [provider, pConfig] of Object.entries(config.providers)) {
      console.log(`  ${c.green}${c.bold}${provider}${c.reset}`);
      for (const model of Object.keys(pConfig.models)) {
        console.log(`    ${c.white}• ${model}${c.reset}`);
      }
      console.log('');
    }
  });

program
  .command('doctor')
  .description('Check configuration and environment')
  .action(() => {
    console.log('');
    console.log(`  ${c.cyan}${c.bold}HalfCopilot Doctor${c.reset}`);
    console.log('');
    
    try {
      const config = loadConfig();
      console.log(`  ${c.green}✓${c.reset} Configuration loaded`);
      console.log(`  ${c.green}✓${c.reset} Providers: ${Object.keys(config.providers).join(', ')}`);
      console.log(`  ${c.green}✓${c.reset} Default: ${config.defaultProvider}/${config.defaultModel}`);
      
      const toolRegistry = new ToolRegistry();
      createBuiltinTools().forEach(t => toolRegistry.register(t));
      console.log(`  ${c.green}✓${c.reset} Tools: ${toolRegistry.list().length} available`);
      
      const skillRegistry = new SkillRegistry();
      createBuiltinSkills().forEach(s => skillRegistry.register(s));
      console.log(`  ${c.green}✓${c.reset} Skills: ${skillRegistry.list().length} available`);
      
      console.log('');
      console.log(`  ${c.green}${c.bold}All checks passed! ✓${c.reset}`);
      console.log('');
    } catch (err) {
      console.log(`  ${c.red}✗ Error: ${err instanceof Error ? err.message : err}${c.reset}`);
    }
  });

program
  .command('skills')
  .description('List available skills')
  .action(() => {
    const skillRegistry = new SkillRegistry();
    createBuiltinSkills().forEach(s => skillRegistry.register(s));

    console.log('');
    console.log(`  ${c.cyan}${c.bold}Available Skills:${c.reset}`);
    console.log('');
    
    for (const skill of skillRegistry.list()) {
      console.log(`  ${c.green}• ${skill.name}${c.reset}`);
      console.log(`    ${c.dim}${skill.description}${c.reset}`);
    }
    console.log('');
  });

program.parse();

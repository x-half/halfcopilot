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
  .version('1.0.16');

interface AgentOptions {
  model?: string;
  provider?: string;
  mode?: string;
  hybrid?: boolean;
}

// Beautiful color palette
const c = {
  reset: '[0m',
  bold: '[1m',
  dim: '[2m',
  
  // Colors
  cyan: '[36m',
  green: '[32m',
  yellow: '[33m',
  red: '[31m',
  magenta: '[35m',
  blue: '[34m',
  white: '[37m',
  gray: '[90m',
  
  // Background
  bgCyan: '[46m',
  bgGreen: '[42m',
  bgYellow: '[43m',
  bgBlue: '[44m',
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

// Agent status types
type AgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'error';

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

// Simple banner - no ASCII art that breaks across terminals
function printHeader() {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}╭${'─'.repeat(62)}╮${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}│${' '.repeat(62)}│${c.reset}`);
  // Banner: H A L F C O P I L O T (19 chars), centered in 62-char box
  const banner = 'H A L F   C O P I L O T';
  const bannerPad = Math.floor((62 - banner.length) / 2);
  console.log(`  ${c.cyan}${c.bold}│${' '.repeat(bannerPad)}${c.white}${c.bold}${banner}${c.reset}${c.cyan}${' '.repeat(62 - bannerPad - banner.length)}│${c.reset}`);
  // Subtitle: 32 chars, pad 15 each side
  const subtitle = 'Multi-model Agent Framework CLI';
  const subPad = Math.floor((62 - subtitle.length) / 2);
  console.log(`  ${c.cyan}${c.bold}│${' '.repeat(subPad)}${c.white}${subtitle}${c.reset}${c.cyan}${' '.repeat(62 - subPad - subtitle.length)}│${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}│${' '.repeat(62)}│${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}╰${'─'.repeat(62)}╯${c.reset}`);
  console.log('');
}

function printInfo(label: string, value: string) {
  console.log(`  ${c.gray}${label}:${c.reset} ${c.white}${c.bold}${value}${c.reset}`);
}

function printUserMessage(message: string) {
  const maxLen = Math.min(message.length, 60);
  const display = message.substring(0, maxLen) + (message.length > maxLen ? '...' : '');
  const lineLen = display.length + 4;
  
  console.log(`\n  ${c.green}${box.tl}─── You ${box.h.repeat(Math.max(0, lineLen - 12))}${box.tr}${c.reset}`);
  console.log(`  ${c.green}${box.v}${c.reset} ${c.green}${c.bold}${display}${c.reset}${' '.repeat(Math.max(0, 60 - display.length))} ${c.green}${box.v}${c.reset}`);
  console.log(`  ${c.green}${box.bl}───${box.h.repeat(Math.max(0, lineLen - 1))}${box.br}${c.reset}\n`);
}

// Strip basic markdown syntax for clean terminal display
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // **bold** -> text
    .replace(/\*([^*]+)\*/g, '$1')           // *italic* -> text
    .replace(/`([^`]+)`/g, '$1')               // `code` -> text
    .replace(/^#+\s+(.*)$/gm, '$1')           // # headings -> plain
    .replace(/^>\s+(.*)$/gm, '  ▸ $1')        // > blockquote
    .replace(/^-\s+/gm, '  • ')               // - list items
    .replace(/\*\*([^*]+)\*\*/g, '$1');    // already handled above, but double-check
}

function printMarkdownBox(text: string) {
  // Strip markdown first
  const clean = stripMarkdown(text);
  const displayLines = clean.split('\n').filter(l => l.trim() !== '');
  if (displayLines.length === 0) return;

  const maxLen = Math.min(Math.max(...displayLines.map(l => l.length)), 64);
  const top = `  ${c.blue}${box.tl}─── HalfCopilot ${box.h.repeat(Math.max(0, maxLen - 21))}${box.tr}${c.reset}`;

  console.log('\n' + top);
  for (const line of displayLines) {
    const padding = ' '.repeat(Math.max(0, maxLen - line.length));
    console.log(`  ${c.blue}${box.v}${c.reset} ${c.white}${line}${c.reset}${padding} ${c.blue}${box.v}${c.reset}`);
  }
  const bot = `  ${c.blue}${box.bl}───${box.h.repeat(maxLen)}${box.br}${c.reset}`;
  console.log(bot + '\n');
}

function printAssistantStart() {
  process.stdout.write(`\n  ${c.blue}${c.bold}🤖 ${c.reset}`);
}

function printAssistantEnd() {
  console.log('\n');
}

function printAssistantText(text: string) {
  process.stdout.write(text);
}

function printThinking() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let interval: NodeJS.Timeout | null = null;
  
  const start = () => {
    interval = setInterval(() => {
      process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]} ${c.dim}Thinking...${c.reset}   `);
      i++;
    }, 80);
  };
  
  const stop = () => {
    if (interval) clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(30) + '\r');
  };
  
  return { start, stop };
}

// Status bar rendering
let currentStatus: AgentStatus = 'idle';
let currentProvider = '';
let currentModel = '';
let currentMode = 'auto';
let statusDescription = 'Ready';

const statusColors: Record<AgentStatus, string> = {
  idle: c.gray,
  thinking: c.yellow,
  executing: c.blue,
  completed: c.green,
  error: c.red,
};

const statusEmoji: Record<AgentStatus, string> = {
  idle: '⚪',
  thinking: '🟡',
  executing: '🔵',
  completed: '🟢',
  error: '🔴',
};

// Status bar: simple single-line footer printed after header
function printStatusBar() {
  const left = `${c.gray}${currentProvider}/${currentModel}`;
  const center = `${c.cyan}[${currentMode.toUpperCase()}]`;
  const right = `${statusColors[currentStatus]}${statusEmoji[currentStatus]} ${statusDescription}`;
  const leftPad = '  ';
  const rightPad = '  ';
  console.log(`${leftPad}${left}${' '.repeat(Math.max(1, 25 - left.length))}${center}${' '.repeat(Math.max(1, 15 - center.length))}${rightPad}${right}${c.reset}`);
}

// updateStatus tracks state; printStatusBar() called at key moments only
function updateStatus(status: AgentStatus, desc?: string) {
  currentStatus = status;
  if (desc) statusDescription = desc;
}

function checkConfig(config: any): boolean {
  const providers = config?.providers;
  if (!providers || Object.keys(providers).length === 0) {
    console.log('');
    console.log(`  ${c.yellow}${c.bold}⚙️  首次使用需要先配置模型 API Key${c.reset}`);
    console.log('');
    console.log(`  ${c.white}运行以下命令进行交互式配置:${c.reset}`);
    console.log('');
    console.log(`    ${c.green}${c.bold}halfcop setup${c.reset}`);
    console.log('');
    console.log(`  ${c.dim}或手动创建 ~/.halfcopilot/settings.json${c.reset}`);
    console.log('');
    return false;
  }
  return true;
}

function createAgent(options: AgentOptions = {}) {
  const config = loadConfig();
  
  // Check if any providers configured
  if (!checkConfig(config)) {
    process.exit(0);
  }
  
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

  return { agent, providerName, config, skillRegistry, modelName, rl, providerRegistry };
}

async function runInteractive(options: AgentOptions = {}) {
  const { agent, providerName, config, skillRegistry, modelName, rl, providerRegistry } = createAgent(options);

  // Initialize status bar info
  currentProvider = providerName;
  currentModel = modelName;
  currentMode = options.mode ?? 'auto';

  printHeader();
  printInfo('Provider', providerName);
  printInfo('Model', modelName);
  printInfo('Mode', options.mode ?? 'auto');
  console.log('');
  console.log(`  ${c.dim}Type to chat. /help for commands. "exit" to quit.${c.reset}`);
  console.log('');
  updateStatus('idle', 'Ready');
  printStatusBar();

  // Agent ref that can be swapped (for provider/model switching)
  const agentRef: { current: AgentLoop } = { current: agent };

  // Blinking cursor animation
  let cursorInterval: NodeJS.Timeout | null = null;
  const cursorOn = () => {
    process.stdout.write(`\r${c.green}${c.bold}  ❯ ${c.reset} `);
  };
  const cursorOff = () => {
    process.stdout.write(`\r${c.green}${c.bold}  █ ${c.reset} `);
  };

  const ask = () => {
    cursorOn();
    let tick = false;
    cursorInterval = setInterval(() => {
      if (tick) cursorOn(); else cursorOff();
      tick = !tick;
    }, 500);

    rl.question('', async (input) => {
      if (cursorInterval) { clearInterval(cursorInterval); cursorInterval = null; }
      // Erase the blinking cursor line
      process.stdout.write(`\r${' '.repeat(60)}\r`);
      const trimmed = (input || '').trim();

      if (!trimmed || trimmed === '') { ask(); return; }
      if (trimmed.startsWith('/')) {
        const result = await handleCommand(trimmed, options, modelName, providerName, agentRef, providerRegistry, config, rl);
        if (result?.newModel) {
          currentModel = result.newModel;
          updateStatus('idle', 'Ready');
          printStatusBar();
        }
        if (result?.newProvider) {
          currentProvider = result.newProvider;
          updateStatus('idle', 'Ready');
          printStatusBar();
        }
        ask();
        return;
      }
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(`\n  ${c.yellow}Bye! 👋${c.reset}`); rl.close(); return;
      }
      if (trimmed === '') { ask(); return; }

      // Print thinking indicator
      process.stdout.write(`\n  ${c.yellow}🟡 thinking...${c.reset}\n\n`);
      let responseText = '';

      try {
        for await (const event of agentRef.current.run(trimmed)) {
          switch (event.type) {
            case 'text':
              responseText += event.content ?? '';
              break;
            case 'tool_use':
              process.stdout.write(`  ${c.cyan}🔧 running ${event.toolName}...${c.reset}\n`);
              break;
            case 'tool_result':
              process.stdout.write(`  ${c.gray}✓ done${c.reset}\n`);
              break;
            case 'error':
              process.stdout.write(`\n  ${c.red}✗ ${event.error?.message?.slice(0, 100) ?? 'error'}${c.reset}\n\n`);
              break;
            case 'done':
              break;
          }
        }

        // Print response in a box with markdown stripped
        if (responseText) {
          printMarkdownBox(responseText);
        }
      } catch (err) {
        updateStatus('error', 'Error');
        printStatusBar();
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n  ${c.red}✗ ${msg.replace(/^400 /,'').replace(/^429 /,'Quota exhausted — ').slice(0, 120)}${c.reset}`);
      }

      ask();
    });
  };

  ask();
}

interface HandleCommandResult {
  newModel?: string;
  newProvider?: string;
}

async function handleCommand(
  cmd: string, 
  opts: AgentOptions, 
  currentModel: string, 
  currentProvider: string,
  agentRef: { current: AgentLoop },
  providerRegistry: ProviderRegistry,
  config: any,
  rl: readline.Interface
): Promise<HandleCommandResult | void> {
  const parts = cmd.split(' ');
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (command) {
    case '/model':
      if (arg) {
        opts.model = arg;
        updateStatus('thinking', `Switching to ${arg}...`);
        try {
          // Re-create agent with new model
          const providerName = opts.provider ?? config.defaultProvider ?? 'xiaomi';
          const provider = providerRegistry.get(providerName);
          
          const toolRegistry = new ToolRegistry();
          const builtinTools = createBuiltinTools();
          builtinTools.forEach(t => toolRegistry.register(t));

          const permissions = new PermissionChecker({
            autoApproveSafe: config.permissions.autoApproveSafe,
            allow: config.permissions.allow,
            deny: config.permissions.deny,
          });

          const executor = new ToolExecutor(toolRegistry, permissions, async (toolName, input) => {
            return new Promise((resolve) => {
              rl.question(`${c.yellow}  ⚠️  Allow ${toolName}? (y/n): ${c.reset}`, (answer) => {
                resolve(answer.toLowerCase().trim() === 'y');
              });
            });
          });

          const newAgent = new AgentLoop({
            provider,
            providerName,
            model: arg,
            tools: toolRegistry,
            executor,
            permissions,
            maxTurns: config.maxTurns,
            mode: (opts.mode as any) ?? 'auto',
          });
          
          agentRef.current = newAgent;
          console.log(`  ${c.green}✓ Model: ${arg}${c.reset}`);
          return { newModel: arg };
        } catch (err) {
          console.log(`  ${c.red}✗ Model not found: ${arg}${c.reset}`);
        }
      } else {
        console.log(`  ${c.yellow}Model: ${currentModel}${c.reset}`);
      }
      break;
      
    case '/provider':
      if (arg) {
        opts.provider = arg;
        updateStatus('thinking', `Switching to ${arg}...`);
        try {
          const newProvider = providerRegistry.get(arg);
          
          const toolRegistry = new ToolRegistry();
          const builtinTools = createBuiltinTools();
          builtinTools.forEach(t => toolRegistry.register(t));

          const permissions = new PermissionChecker({
            autoApproveSafe: config.permissions.autoApproveSafe,
            allow: config.permissions.allow,
            deny: config.permissions.deny,
          });

          const executor = new ToolExecutor(toolRegistry, permissions, async (toolName, input) => {
            return new Promise((resolve) => {
              rl.question(`${c.yellow}  ⚠️  Allow ${toolName}? (y/n): ${c.reset}`, (answer) => {
                resolve(answer.toLowerCase().trim() === 'y');
              });
            });
          });

          const newAgent = new AgentLoop({
            provider: newProvider,
            providerName: arg,
            model: opts.model ?? config.defaultModel ?? 'mimo-v2.5-pro',
            tools: toolRegistry,
            executor,
            permissions,
            maxTurns: config.maxTurns,
            mode: (opts.mode as any) ?? 'auto',
          });
          
          agentRef.current = newAgent;
          console.log(`  ${c.green}✓ Provider: ${arg}${c.reset}`);
          return { newProvider: arg };
        } catch (err) {
          console.log(`  ${c.red}✗ Provider not found: ${arg}${c.reset}`);
        }
      } else {
        console.log(`  ${c.yellow}Provider: ${currentProvider}${c.reset}`);
      }
      break;
      
    case '/mode':
      if (arg && ['plan', 'act', 'auto', 'review'].includes(arg)) {
        opts.mode = arg;
        agentRef.current.setMode(arg as any);
        console.log(`  ${c.green}✓ Mode: ${arg}${c.reset}`);
        currentMode = arg;
        updateStatus('idle', `Mode: ${arg}`);
      } else {
        console.log(`  ${c.yellow}Mode: ${currentMode}${c.reset}`);
        console.log(`  ${c.dim}Options: plan, act, auto, review${c.reset}`);
      }
      break;
      
    case '/clear':
      console.clear();
      printHeader();
      break;
      
    case '/help':
      console.log(`\n  ${c.cyan}Commands:${c.reset}`);
      console.log(`  ${c.white}/model <name>${c.reset}   - Switch model`);
      console.log(`  ${c.white}/provider <name>${c.reset} - Switch provider`);
      console.log(`  ${c.white}/mode <name>${c.reset}    - Set mode (plan/act/auto/review)`);
      console.log(`  ${c.white}/clear${c.reset}           - Clear screen`);
      console.log(`  ${c.white}/help${c.reset}           - Show this help`);
      console.log(`  ${c.white}/exit${c.reset}           - Quit\n`);
      break;
      
    default:
      console.log(`  ${c.red}Unknown: ${command}${c.reset}`);
  }
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
            thinking.stop();
            isFirstChunk = false;
          }
          process.stdout.write(event.content ?? '');
          break;
        case 'tool_use':
        case 'tool_result':
          break;
      }
    }
    console.log('');
  } catch (err) {
    thinking.stop();
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
  }
  
  rl.close();
}

// Subcommands first
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

program
  .command('setup')
  .description('Interactive setup — configure API keys for model providers')
  .action(async () => {
    const fs = await import('fs');
    const pathModule = await import('path');
    const os = await import('os');
    
    const configDir = pathModule.join(os.homedir(), '.halfcopilot');
    const configFile = pathModule.join(configDir, 'settings.json');
    
    // Load existing or create default
    let config: any = {};
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
    if (!config.providers) config.providers = {};
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));
    
    // Print header
    console.log('');
    console.log(`${c.cyan}${c.bold}  ╭─────────────────────────────────────────────────────╮${c.reset}`);
    console.log(`${c.cyan}${c.bold}  │                                                     │${c.reset}`);
    console.log(`${c.cyan}${c.bold}  │           ⚙️  HalfCopilot Setup                     │${c.reset}`);
    console.log(`${c.cyan}${c.bold}  │                                                     │${c.reset}`);
    console.log(`${c.cyan}${c.bold}  ╰─────────────────────────────────────────────────────╯${c.reset}`);
    console.log('');
    
    // Provider templates - updated with accurate endpoints
    const providers: Array<{
      name: string; label: string; baseUrl: string; models: string[]; desc: string;
    }> = [
      { name: 'minimax', label: 'MiniMax', desc: 'M2.7 / M2.5 — 海螺AI同款',
        baseUrl: 'https://api.minimaxi.com/v1', models: ['MiniMax-M2.7', 'MiniMax-M2.5'] },
      { name: 'xiaomi', label: '小米 MiMo', desc: 'Token Plan API',
        baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', models: ['mimo-v2.5-pro', 'mimo-v2.5'] },
      { name: 'deepseek', label: 'DeepSeek', desc: '高性价比，深度推理',
        baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
      { name: 'qwen', label: '通义千问 Qwen', desc: '阿里云出品',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus'] },
      { name: 'openai', label: 'OpenAI', desc: 'GPT-4o / GPT-4o-mini',
        baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] },
      { name: 'anthropic', label: 'Anthropic Claude', desc: 'Claude Sonnet 4',
        baseUrl: '', models: ['claude-sonnet-4-20250514'] },
    ];
    
    console.log(`  ${c.dim}选择你要配置的模型厂商，输入 API Key 即可。${c.reset}`);
    console.log('');
    console.log(`  ${c.cyan}${c.bold}📦 可用厂商:${c.reset}`);
    console.log('');
    
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      const configured = config.providers[p.name] ? ` ${c.green}(已配置)${c.reset}` : '';
      console.log(`  ${c.bold}${i + 1}${c.reset}. ${c.white}${p.label}${c.reset} — ${c.dim}${p.desc}${c.reset}${configured}`);
    }
    console.log(`  ${c.bold}0${c.reset}. ${c.dim}完成配置，退出${c.reset}`);
    console.log('');
    
    let selectedIdx = -1;
    
    // Keyboard navigation (basic, using enter)
    const choice = await ask(`  ${c.green}选择你要配置的厂商 (0-${providers.length}): ${c.reset}`);
    selectedIdx = parseInt(choice.trim()) - 1;
    
    if (isNaN(selectedIdx) || selectedIdx < -1 || selectedIdx >= providers.length) {
      console.log(`  ${c.red}无效选择${c.reset}`);
      rl.close();
      return;
    }
    
    if (selectedIdx === -1) {
      console.log(`  ${c.yellow}配置完成！${c.reset}`);
      rl.close();
      return;
    }
    
    const selected = providers[selectedIdx];
    
    console.log('');
    console.log(`  ${c.cyan}配置 ${selected.label}${c.reset}`);
    
    let apiKey: string;
    
    if (selected.name === 'xiaomi') {
      console.log('');
      console.log(`  ${c.dim}小米 Token Plan API Key 示例格式:${c.reset}`);
      console.log(`  ${c.dim}tp-xxxxxxxxxx...${c.reset}`);
    }
    
    if (selected.name === 'minimax') {
      console.log('');
      console.log(`  ${c.dim}MiniMax API Key (来自 minimaxi.com):${c.reset}`);
    }
    
    if (selected.name === 'deepseek') {
      console.log('');
      console.log(`  ${c.dim}DeepSeek API Key (来自 api.deepseek.com):${c.reset}`);
    }
    
    apiKey = await ask(`  ${c.green}API Key: ${c.reset}`);
    
    if (!apiKey.trim()) {
      console.log(`  ${c.yellow}已跳过${c.reset}`);
      rl.close();
      return;
    }
    
    // Build models object with proper context windows
    const modelConfigs: Record<string, { contextWindow: number; maxOutput: number }> = {};
    
    if (selected.name === 'minimax') {
      modelConfigs['MiniMax-M2.7'] = { contextWindow: 128000, maxOutput: 16384 };
      modelConfigs['MiniMax-M2.5'] = { contextWindow: 128000, maxOutput: 16384 };
    } else if (selected.name === 'deepseek') {
      modelConfigs['deepseek-chat'] = { contextWindow: 64000, maxOutput: 8192 };
      modelConfigs['deepseek-reasoner'] = { contextWindow: 64000, maxOutput: 8192 };
    } else if (selected.name === 'xiaomi') {
      modelConfigs['mimo-v2.5-pro'] = { contextWindow: 128000, maxOutput: 16384 };
      modelConfigs['mimo-v2.5'] = { contextWindow: 128000, maxOutput: 16384 };
    } else {
      for (const m of selected.models) {
        modelConfigs[m] = { contextWindow: 128000, maxOutput: 8192 };
      }
    }
    
    // Save provider config
    config.providers[selected.name] = {
      type: selected.name === 'anthropic' ? 'anthropic' : 'openai-compatible',
      ...(selected.baseUrl ? { baseUrl: selected.baseUrl } : {}),
      apiKey,
      models: modelConfigs,
    };
    
    // Set as default if no default set
    if (!config.defaultProvider) {
      config.defaultProvider = selected.name;
      config.defaultModel = selected.models[0];
    }
    
    // Write config
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    
    console.log('');
    console.log(`  ${c.green}${c.bold}✅ ${selected.label} 配置成功！${c.reset}`);
    console.log(`  ${c.dim}配置文件: ${configFile}${c.reset}`);
    console.log(`  ${c.dim}模型: ${Object.keys(modelConfigs).join(', ')}${c.reset}`);
    
    if (config.defaultProvider === selected.name) {
      console.log(`  ${c.green}已设为默认厂商${c.reset}`);
    }
    console.log('');
    
    rl.close();
  });

// Default action: when no command given, start interactive chat
program.action(async () => {
  await runInteractive({});
});

program.parse();

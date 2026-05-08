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
  console.log(`\n  ${c.green}${c.bold}❯ ${c.reset}${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n`);
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
  return {
    frame: (i: number) => process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]} ${c.dim}Thinking...${c.reset}   `),
    clear: () => process.stdout.write('\r' + ' '.repeat(30) + '\r'),
  };
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

  printHeader();
  printInfo('Provider', providerName);
  printInfo('Model', modelName);
  printInfo('Mode', options.mode ?? 'auto');
  console.log('');
  console.log(`  ${c.dim}Type to chat. /help for commands. "exit" to quit.${c.reset}`);
  console.log('');

  let statusText = '';
  const setStatus = (text: string) => {
    statusText = text;
    process.stdout.write(`\r\x1b[K  ${c.dim}${text}${c.reset}`);
  };
  const clearStatus = () => process.stdout.write(`\r\x1b[K`);

  const ask = () => {
    clearStatus();
    rl.question(`${c.green}${c.bold}  ❯ ${c.reset}`, async (input) => {
      const trimmed = input.trim();
      
      if (trimmed.startsWith('/')) {
        handleCommand(trimmed, options, modelName, providerName);
        ask();
        return;
      }
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(`\n  ${c.yellow}Bye! 👋${c.reset}`); rl.close(); return;
      }
      if (trimmed === '') { ask(); return; }

      setStatus('⏳ Thinking...');
      let started = false;

      try {
        for await (const event of agent.run(trimmed)) {
          switch (event.type) {
            case 'text':
              if (!started) { console.log(''); started = true; }
              process.stdout.write(`  ${c.blue}${c.bold}🤖${c.reset} `);
              process.stdout.write(event.content ?? '');
              setStatus('Typing...');
              break;
            case 'tool_use':
              setStatus(`🔧 ${event.toolName}`);
              break;
            case 'tool_result':
              setStatus('Thinking...');
              break;
            case 'error':
              clearStatus();
              console.log(`\n  ${c.red}✗ ${event.error?.message?.slice(0, 100)}${c.reset}`);
              break;
            case 'done':
              if (started) console.log('\n');
              break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        clearStatus();
        console.log(`\n  ${c.red}✗ ${msg.replace(/^400 /,'').replace(/^429 /,'Quota exhausted — ').slice(0, 120)}${c.reset}`);
      }

      clearStatus();
      ask();
    });
  };

  function handleCommand(cmd: string, opts: AgentOptions, currentModel: string, currentProvider: string) {
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (command) {
      case '/model':
        if (arg) {
          opts.model = arg;
          console.log(`  ${c.green}✓ Model: ${arg}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Model: ${currentModel}${c.reset}`);
        }
        break;
      case '/provider':
        if (arg) {
          opts.provider = arg;
          console.log(`  ${c.green}✓ Provider: ${arg}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Provider: ${currentProvider}${c.reset}`);
        }
        break;
      case '/clear':
        console.clear();
        printHeader();
        break;
      case '/help':
        console.log(`\n  ${c.cyan}Commands:${c.reset}`);
        console.log(`  ${c.white}/model <name> /provider <name> /clear /help /exit${c.reset}\n`);
        break;
      default:
        console.log(`  ${c.red}Unknown: ${command}${c.reset}`);
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
    const path = await import('path');
    const os = await import('os');
    
    const configDir = path.join(os.homedir(), '.halfcopilot');
    const configFile = path.join(configDir, 'settings.json');
    
    // Load existing or create default
    let config: any = {};
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
    if (!config.providers) config.providers = {};
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));
    
    // Provider templates
    const providers: Array<{
      name: string; label: string; baseUrl: string; models: string[]; desc: string;
    }> = [
      { name: 'xiaomi', label: '小米 MiMo', desc: '[推荐] 已验证，直接可用',
        baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', models: ['mimo-v2.5-pro', 'mimo-v2.5'] },
      { name: 'deepseek', label: 'DeepSeek', desc: '高性价比，国产大模型',
        baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] },
      { name: 'qwen', label: '通义千问 Qwen', desc: '阿里云出品',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus'] },
      { name: 'openai', label: 'OpenAI', desc: 'GPT-4o / GPT-4o-mini',
        baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] },
      { name: 'anthropic', label: 'Anthropic Claude', desc: 'Claude Sonnet 4',
        baseUrl: '', models: ['claude-sonnet-4-20250514'] },
    ];
    
    console.log('');
    console.log(`  ${c.cyan}${c.bold}⚙️  HalfCopilot Setup${c.reset}`);
    console.log('');
    console.log(`  ${c.dim}选择你要配置的模型厂商，输入 API Key 即可。${c.reset}`);
    console.log('');
    
    // Pick default provider first
    console.log(`  ${c.cyan}${c.bold}📦 可用厂商:${c.reset}`);
    console.log('');
    
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      const configured = config.providers[p.name] ? ` ${c.green}(已配置)${c.reset}` : '';
      console.log(`  ${c.bold}${i + 1}${c.reset}. ${c.white}${p.label}${c.reset} — ${c.dim}${p.desc}${c.reset}${configured}`);
    }
    console.log(`  ${c.bold}0${c.reset}. ${c.dim}完成配置，退出${c.reset}`);
    console.log('');
    
    const choice = await ask(`  ${c.green}选择你要配置的厂商 (0-5): ${c.reset}`);
    const idx = parseInt(choice.trim());
    
    if (isNaN(idx) || idx < 0 || idx > 5) {
      console.log(`  ${c.red}无效选择${c.reset}`);
      rl.close();
      return;
    }
    
    if (idx === 0) {
      console.log(`  ${c.yellow}配置完成！${c.reset}`);
      rl.close();
      return;
    }
    
    const selected = providers[idx - 1];
    
    console.log('');
    console.log(`  ${c.cyan}配置 ${selected.label}${c.reset}`);
    
    let apiKey: string;
    
    if (selected.name === 'xiaomi') {
      // Show quick config presets
      console.log('');
      console.log(`  ${c.dim}小米 Token Plan API Key 示例格式:${c.reset}`);
      console.log(`  ${c.dim}tp-xxxxxxxxxx...${c.reset}`);
    }
    
    apiKey = await ask(`  ${c.green}API Key: ${c.reset}`);
    
    if (!apiKey.trim()) {
      console.log(`  ${c.yellow}已跳过${c.reset}`);
      rl.close();
      return;
    }
    
    // Build models object
    const models: Record<string, { contextWindow: number; maxOutput: number }> = {};
    for (const m of selected.models) {
      models[m] = { contextWindow: 128000, maxOutput: 8192 };
    }
    
    // Save provider config
    config.providers[selected.name] = {
      type: selected.name === 'anthropic' ? 'anthropic' : 'openai-compatible',
      ...(selected.baseUrl ? { baseUrl: selected.baseUrl } : {}),
      apiKey,
      models,
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
    console.log(`  ${c.dim}模型: ${selected.models.join(', ')}${c.reset}`);
    
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

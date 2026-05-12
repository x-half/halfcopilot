#!/usr/bin/env node

/**
 * HalfCopilot CLI - Beautiful Chat Interface
 */

// Suppress noisy Node.js deprecation warnings (e.g. punycode from deps)
try { process.noDeprecation = true; } catch {}
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "DeprecationWarning" && String(w.message).includes("punycode")) return;
  // biome-ignore lint/suspicious/noConsole: intentional
  console.error(w.stack ?? w.message);
});

import { Command } from "commander";
import { loadConfig, saveConfig, type HalfCopilotConfig } from "@halfcopilot/config";
import cliPkg from "../package.json";
import { ProviderRegistry } from "@halfcopilot/provider";
import {
  ToolRegistry,
  createBuiltinTools,
  PermissionChecker,
  ToolExecutor,
} from "@halfcopilot/tools";
import { AgentLoop, HybridProvider, type AgentMode } from "@halfcopilot/core";
import { SkillRegistry, createBuiltinSkills } from "@halfcopilot/skills";
import readline from "readline";

const program = new Command();

program
  .name("halfcop")
  .description("HalfCopilot — Multi-model Agent Framework CLI")
  .version(cliPkg.version);

type ThoughtLevel = "default" | "verbose" | "debug";

interface AgentOptions {
  model?: string;
  provider?: string;
  mode?: string;
  hybrid?: boolean;
  verbose?: boolean;
  debug?: boolean;
}

function resolveThoughtLevel(opts: AgentOptions): ThoughtLevel {
  if (opts.debug) return "debug";
  if (opts.verbose) return "verbose";
  return "default";
}

// Beautiful color palette
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",

  // Colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// Box drawing characters
const box = {
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  h: "─",
  v: "│",
  ml: "├",
  mr: "┤",
};

// Agent status types
type AgentStatus = "idle" | "thinking" | "executing" | "completed" | "error";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Braille dot spinning animation — always occupies its own line (Layer A)
function createThinkingAnimation() {
  let interval: NodeJS.Timeout | null = null;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let started = false;

  const start = (message = "Thinking") => {
    if (interval) return;
    started = true;
    // Move spinner to its own line so it never overlaps the prompt
    process.stdout.write("\n");
    process.stdout.write(`  ${c.cyan}⠋${c.reset} ${c.dim}${message}${c.reset}`);
    interval = setInterval(() => {
      i++;
      process.stdout.write(
        `\r  ${c.cyan}${frames[i % frames.length]}${c.reset} ${c.dim}${message}${c.reset}`,
      );
    }, 80);
  };

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (started) {
      // Clear spinner line: move up, clear entire line, move back
      process.stdout.write("\x1b[F\x1b[2K");
      started = false;
    }
  };

  return { start, stop };
}

// Clear n lines upward from current cursor position
function clearLines(n: number) {
  for (let i = 0; i < n; i++) {
    process.stdout.write("\x1b[F\x1b[2K"); // move up one line, clear it
  }
}

// Animated loading indicator
async function showLoading(message: string, duration: number = 1500) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const startTime = Date.now();
  let i = 0;

  process.stdout.write(`\r${c.cyan}${frames[0]} ${message}${c.reset}`);

  while (Date.now() - startTime < duration) {
    await sleep(80);
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${c.cyan}${frames[i]} ${message}${c.reset}`);
  }

  process.stdout.write("\r" + " ".repeat(message.length + 4) + "\r");
}

function printBox(content: string, color: string = c.cyan, width: number = 50) {
  const lines = content.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), width - 4);

  console.log(
    `${color}${box.tl}${box.h.repeat(maxLen + 2)}${box.tr}${c.reset}`,
  );
  for (const line of lines) {
    const padding = " ".repeat(maxLen - line.length);
    console.log(
      `${color}${box.v}${c.reset} ${line}${padding} ${color}${box.v}${c.reset}`,
    );
  }
  console.log(
    `${color}${box.bl}${box.h.repeat(maxLen + 2)}${box.br}${c.reset}`,
  );
}

// Simple banner - no ASCII art that breaks across terminals
function printHeader() {
  console.log("");
  console.log(`  ${c.cyan}${c.bold}╭${"─".repeat(62)}╮${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}│${" ".repeat(62)}│${c.reset}`);
  // Banner: H A L F C O P I L O T (19 chars), centered in 62-char box
  const banner = "H A L F   C O P I L O T";
  const bannerPad = Math.floor((62 - banner.length) / 2);
  console.log(
    `  ${c.cyan}${c.bold}│${" ".repeat(bannerPad)}${c.white}${c.bold}${banner}${c.reset}${c.cyan}${" ".repeat(62 - bannerPad - banner.length)}│${c.reset}`,
  );
  // Subtitle: 32 chars, pad 15 each side
  const subtitle = "Multi-model Agent Framework CLI";
  const subPad = Math.floor((62 - subtitle.length) / 2);
  console.log(
    `  ${c.cyan}${c.bold}│${" ".repeat(subPad)}${c.white}${subtitle}${c.reset}${c.cyan}${" ".repeat(62 - subPad - subtitle.length)}│${c.reset}`,
  );
  console.log(`  ${c.cyan}${c.bold}│${" ".repeat(62)}│${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}╰${"─".repeat(62)}╯${c.reset}`);
  console.log("");
}

function printInfo(label: string, value: string) {
  console.log(
    `  ${c.gray}${label}:${c.reset} ${c.white}${c.bold}${value}${c.reset}`,
  );
}

function printUserMessage(message: string) {
  const maxLen = Math.min(message.length, 60);
  const display =
    message.substring(0, maxLen) + (message.length > maxLen ? "..." : "");
  const lineLen = display.length + 4;

  console.log(
    `\n  ${c.green}${box.tl}─── You ${box.h.repeat(Math.max(0, lineLen - 12))}${box.tr}${c.reset}`,
  );
  console.log(
    `  ${c.green}${box.v}${c.reset} ${c.green}${c.bold}${display}${c.reset}${" ".repeat(Math.max(0, 60 - display.length))} ${c.green}${box.v}${c.reset}`,
  );
  console.log(
    `  ${c.green}${box.bl}───${box.h.repeat(Math.max(0, lineLen - 1))}${box.br}${c.reset}\n`,
  );
}

// Strip basic markdown syntax for clean terminal display
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> text
    .replace(/\*([^*]+)\*/g, "$1") // *italic* -> text
    .replace(/`([^`]+)`/g, "$1") // `code` -> text
    .replace(/^#+\s+(.*)$/gm, "$1") // # headings -> plain
    .replace(/^>\s+(.*)$/gm, "  ▸ $1") // > blockquote
    .replace(/^-\s+/gm, "  • ") // - list items
    .replace(/\*\*([^*]+)\*\*/g, "$1"); // already handled above, but double-check
}

// Print text with code block detection
function printFormatted(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/);
  for (const part of parts) {
    if (part.startsWith("```")) {
      const code = part.replace(/```\w*\n?/, "").replace(/```$/, "");
      const lines = code.split("\n");
      for (const line of lines) {
        process.stdout.write(`  ${c.gray}│ ${line}${c.reset}\n`);
      }
    } else {
      process.stdout.write(part);
    }
  }
}

function printMarkdownBox(text: string) {
  // Strip markdown first
  const clean = stripMarkdown(text);
  const displayLines = clean.split("\n").filter((l) => l.trim() !== "");
  if (displayLines.length === 0) return;

  const maxLen = Math.min(Math.max(...displayLines.map((l) => l.length)), 64);
  const top = `  ${c.blue}${box.tl}─── HalfCopilot ${box.h.repeat(Math.max(0, maxLen - 21))}${box.tr}${c.reset}`;

  console.log("\n" + top);
  for (const line of displayLines) {
    const padding = " ".repeat(Math.max(0, maxLen - line.length));
    console.log(
      `  ${c.blue}${box.v}${c.reset} ${c.white}${line}${c.reset}${padding} ${c.blue}${box.v}${c.reset}`,
    );
  }
  const bot = `  ${c.blue}${box.bl}───${box.h.repeat(maxLen)}${box.br}${c.reset}`;
  console.log(bot + "\n");
}

function displayThinkingBox(text: string): void {
  const lines = text.split("\n").filter(Boolean);
  if (!lines.length) return;
  for (const line of lines) {
    process.stdout.write(`  ${c.dim}${c.italic}💭 ${line}${c.reset}\n`);
  }
}

function printAssistantStart() {
  process.stdout.write(`\n  ${c.blue}${c.bold}🤖 ${c.reset}`);
}

function printAssistantEnd() {
  console.log("\n");
}

function printAssistantText(text: string) {
  printFormatted(text);
}

function printThinking() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let interval: NodeJS.Timeout | null = null;

  const start = () => {
    interval = setInterval(() => {
      process.stdout.write(
        `\r  ${c.cyan}${frames[i % frames.length]} ${c.dim}Thinking...${c.reset}   `,
      );
      i++;
    }, 80);
  };

  const stop = () => {
    if (interval) clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(30) + "\r");
  };

  return { start, stop };
}

// Status tracking variables
let currentStatus: AgentStatus = "idle";
let currentProvider = "";
let currentModel = "";
let currentMode = "auto";
let statusDescription = "Ready";
let sessionStartTime = 0;
let currentTurn = 0;
let maxTurns = 20;
let inputTokens = 0;
let outputTokens = 0;
let lastResponseTime = 0;
let responseStartTime = 0;

const statusColors: Record<AgentStatus, string> = {
  idle: c.gray,
  thinking: c.yellow,
  executing: c.blue,
  completed: c.green,
  error: c.red,
};

const statusEmoji: Record<AgentStatus, string> = {
  idle: "⚪",
  thinking: "🟡",
  executing: "🔵",
  completed: "🟢",
  error: "🔴",
};

const PERMISSION_INDICATORS: Record<string, string> = {
  SAFE: "🟢",
  WARN: "🟡",
  UNSAFE: "🔴",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// Enhanced status bar with rich session info
function printStatusBar() {
  const cols = getTerminalWidth();
  const elapsed =
    sessionStartTime > 0 ? formatDuration(Date.now() - sessionStartTime) : "";
  const tokens =
    inputTokens + outputTokens > 0 ? `${inputTokens}↓${outputTokens}↑` : "";
  const turnInfo = currentTurn > 0 ? `${currentTurn}/${maxTurns}` : "";

  const leftParts: string[] = [];
  if (currentProvider)
    leftParts.push(`${c.gray}${currentProvider}/${currentModel}${c.reset}`);
  if (turnInfo) leftParts.push(`${c.dim}${turnInfo}${c.reset}`);
  const left = leftParts.join(" ");

  const centerParts: string[] = [];
  if (currentMode)
    centerParts.push(`${c.cyan}[${currentMode.toUpperCase()}]${c.reset}`);
  if (tokens) centerParts.push(`${c.green}${tokens}${c.reset}`);
  if (elapsed) centerParts.push(`${c.dim}${elapsed}${c.reset}`);
  const center = centerParts.join(" ");

  const right = `${statusColors[currentStatus]}${statusEmoji[currentStatus]} ${truncate(statusDescription, 30)}${c.reset}`;

  const paddedLeft = `  ${left}`;
  const paddedRight = `${right}  `;
  const remaining = Math.max(1, cols - paddedLeft.length - paddedRight.length);
  const centerPadded = center.slice(0, remaining);

  console.log(
    `${paddedLeft}${" ".repeat(Math.max(1, remaining - centerPadded.length))}${centerPadded}${paddedRight}`,
  );
}

function updateStatus(status: AgentStatus, desc?: string) {
  currentStatus = status;
  if (desc) statusDescription = desc;
  if (currentStatus === "completed" && !desc) {
    statusDescription = "Ready";
  }
}

function checkConfig(config: HalfCopilotConfig): boolean {
  const providers = config?.providers;
  if (!providers || Object.keys(providers).length === 0) {
    console.log("");
    console.log(
      `  ${c.yellow}${c.bold}⚙️  首次使用需要先配置模型 API Key${c.reset}`,
    );
    console.log("");
    console.log(`  ${c.white}运行以下命令进行交互式配置:${c.reset}`);
    console.log("");
    console.log(`    ${c.green}${c.bold}halfcop setup${c.reset}`);
    console.log("");
    console.log(`  ${c.dim}或手动创建 ~/.halfcopilot/settings.json${c.reset}`);
    console.log("");
    return false;
  }
  return true;
}

// Input mode state machine: isolates permission input from chat input
let inputMode: "chat" | "approval" = "chat";
let _justApproved = false;
let _resumeChat: (() => void) | null = null;

// Permission keyboard selector: arrow keys + Enter, no echo leak
const PERM_OPTIONS = [
  { label: "允许一次", value: "once" as const },
  { label: "本次会话允许", value: "session" as const },
  { label: "拒绝", value: "reject" as const },
];

async function askApproval(
  toolName: string,
  _input: Record<string, unknown>,
): Promise<boolean> {
  inputMode = "approval";
  const inputStr = JSON.stringify(_input);
  const truncated = inputStr.length > 80 ? inputStr.substring(0, 80) + "…" : inputStr;
  const PERM_BOX_HEIGHT = 6; // lines the panel occupies

  // Draw permission box
  process.stdout.write(
    `  ${c.yellow}╭─ 🔒  Permission Required ${"─".repeat(23)}╮${c.reset}\n`,
  );
  process.stdout.write(
    `  ${c.yellow}│${c.reset}  Tool: ${c.bold}${toolName}${c.reset}${" ".repeat(Math.max(1, 41 - toolName.length))}${c.yellow}│${c.reset}\n`,
  );
  process.stdout.write(
    `  ${c.yellow}│${c.reset}  Input: ${c.dim}${truncated}${c.reset}${" ".repeat(Math.max(1, 40 - truncated.length))}${c.yellow}│${c.reset}\n`,
  );
  process.stdout.write(
    `  ${c.yellow}│${c.reset}${" ".repeat(50)}${c.yellow}│${c.reset}\n`,
  );
  process.stdout.write(
    `  ${c.yellow}╰──────────────────────────────────────────────────────╯${c.reset}`,
  );

  return new Promise((resolve) => {
    let selected = 0;
    let buffer = "";

    const render = () => {
      // Move up to the selector line and redraw
      const labels = PERM_OPTIONS.map((opt, i) =>
        i === selected
          ? `${c.cyan}${c.bold} › ${opt.label} ${c.reset}`
          : `   ${opt.label}  `,
      ).join("");
      process.stdout.write(`\n  ${labels}\n`);
    };

    const cleanup = () => {
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        try { process.stdin.setRawMode(false); } catch {}
      }
      process.stdin.removeListener("data", dataHandler);
      // Clear the permission panel lines
      clearLines(PERM_BOX_HEIGHT);
      process.stdout.write("\r"); // reset cursor
      inputMode = "chat";
      // Restart chat input on next tick
      setTimeout(() => _resumeChat?.(), 10);
    };

    const dataHandler = (buf: Buffer) => {
      const hex = buf.toString("hex");
      buffer += buf.toString();

      // Arrow keys send 3-byte sequences: 1b 5b 41/42/43/44
      if (hex === "1b5b43" || hex === "1b5b42") {
        // Right or Down
        selected = (selected + 1) % PERM_OPTIONS.length;
        render();
        buffer = "";
      } else if (hex === "1b5b44" || hex === "1b5b41") {
        // Left or Up
        selected = (selected - 1 + PERM_OPTIONS.length) % PERM_OPTIONS.length;
        render();
        buffer = "";
      } else if (hex === "0d" || hex === "0a") {
        // Enter
        cleanup();
        const chosen = PERM_OPTIONS[selected];
        if (chosen.value === "reject") {
          resolve(false);
        } else {
          resolve(true);
        }
        buffer = "";
        } else if (buf.length === 1 && !hex.startsWith("1b")) {
          // Single non-escape char — ignore to prevent echo leak
          buffer = "";
        }
      };

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      try { process.stdin.setRawMode(true); } catch {}
    }
    render();
    process.stdin.on("data", dataHandler);
  });
}

function createAgent(options: AgentOptions = {}) {
  const config = loadConfig();

  // Check if any providers configured
  if (!checkConfig(config)) {
    process.exit(0);
  }

  const providerRegistry = new ProviderRegistry();
  providerRegistry.createFromConfig(config);

  const providerName = options.provider ?? config.defaultProvider ?? "xiaomi";
  let provider = providerRegistry.get(providerName);

  if (options.hybrid) {
    provider = new HybridProvider(provider);
  }

  const toolRegistry = new ToolRegistry();
  const builtinTools = createBuiltinTools();
  builtinTools.forEach((t) => toolRegistry.register(t));

  const skillRegistry = new SkillRegistry();
  const builtinSkills = createBuiltinSkills();
  builtinSkills.forEach((s) => skillRegistry.register(s));

  const permissions = new PermissionChecker({
    autoApproveSafe: config.permissions.autoApproveSafe,
    allow: config.permissions.allow,
    deny: config.permissions.deny,
  });

  const executor = new ToolExecutor(toolRegistry, permissions, askApproval);

  const modelName = options.model ?? config.defaultModel ?? "mimo-v2.5-pro";

  const agent = new AgentLoop({
    provider,
    providerName,
    model: modelName,
    tools: toolRegistry,
    executor,
    permissions,
    maxTurns: config.maxTurns,
    mode: (options.mode as AgentMode) ?? "auto",
  });

  return {
    agent,
    providerName,
    config,
    skillRegistry,
    modelName,
    providerRegistry,
  };
}

async function runInteractive(options: AgentOptions = {}) {
  const {
    agent,
    providerName,
    config,
    skillRegistry,
    modelName,
    providerRegistry,
  } = createAgent(options);

  currentProvider = providerName;
  currentModel = modelName;
  currentMode = options.mode ?? "auto";
  maxTurns = config.maxTurns ?? 20;
  currentTurn = 0;
  inputTokens = 0;
  outputTokens = 0;
  sessionStartTime = Date.now();

  printHeader();
  printInfo("Provider", providerName);
  printInfo("Model", modelName);
  printInfo("Mode", options.mode ?? "auto");
  printInfo("Max Turns", String(maxTurns));
  console.log("");
  console.log(
    `  ${c.dim}Type to chat. /help for commands. "exit" to quit.${c.reset}`,
  );
  console.log("");

  const agentRef: { current: AgentLoop } = { current: agent };

  let isProcessing = false;
  const thoughtLevel: ThoughtLevel = resolveThoughtLevel(options);

  // Setup readline for input (readline manages raw mode internally)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const PROMPT = `  ${c.green}${c.bold}❯${c.reset} `;

  // Resume chat after approval completes — discards stale input
  _resumeChat = () => {
    _justApproved = true;
    // Defer so readline's buffered input fires first and is discarded
    setTimeout(() => { _justApproved = false; ask(); }, 20);
  };

  const ask = () => {
    if (inputMode === "approval") return;

    rl.question(PROMPT, async (input) => {
      // Discard stale input captured during approval
      if (isProcessing || inputMode === "approval" || _justApproved) return;
      const trimmed = input.trim();

      if (!trimmed) {
        ask();
        return;
      }

      if (
        trimmed.toLowerCase() === "exit" ||
        trimmed.toLowerCase() === "quit"
      ) {
        console.log(`\n  ${c.yellow}Bye! 👋${c.reset}`);
        rl.close();
        return;
      }

      if (trimmed.startsWith("/")) {
        const result = await handleCommand(
          trimmed,
          options,
          currentModel,
          currentProvider,
          agentRef,
          providerRegistry,
          config,
        );
        if (result?.newModel) currentModel = result.newModel;
        if (result?.newProvider) currentProvider = result.newProvider;
        ask();
        return;
      }

      await processInput(trimmed);
      ask();
    });
  };

  // ------- Agent processing -------

  const processInput = async (input: string) => {
    isProcessing = true;
    const trimmed = input.trim();
    if (!trimmed) {
      isProcessing = false;
      return;
    }

    let interrupted = false;
    const onKeypress = (_str: string | undefined, key: readline.Key) => {
      if (key.name === "escape") interrupted = true;
    };
    process.stdin.on("keypress", onKeypress);

    const thinking = createThinkingAnimation();
    thinking.start();

    let responseStarted = false;
    let thinkingDisplayed = false;
    let loopEnded = false;
    let atLineStart = false;
    let tBuffer = "";
    let stepCount = 0;

    try {
      for await (const event of agentRef.current.run(trimmed)) {
        if (interrupted) {
          loopEnded = true;
          thinking.stop();
          process.stdout.write(`\n    ${c.yellow}⏹ Interrupted${c.reset}\n`);
          atLineStart = true;
          updateStatus("idle", "Interrupted");
          break;
        }

        switch (event.type) {
          case "thinking":
            if (!responseStarted) {
              if (!thinkingDisplayed) {
                thinking.stop();
                thinkingDisplayed = true;
              }
              let content = event.content ?? "";
              content = content.replace(/<\/?think>/gi, "").trim();
              if (content && thoughtLevel !== "default") {
                displayThinkingBox(content);
              }
            }
            break;
          case "text": {
            const chunk = event.content ?? "";
            if (!responseStarted) {
              thinking.stop();
              // Move to a fresh line for response content (Layer C)
              process.stdout.write("\n");
            }
            const combined = tBuffer + chunk;
            const openIdx = combined.indexOf("<think>");
            const closeIdx = combined.indexOf("</think>");
            const hasComplete =
              openIdx >= 0 && closeIdx >= 0 && closeIdx > openIdx + 6;
            if (!responseStarted && hasComplete) {
              const thinkText = combined.slice(openIdx + 7, closeIdx).trim();
              if (thinkText) displayThinkingBox(thinkText);
              const after = combined.slice(closeIdx + 8).trimStart();
              if (after) {
                process.stdout.write(
                  `\n  ${c.green}${c.bold}●${c.reset} `,
                );
                responseStarted = true;
                atLineStart = false;
                responseStartTime = Date.now();
                const clean = after.replace(/^\n+/, "");
                if (clean) {
                  const indented = clean.includes("\n")
                    ? clean.replace(/\n/g, "\n  ")
                    : clean;
                  process.stdout.write(indented);
                  atLineStart = clean.endsWith("\n");
                }
              }
              tBuffer = "";
              break;
            }
            if (!responseStarted && openIdx >= 0) {
              tBuffer = combined;
              break;
            }
            if (!responseStarted) {
              process.stdout.write(
                `\n  ${c.green}${c.bold}●${c.reset} `,
              );
              responseStarted = true;
              atLineStart = false;
              responseStartTime = Date.now();
              const clean = combined.replace(/^\n+/, "");
              const indented = clean.includes("\n")
                ? clean.replace(/\n/g, "\n  ")
                : clean;
              process.stdout.write(indented);
              tBuffer = "";
              break;
            }
            if (tBuffer) {
              tBuffer = combined;
              if (closeIdx >= 0 && openIdx >= 0 && closeIdx > openIdx + 6) {
                const thinkText = tBuffer.slice(openIdx + 7, closeIdx).trim();
                if (thinkText) displayThinkingBox(thinkText);
                process.stdout.write(
                  `\n  ${c.green}${c.bold}●${c.reset} `,
                );
                responseStarted = true;
                atLineStart = false;
                responseStartTime = Date.now();
                const after = tBuffer.slice(closeIdx + 8).trimStart();
                if (after) {
                  const clean = after.replace(/^\n+/, "");
                  if (clean) {
                    const indented = clean.includes("\n")
                      ? clean.replace(/\n/g, "\n  ")
                      : clean;
                    process.stdout.write(indented);
                    atLineStart = clean.endsWith("\n");
                  }
                }
                tBuffer = "";
                break;
              }
              break;
            }
            if (atLineStart) {
              process.stdout.write(`  `);
              atLineStart = false;
            }
            if (chunk.includes("\n")) {
              const indented = chunk.replace(/\n/g, "\n  ");
              process.stdout.write(indented);
              atLineStart = chunk.endsWith("\n");
            } else {
              process.stdout.write(chunk);
              atLineStart = false;
            }
            break;
          }
          case "tool_use":
            if (!responseStarted) {
              thinking.stop();
              responseStarted = true;
            }
            if (thoughtLevel === "verbose" || thoughtLevel === "debug") {
              stepCount++;
              process.stdout.write(
                `\n  ${c.dim}── step ${stepCount}: ${event.toolName} ──${c.reset}\n`,
              );
            }
            const toolInput = event.toolInput ?? {};
            const inputStr = JSON.stringify(toolInput);
            process.stdout.write(
              `\n    ${c.cyan}🔧 ${event.toolName}${c.reset} ${c.yellow}${PERMISSION_INDICATORS.WARN}${c.reset} `,
            );
            if (inputStr.length < 60) {
              process.stdout.write(`${c.dim}${inputStr}${c.reset}`);
            } else {
              const formatted = JSON.stringify(toolInput, null, 2);
              process.stdout.write(
                `\n${formatted
                  .split("\n")
                  .map((l: string) => `      ${c.dim}${l}${c.reset}`)
                  .join("\n")}`,
              );
            }
            updateStatus("executing", event.toolName);
            break;
          case "tool_result":
            const output = event.toolOutput;
            const success = output !== undefined && output !== null;
            if (success) {
              process.stdout.write(` ${c.green}✓${c.reset}\n`);
            } else {
              const errSummary = (
                typeof output === "string" ? output : String(output ?? "")
              ).slice(0, 100);
              process.stdout.write(
                ` ${c.red}✗${c.reset} ${c.dim}${errSummary}${c.reset}\n`,
              );
            }
            atLineStart = true;
            updateStatus("executing", "Tool completed");
            break;
          case "error":
            loopEnded = true;
            thinking.stop();
            process.stdout.write(
              `\n    ${c.red}✗ ${event.error?.message?.slice(0, 100) ?? "error"}${c.reset}\n`,
            );
            atLineStart = true;
            updateStatus("error", event.error?.message?.slice(0, 50));
            break;
          case "done":
            loopEnded = true;
            if (responseStarted) {
              const respTime =
                responseStartTime > 0 ? Date.now() - responseStartTime : 0;
              lastResponseTime = respTime;
              process.stdout.write(
                `\n  ${c.dim}(${formatDuration(respTime)})${c.reset}\n\n`,
              );
            }
            atLineStart = true;
            updateStatus("completed", "Ready");
            if (event.usage) {
              inputTokens += event.usage.inputTokens ?? 0;
              outputTokens += event.usage.outputTokens ?? 0;
            }
            break;
        }
      }

      if (!loopEnded) thinking.stop();
    } catch (err) {
      thinking.stop();
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(
        `\n    ${c.red}✗ ${msg.replace(/^400 /, "").replace(/^429 /, "Quota exhausted — ").slice(0, 120)}${c.reset}\n`,
      );
      updateStatus("error", msg.slice(0, 50));
    } finally {
      process.stdin.removeListener("keypress", onKeypress);
      isProcessing = false;
      currentTurn++;
    }
  };

  // Keep process alive, cleanup terminal on exit
  await new Promise<void>((resolve) => {
    rl.on("close", () => {
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
      resolve();
    });
    ask();
  });
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
  config: HalfCopilotConfig,
): Promise<HandleCommandResult | void> {
  const parts = cmd.split(" ");
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (command) {
    case "/model":
      {
        const providerName =
          opts.provider ?? config.defaultProvider ?? "xiaomi";
        const providerCfg = config.providers[providerName];
        const availableModels = providerCfg
          ? Object.keys(providerCfg.models)
          : [];

        if (arg) {
          let targetModel = arg;
          const numIdx = parseInt(arg, 10);
          if (
            !isNaN(numIdx) &&
            numIdx >= 1 &&
            numIdx <= availableModels.length
          ) {
            targetModel = availableModels[numIdx - 1];
          }

          if (!availableModels.includes(targetModel)) {
            console.log(
              `  ${c.red}✗ Unknown model: ${targetModel}${c.reset}`,
            );
            console.log(
              `  ${c.dim}Available: ${availableModels.join(", ")}${c.reset}`,
            );
            break;
          }

          opts.model = targetModel;
          updateStatus("thinking", `Switching to ${targetModel}...`);
          try {
            const provider = providerRegistry.get(providerName);

            const toolRegistry = new ToolRegistry();
            const builtinTools = createBuiltinTools();
            builtinTools.forEach((t) => toolRegistry.register(t));

            const permissions = new PermissionChecker({
              autoApproveSafe: config.permissions.autoApproveSafe,
              allow: config.permissions.allow,
              deny: config.permissions.deny,
            });

            const executor = new ToolExecutor(
              toolRegistry,
              permissions,
              askApproval,
            );

            const newAgent = new AgentLoop({
              provider,
              providerName,
              model: targetModel,
              tools: toolRegistry,
              executor,
              permissions,
              maxTurns: config.maxTurns,
              mode: (opts.mode as AgentMode) ?? "auto",
            });

            agentRef.current = newAgent;
            saveConfig({ defaultModel: targetModel });
            console.log(`  ${c.green}✓ Model: ${targetModel}${c.reset}`);
            return { newModel: targetModel };
          } catch (err) {
            console.log(
              `  ${c.red}✗ Failed to switch: ${err instanceof Error ? err.message : err}${c.reset}`,
            );
          }
        } else {
          console.log(`\n  ${c.cyan}Current Model: ${c.bold}${currentModel}${c.reset}\n`);
          if (availableModels.length > 0) {
            console.log(`  ${c.dim}Available models for ${providerName}:${c.reset}`);
            for (let i = 0; i < availableModels.length; i++) {
              const marker =
                availableModels[i] === currentModel
                  ? ` ${c.green}← ${c.bold}(current)${c.reset}`
                  : "";
              console.log(
                `  ${c.bold}${i + 1}${c.reset}. ${c.white}${availableModels[i]}${c.reset}${marker}`,
              );
            }
            console.log(
              `\n  ${c.dim}Usage: /model <name> or /model <number>${c.reset}`,
            );
          }
        }
      }
      break;

    case "/provider":
      if (arg) {
        opts.provider = arg;
        updateStatus("thinking", `Switching to ${arg}...`);
        try {
          const newProvider = providerRegistry.get(arg);

          const toolRegistry = new ToolRegistry();
          const builtinTools = createBuiltinTools();
          builtinTools.forEach((t) => toolRegistry.register(t));

          const permissions = new PermissionChecker({
            autoApproveSafe: config.permissions.autoApproveSafe,
            allow: config.permissions.allow,
            deny: config.permissions.deny,
          });

          const executor = new ToolExecutor(
            toolRegistry,
            permissions,
            askApproval,
          );

          const providerConfig = config.providers[arg];
          const defaultModel = providerConfig
            ? Object.keys(providerConfig.models)[0]
            : opts.model ?? config.defaultModel ?? "mimo-v2.5-pro";

          const newAgent = new AgentLoop({
            provider: newProvider,
            providerName: arg,
            model: defaultModel,
            tools: toolRegistry,
            executor,
            permissions,
            maxTurns: config.maxTurns,
            mode: (opts.mode as AgentMode) ?? "auto",
          });

          agentRef.current = newAgent;
          saveConfig({ defaultProvider: arg, defaultModel });
          console.log(`  ${c.green}✓ Provider: ${arg}${c.reset}`);
          return { newProvider: arg, newModel: defaultModel };
        } catch (err) {
          console.log(`  ${c.red}✗ Provider not found: ${arg}${c.reset}`);
        }
      } else {
        console.log(`  ${c.yellow}Provider: ${currentProvider}${c.reset}`);
      }
      break;

    case "/mode":
      if (arg && ["plan", "act", "auto", "review"].includes(arg)) {
        opts.mode = arg;
        agentRef.current.setMode(arg as AgentMode);
        console.log(`  ${c.green}✓ Mode: ${arg}${c.reset}`);
        currentMode = arg;
        updateStatus("idle", `Mode: ${arg}`);
      } else {
        console.log(`  ${c.yellow}Mode: ${currentMode}${c.reset}`);
        console.log(`  ${c.dim}Options: plan, act, auto, review${c.reset}`);
      }
      break;

    case "/providers":
    case "/list":
      console.log(`\n  ${c.cyan}Configured Providers:${c.reset}\n`);
      for (const [name, pc] of Object.entries(config.providers)) {
        const models = Object.keys(pc.models).join(", ");
        const isDefault = name === config.defaultProvider;
        console.log(
          `  ${isDefault ? c.green + "★" : c.white}${c.bold} ${name}${c.reset}`,
        );
        console.log(`    ${c.dim}Models: ${models}${c.reset}`);
        console.log(`    ${c.dim}Base: ${pc.baseUrl ?? "default"}${c.reset}`);
        if (isDefault) console.log(`    ${c.green}(default)${c.reset}`);
        console.log("");
      }
      break;

    case "/clear":
      console.clear();
      printHeader();
      break;

    case "/help":
      console.log(`\n  ${c.cyan}Commands:${c.reset}`);
      console.log(`  ${c.white}/model <name>${c.reset}   - Switch model`);
      console.log(`  ${c.white}/provider <name>${c.reset} - Switch provider`);
      console.log(
        `  ${c.white}/mode <name>${c.reset}    - Set mode (plan/act/auto/review)`,
      );
      console.log(`  ${c.white}/list${c.reset}            - List configured providers`);
      console.log(`  ${c.white}/clear${c.reset}           - Clear screen`);
      console.log(`  ${c.white}/help${c.reset}           - Show this help`);
      console.log(`  ${c.white}/exit${c.reset}           - Quit\n`);
      break;

    default:
      console.log(`  ${c.red}Unknown: ${command}${c.reset}`);
  }
}

async function runSingle(prompt: string, options: AgentOptions = {}) {
  const { agent } = createAgent(options);

  const thinking = printThinking();
  let isFirstChunk = true;
  let tBuffer = "";
  let thinkRendered = false;

  try {
    for await (const event of agent.run(prompt)) {
      switch (event.type) {
        case "text": {
          const chunk = event.content ?? "";
          if (isFirstChunk) {
            thinking.stop();
            isFirstChunk = false;
          }
          const combined = tBuffer + chunk;
          const openIdx = combined.indexOf("<think>");
          const closeIdx = combined.indexOf("</think>");
          const hasComplete =
            openIdx >= 0 && closeIdx >= 0 && closeIdx > openIdx + 6;
          if (!thinkRendered && hasComplete) {
            const thinkText = combined.slice(openIdx + 7, closeIdx).trim();
            if (thinkText) displayThinkingBox(thinkText);
            const after = combined.slice(closeIdx + 8).trimStart();
            if (after) {
              process.stdout.write(
                `\n  ${c.green}${c.bold}●${c.reset} `,
              );
              const clean3 = after.replace(/^\n+/, "");
              const indented3 = clean3.includes("\n")
                ? clean3.replace(/\n/g, "\n  ")
                : clean3;
              process.stdout.write(indented3);
              thinkRendered = true;
            }
            tBuffer = "";
            break;
          }
          if (!thinkRendered && openIdx >= 0) {
            tBuffer = combined;
            break;
          }
          if (!thinkRendered) {
            process.stdout.write(`\n  ${c.green}${c.bold}●${c.reset} `);
            thinkRendered = true;
          }
          const clean2 = combined.replace(/^\n+/, "");
          const indented2 = clean2.includes("\n")
            ? clean2.replace(/\n/g, "\n  ")
            : clean2;
          process.stdout.write(indented2);
          break;
        }
        case "thinking":
          if (isFirstChunk) {
            thinking.stop();
            isFirstChunk = false;
          }
          const tc = (event.content ?? "").replace(/<\/?think>/gi, "").trim();
          if (tc) displayThinkingBox(tc);
          break;
        case "tool_use":
        case "tool_result":
          break;
      }
    }
    console.log("");
  } catch (err) {
    thinking.stop();
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
  }
}

// Subcommands first
program
  .command("chat")
  .description("Start interactive chat mode")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider to use")
  .option("--mode <mode>", "Agent mode (plan/review/act/auto)", "auto")
  .option("--hybrid", "Enable hybrid mode")
  .option("--verbose", "Show detailed thinking steps")
  .option("--debug", "Show full internal reasoning")
  .option("--tui", "Enable TUI mode (requires ink/React)")
  .action(async (options) => {
    if (options.tui) {
      try {
        const { render } = await import("ink");
        const React = await import("react");
        const { App } = await import("./tui/app.js");
        const { agent, providerName, config } = createAgent(options);
        const { waitUntilExit } = render(
          React.createElement(App, {
            agent,
            providerName,
            model: options.model ?? config.defaultModel ?? "mimo-v2.5-pro",
            mode: options.mode ?? "auto",
          }),
        );
        await waitUntilExit();
        return;
      } catch {
        console.log(
          `  ${c.yellow}TUI mode not available, falling back to simple mode${c.reset}\n`,
        );
      }
    }
    await runInteractive(options);
  });

program
  .command("run <prompt>")
  .description("Run a single prompt and exit")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider to use")
  .option("--mode <mode>", "Agent mode (plan/review/act/auto)", "act")
  .option("--hybrid", "Enable hybrid mode")
  .option("--verbose", "Show detailed thinking steps")
  .option("--debug", "Show full internal reasoning")
  .action(async (prompt, options) => {
    await runSingle(prompt, options);
    process.exit(0);
  });

program
  .command("models")
  .description("List available models")
  .action(() => {
    console.log("");
    console.log(`  ${c.cyan}${c.bold}Available Models:${c.reset}`);
    console.log("");

    const config = loadConfig();
    for (const [provider, pConfig] of Object.entries(config.providers)) {
      console.log(`  ${c.green}${c.bold}${provider}${c.reset}`);
      for (const model of Object.keys(pConfig.models)) {
        console.log(`    ${c.white}• ${model}${c.reset}`);
      }
      console.log("");
    }
  });

program
  .command("doctor")
  .description("Check configuration and environment")
  .action(() => {
    console.log("");
    console.log(`  ${c.cyan}${c.bold}HalfCopilot Doctor${c.reset}`);
    console.log("");

    try {
      const config = loadConfig();
      console.log(`  ${c.green}✓${c.reset} Configuration loaded`);
      console.log(
        `  ${c.green}✓${c.reset} Providers: ${Object.keys(config.providers).join(", ")}`,
      );
      console.log(
        `  ${c.green}✓${c.reset} Default: ${config.defaultProvider}/${config.defaultModel}`,
      );

      const toolRegistry = new ToolRegistry();
      createBuiltinTools().forEach((t) => toolRegistry.register(t));
      console.log(
        `  ${c.green}✓${c.reset} Tools: ${toolRegistry.list().length} available`,
      );

      const skillRegistry = new SkillRegistry();
      createBuiltinSkills().forEach((s) => skillRegistry.register(s));
      console.log(
        `  ${c.green}✓${c.reset} Skills: ${skillRegistry.list().length} available`,
      );

      console.log("");
      console.log(`  ${c.green}${c.bold}All checks passed! ✓${c.reset}`);
      console.log("");
    } catch (err) {
      console.log(
        `  ${c.red}✗ Error: ${err instanceof Error ? err.message : err}${c.reset}`,
      );
    }
  });

program
  .command("skills")
  .description("List available skills")
  .action(() => {
    const skillRegistry = new SkillRegistry();
    createBuiltinSkills().forEach((s) => skillRegistry.register(s));

    console.log("");
    console.log(`  ${c.cyan}${c.bold}Available Skills:${c.reset}`);
    console.log("");

    for (const skill of skillRegistry.list()) {
      console.log(`  ${c.green}• ${skill.name}${c.reset}`);
      console.log(`    ${c.dim}${skill.description}${c.reset}`);
    }
    console.log("");
  });

program
  .command("setup")
  .description("Interactive setup — configure API keys for model providers")
  .action(async () => {
    const fs = await import("fs");
    const pathModule = await import("path");
    const os = await import("os");

    const configDir = pathModule.join(os.homedir(), ".halfcopilot");
    const configFile = pathModule.join(configDir, "settings.json");

    // Load existing or create default
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, "utf-8")) as Record<
        string,
        unknown
      >;
    }
    if (!config.providers) {
      config.providers = {};
    }
    const providersCfg = config.providers as Record<
      string,
      Record<string, unknown>
    >;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = (q: string) =>
      new Promise<string>((resolve) => rl.question(q, resolve));

    // Print header
    console.log("");
    console.log(
      `${c.cyan}${c.bold}  ╭─────────────────────────────────────────────────────╮${c.reset}`,
    );
    console.log(
      `${c.cyan}${c.bold}  │                                                     │${c.reset}`,
    );
    console.log(
      `${c.cyan}${c.bold}  │           ⚙️  HalfCopilot Setup                     │${c.reset}`,
    );
    console.log(
      `${c.cyan}${c.bold}  │                                                     │${c.reset}`,
    );
    console.log(
      `${c.cyan}${c.bold}  ╰─────────────────────────────────────────────────────╯${c.reset}`,
    );
    console.log("");

    // Provider templates - from official API docs
    const providers: Array<{
      name: string;
      label: string;
      baseUrl: string;
      models: string[];
      desc: string;
    }> = [
      {
        name: "deepseek",
        label: "DeepSeek",
        desc: "v4 系列，高性价比深度推理",
        baseUrl: "https://api.deepseek.com",
        models: [
          "deepseek-v4-flash",
          "deepseek-v4-pro",
          "deepseek-chat",
          "deepseek-reasoner",
        ],
      },
      {
        name: "minimax",
        label: "MiniMax",
        desc: "M2 系列，204K 上下文",
        baseUrl: "https://api.minimaxi.com/v1",
        models: [
          "MiniMax-M2.7",
          "MiniMax-M2.7-highspeed",
          "MiniMax-M2.5",
          "MiniMax-M2.5-highspeed",
          "MiniMax-M2.1",
          "MiniMax-M2.1-highspeed",
          "MiniMax-M2",
        ],
      },
      {
        name: "xiaomi",
        label: "小米 MiMo",
        desc: "Token Plan API",
        baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        models: ["mimo-v2.5-pro", "mimo-v2.5"],
      },
      {
        name: "openai",
        label: "OpenAI",
        desc: "GPT-4o / GPT-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        models: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
      },
      {
        name: "anthropic",
        label: "Anthropic Claude",
        desc: "Claude Sonnet 4 / Haiku 3.5",
        baseUrl: "",
        models: [
          "claude-sonnet-4-20250514",
          "claude-3-5-haiku-20241022",
        ],
      },
      {
        name: "qwen",
        label: "通义千问 Qwen",
        desc: "阿里云出品",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-coder-plus"],
      },
    ];

    while (true) {
      console.log(
        `  ${c.dim}选择你要配置的模型厂商，输入 API Key 即可。${c.reset}`,
      );
      console.log("");
      console.log(`  ${c.cyan}${c.bold}📦 可用厂商:${c.reset}`);
      console.log("");

      for (let i = 0; i < providers.length; i++) {
        const p = providers[i];
        const configured = providersCfg[p.name]
          ? ` ${c.green}(已配置)${c.reset}`
          : "";
        console.log(
          `  ${c.bold}${i + 1}${c.reset}. ${c.white}${p.label}${c.reset} — ${c.dim}${p.desc}${c.reset}${configured}`,
        );
      }
      console.log(`  ${c.bold}0${c.reset}. ${c.dim}完成配置，退出${c.reset}`);
      console.log("");

      const choice = await ask(
        `  ${c.green}选择你要配置的厂商 (0-${providers.length}): ${c.reset}`,
      );
      const selectedIdx = parseInt(choice.trim()) - 1;

      if (
        isNaN(selectedIdx) ||
        selectedIdx < -1 ||
        selectedIdx >= providers.length
      ) {
        console.log(`  ${c.red}无效选择${c.reset}\n`);
        continue;
      }

      if (selectedIdx === -1) {
        console.log(`  ${c.yellow}配置完成！${c.reset}`);
        break;
      }

      const selected = providers[selectedIdx];

      console.log("");
      console.log(`  ${c.cyan}配置 ${selected.label}${c.reset}`);

      if (selected.name === "xiaomi") {
        console.log("");
        console.log(`  ${c.dim}小米 Token Plan API Key 示例格式:${c.reset}`);
        console.log(`  ${c.dim}tp-xxxxxxxxxx...${c.reset}`);
      }

      if (selected.name === "minimax") {
        console.log("");
        console.log(`  ${c.dim}MiniMax API Key (来自 minimaxi.com):${c.reset}`);
      }

      if (selected.name === "deepseek") {
        console.log("");
        console.log(
          `  ${c.dim}DeepSeek API Key (来自 api.deepseek.com):${c.reset}`,
        );
      }

      const apiKey = await ask(`  ${c.green}API Key: ${c.reset}`);

      if (!apiKey.trim()) {
        console.log(`  ${c.yellow}已跳过${c.reset}\n`);
        continue;
      }

      // Let user select which models to enable
      console.log(`\n  ${c.cyan}可用模型:${c.reset}`);
      const modelSelections: boolean[] = [];
      for (let i = 0; i < selected.models.length; i++) {
        modelSelections.push(true);
        console.log(
          `  ${c.bold}${i + 1}${c.reset}. ${c.white}${selected.models[i]}${c.reset} ${c.green}[启用]${c.reset}`,
        );
      }
      console.log(
        `  ${c.dim}按 Enter 启用全部，或输入要禁用的编号(逗号分隔):${c.reset}`,
      );
      const disableChoice = await ask(`  ${c.green}禁用: ${c.reset}`);
      if (disableChoice.trim()) {
        const disableIndices = disableChoice
          .split(",")
          .map((s) => parseInt(s.trim()) - 1)
          .filter((i) => i >= 0 && i < selected.models.length);
        for (const i of disableIndices) modelSelections[i] = false;
      }

      const enabledModels = selected.models.filter((_, i) => modelSelections[i]);

      // Build models object with proper context windows
      const modelConfigs: Record<
        string,
        { contextWindow: number; maxOutput: number }
      > = {};

      if (selected.name === "minimax") {
        for (const m of enabledModels) {
          modelConfigs[m] = { contextWindow: 204800, maxOutput: 16384 };
        }
      } else if (selected.name === "deepseek") {
        for (const m of enabledModels) {
          modelConfigs[m] = {
            contextWindow:
              m === "deepseek-chat" || m === "deepseek-reasoner"
                ? 65536
                : 131072,
            maxOutput: 8192,
          };
        }
      } else if (selected.name === "xiaomi") {
        for (const m of enabledModels) {
          modelConfigs[m] = { contextWindow: 128000, maxOutput: 16384 };
        }
      } else {
        for (const m of enabledModels) {
          modelConfigs[m] = { contextWindow: 128000, maxOutput: 16384 };
        }
      }

      // Save provider config
      providersCfg[selected.name] = {
        type: selected.name === "anthropic" ? "anthropic" : "openai-compatible",
        ...(selected.baseUrl ? { baseUrl: selected.baseUrl } : {}),
        apiKey,
        models: modelConfigs,
      };

      // Set as default if no default set
      const configAny = config as Record<string, unknown>;
      if (!configAny.defaultProvider) {
        configAny.defaultProvider = selected.name;
        configAny.defaultModel = enabledModels[0];
      }

      // Write config
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

      console.log("");
      console.log(
        `  ${c.green}${c.bold}✅ ${selected.label} 配置成功！${c.reset}`,
      );
      console.log(`  ${c.dim}配置文件: ${configFile}${c.reset}`);
      console.log(
        `  ${c.dim}模型: ${enabledModels.join(", ")}${c.reset}`,
      );

      if (configAny.defaultProvider === selected.name) {
        console.log(`  ${c.green}已设为默认厂商${c.reset}`);
      }
      console.log("");
    }

    rl.close();
  });

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    try {
      const config = loadConfig();
      console.log(`\n  ${c.cyan}Current Configuration:${c.reset}\n`);
      console.log(JSON.stringify(config, null, 2));
      console.log("");
    } catch (err) {
      console.log(
        `  ${c.red}✗ ${err instanceof Error ? err.message : err}${c.reset}`,
      );
    }
  });

program
  .command("providers")
  .description("List available providers")
  .action(() => {
    try {
      const config = loadConfig();
      console.log(`\n  ${c.cyan}Available Providers:${c.reset}\n`);
      for (const name of Object.keys(config.providers)) {
        console.log(`  ${c.green}• ${c.bold}${name}${c.reset}`);
      }
      console.log("");
    } catch (err) {
      console.log(
        `  ${c.red}✗ ${err instanceof Error ? err.message : err}${c.reset}`,
      );
    }
  });

program.action(async () => {
  await runInteractive({});
});

program.parse();

import { lookup } from "node:dns";
import { promisify } from "node:util";

const promiseLookup = promisify(lookup);

const DANGEROUS_COMMANDS = [
  "rm -rf",
  "sudo",
  "mkfs",
  "dd",
  ":(){:|:&}:",
  "forkbomb",
];

const BLOCKED_PATTERNS = [
  /;\s*rm\s/,
  /\|\s*rm\s/,
  /&&\s*rm\s/,
  /\|\|\s*rm\s/,
  /\$\(/,
  /\$\{/,
  /`/,
  /eval\s/,
  /exec\s+[^=]+-p/,
  /^[^|]*\|[^|]*rm/,
];

const COMMAND_WHITELIST = [
  "ls",
  "cat",
  "find",
  "grep",
  "rg",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "cut",
  "tr",
  "sed",
  "awk",
  "git",
  "npm",
  "pnpm",
  "bun",
  "deno",
  "tar",
  "zip",
  "unzip",
  "gzip",
  "gunzip",
  "mkdir",
  "cp",
  "mv",
  "touch",
  "chmod",
  "chown",
];

const READ_ONLY_COMMANDS = ["find", "grep", "rg", "head", "tail", "wc", "sort", "uniq", "cut", "tr"];

export function parseShellCommand(
  command: string,
): { command: string; args: string[]; error?: string } {
  if (!command || typeof command !== "string") {
    return { command: "", args: [], error: "Empty command" };
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { command: "", args: [], error: "Empty command" };
  }

  const lower = trimmed.toLowerCase();
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lower.includes(dangerous)) {
      return {
        command: "",
        args: [],
        error: `Blocked dangerous pattern: ${dangerous}`,
      };
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        command: "",
        args: [],
        error: `Blocked suspicious pattern in command`,
      };
    }
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { command: "", args: [], error: "Empty command" };
  }

  const cmd = tokens[0];
  const cmdLower = cmd.toLowerCase();
  const args = tokens.slice(1);

  const isWhiteListed = COMMAND_WHITELIST.some((c) => cmdLower === c);
  const isSafeBuiltin =
    ["cd", "echo", "pwd", "export", "source", "alias", "history"].includes(
      cmdLower,
    ) || cmdLower.startsWith("./") || cmdLower.startsWith("/");
  const isPathTraversal = cmd.startsWith("/") || cmd.startsWith("./");

  if (!isWhiteListed && !isSafeBuiltin && !isPathTraversal) {
    return {
      command: "",
      args: [],
      error: `Command not allowed: ${cmd}. Allowed: ${COMMAND_WHITELIST.join(", ")}`,
    };
  }

  if (cmdLower === "cat" && args.length > 0) {
    const firstArg = args[0];
    if (firstArg.startsWith("/") || firstArg.startsWith("~")) {
      return {
        command: "",
        args: [],
        error: `cat with absolute path not allowed: ${firstArg}`,
      };
    }
  }

  if (cmdLower === "python" || cmdLower === "python3" || cmdLower === "node" || cmdLower === "ruby" || cmdLower === "perl") {
    return {
      command: "",
      args: [],
      error: `Script interpreter not allowed: ${cmd}`,
    };
  }

  return { command: cmd, args };
}

function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let escaped = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inQuote) {
      escaped = true;
      continue;
    }

    if ((ch === '"' || ch === "'") && !escaped) {
      if (inQuote && ch === quoteChar) {
        inQuote = false;
        quoteChar = "";
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === " " && !inQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function buildShellArgs(args: string[]): string[] {
  return args;
}

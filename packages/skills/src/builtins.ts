import type { Skill, SkillContext, SkillResult } from "./types.js";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helpers: git-commit
// ---------------------------------------------------------------------------

function cleanStatusLine(line: string): string {
  const cleaned = line.substring(3).trim();
  const arrow = cleaned.lastIndexOf(" -> ");
  return arrow >= 0 ? cleaned.substring(arrow + 4) : cleaned;
}

function determineGitType(diff: string, status: string): string {
  const lines = diff.split("\n");
  const addedLines = lines.filter(
    (l) => l.startsWith("+") && !l.startsWith("+++"),
  ).length;
  const removedLines = lines.filter(
    (l) => l.startsWith("-") && !l.startsWith("---"),
  ).length;

  const hasNewFiles = status.split("\n").some((l) => /^\?\?/.test(l));
  if (hasNewFiles) return "feat";
  if (/^A\s+/.test(status)) return "feat";
  if (/^D\s+/.test(status)) return "fix";
  if (/fix|bug|error|issue/i.test(diff)) return "fix";
  if (/docs?|readme|\.md$/im.test(status)) return "docs";
  if (/style|format|prettier|whitespace/i.test(diff)) return "style";
  if (/refactor|extract|rename|move/i.test(diff)) return "refactor";
  if (/test|spec|\.test\.|\.spec\./i.test(status)) return "test";
  if (/config|package\.json|dependabot|version/i.test(status)) return "chore";
  return addedLines > removedLines ? "feat" : "fix";
}

function determineScope(status: string): string {
  const files = status.split("\n").filter(Boolean);
  if (files.length === 0) return "";
  const clean = files.map(cleanStatusLine);
  if (clean.length === 1) {
    const parts = clean[0].split("/");
    return parts.length > 1 ? parts[0] : "";
  }
  const prefixes = clean.map((f) => f.split("/")[0]);
  return new Set(prefixes).size === 1 ? prefixes[0] : "";
}

function describeChanges(status: string): string {
  const files = status.split("\n").filter(Boolean);
  const clean = files.map(cleanStatusLine);
  if (clean.length <= 3)
    return clean.map((f) => f.split("/").pop()!).join(", ");
  return `${files.length} files`;
}

// ---------------------------------------------------------------------------
// Helpers: test-runner
// ---------------------------------------------------------------------------

async function detectTestFramework(
  executeTool: SkillContext["executeTool"],
  cwd: string,
): Promise<{ cmd: string; label: string } | null> {
  const checks: Array<{ pattern: string; cmd: string; label: string }> = [
    { pattern: "package.json", cmd: "npm test 2>&1", label: "npm" },
    { pattern: "pnpm-lock.yaml", cmd: "pnpm test 2>&1", label: "pnpm" },
    { pattern: "pyproject.toml", cmd: "pytest -v 2>&1", label: "pytest" },
    { pattern: "setup.py", cmd: "pytest -v 2>&1", label: "pytest" },
    { pattern: "go.mod", cmd: "go test ./... 2>&1", label: "go test" },
    { pattern: "Cargo.toml", cmd: "cargo test 2>&1", label: "cargo test" },
    { pattern: "Makefile", cmd: "make test 2>&1", label: "make test" },
  ];

  for (const { pattern, cmd, label } of checks) {
    const r = await executeTool("glob", { pattern, path: cwd });
    if (r.output && !r.output.includes("No files found")) {
      return { cmd, label };
    }
  }
  return null;
}

function parseTestOutput(output: string): {
  passed: number;
  failed: number;
  failures: string[];
} {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  const passMatch = output.match(/(\d+)\s+(?:passed|passing|ok)/i);
  const failMatch = output.match(/(\d+)\s+(?:failed|failing)/i);
  if (passMatch) passed = parseInt(passMatch[1], 10);
  if (failMatch) failed = parseInt(failMatch[1], 10);

  const lines = output.split("\n");
  for (const line of lines) {
    if (/^(not ok|FAIL|FAILED)\s/i.test(line.trim())) {
      failures.push(line.trim());
    }
  }

  // Try pytest-style failure extraction
  const failLines = output.match(/FAILED\s+\S+\/\S+/g);
  if (failLines) failures.push(...failLines);

  return { passed, failed, failures };
}

// ---------------------------------------------------------------------------
// Helpers: code-review
// ---------------------------------------------------------------------------

interface ReviewIssue {
  type: string;
  severity: "error" | "warning" | "info";
  line?: number;
  message: string;
  suggestion?: string;
}

function reviewFileContent(content: string, filename: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = content.split("\n");
  const ext = filename.split(".").pop()?.toLowerCase();

  // File length
  if (lines.length > 500) {
    issues.push({
      type: "complexity",
      severity: "warning",
      message: `File is very long (${lines.length} lines). Consider splitting into smaller modules.`,
    });
  }

  // eval
  const evalRe = /\beval\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = evalRe.exec(content)) !== null) {
    issues.push({
      type: "security",
      severity: "error",
      line: content.substring(0, m.index).split("\n").length,
      message: "Use of eval() detected — can lead to code injection.",
      suggestion: "Avoid eval(). Use safer alternatives.",
    });
  }

  // Hardcoded secrets
  const secretPatterns = [
    {
      re: /(?:api[_-]?key|apikey|secret|password|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]/i,
      desc: "hardcoded credential",
    },
    { re: /AKIA[0-9A-Z]{16}/, desc: "AWS access key" },
    { re: /sk-[a-zA-Z0-9]{32,}/, desc: "OpenAI API key" },
  ];
  for (const { re, desc } of secretPatterns) {
    const match = content.match(re);
    if (match) {
      issues.push({
        type: "security",
        severity: "error",
        line: content.substring(0, match.index!).split("\n").length,
        message: `Possible ${desc} detected.`,
        suggestion: "Use environment variables or a secrets manager.",
      });
    }
  }

  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    // `any` type (TS only)
    if ((ext === "ts" || ext === "tsx") && /:\s*any\b/.test(content)) {
      issues.push({
        type: "typescript",
        severity: "warning",
        message:
          "Usage of `any` type detected. Prefer specific types, `unknown`, or generics.",
      });
    }

    // Missing return types on functions (TS only)
    if (ext === "ts" || ext === "tsx") {
      const funcRe =
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/g;
      while ((m = funcRe.exec(content)) !== null) {
        if (!m[0].includes("):")) {
          issues.push({
            type: "typescript",
            severity: "info",
            line: content.substring(0, m.index).split("\n").length,
            message: `Function \`${m[1]}\` is missing a return type annotation.`,
          });
        }
      }
    }

    // Unused variables (basic heuristic)
    const varRe = /(?:const|let|var)\s+(\w+)\s*[=;]/g;
    while ((m = varRe.exec(content)) !== null) {
      const name = m[1];
      if (name.startsWith("_")) continue;
      const after = content.substring(m.index + m[0].length);
      const used = new RegExp(`[^\\w.]${name}[^\\w(]`);
      if (!used.test(after) && !after.includes(name + ".")) {
        issues.push({
          type: "typescript",
          severity: "warning",
          line: content.substring(0, m.index).split("\n").length,
          message: `Variable \`${name}\` appears to be unused.`,
        });
      }
    }
  }

  // Empty catch blocks
  const catchRe = /catch\s*\([^)]*\)\s*\{([^}]*)\}/g;
  while ((m = catchRe.exec(content)) !== null) {
    const body = m[1].trim();
    if (!body || body === "/* ignore */" || body === "// ignore") {
      issues.push({
        type: "error-handling",
        severity: "error",
        line: content.substring(0, m.index).split("\n").length,
        message: "Empty catch block detected. Errors should be handled.",
        suggestion: "At minimum, log the error with console.error().",
      });
    }
  }

  // Function length
  const fnRe =
    /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/g;
  while ((m = fnRe.exec(content)) !== null) {
    let depth = 1;
    let pos = content.indexOf("{", m.index) + 1;
    while (depth > 0 && pos < content.length) {
      if (content[pos] === "{") depth++;
      if (content[pos] === "}") depth--;
      pos++;
    }
    const funcLines = content.substring(m.index, pos).split("\n").length;
    if (funcLines > 50) {
      issues.push({
        type: "complexity",
        severity: "warning",
        line: content.substring(0, m.index).split("\n").length,
        message: `Function is ${funcLines} lines long. Consider breaking it into smaller functions.`,
      });
    }
  }

  // console.log in non-test files
  if (
    !/\.(test|spec)\./.test(filename) &&
    /console\.(log|debug)\s*\(/.test(content)
  ) {
    issues.push({
      type: "code-quality",
      severity: "info",
      message:
        "console.log/debug statements found. Consider removing or using a logger in production code.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers: documentation
// ---------------------------------------------------------------------------

interface DocEntry {
  type: "function" | "class" | "interface" | "type";
  name: string;
  signature: string;
  line: number;
  params?: Array<{ name: string; type: string; optional: boolean }>;
  returnType?: string;
  extends?: string;
  implements?: string;
}

function parseDocEntries(content: string, filename: string): DocEntry[] {
  const entries: DocEntry[] = [];
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || !["ts", "tsx", "js", "jsx", "mjs"].includes(ext)) return entries;

  let m: RegExpExecArray | null;

  // Functions
  const fnRe =
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+?))?\s*\{/g;
  while ((m = fnRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length + 1;
    const raw = m[2].trim();
    const params = raw
      ? raw.split(",").map((p) => {
          const parts = p.trim().split(/\s*:\s*/);
          return {
            name: parts[0],
            type: parts[1] || "any",
            optional: parts[0].endsWith("?"),
          };
        })
      : [];
    entries.push({
      type: "function",
      name: m[1],
      signature: `function ${m[1]}(${raw})${m[3] ? ": " + m[3].trim() : ""}`,
      line: lineNum,
      params,
      returnType: m[3]?.trim(),
    });
  }

  // Arrow-function const
  const arrowRe =
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*(\w+))?\s*=>/g;
  while ((m = arrowRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length + 1;
    const raw = m[2].trim();
    const params = raw
      ? raw.split(",").map((p) => {
          const parts = p.trim().split(/\s*:\s*/);
          return {
            name: parts[0],
            type: parts[1] || "any",
            optional: parts[0].endsWith("?"),
          };
        })
      : [];
    entries.push({
      type: "function",
      name: m[1],
      signature: `const ${m[1]} = (${raw})${m[3] ? ": " + m[3] : ""} =>`,
      line: lineNum,
      params,
      returnType: m[3]?.trim(),
    });
  }

  // Class
  const classRe =
    /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+?))?\s*\{/g;
  while ((m = classRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length + 1;
    entries.push({
      type: "class",
      name: m[1],
      signature: `class ${m[1]}${m[2] ? " extends " + m[2] : ""}${m[3] ? " implements " + m[3].trim() : ""}`,
      line: lineNum,
      extends: m[2],
      implements: m[3]?.trim(),
    });
  }

  // Interface
  const ifaceRe =
    /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+?))?\s*\{/g;
  while ((m = ifaceRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length + 1;
    entries.push({
      type: "interface",
      name: m[1],
      signature: `interface ${m[1]}${m[2] ? " extends " + m[2].trim() : ""}`,
      line: lineNum,
      extends: m[2]?.trim(),
    });
  }

  // Type alias
  const typeRe = /(?:export\s+)?type\s+(\w+)\s*=\s*([^;]+);/g;
  while ((m = typeRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length + 1;
    entries.push({
      type: "type",
      name: m[1],
      signature: `type ${m[1]} = ${m[2].trim()}`,
      line: lineNum,
    });
  }

  return entries;
}

function generateMarkdown(entries: DocEntry[], filename: string): string {
  const out: string[] = [];
  const title = filename.split(/[/\\]/).pop() || filename;
  out.push(`# \`${title}\` Documentation`);
  out.push("");
  out.push(`> Source: \`${filename}\``);
  out.push("");

  if (entries.length === 0) {
    out.push("_No exports found._");
    return out.join("\n");
  }

  for (const e of entries) {
    out.push(`### \`${e.name}\``);
    out.push("");
    out.push("```typescript");
    out.push(e.signature);
    out.push("```");
    out.push("");
    out.push(`- **Type:** \`${e.type}\``);
    out.push(`- **Line:** ${e.line}`);
    if (e.returnType) out.push(`- **Return:** \`${e.returnType}\``);
    if (e.extends) out.push(`- **Extends:** \`${e.extends}\``);
    if (e.implements) out.push(`- **Implements:** \`${e.implements}\``);
    if (e.params && e.params.length > 0) {
      out.push("- **Parameters:**");
      out.push("");
      out.push("| Name | Type | Optional |");
      out.push("|------|------|----------|");
      for (const p of e.params) {
        out.push(
          `| \`${p.name}\` | \`${p.type}\` | ${p.optional ? "Yes" : "No"} |`,
        );
      }
    }
    out.push("");
  }

  return out.join("\n");
}

// ==========================================================================
// Skills
// ==========================================================================

export function createGitCommitSkill(): Skill {
  return {
    name: "git-commit",
    description: "Create a git commit with a meaningful message",
    instructions: `When the user asks to commit changes or save work:
1. Run 'git status' to see what files have changed
2. Run 'git diff' to see the actual changes
3. Analyze the changes and write a meaningful commit message
4. Stage the relevant files with 'git add'
5. Create the commit with 'git commit -m "message"

Follow conventional commit format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore`,
    triggers: [
      { type: "keyword", value: "commit" },
      { type: "keyword", value: "save changes" },
      { type: "intent", value: "save" },
    ],
    async execute(
      context: SkillContext,
      input: Record<string, unknown>,
    ): Promise<SkillResult> {
      const { executeTool, workingDirectory } = context;

      // Verify this is a git repo
      const gitCheck = await executeTool("bash", {
        command: "git rev-parse --is-inside-work-tree 2>&1",
        cwd: workingDirectory,
      });
      if (gitCheck.error || gitCheck.output.trim() !== "true") {
        return { success: false, output: "Not a git repository." };
      }

      // Check for changes
      const statusResult = await executeTool("bash", {
        command: "git status --porcelain",
        cwd: workingDirectory,
      });
      if (statusResult.error) {
        return {
          success: false,
          output: `Failed to check git status: ${statusResult.error}`,
        };
      }

      const status = statusResult.output.trim();
      if (!status) {
        return {
          success: true,
          output: "No changes to commit. Working tree is clean.",
        };
      }

      // Check if anything is already staged
      const stagedCheck = await executeTool("bash", {
        command: "git diff --cached --stat",
        cwd: workingDirectory,
      });
      const hasStaged =
        stagedCheck.output.trim().length > 0 &&
        stagedCheck.output.trim() !== "(no output)";

      if (!hasStaged) {
        const addResult = await executeTool("bash", {
          command: "git add -A",
          cwd: workingDirectory,
        });
        if (addResult.error) {
          return {
            success: false,
            output: `Failed to stage changes: ${addResult.error}`,
          };
        }
      }

      // Get diff for message generation
      const diffResult = await executeTool("bash", {
        command: "git diff --cached",
        cwd: workingDirectory,
      });

      const type = determineGitType(diffResult.output, status);
      const scope = determineScope(status);
      const scopeStr = scope ? `(${scope})` : "";
      const autoMsg = `${type}${scopeStr}: ${describeChanges(status)}`;
      const commitMessage = (input.message as string) || autoMsg;

      const commitResult = await executeTool("bash", {
        command: `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        cwd: workingDirectory,
      });

      if (commitResult.error) {
        return {
          success: false,
          output: `Commit failed: ${commitResult.error}`,
        };
      }

      return {
        success: true,
        output: `Committed successfully\n\nMessage: ${commitMessage}\n\n${commitResult.output}`,
      };
    },
  };
}

export function createTestRunnerSkill(): Skill {
  return {
    name: "test-runner",
    description: "Run tests for the current project",
    instructions: `When the user asks to run tests:
1. Check for package.json to determine the test framework
2. Run the appropriate test command:
   - npm/pnpm/yarn: 'npm test' / 'pnpm test' / 'yarn test'
   - pytest: 'pytest'
   - go test: 'go test ./...'
3. Report the test results

If tests fail, help identify and fix the issues.`,
    triggers: [
      { type: "keyword", value: "test" },
      { type: "keyword", value: "run tests" },
      { type: "intent", value: "test" },
    ],
    async execute(
      context: SkillContext,
      input: Record<string, unknown>,
    ): Promise<SkillResult> {
      const { executeTool, workingDirectory } = context;

      const framework = await detectTestFramework(
        executeTool,
        workingDirectory,
      );
      if (!framework) {
        return {
          success: false,
          output:
            "Could not detect a supported test framework.\nSupported: npm/pnpm, pytest, go test, cargo test, make test.",
        };
      }

      const testResult = await executeTool("bash", {
        command: framework.cmd,
        cwd: workingDirectory,
        timeout: 300000,
      });

      const raw = (testResult.output || "").slice(0, 5000);
      const { passed, failed, failures } = parseTestOutput(raw);

      let out = `## Test Results (${framework.label})\n\n`;
      out +=
        passed > 0 || failed > 0
          ? `Tests: ${passed} passed, ${failed} failed`
          : "Test run completed (unable to parse structured results)";
      out += "\n\n";

      if (failed > 0 && failures.length > 0) {
        out += "### Failures\n\n";
        for (const f of failures.slice(0, 10)) {
          out += `- ${f}\n`;
        }
        if (failures.length > 10)
          out += `- ... and ${failures.length - 10} more\n`;
        out += "\n";
      }

      if (raw.length >= 5000)
        out += "*(Output truncated to 5000 characters)*\n";
      if (testResult.error) {
        out += `\n### Errors\n\n${testResult.error.slice(0, 2000)}\n`;
      }

      return { success: !testResult.error && failed === 0, output: out };
    },
  };
}

export function createCodeReviewSkill(): Skill {
  return {
    name: "code-review",
    description: "Review code for potential issues",
    instructions: `When reviewing code:
1. Read the file(s) to review
2. Check for:
   - Syntax errors
   - Logic errors
   - Security vulnerabilities
   - Performance issues
   - Code style inconsistencies
   - Missing error handling
   - Unclear variable/function names
3. Provide specific, actionable feedback
4. Suggest improvements with code examples`,
    triggers: [
      { type: "keyword", value: "review" },
      { type: "keyword", value: "check code" },
      { type: "keyword", value: "code review" },
    ],
    async execute(
      context: SkillContext,
      input: Record<string, unknown>,
    ): Promise<SkillResult> {
      const { executeTool, workingDirectory } = context;

      let files: string[] = [];
      if (input.path) {
        files = [String(input.path)];
      } else if (input.files && Array.isArray(input.files)) {
        files = input.files.map((f) => String(f));
      } else {
        return {
          success: false,
          output:
            "Please provide a `path` (string) or `files` (string[]) to review.",
        };
      }

      const reports: string[] = [];
      let totalErrors = 0;
      let totalWarnings = 0;
      let totalInfos = 0;

      for (const file of files) {
        const absPath = resolve(workingDirectory, file);
        const readResult = await executeTool("file_read", { path: absPath });

        if (readResult.error) {
          reports.push(
            `### \`${file}\`\n\nCould not read file: ${readResult.error}\n`,
          );
          continue;
        }

        const issues = reviewFileContent(readResult.output, file);
        if (issues.length === 0) {
          reports.push(`### \`${file}\`\n\nNo issues found.\n`);
          continue;
        }

        const errs = issues.filter((i) => i.severity === "error");
        const warns = issues.filter((i) => i.severity === "warning");
        const infos = issues.filter((i) => i.severity === "info");
        totalErrors += errs.length;
        totalWarnings += warns.length;
        totalInfos += infos.length;

        let report = `### \`${file}\`\n\nFound ${issues.length} issue(s): ${errs.length} errors, ${warns.length} warnings, ${infos.length} info\n\n`;
        for (const issue of issues) {
          const tag =
            issue.severity === "error"
              ? "[ERROR]"
              : issue.severity === "warning"
                ? "[WARNING]"
                : "[INFO]";
          report += `${tag}`;
          if (issue.line) report += ` (line ${issue.line})`;
          report += `: ${issue.message}\n`;
          if (issue.suggestion) report += `  Suggestion: ${issue.suggestion}\n`;
          report += "\n";
        }
        reports.push(report);
      }

      const summary = `## Code Review Summary\n\n${files.length} file(s) reviewed — ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfos} info\n\n`;
      return { success: true, output: summary + reports.join("\n---\n\n") };
    },
  };
}

export function createDocumentationSkill(): Skill {
  return {
    name: "documentation",
    description: "Generate or update documentation",
    instructions: `When generating documentation:
1. Read the source code
2. Identify:
   - Public APIs and their signatures
   - Configuration options
   - Usage examples
   - Dependencies
3. Generate clear, concise documentation
4. Use appropriate format (JSDoc, Markdown, etc.)`,
    triggers: [
      { type: "keyword", value: "document" },
      { type: "keyword", value: "docs" },
      { type: "keyword", value: "readme" },
    ],
    async execute(
      context: SkillContext,
      input: Record<string, unknown>,
    ): Promise<SkillResult> {
      const { executeTool, workingDirectory } = context;

      const path = input.path as string | undefined;
      if (!path) {
        return {
          success: false,
          output: "Please specify a source file `path` to document.",
        };
      }

      const absPath = resolve(workingDirectory, path);
      const readResult = await executeTool("file_read", { path: absPath });
      if (readResult.error) {
        return {
          success: false,
          output: `Could not read file: ${readResult.error}`,
        };
      }

      const entries = parseDocEntries(readResult.output, path);
      const markdown = generateMarkdown(entries, path);

      const docPath = path.replace(/\.[^.]+$/, ".md");
      return {
        success: true,
        output: markdown,
        artifacts: [{ path: docPath, content: markdown }],
      };
    },
  };
}

export function createRefactorSkill(): Skill {
  return {
    name: "refactor",
    description: "Refactor code for better quality",
    instructions: `When refactoring code:
1. Understand the current code structure
2. Identify improvement opportunities:
   - Extract repeated code into functions
   - Simplify complex conditionals
   - Improve naming
   - Remove dead code
   - Apply design patterns where appropriate
3. Make changes incrementally
4. Verify each change doesn't break functionality`,
    triggers: [
      { type: "keyword", value: "refactor" },
      { type: "keyword", value: "clean up" },
      { type: "keyword", value: "improve" },
    ],
    async execute(
      context: SkillContext,
      input: Record<string, unknown>,
    ): Promise<SkillResult> {
      const { executeTool, workingDirectory } = context;

      const path = input.path as string | undefined;
      const description = (input.description as string) || "";
      if (!path) {
        return {
          success: false,
          output: "Please specify a file `path` to refactor.",
        };
      }

      const absPath = resolve(workingDirectory, path);
      const readResult = await executeTool("file_read", { path: absPath });
      if (readResult.error) {
        return {
          success: false,
          output: `Could not read file: ${readResult.error}`,
        };
      }

      const content = readResult.output;
      const issues = reviewFileContent(content, path);
      const critical = issues.filter(
        (i) => i.severity === "error" || i.severity === "warning",
      );

      let report = `## Refactoring Analysis: \`${path}\`\n\n`;
      if (critical.length === 0) {
        report += "No refactoring opportunities detected automatically.\n";
      } else {
        report += `Found ${critical.length} potential improvement(s):\n\n`;
        for (const issue of critical) {
          report += `- [${issue.severity.toUpperCase()}] ${issue.message}\n`;
          if (issue.suggestion) report += `  -> ${issue.suggestion}\n`;
        }
        report += "\n";
      }

      if (description) {
        report += `### Requested Refactoring\n\n${description}\n\n`;

        // Remove console.log statements
        if (/remove (console|log)/i.test(description)) {
          const logRe = /^\s*console\.(log|debug)\s*\([^;]*\);?\s*$/gm;
          const matches = content.match(logRe);
          if (matches) {
            for (const match of matches) {
              const editResult = await executeTool("file_edit", {
                path: absPath,
                oldText: match,
                newText: "",
                replaceAll: false,
              });
              if (editResult.error) {
                report += `- Failed to remove \`${match.trim()}\`: ${editResult.error}\n`;
              }
            }
            report += `- Removed ${matches.length} console.log/debug statement(s)\n`;
          } else {
            report += "- No console.log/debug statements found.\n";
          }
        }

        // Verify
        const verifyResult = await executeTool("bash", {
          command: 'npx tsc --noEmit 2>&1 || echo "No typecheck configured"',
          cwd: workingDirectory,
          timeout: 60000,
        });
        if (verifyResult.error) {
          report += `\n### Verification\n\nType check reported:\n\`\`\`\n${(verifyResult.output || verifyResult.error).slice(0, 1500)}\n\`\`\`\n`;
        } else if (
          verifyResult.output &&
          !verifyResult.output.includes("No typecheck configured")
        ) {
          report += `\n### Verification\n\n\`\`\`\n${verifyResult.output.slice(0, 1500)}\n\`\`\`\n`;
        } else {
          report += "\n### Verification\n\nNo type/build errors detected.\n";
        }
      }

      return { success: true, output: report };
    },
  };
}

export function createBuiltinSkills(): Skill[] {
  return [
    createGitCommitSkill(),
    createTestRunnerSkill(),
    createCodeReviewSkill(),
    createDocumentationSkill(),
    createRefactorSkill(),
  ];
}

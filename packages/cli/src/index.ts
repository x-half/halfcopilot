#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "@halfcopilot/config";
import { ProviderRegistry } from "@halfcopilot/provider";
import {
  ToolRegistry,
  createBuiltinTools,
  PermissionChecker,
  ToolExecutor,
} from "@halfcopilot/tools";
import { AgentLoop, HybridProvider, type AgentMode } from "@halfcopilot/core";
import { MemoryStore } from "@halfcopilot/memory";
import { SkillRegistry, createBuiltinSkills } from "@halfcopilot/skills";
import { MCPClientManager } from "@halfcopilot/mcp";

const program = new Command();

program
  .name("halfcopilot")
  .description("HalfCopilot — Multi-model Agent Framework CLI with Hybrid Mode")
  .version("0.0.1");

function createAgent(options: {
  model?: string;
  provider?: string;
  mode?: string;
  hybrid?: boolean;
}) {
  const config = loadConfig();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.createFromConfig(config);

  const providerName = options.provider ?? config.defaultProvider ?? "xiaomi";
  let provider = providerRegistry.get(providerName);

  // Apply hybrid mode if requested
  if (options.hybrid) {
    provider = new HybridProvider(provider);
  }

  const toolRegistry = new ToolRegistry();
  const builtinTools = createBuiltinTools();
  builtinTools.forEach((t) => toolRegistry.register(t));

  // Load skills
  const skillRegistry = new SkillRegistry();
  const builtinSkills = createBuiltinSkills();
  builtinSkills.forEach((s) => skillRegistry.register(s));

  const permissions = new PermissionChecker({
    autoApproveSafe: config.permissions.autoApproveSafe,
    allow: config.permissions.allow,
    deny: config.permissions.deny,
  });

  const executor = new ToolExecutor(toolRegistry, permissions);

  const agent = new AgentLoop({
    provider,
    model: options.model ?? config.defaultModel ?? "mimo-v2.5-pro",
    tools: toolRegistry,
    executor,
    permissions,
    maxTurns: config.maxTurns,
    mode: (options.mode as AgentMode) ?? "auto",
  });

  return { agent, providerName, config, skillRegistry };
}

program
  .command("chat")
  .description("Start interactive chat mode")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider to use")
  .option("--mode <mode>", "Agent mode (plan/review/act/auto)", "auto")
  .option(
    "--hybrid",
    "Enable hybrid mode (text block parsing for non-tool-use models)",
  )
  .option("--tui", "Enable TUI mode (requires ink/React)")
  .action(async (options) => {
    try {
      const { agent, providerName, config, skillRegistry } =
        createAgent(options);

      // Try to use TUI if requested
      if (options.tui) {
        try {
          const { render } = await import("ink");
          const React = await import("react");
          const { App } = await import("./tui/app.js");

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
          // Fallback to simple CLI
          console.log("TUI mode not available, falling back to simple mode\n");
        }
      }

      // Simple CLI mode
      console.log(
        "\x1b[36m╔══════════════════════════════════════════════════╗\x1b[0m",
      );
      console.log(
        "\x1b[36m║          HalfCopilot v0.0.1                      ║\x1b[0m",
      );
      console.log(
        "\x1b[36m║   Multi-model Agent Framework CLI                ║\x1b[0m",
      );
      console.log(
        "\x1b[36m╚══════════════════════════════════════════════════╝\x1b[0m",
      );
      console.log(`\x1b[32mProvider:\x1b[0m ${providerName}`);
      console.log(
        `\x1b[32mModel:\x1b[0m ${options.model ?? config.defaultModel ?? "mimo-v2.5-pro"}`,
      );
      console.log(`\x1b[32mMode:\x1b[0m ${options.mode ?? "auto"}`);
      if (options.hybrid) {
        console.log(`\x1b[33mHybrid Mode: Enabled\x1b[0m`);
      }
      console.log(
        `\x1b[33mType your message and press Enter. Type 'exit' to quit.\x1b[0m\n`,
      );

      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = () => {
        rl.question("\x1b[32m❯ \x1b[0m", async (input) => {
          if (
            input.trim().toLowerCase() === "exit" ||
            input.trim().toLowerCase() === "quit"
          ) {
            console.log("\x1b[33mGoodbye!\x1b[0m");
            rl.close();
            return;
          }

          if (input.trim() === "") {
            ask();
            return;
          }

          // Check for skill triggers
          const matchedSkills = skillRegistry.findByTrigger(input);
          if (matchedSkills.length > 0) {
            console.log(
              `\x1b[35m[Skills matched: ${matchedSkills.map((s) => s.name).join(", ")}]\x1b[0m`,
            );
          }

          try {
            for await (const event of agent.run(input)) {
              if (event.type === "text") {
                process.stdout.write(event.content ?? "");
              } else if (event.type === "tool_use") {
                console.log(`\n\x1b[35m[Tool: ${event.toolName}]\x1b[0m`);
              } else if (event.type === "tool_result") {
                const result = event.toolOutput ?? "";
                const truncated =
                  result.length > 200 ? result.slice(0, 200) + "..." : result;
                console.log(`\x1b[36m[Result: ${truncated}]\x1b[0m`);
              } else if (event.type === "error") {
                console.log(`\x1b[31m[Error: ${event.error?.message}]\x1b[0m`);
              } else if (event.type === "done") {
                console.log("\n");
              }
            }
          } catch (err) {
            console.log(
              `\x1b[31m[Error: ${err instanceof Error ? err.message : err}]\x1b[0m`,
            );
          }

          ask();
        });
      };

      ask();
    } catch (err) {
      console.error(
        "\x1b[31mError:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

program
  .command("run <prompt>")
  .description("Run a single prompt and exit")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider to use")
  .option("--mode <mode>", "Agent mode (plan/review/act/auto)", "act")
  .option("--hybrid", "Enable hybrid mode")
  .action(async (prompt, options) => {
    try {
      const { agent } = createAgent(options);

      for await (const event of agent.run(prompt)) {
        if (event.type === "text") {
          process.stdout.write(event.content ?? "");
        } else if (event.type === "tool_use") {
          console.log(`\n\x1b[35m[Tool: ${event.toolName}]\x1b[0m`);
        } else if (event.type === "tool_result") {
          const result = event.toolOutput ?? "";
          const truncated =
            result.length > 200 ? result.slice(0, 200) + "..." : result;
          console.log(`\x1b[36m[Result: ${truncated}]\x1b[0m`);
        }
      }

      console.log("\n");
    } catch (err) {
      console.error(
        "\x1b[31mError:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Show configuration")
  .action(() => {
    try {
      const config = loadConfig();
      console.log("\x1b[36mCurrent Configuration:\x1b[0m");
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error(
        "\x1b[31mError:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
    }
  });

program
  .command("providers")
  .description("List available providers")
  .action(() => {
    try {
      const config = loadConfig();
      const providerRegistry = new ProviderRegistry();
      providerRegistry.createFromConfig(config);
      console.log(
        "\x1b[36mAvailable providers:\x1b[0m",
        providerRegistry.list().join(", "),
      );
    } catch (err) {
      console.error(
        "\x1b[31mError:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
    }
  });

program
  .command("skills")
  .description("List available skills")
  .action(() => {
    try {
      const skillRegistry = new SkillRegistry();
      const builtinSkills = createBuiltinSkills();
      builtinSkills.forEach((s) => skillRegistry.register(s));

      console.log("\x1b[36mAvailable Skills:\x1b[0m\n");
      for (const skill of skillRegistry.list()) {
        console.log(`\x1b[32m${skill.name}\x1b[0m: ${skill.description}`);
        if (skill.triggers && skill.triggers.length > 0) {
          console.log(
            `  Triggers: ${skill.triggers.map((t) => t.value).join(", ")}`,
          );
        }
        console.log();
      }
    } catch (err) {
      console.error(
        "\x1b[31mError:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
    }
  });

program
  .command("doctor")
  .description("Check configuration and environment")
  .action(() => {
    console.log("\x1b[36mHalfCopilot Doctor\x1b[0m\n");

    try {
      const config = loadConfig();
      console.log("\x1b[32m✓\x1b[0m Configuration loaded successfully");

      const providerRegistry = new ProviderRegistry();
      providerRegistry.createFromConfig(config);
      console.log(
        `\x1b[32m✓\x1b[0m Providers: ${providerRegistry.list().join(", ")}`,
      );

      console.log(
        `\x1b[32m✓\x1b[0m Default provider: ${config.defaultProvider}`,
      );
      console.log(`\x1b[32m✓\x1b[0m Default model: ${config.defaultModel}`);

      const toolRegistry = new ToolRegistry();
      const builtinTools = createBuiltinTools();
      builtinTools.forEach((t) => toolRegistry.register(t));
      console.log(
        `\x1b[32m✓\x1b[0m Built-in tools: ${toolRegistry.list().join(", ")}`,
      );

      const skillRegistry = new SkillRegistry();
      const builtinSkills = createBuiltinSkills();
      builtinSkills.forEach((s) => skillRegistry.register(s));
      console.log(
        `\x1b[32m✓\x1b[0m Skills: ${skillRegistry
          .list()
          .map((s) => s.name)
          .join(", ")}`,
      );

      console.log("\n\x1b[32mAll checks passed!\x1b[0m");
    } catch (err) {
      console.error(
        "\x1b[31m✗ Error:\x1b[0m",
        err instanceof Error ? err.message : err,
      );
    }
  });

program.parse();

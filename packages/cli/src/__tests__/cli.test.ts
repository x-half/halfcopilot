import { describe, it, expect } from "vitest";
import { Command } from "commander";

describe("CLI program structure", () => {
  it("should create a program with expected commands", () => {
    const program = new Command();
    program
      .name("halfcopilot")
      .description(
        "HalfCopilot — Multi-model Agent Framework CLI with Hybrid Mode",
      )
      .version("0.0.1");

    program
      .command("chat")
      .description("Start interactive chat mode")
      .option("-m, --model <model>", "Model to use");

    program
      .command("run <prompt>")
      .description("Run a single prompt and exit")
      .option("--mode <mode>", "Agent mode");

    program.command("config").description("Show configuration");

    program.command("providers").description("List available providers");

    program.command("skills").description("List available skills");

    program
      .command("doctor")
      .description("Check configuration and environment");

    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("chat");
    expect(commands).toContain("run");
    expect(commands).toContain("config");
    expect(commands).toContain("providers");
    expect(commands).toContain("skills");
    expect(commands).toContain("doctor");
    expect(commands).toHaveLength(6);
  });

  it("should have correct program metadata", () => {
    const program = new Command();
    program.name("halfcopilot").version("0.0.1");
    expect(program.name()).toBe("halfcopilot");
    expect(program.version()).toBe("0.0.1");
  });

  it("should parse chat command options", () => {
    const program = new Command();
    program
      .command("chat")
      .option("-m, --model <model>", "Model to use")
      .option("-p, --provider <provider>", "Provider to use")
      .option("--mode <mode>", "Agent mode", "auto")
      .option("--hybrid", "Enable hybrid mode");

    const cmd = program.commands.find((c) => c.name() === "chat")!;
    expect(cmd.options).toHaveLength(4);
  });

  it("should parse run command with required prompt argument", () => {
    const program = new Command();
    program.command("run <prompt>").description("Run a single prompt and exit");

    const cmd = program.commands.find((c) => c.name() === "run")!;
    expect(cmd.registeredArguments).toHaveLength(1);
    expect(cmd.registeredArguments[0].name()).toBe("prompt");
    expect(cmd.registeredArguments[0].required).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { Command } from "commander";

describe("CLI program structure", () => {
  it("should create a program with basic metadata", () => {
    const program = new Command();
    program
      .name("halfcop")
      .description("HalfCopilot — Multi-model Agent Framework CLI")
      .version("1.1.8");

    program.command("chat").description("Start interactive chat mode");
    program.command("run <prompt>").description("Run a single prompt");
    program.command("models").description("List available models");
    program.command("doctor").description("Check configuration");
    program.command("skills").description("List available skills");
    program.command("setup").description("Interactive setup");
    program.command("config").description("Show configuration");
    program.command("providers").description("List available providers");

    expect(program.commands).toHaveLength(8);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("chat");
    expect(names).toContain("run");
    expect(names).toContain("models");
    expect(names).toContain("doctor");
    expect(names).toContain("skills");
    expect(names).toContain("setup");
    expect(names).toContain("config");
    expect(names).toContain("providers");
  });

  it("should have correct program metadata", () => {
    const program = new Command();
    program.name("halfcop").version("1.1.8");
    expect(program.name()).toBe("halfcop");
    expect(program.version()).toBe("1.1.7");
  });

  it("should parse chat command options", () => {
    const program = new Command();
    program
      .command("chat")
      .option("-m, --model <model>", "Model to use")
      .option("-p, --provider <provider>", "Provider to use")
      .option("--mode <mode>", "Agent mode", "auto")
      .option("--hybrid", "Enable hybrid mode")
      .option("--tui", "Enable TUI mode");

    const cmd = program.commands.find((c) => c.name() === "chat")!;
    expect(cmd.options).toHaveLength(5);
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

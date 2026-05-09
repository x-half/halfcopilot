import type { ChatEvent, ContentBlock, ToolDef } from "@halfcopilot/provider";
import type { AgentConfig, AgentEvent, AgentMode } from "./types.js";
import { AgentState } from "./types.js";
import { ConversationManager } from "./conversation.js";

const PLAN_SAFE_TOOLS = ["file_read", "grep", "glob", "list_files"];

export class AgentLoop {
  private config: AgentConfig;
  private currentMode: AgentMode;
  private currentState: AgentState = AgentState.IDLE;
  private turnCount = 0;
  private toolRetryCount = 0;
  private maxToolRetries = 1;
  private conversation: ConversationManager;
  private providerName: string;
  private modelName: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.currentMode = config.mode ?? "auto";
    this.conversation = new ConversationManager({
      maxMessages: 100,
      compactionThreshold: 50,
    });
    this.providerName = config.providerName ?? "unknown";
    this.modelName = config.model ?? "unknown";
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    this.conversation.addUserMessage(userMessage);
    this.turnCount = 0;
    this.toolRetryCount = 0;
    this.currentState = AgentState.THINKING;
    yield { type: "state_change", state: AgentState.THINKING };

    while (this.turnCount < this.config.maxTurns) {
      this.turnCount++;
      let hasToolUse = false;
      let fullText = "";
      let toolUses: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];
      let toolResults: Array<{ id: string; output: string; isError: boolean }> =
        [];

      const messages = this.conversation.buildMessages(this.getSystemPrompt());
      const tools = this.config.tools.definitions();
      const filteredTools =
        this.currentMode === "plan" ? this.filterPlanTools(tools) : tools;

      let stream: AsyncGenerator<ChatEvent> | null = null;
      for (let attempt = 0; attempt <= 3; attempt++) {
        try {
          stream = this.config.provider.chat({
            model: this.config.model,
            messages,
            tools: filteredTools,
            systemPrompt: undefined,
            maxTokens: 16384,
          });
          break;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3 && this.isRetryable(error)) {
            const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
            yield {
              type: "text",
              content: `\n[provider retry ${attempt + 1}/3 after ${Math.round(delay)}ms]\n`,
            };
            await new Promise((r) => setTimeout(r, delay));
          } else {
            this.currentState = AgentState.ERROR;
            yield { type: "state_change", state: AgentState.ERROR };
            yield { type: "error", error };
            return;
          }
        }
      }

      try {
        for await (const event of stream!) {
          if (event.type === "text") {
            fullText += event.content;
            yield { type: "text", content: event.content };
          }

          if (event.type === "thinking") {
            yield { type: "thinking", content: event.content };
          }

          if (event.type === "tool_use") {
            hasToolUse = true;
            const toolName = event.name;
            const toolInput = event.input;

            yield { type: "tool_use", toolName, toolInput };
            toolUses.push({ id: event.id, name: toolName, input: toolInput });

            if (
              this.currentMode === "plan" &&
              !PLAN_SAFE_TOOLS.includes(toolName)
            ) {
              const msg = `Tool "${toolName}" not allowed in plan mode.`;
              yield { type: "tool_result", toolName, toolOutput: msg };
              toolResults.push({ id: event.id, output: msg, isError: true });
              continue;
            }

            this.currentState = AgentState.TOOL_CALLING;
            yield { type: "state_change", state: AgentState.TOOL_CALLING };

            try {
              const result = await this.config.executor.execute(
                toolName,
                toolInput,
                {
                  projectRoot: process.cwd(),
                  workingDirectory: process.cwd(),
                  signal: new AbortController().signal,
                  sessionId: "default",
                },
              );

              yield {
                type: "tool_result",
                toolName,
                toolOutput: result.output,
              };
              toolResults.push({
                id: event.id,
                output: result.output,
                isError: !!result.error,
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              yield { type: "tool_result", toolName, toolOutput: errorMsg };
              toolResults.push({
                id: event.id,
                output: errorMsg,
                isError: true,
              });
            }

            this.currentState = AgentState.THINKING;
            yield { type: "state_change", state: AgentState.THINKING };
          }

          if (event.type === "done") {
            this.conversation.addTokenUsage(event.usage);

            if (hasToolUse) {
              const blocks: ContentBlock[] = [];
              if (fullText) blocks.push({ type: "text", text: fullText });
              for (const tu of toolUses) {
                blocks.push({
                  type: "tool_use",
                  id: tu.id,
                  name: tu.name,
                  input: tu.input,
                });
              }
              this.conversation.addAssistantMessage(blocks);

              for (const tr of toolResults) {
                this.conversation.addToolResult(tr.id, tr.output, tr.isError);
              }
            } else if (fullText) {
              this.conversation.addAssistantMessage(fullText);
            }

            if (!hasToolUse) {
              this.currentState = AgentState.IDLE;
              yield { type: "state_change", state: AgentState.IDLE };
              yield { type: "done", usage: event.usage };
              return;
            }

            break;
          }

          if (event.type === "error") {
            this.currentState = AgentState.ERROR;
            yield { type: "state_change", state: AgentState.ERROR };
            yield { type: "error", error: event.error };
            return;
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (/timeout|timedout|abort/i.test(error.message)) {
          this.currentState = AgentState.TIMEOUT;
          yield { type: "state_change", state: AgentState.TIMEOUT };
        } else {
          this.currentState = AgentState.ERROR;
          yield { type: "state_change", state: AgentState.ERROR };
        }
        yield { type: "error", error };
        return;
      }

      if (hasToolUse && this.toolRetryCount < this.maxToolRetries) {
        const retryableErrors = toolResults.filter(
          (tr) => tr.isError && this.isToolErrorRetryable(tr.output),
        );
        if (retryableErrors.length > 0) {
          this.toolRetryCount++;
          this.turnCount--;
          yield {
            type: "text",
            content: `\n[auto-retry: ${retryableErrors.length} tool(s) returned fixable errors]\n`,
          };
          this.conversation.addUserMessage(
            `The previous tool call(s) returned errors. Please fix the approach and retry:\n${retryableErrors.map((tr) => `- ${tr.id}: ${tr.output.substring(0, 300)}`).join("\n")}`,
          );
          continue;
        }
      }
    }

    this.currentState = AgentState.IDLE;
    yield { type: "state_change", state: AgentState.IDLE };
    yield {
      type: "warning",
      content: `Max turns (${this.config.maxTurns}) reached. The task may be incomplete.`,
    };
    yield { type: "done", usage: this.conversation.getTotalUsage() };
  }

  getMode(): AgentMode {
    return this.currentMode;
  }

  setMode(mode: AgentMode): void {
    this.currentMode = mode;
  }

  getState(): AgentState {
    return this.currentState;
  }

  private isRetryable(error: Error): boolean {
    const msg = error.message;
    return /429|5\d{2}|timeout|econnreset|etimedout|socket|network|econnrefused/i.test(
      msg,
    );
  }

  private isToolErrorRetryable(output: string): boolean {
    const lower = output.toLowerCase();
    return (
      lower.includes("enoent") ||
      lower.includes("not found") ||
      lower.includes("no such") ||
      lower.includes("does not exist") ||
      lower.includes("is a directory") ||
      lower.includes("eisdir") ||
      lower.includes("permission denied") ||
      lower.includes("eacces") ||
      lower.includes("eexist") ||
      lower.includes("file already exists")
    );
  }

  private getSystemPrompt(): string {
    const basePrompt =
      this.config.systemPrompt ??
      `You are HalfCopilot, an AI assistant built by half, powered by ${this.modelName} (${this.providerName}).

You have access to tools: file_read, file_write, file_edit, bash, grep, glob.
Reply in the same language as the user. Be concise and direct.`;

    let prompt = basePrompt;

    prompt += `\n\n## Session
- Model: ${this.modelName} (${this.providerName})
- Mode: ${this.currentMode}
- Built by: half`;

    if (this.currentMode === "plan") {
      prompt +=
        "\n\nYou are in PLAN mode. Only read/search tools allowed. Present a plan, no file writes or commands.";
    }

    return prompt;
  }

  private filterPlanTools(tools: ToolDef[] | undefined): ToolDef[] | undefined {
    if (!tools) return undefined;
    return tools.filter((t: ToolDef) => PLAN_SAFE_TOOLS.includes(t.name));
  }
}

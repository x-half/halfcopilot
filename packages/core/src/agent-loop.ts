import type { ChatEvent } from '@halfcopilot/provider';
import type { AgentConfig, AgentEvent, AgentMode } from './types.js';
import { AgentState } from './types.js';
import { ConversationManager } from './conversation.js';

const PLAN_SAFE_TOOLS = ['file_read', 'grep', 'glob', 'list_files'];

export class AgentLoop {
  private config: AgentConfig;
  private currentMode: AgentMode;
  private currentState: AgentState = AgentState.IDLE;
  private turnCount = 0;
  private conversation: ConversationManager;
  private providerName: string;
  private modelName: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.currentMode = config.mode ?? 'auto';
    this.conversation = new ConversationManager({ maxMessages: 100 });
    this.providerName = config.providerName ?? 'unknown';
    this.modelName = config.model ?? 'unknown';
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    this.conversation.addUserMessage(userMessage);
    this.turnCount = 0;
    this.currentState = AgentState.THINKING;

    yield { type: 'state_change', state: AgentState.THINKING };

    while (this.turnCount < this.config.maxTurns) {
      this.turnCount++;
      let hasToolUse = false;

      const messages = this.conversation.buildMessages(this.getSystemPrompt());
      const tools = this.config.tools.definitions();
      const stream = this.config.provider.chat({
        model: this.config.model,
        messages,
        tools: this.currentMode === 'plan' ? this.filterPlanTools(tools) : tools,
        systemPrompt: undefined,
        maxTokens: 16384,
      });

      let fullText = '';

      for await (const event of stream) {
        if (event.type === 'text') {
          fullText += event.content;
          yield { type: 'text', content: event.content };
        }

        if (event.type === 'thinking') {
          yield { type: 'thinking', content: event.content };
        }

        if (event.type === 'tool_use') {
          hasToolUse = true;
          const toolName = event.name;
          const toolInput = event.input;

          yield { type: 'tool_use', toolName, toolInput };

          if (this.currentMode === 'plan' && !PLAN_SAFE_TOOLS.includes(toolName)) {
            const msg = `Tool "${toolName}" is not allowed in plan mode. Switch to act mode to execute.`;
            yield { type: 'tool_result', toolName, toolOutput: msg };
            this.conversation.addToolResult(event.id, msg, true);
            continue;
          }

          this.currentState = AgentState.TOOL_CALLING;
          yield { type: 'state_change', state: AgentState.TOOL_CALLING };

          try {
            const result = await this.config.executor.execute(toolName, toolInput, {
              projectRoot: process.cwd(),
              workingDirectory: process.cwd(),
              signal: new AbortController().signal,
              sessionId: 'default',
            });

            yield { type: 'tool_result', toolName, toolOutput: result.output };
            this.conversation.addToolResult(event.id, result.output, !!result.error);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            yield { type: 'tool_result', toolName, toolOutput: errorMsg };
            this.conversation.addToolResult(event.id, errorMsg, true);
          }

          this.currentState = AgentState.THINKING;
          yield { type: 'state_change', state: AgentState.THINKING };
        }

        if (event.type === 'done') {
          this.conversation.addTokenUsage(event.usage);
          if (!hasToolUse) {
            if (fullText) {
              this.conversation.addAssistantMessage(fullText);
            }
            this.currentState = AgentState.IDLE;
            yield { type: 'state_change', state: AgentState.IDLE };
            yield { type: 'done', usage: event.usage };
            return;
          }
        }

        if (event.type === 'error') {
          this.currentState = AgentState.ERROR;
          yield { type: 'state_change', state: AgentState.ERROR };
          yield { type: 'error', error: event.error };
          return;
        }
      }
    }

    this.currentState = AgentState.IDLE;
    yield { type: 'state_change', state: AgentState.IDLE };
    yield { type: 'done', usage: this.conversation.getTotalUsage() };
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

  private getSystemPrompt(): string {
    const basePrompt = this.config.systemPrompt ?? `You are HalfCopilot, a helpful AI coding assistant powered by the ${this.modelName} model from ${this.providerName}.

You have access to the following tools:
- file_read: Read file contents
- file_write: Write file contents
- file_edit: Edit file contents
- bash: Execute shell commands
- grep: Search for patterns in files
- glob: Find files matching patterns

When helping users, be concise and direct. Always explain what you're doing and why.`;

    let prompt = basePrompt;

    // Add model information
    prompt += `\n\n## Current Session Information
- Model: ${this.modelName}
- Provider: ${this.providerName}
- Mode: ${this.currentMode}

You are currently using the ${this.modelName} model provided by ${this.providerName}.`;

    if (this.currentMode === 'plan') {
      prompt += '\n\nYou are currently in PLAN mode. You can only read files and search the codebase. You cannot write files or execute commands. Analyze the situation and present a plan.';
    }

    return prompt;
  }

  private filterPlanTools(tools: any[] | undefined): any[] | undefined {
    if (!tools) return undefined;
    return tools.filter((t: any) => PLAN_SAFE_TOOLS.includes(t.name));
  }
}

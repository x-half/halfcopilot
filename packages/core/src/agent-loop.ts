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
      let toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let toolResults: Array<{ id: string; output: string; isError: boolean }> = [];

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
          toolUses.push({ id: event.id, name: toolName, input: toolInput });

          if (this.currentMode === 'plan' && !PLAN_SAFE_TOOLS.includes(toolName)) {
            const msg = `Tool "${toolName}" not allowed in plan mode.`;
            yield { type: 'tool_result', toolName, toolOutput: msg };
            toolResults.push({ id: event.id, output: msg, isError: true });
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
            toolResults.push({ id: event.id, output: result.output, isError: !!result.error });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            yield { type: 'tool_result', toolName, toolOutput: errorMsg };
            toolResults.push({ id: event.id, output: errorMsg, isError: true });
          }

          this.currentState = AgentState.THINKING;
          yield { type: 'state_change', state: AgentState.THINKING };
        }

        if (event.type === 'done') {
          this.conversation.addTokenUsage(event.usage);

          if (hasToolUse) {
            // IMPORTANT: add assistant (with tool_calls) FIRST, then tool_results
            const blocks: any[] = [];
            if (fullText) blocks.push({ type: 'text', text: fullText });
            for (const tu of toolUses) {
              blocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
            }
            this.conversation.addAssistantMessage(blocks);

            // Then add tool results after the assistant message
            for (const tr of toolResults) {
              this.conversation.addToolResult(tr.id, tr.output, tr.isError);
            }
          } else if (fullText) {
            this.conversation.addAssistantMessage(fullText);
          }

          if (!hasToolUse) {
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
    const basePrompt = this.config.systemPrompt ?? `You are HalfCopilot, an AI assistant built by half, powered by ${this.modelName} (${this.providerName}).

You have access to tools: file_read, file_write, file_edit, bash, grep, glob.
Reply in the same language as the user. Be concise and direct.`;

    let prompt = basePrompt;

    prompt += `\n\n## Session
- Model: ${this.modelName} (${this.providerName})
- Mode: ${this.currentMode}
- Built by: half | https://github.com/xujinke/halfcopilot`;

    if (this.currentMode === 'plan') {
      prompt += '\n\nYou are in PLAN mode. Only read/search tools allowed. Present a plan, no file writes or commands.';
    }

    return prompt;
  }

  private filterPlanTools(tools: any[] | undefined): any[] | undefined {
    if (!tools) return undefined;
    return tools.filter((t: any) => PLAN_SAFE_TOOLS.includes(t.name));
  }
}

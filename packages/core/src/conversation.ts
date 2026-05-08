import type { Message, TokenUsage } from '@halfcopilot/provider';

export interface ConversationConfig {
  maxMessages: number;
  compactionThreshold?: number;
}

export class ConversationManager {
  private messages: Message[] = [];
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private config: ConversationConfig;

  constructor(config: ConversationConfig) {
    this.config = config;
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
    this.enforceLimit();
  }

  addAssistantMessage(content: string | Message[]): void {
    if (typeof content === 'string') {
      this.messages.push({ role: 'assistant', content });
    } else {
      this.messages.push({ role: 'assistant', content: content as any });
    }
    this.enforceLimit();
  }

  addToolResult(toolUseId: string, output: string, isError = false): void {
    this.messages.push({
      role: 'tool_result',
      toolUseId,
      content: output,
      isError,
    });
    this.enforceLimit();
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  buildMessages(systemPrompt?: string): Message[] {
    const msgs: Message[] = [];
    if (systemPrompt) {
      msgs.push({ role: 'system', content: systemPrompt });
    }
    msgs.push(...this.messages);
    return msgs;
  }

  addTokenUsage(usage: TokenUsage): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
  }

  private enforceLimit(): void {
    while (this.messages.length > this.config.maxMessages) {
      const idx = this.messages.findIndex(
        (m) => m.role === 'user' || m.role === 'assistant'
      );
      if (idx >= 0) {
        this.messages.splice(idx, 1);
      } else {
        break;
      }
    }
  }
}

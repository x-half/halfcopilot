import type { Message, TokenUsage, ContentBlock } from "@halfcopilot/provider";

export interface ConversationConfig {
  maxMessages: number;
  maxTokens?: number;
  compactionThreshold?: number;
}

export class ConversationManager {
  private messages: Message[] = [];
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private config: Required<ConversationConfig>;
  private systemPrompt?: string;

  constructor(config: ConversationConfig) {
    this.config = {
      maxMessages: config.maxMessages,
      maxTokens: config.maxTokens ?? 128000,
      compactionThreshold: config.compactionThreshold ?? 50,
    };
  }

  private estimateTokens(text: string): number {
    const cjkCount = (text.match(/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/g) || []).length;
    const nonCjkText = text.replace(/[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/g, " ");
    const words = nonCjkText.split(/\s+/).filter(Boolean).length;
    return Math.ceil(cjkCount * 1.5 + words * 1.3);
  }

  getTokenCount(): number {
    let total = 0;
    for (const msg of this.messages) {
      if (typeof msg.content === "string") {
        total += this.estimateTokens(msg.content);
      } else {
        for (const block of msg.content) {
          if (block.type === "text") {
            total += this.estimateTokens(block.text);
          } else if (block.type === "tool_use") {
            total += this.estimateTokens(block.name);
            total += this.estimateTokens(JSON.stringify(block.input));
          } else if (block.type === "thinking") {
            total += this.estimateTokens(block.text);
          }
        }
      }
    }
    return total;
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
    this.enforceLimit();
  }

  addAssistantMessage(content: string | ContentBlock[]): void {
    if (typeof content === "string") {
      this.messages.push({ role: "assistant", content });
    } else {
      this.messages.push({ role: "assistant", content });
    }
    this.enforceLimit();
  }

  addToolResult(toolUseId: string, output: string, isError = false): void {
    this.messages.push({
      role: "tool_result",
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
    const sp = systemPrompt ?? this.systemPrompt;
    if (sp) {
      msgs.push({ role: "system", content: sp });
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

  compact(): void {
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      if (
        msg.role === "tool_result" &&
        typeof msg.content === "string" &&
        msg.content.length > 1000
      ) {
        this.messages[i] = {
          ...msg,
          content: msg.content.substring(0, 1000) + "\n...[truncated]",
        };
      }
    }

    const targetTokens = Math.floor(this.config.maxTokens * 0.9);
    while (
      (this.getTokenCount() > targetTokens ||
        this.messages.length > this.config.maxMessages) &&
      this.messages.length > 1
    ) {
      const idx = this.findMessageToDrop();
      if (idx === -1) break;
      this.messages.splice(idx, 1);
    }
  }

  private findMessageToDrop(): number {
    const len = this.messages.length;
    if (len <= 1) return -1;

    const totalTools = this.messages.filter(
      (m) => m.role === "tool_result",
    ).length;

    let toolSeen = 0;
    for (let i = 0; i < len; i++) {
      if (this.messages[i].role === "tool_result") {
        toolSeen++;
        if (toolSeen <= totalTools - 3) {
          return i;
        }
      }
    }

    for (let i = 0; i < len - 2; i++) {
      const msg = this.messages[i];
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        if (msg.content.some((b) => b.type === "tool_use")) {
          return i;
        }
      }
    }

    for (let i = 1; i < len - 1; i++) {
      const msg = this.messages[i];
      if (
        msg.role === "user" ||
        (msg.role === "assistant" && typeof msg.content === "string")
      ) {
        return i;
      }
    }

    return -1;
  }

  private enforceLimit(): void {
    if (
      this.config.compactionThreshold > 0 &&
      this.messages.length >= this.config.compactionThreshold
    ) {
      this.compact();
      return;
    }

    if (this.getTokenCount() > this.config.maxTokens) {
      this.compact();
      return;
    }

    while (this.messages.length > this.config.maxMessages) {
      const idx = this.messages.findIndex(
        (m) => m.role === "user" || m.role === "assistant",
      );
      if (idx >= 0) {
        this.messages.splice(idx, 1);
      } else {
        break;
      }
    }
  }
}

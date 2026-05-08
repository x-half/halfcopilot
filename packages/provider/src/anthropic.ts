import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';
import type { ChatParams, ChatEvent, Message, ToolDef, ProviderCapabilities } from './types.js';
import type { ProviderConfig } from '@halfcopilot/config';
import { resolveEnvVar } from '@halfcopilot/shared';

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly capabilities: ProviderCapabilities;
  private client: Anthropic;

  constructor(options: { apiKey: string; models?: Record<string, unknown> }) {
    super();
    this.client = new Anthropic({ apiKey: resolveEnvVar(options.apiKey) });
    this.capabilities = {
      toolUse: true,
      streaming: true,
      thinking: true,
      promptCaching: true,
      contextWindow: 200000,
      maxOutputTokens: 16384,
    };
  }

  static fromConfig(config: ProviderConfig): AnthropicProvider {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      models: config.models,
    });
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const { system, messages } = this.convertMessages(params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens ?? 16384,
      system: params.systemPrompt
        ? [{ type: 'text' as const, text: params.systemPrompt }]
        : system,
      messages,
      tools,
      temperature: params.temperature,
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let currentToolCall: { id: string; name: string; input: string } | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: '',
          };
        }
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta.thinking };
        }
        if (event.delta.type === 'input_json_delta' && currentToolCall) {
          currentToolCall.input += event.delta.partial_json;
        }
      }

      if (event.type === 'content_block_stop' && currentToolCall) {
        try {
          yield {
            type: 'tool_use',
            id: currentToolCall.id,
            name: currentToolCall.name,
            input: JSON.parse(currentToolCall.input),
          };
        } catch {
          yield {
            type: 'tool_use',
            id: currentToolCall.id,
            name: currentToolCall.name,
            input: {},
          };
        }
        currentToolCall = null;
      }

      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
      }

      if (event.type === 'message_delta') {
        outputTokens += event.usage?.output_tokens ?? 0;
      }
    }

    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }

  convertMessages(messages: Message[]): {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
  } {
    const system: Anthropic.TextBlockParam[] = [];
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system.push({ type: 'text', text: msg.content });
        continue;
      }
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
          continue;
        }
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            blocks.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            blocks.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
        result.push({ role: 'assistant', content: blocks });
        continue;
      }
      if (msg.role === 'tool_result') {
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolUseId,
            content: msg.content,
            is_error: msg.isError,
          }],
        });
        continue;
      }
    }

    return { system, messages: result };
  }

  convertTools(tools: ToolDef[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }
}

import OpenAI from "openai";
import { BaseProvider } from "./base.js";
import type {
  ChatParams,
  ChatEvent,
  Message,
  ToolDef,
  ProviderCapabilities,
} from "./types.js";
import type { ProviderConfig, ModelConfig } from "@halfcopilot/config";
import { resolveEnvVar } from "@halfcopilot/shared";

interface OpenAIProviderOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  models?: Record<string, ModelConfig>;
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  private client: OpenAI;
  private models: Record<string, ModelConfig>;

  constructor(options: OpenAIProviderOptions) {
    super();
    this.name = options.name;
    this.models = options.models ?? {};
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: resolveEnvVar(options.apiKey),
    });

    const firstModel = Object.values(this.models)[0];
    this.capabilities = {
      toolUse: true,
      streaming: true,
      thinking: false,
      promptCaching: false,
      contextWindow: firstModel?.contextWindow ?? 128000,
      maxOutputTokens: firstModel?.maxOutput ?? 8192,
    };
  }

  static fromConfig(
    name: string,
    config: ProviderConfig,
  ): OpenAICompatibleProvider {
    if (!config.baseUrl) {
      throw new Error(
        `OpenAI-compatible provider "${name}" requires a baseUrl`,
      );
    }
    return new OpenAICompatibleProvider({
      name,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      models: config.models,
    });
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const messages = this.convertMessages(params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: params.systemPrompt
        ? [
            { role: "system" as const, content: params.systemPrompt },
            ...messages,
          ]
        : messages,
      tools: tools as OpenAI.ChatCompletionTool[] | undefined,
      stream: true,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    });

    let currentToolCall: { id: string; name: string; args: string } | null =
      null;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        yield { type: "text", content: delta.content };
      }

      const reasoningContent = (delta as Record<string, unknown>)
        ?.reasoning_content as string | undefined;
      if (reasoningContent) {
        yield { type: "thinking", content: reasoningContent };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            if (currentToolCall) {
              try {
                yield {
                  type: "tool_use",
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: JSON.parse(currentToolCall.args),
                };
              } catch {
                yield {
                  type: "tool_use",
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: {},
                };
              }
            }
            currentToolCall = {
              id: tc.id,
              name: tc.function?.name ?? "",
              args: "",
            };
          }
          if (tc.function?.arguments && currentToolCall) {
            currentToolCall.args += tc.function.arguments;
          }
        }
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    if (currentToolCall) {
      try {
        yield {
          type: "tool_use",
          id: currentToolCall.id,
          name: currentToolCall.name,
          input: JSON.parse(currentToolCall.args),
        };
      } catch {
        yield {
          type: "tool_use",
          id: currentToolCall.id,
          name: currentToolCall.name,
          input: {},
        };
      }
    }

    yield { type: "done", usage: { inputTokens, outputTokens } };
  }

  convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "system" as const, content: msg.content };
      }
      if (msg.role === "user") {
        return { role: "user" as const, content: msg.content };
      }
      if (msg.role === "assistant") {
        if (typeof msg.content === "string") {
          return { role: "assistant" as const, content: msg.content };
        }
        const textParts: string[] = [];
        const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
        for (const block of msg.content) {
          if (block.type === "text") {
            textParts.push(block.text);
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }
        return {
          role: "assistant" as const,
          content: textParts.join("") || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
      }
      if (msg.role === "tool_result") {
        return {
          role: "tool" as const,
          tool_call_id: msg.toolUseId,
          content: msg.content,
        } as OpenAI.ChatCompletionToolMessageParam;
      }
      return { role: "user" as const, content: String(msg) };
    });
  }

  convertTools(tools: ToolDef[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}

// ---- Message Types ----

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ThinkingContent {
  type: "thinking";
  text: string;
}

export type ContentBlock = TextContent | ToolUseContent | ThinkingContent;

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string | ContentBlock[];
}

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface ToolResultMessage {
  role: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage;

// ---- Chat Types ----

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  messages: Message[];
  tools?: ToolDef[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type ChatEvent =
  | { type: "text"; content: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; output: string }
  | { type: "thinking"; content: string }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; error: Error };

// ---- Provider Capabilities ----

export interface ProviderCapabilities {
  toolUse: boolean;
  streaming: boolean;
  thinking: boolean;
  promptCaching: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

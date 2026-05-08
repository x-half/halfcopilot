/**
 * HalfCopilot Provider 接口定义
 * 
 * Provider 层负责与各大模型提供商 API 交互
 * 支持 OpenAI 兼容轨和 Anthropic 原生轨
 */

// ==================== 基础类型 ====================

/**
 * 消息角色
 */
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 文本内容块
 */
interface TextContent {
  type: 'text';
  text: string;
}

/**
 * 工具调用结果
 */
interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text: string }>;
  is_error: boolean;
}

/**
 * 工具调用请求
 */
interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * 思考内容 (Claude thinking)
 */
interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  signature: string;
}

/**
 * 消息内容 (可以是字符串或内容块数组)
 */
type MessageContent = string | Array<TextContent | ToolResultContent | ToolUseContent | ThinkingContent>;

/**
 * 对话消息
 */
interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;  // tool 调用时需要
  tool_call_id?: string;  // tool 结果时需要
}

/**
 * 工具定义
 */
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Token 使用统计
 */
interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_write_input_tokens?: number;
}

// ==================== 事件类型 ====================

/**
 * 文本流事件
 */
interface TextStreamEvent {
  type: 'text';
  content: string;
  snapshot?: string;  // 完整文本快照（用于重绘）
}

/**
 * 工具调用事件
 */
interface ToolUseEvent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  partial?: boolean;  // 是否未完整接收
}

/**
 * 思考事件
 */
interface ThinkingEvent {
  type: 'thinking';
  content: string;
  signature?: string;
}

/**
 * 完成事件
 */
interface DoneEvent {
  type: 'done';
  usage: TokenUsage;
  stop_reason?: 'stop' | 'tool_use' | 'max_tokens' | 'end_turn';
}

/**
 * 错误事件
 */
interface ErrorEvent {
  type: 'error';
  error: Error;
  retryable?: boolean;
}

/**
 * 所有聊天事件类型
 */
type ChatEvent = TextStreamEvent | ToolUseEvent | ThinkingEvent | DoneEvent | ErrorEvent;

// ==================== Provider 接口 ====================

/**
 * 聊天参数
 */
interface ChatParams {
  /** 模型名称 */
  model: string;
  /** 消息历史 */
  messages: Message[];
  /** 工具定义列表 */
  tools?: ToolDefinition[];
  /** 系统提示词 */
  systemPrompt?: string;
  /** 温度 (0-2) */
  temperature?: number;
  /** 最大输出 token */
  maxTokens?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 停用词 */
  stopSequences?: string[];
  /** 顶级采样参数 */
  topP?: number;
  /** 种子 (可复现) */
  seed?: number;
}

/**
 * Provider 能力信息
 */
interface ProviderCapabilities {
  /** 支持 tool_use */
  supportsToolUse: boolean;
  /** 支持流式输出 */
  supportsStreaming: boolean;
  /** 支持思考模式 */
  supportsThinking: boolean;
  /** 支持视觉输入 */
  supportsVision: boolean;
  /** 支持缓存 (Claude prompt caching) */
  supportsCaching: boolean;
}

/**
 * 模型信息
 */
interface ModelInfo {
  /** 模型 ID */
  id: string;
  /** 显示名称 */
  displayName: string;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 最大输出 token */
  maxOutput: number;
  /** 是否支持 tool_use */
  supportsToolUse: boolean;
  /** 是否支持 vision */
  supportsVision: boolean;
  /** 价格 (每百万 token) */
  pricing?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

/**
 * Provider 配置
 */
interface ProviderConfig {
  /** Provider 类型 */
  type: 'openai-compatible' | 'anthropic';
  /** API 基础 URL */
  baseUrl?: string;
  /** API Key (或 env:VAR_NAME) */
  apiKey: string;
  /** 模型配置 */
  models?: Record<string, Partial<ModelInfo>>;
  /** 额外 headers */
  headers?: Record<string, string>;
  /** 超时 (ms) */
  timeout?: number;
  /** 重试次数 */
  retries?: number;
}

/**
 * Provider 抽象接口
 */
interface Provider {
  /** Provider 名称 (如 'deepseek', 'anthropic') */
  readonly name: string;
  
  /** Provider 类型 */
  readonly type: 'openai-compatible' | 'anthropic';
  
  /** 获取能力信息 */
  getCapabilities(): ProviderCapabilities;
  
  /** 获取可用模型列表 */
  getModels(): Promise<ModelInfo[]>;
  
  /** 获取模型上下文窗口 */
  getContextWindow(model: string): number;
  
  /** 获取模型最大输出 */
  getMaxOutput(model: string): number;
  
  /**
   * 聊天接口 (流式)
   * @returns AsyncGenerator 产生聊天事件流
   */
  chat(params: ChatParams): AsyncGenerator<ChatEvent>;
  
  /**
   * 聊天接口 (非流式)
   * @returns 完整响应
   */
  chatComplete?(params: ChatParams): Promise<{
    content: MessageContent;
    usage: TokenUsage;
    stopReason: string;
  }>;
  
  /** 验证 API Key 是否有效 */
  validate(): Promise<boolean>;
}

// ==================== Provider 注册表 ====================

/**
 * Provider 工厂函数
 */
type ProviderFactory = (config: ProviderConfig) => Provider;

/**
 * Provider 注册表
 */
interface ProviderRegistry {
  /** 注册 Provider */
  register(name: string, factory: ProviderFactory): void;
  
  /** 获取 Provider */
  get(name: string, config: ProviderConfig): Provider;
  
  /** 列出所有已注册 Provider */
  list(): string[];
  
  /** 检查是否已注册 */
  has(name: string): boolean;
}

// ==================== 实现示例 ====================

/**
 * OpenAI 兼容 Provider 实现示例
 */
class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  readonly type: 'openai-compatible' = 'openai-compatible';
  
  private baseUrl: string;
  private apiKey: string;
  private models: Record<string, ModelInfo>;
  
  constructor(config: ProviderConfig) {
    this.name = config.baseUrl ? new URL(config.baseUrl).hostname : 'openai';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;
    this.models = config.models || {};
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      supportsToolUse: true,
      supportsStreaming: true,
      supportsThinking: false,
      supportsVision: false,
      supportsCaching: false,
    };
  }
  
  async getModels(): Promise<ModelInfo[]> {
    // 实现获取模型列表逻辑
    return Object.entries(this.models).map(([id, info]) => ({
      id,
      displayName: info.displayName || id,
      contextWindow: info.contextWindow || 4096,
      maxOutput: info.maxOutput || 2048,
      supportsToolUse: info.supportsToolUse ?? true,
      supportsVision: info.supportsVision ?? false,
    }));
  }
  
  getContextWindow(model: string): number {
    return this.models[model]?.contextWindow || 4096;
  }
  
  getMaxOutput(model: string): number {
    return this.models[model]?.maxOutput || 2048;
  }
  
  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    // 实现流式聊天逻辑
    // 这里省略具体实现，实际需要使用 fetch/axios 调用 API
    yield {
      type: 'text',
      content: 'Hello',
    };
    yield {
      type: 'done',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }
  
  async validate(): Promise<boolean> {
    try {
      await this.chat({
        model: Object.keys(this.models)[0] || 'default',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Anthropic Provider 实现示例
 */
class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  readonly type: 'anthropic' = 'anthropic';
  
  private apiKey: string;
  private baseUrl: string;
  
  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      supportsToolUse: true,
      supportsStreaming: true,
      supportsThinking: true,
      supportsVision: true,
      supportsCaching: true,
    };
  }
  
  async getModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxOutput: 16384,
        supportsToolUse: true,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        contextWindow: 200000,
        maxOutput: 16384,
        supportsToolUse: true,
        supportsVision: true,
      },
    ];
  }
  
  getContextWindow(model: string): number {
    // Claude 所有模型都是 200K
    return 200000;
  }
  
  getMaxOutput(model: string): number {
    return 16384;
  }
  
  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    // 实现 Anthropic API 流式聊天
    // 需要处理 tool_use 和 thinking 块
    yield {
      type: 'text',
      content: 'Hello from Claude',
    };
    yield {
      type: 'done',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }
  
  async validate(): Promise<boolean> {
    // 实现验证逻辑
    return true;
  }
}

// ==================== 导出 ====================

export type {
  MessageRole,
  Message,
  MessageContent,
  TextContent,
  ToolResultContent,
  ToolUseContent,
  ThinkingContent,
  ToolDefinition,
  TokenUsage,
  ChatParams,
  ChatEvent,
  TextStreamEvent,
  ToolUseEvent,
  ThinkingEvent,
  DoneEvent,
  ErrorEvent,
  ProviderCapabilities,
  ModelInfo,
  ProviderConfig,
  Provider,
  ProviderFactory,
  ProviderRegistry,
};

export {
  OpenAICompatibleProvider,
  AnthropicProvider,
};
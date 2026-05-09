import type { ChatParams, ChatEvent, ProviderCapabilities } from "./types.js";

export interface Provider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  chat(params: ChatParams): AsyncGenerator<ChatEvent>;
  supportsToolUse(): boolean;
  supportsStreaming(): boolean;
}

export abstract class BaseProvider implements Provider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  abstract chat(params: ChatParams): AsyncGenerator<ChatEvent>;

  supportsToolUse(): boolean {
    return this.capabilities.toolUse;
  }

  supportsStreaming(): boolean {
    return this.capabilities.streaming;
  }
}

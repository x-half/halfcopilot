import type {
  Provider,
  ChatParams,
  ChatEvent,
  ProviderCapabilities,
} from "@halfcopilot/provider";
import { TextBlockParser } from "./parser.js";
import { TextBlockToToolCallMapper } from "./mapper.js";

export class HybridProvider implements Provider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  private inner: Provider;
  private parser: TextBlockParser;
  private mapper: TextBlockToToolCallMapper;

  constructor(inner: Provider) {
    this.inner = inner;
    this.name = inner.name;
    this.capabilities = inner.capabilities;
    this.parser = new TextBlockParser();
    this.mapper = new TextBlockToToolCallMapper();
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent> {
    // If provider supports tool_use, pass through directly
    if (this.capabilities.toolUse) {
      yield* this.inner.chat(params);
      return;
    }

    // Inject text block protocol into system prompt
    const enhancedParams = this.injectTextBlockProtocol(params);

    // Call underlying provider
    let fullText = "";
    for await (const event of this.inner.chat(enhancedParams)) {
      if (event.type === "text") {
        fullText += event.content;
        yield event; // Still pass through text stream to TUI
      } else {
        yield event;
      }
    }

    // Parse text blocks and convert to tool_use events
    const result = this.parser.parse(fullText);
    for (const block of result.blocks) {
      try {
        const toolCall = this.mapper.map(block);
        yield {
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        };
      } catch (error) {
        yield {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }
  }

  supportsToolUse(): boolean {
    return this.capabilities.toolUse;
  }

  supportsStreaming(): boolean {
    return this.capabilities.streaming;
  }

  private injectTextBlockProtocol(params: ChatParams): ChatParams {
    const protocolPrompt = `You can use the following text blocks to perform actions:

\`\`\`read
path: /path/to/file
\`\`\`

\`\`\`edit
path: /path/to/file
\`\`\`
old content
>>>>>>> REPLACE
new content
\`\`\`

\`\`\`create
path: /path/to/new/file
\`\`\`
file content
\`\`\`

\`\`\`run
command: shell command here
\`\`\`

\`\`\`search
pattern: regex pattern
glob: **/*.ts
\`\`\`

\`\`\`glob
pattern: src/**/*.ts
\`\`\`

You can also use inline commands:
- !command - Run a shell command
- @path - Read a file

Use these blocks when you need to read files, edit code, create files, run commands, or search the codebase.`;

    return {
      ...params,
      messages: [
        { role: "system", content: protocolPrompt },
        ...params.messages,
      ],
    };
  }
}

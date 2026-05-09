import type { TextBlock } from "./parser.js";
import { generateId } from "@halfcopilot/shared";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class TextBlockToToolCallMapper {
  private readonly mapping: Record<string, (block: TextBlock) => ToolCall> = {
    read: (block) => ({
      id: generateId(),
      name: "file_read",
      input: { path: block.params.path },
    }),
    edit: (block) => ({
      id: generateId(),
      name: "file_edit",
      input: {
        path: block.params.path,
        oldText: block.params._oldContent,
        newText: block.params._newContent,
      },
    }),
    create: (block) => ({
      id: generateId(),
      name: "file_write",
      input: { path: block.params.path, content: block.body },
    }),
    run: (block) => ({
      id: generateId(),
      name: "bash",
      input: {
        command: block.params.command,
        timeout: block.params.timeout
          ? parseInt(block.params.timeout)
          : undefined,
      },
    }),
    search: (block) => ({
      id: generateId(),
      name: "grep",
      input: {
        pattern: block.params.pattern,
        glob: block.params.glob,
      },
    }),
    glob: (block) => ({
      id: generateId(),
      name: "glob",
      input: { pattern: block.params.pattern },
    }),
  };

  map(block: TextBlock): ToolCall {
    const mapper = this.mapping[block.type];
    if (!mapper) {
      throw new Error(`Unknown text block type: ${block.type}`);
    }
    return mapper(block);
  }
}

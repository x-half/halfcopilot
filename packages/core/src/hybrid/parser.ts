export type TextBlockType = 'read' | 'edit' | 'create' | 'run' | 'search' | 'glob';

export interface TextBlock {
  type: TextBlockType;
  params: Record<string, string>;
  body?: string;
  source: {
    line: number;
    column: number;
  };
}

export interface TextPart {
  text: string;
  line: number;
}

export interface ParseError {
  message: string;
  line: number;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  blocks: TextBlock[];
  textParts: TextPart[];
  errors: ParseError[];
}

export class TextBlockParser {
  private readonly BLOCK_START = /^```(read|edit|create|run|search|glob)\s*$/;
  private readonly BLOCK_END = /^```\s*$/;
  private readonly PARAM_LINE = /^(\w+):\s*(.+)$/;
  private readonly EDIT_SEPARATOR = /^>>>>>>> REPLACE$/;
  private readonly INLINE_RUN = /^!\s*(.+)$/;
  private readonly INLINE_READ = /^@\s*(.+)$/;

  parse(text: string): ParseResult {
    const blocks: TextBlock[] = [];
    const textParts: TextPart[] = [];
    const errors: ParseError[] = [];

    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      // Try inline commands first
      const inlineRun = this.INLINE_RUN.exec(lines[i]);
      if (inlineRun) {
        blocks.push({
          type: 'run',
          params: { command: inlineRun[1].trim() },
          source: { line: i + 1, column: 1 },
        });
        i++;
        continue;
      }

      const inlineRead = this.INLINE_READ.exec(lines[i]);
      if (inlineRead) {
        blocks.push({
          type: 'read',
          params: { path: inlineRead[1].trim() },
          source: { line: i + 1, column: 1 },
        });
        i++;
        continue;
      }

      // Try to match text block start
      const startMatch = this.BLOCK_START.exec(lines[i]);

      if (startMatch) {
        const blockType = startMatch[1] as TextBlockType;
        const startLine = i;

        // Extract parameters
        const params: Record<string, string> = {};
        i++;
        while (i < lines.length && this.PARAM_LINE.test(lines[i])) {
          const [, key, value] = this.PARAM_LINE.exec(lines[i])!;
          params[key] = value.trim();
          i++;
        }

        // Extract body
        let body = '';
        const bodyLines: string[] = [];
        while (i < lines.length && !this.BLOCK_END.test(lines[i])) {
          bodyLines.push(lines[i]);
          i++;
        }

        if (i < lines.length) {
          body = bodyLines.join('\n');
          i++; // Skip closing ```
        } else {
          errors.push({
            message: `Unclosed text block starting at line ${startLine + 1}`,
            line: startLine + 1,
            severity: 'warning',
          });
        }

        // Handle EDIT type special body
        if (blockType === 'edit') {
          const parsed = this.parseEditBody(body);
          params._oldContent = parsed.oldContent;
          params._newContent = parsed.newContent;
        }

        blocks.push({
          type: blockType,
          params,
          body,
          source: { line: startLine + 1, column: 1 },
        });
      } else {
        textParts.push({ text: lines[i], line: i });
        i++;
      }
    }

    return { blocks, textParts, errors };
  }

  private parseEditBody(body: string): { oldContent: string; newContent: string } {
    const separator = this.EDIT_SEPARATOR;
    const lines = body.split('\n');
    const oldLines: string[] = [];
    const newLines: string[] = [];
    let foundSeparator = false;

    for (const line of lines) {
      if (separator.test(line)) {
        foundSeparator = true;
        continue;
      }
      if (foundSeparator) {
        newLines.push(line);
      } else {
        oldLines.push(line);
      }
    }

    if (!foundSeparator) {
      // No separator, treat entire body as new content (create file semantics)
      return { oldContent: '', newContent: body };
    }

    return {
      oldContent: oldLines.join('\n'),
      newContent: newLines.join('\n'),
    };
  }

  hasTextBlocks(text: string): boolean {
    return this.BLOCK_START.test(text) || this.INLINE_RUN.test(text) || this.INLINE_READ.test(text);
  }
}

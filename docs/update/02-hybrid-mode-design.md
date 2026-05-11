# 混合模式设计：文本解析回退

> 当模型不支持 `tool_use` API 时，HalfCopilot 通过解析模型输出的文本块来提取工具调用。
> 这是多模型支持的核心差异化功能，必须优先实现。

---

## 1. 问题背景

| 模型 | 原生 tool_use | 需要文本回退 |
|------|:------------:|:----------:|
| Anthropic Claude | ✅ | 否 |
| OpenAI GPT-4 | ✅ | 否 |
| DeepSeek V3 | ✅ | 否 |
| DeepSeek V2 | ❌ | 是 |
| MiniMax | 部分 | 是 |
| Qwen (部分版本) | ❌ | 是 |
| 小米 MiMo | ❌ | 是 |
| 本地模型 (Ollama) | 大部分不支持 | 是 |

**结论：** 没有文本回退，多模型支持就是空话。

---

## 2. 文本块协议 (Text Block Protocol)

### 2.1 设计原则

1. **简洁明了**：文本块语法必须让模型容易学习，用户也能看懂
2. **无歧义**：解析器必须能 100% 确定地识别文本块边界
3. **容错性**：模型输出格式略有偏差时仍能正确解析
4. **可组合**：一个回复中可以包含多个文本块 + 多段自然语言

### 2.2 文本块类型

#### 读取文件 (READ)

```
```read
path: /path/to/file
```
```

#### 编辑文件 (EDIT)

```
```edit
path: /path/to/file
```
old content here
```
>>>>>>> REPLACE
```
new content here
```
>>>>>>> REPLACE
```
```

#### 创建文件 (CREATE)

```
```create
path: /path/to/new/file
```
file content here
```
```

#### 运行命令 (RUN)

```
```run
command: pnpm test
timeout: 30000
```
```

#### 搜索 (SEARCH)

```
```search
pattern: import.*from
glob: **/*.ts
output: files_with_matches
```
```

#### 全局搜索 (GLOB)

```
```glob
pattern: src/**/*.test.ts
```
```

### 2.3 文本块格式规范

```typescript
interface TextBlock {
  type: 'read' | 'edit' | 'create' | 'run' | 'search' | 'glob';
  params: Record<string, string>;  // YAML-like key: value 头部
  body?: string;                   // 可选的正文内容
  source: {                        // 原始位置，用于错误报告
    line: number;
    column: number;
  };
}
```

---

## 3. 解析器设计

### 3.1 解析流程

```
模型输出文本
    │
    ▼
[文本块检测] ──无文本块──→ 纯文本回复，直接输出
    │
    │ 有文本块
    ▼
[文本块提取] → 逐个提取 TextBlock
    │
    ▼
[参数解析] → 解析 YAML 头部 + 正文
    │
    ▼
[转换为 ToolCall] → 映射到统一的 ToolCall 接口
    │
    ▼
[权限检查] → 走标准权限流程
    │
    ▼
[执行] → 调用对应 Tool
```

### 3.2 解析器实现

```typescript
class TextBlockParser {
  private readonly BLOCK_START = /^```(read|edit|create|run|search|glob)\s*$/;
  private readonly BLOCK_END = /^```\s*$/;
  private readonly PARAM_LINE = /^(\w+):\s*(.+)$/;
  private readonly EDIT_SEPARATOR = /^>>>>>>> REPLACE$/;

  parse(text: string): ParseResult {
    const blocks: TextBlock[] = [];
    const textParts: TextPart[] = [];
    const errors: ParseError[] = [];

    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      // 尝试匹配文本块开始
      const startMatch = this.BLOCK_START.exec(lines[i]);

      if (startMatch) {
        const blockType = startMatch[1] as TextBlock['type'];
        const startLine = i;

        // 提取参数（key: value 行）
        const params: Record<string, string> = {};
        i++;
        while (i < lines.length && this.PARAM_LINE.test(lines[i])) {
          const [, key, value] = this.PARAM_LINE.exec(lines[i])!;
          params[key] = value.trim();
          i++;
        }

        // 提取正文
        let body = '';
        const bodyLines: string[] = [];
        while (i < lines.length && !this.BLOCK_END.test(lines[i])) {
          bodyLines.push(lines[i]);
          i++;
        }

        if (i < lines.length) {
          body = bodyLines.join('\n');
          i++; // 跳过结束 ```
        } else {
          errors.push({
            message: `Unclosed text block starting at line ${startLine + 1}`,
            line: startLine + 1,
          });
        }

        // 处理 EDIT 类型的特殊正文（含 >>>>>>> REPLACE 分隔符）
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
      // 没有 >>>>>>> REPLACE，整个 body 作为新内容（创建文件语义）
      return { oldContent: '', newContent: body };
    }

    return {
      oldContent: oldLines.join('\n'),
      newContent: newLines.join('\n'),
    };
  }
}
```

### 3.3 文本块到 ToolCall 的映射

```typescript
class TextBlockToToolCallMapper {
  private readonly mapping: Record<string, (block: TextBlock) => ToolCall> = {
    read: (block) => ({
      id: generateId(),
      name: 'file_read',
      input: { path: block.params.path },
    }),
    edit: (block) => ({
      id: generateId(),
      name: 'file_edit',
      input: {
        path: block.params.path,
        old_string: block.params._oldContent,
        new_string: block.params._newContent,
      },
    }),
    create: (block) => ({
      id: generateId(),
      name: 'file_write',
      input: { path: block.params.path, content: block.body },
    }),
    run: (block) => ({
      id: generateId(),
      name: 'bash',
      input: {
        command: block.params.command,
        timeout: block.params.timeout ? parseInt(block.params.timeout) : undefined,
      },
    }),
    search: (block) => ({
      id: generateId(),
      name: 'grep',
      input: {
        pattern: block.params.pattern,
        glob: block.params.glob,
        output_mode: block.params.output || 'files_with_matches',
      },
    }),
    glob: (block) => ({
      id: generateId(),
      name: 'glob',
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
```

---

## 4. HybridProvider 设计

### 4.1 Provider 能力声明

```typescript
interface ProviderCapabilities {
  /** 是否支持原生 tool_use API */
  toolUse: boolean;

  /** 是否支持流式输出 */
  streaming: boolean;

  /** 是否支持 thinking/extended thinking */
  thinking: boolean;

  /** 是否支持 prompt caching */
  promptCaching: boolean;

  /** 上下文窗口大小 */
  contextWindow: number;

  /** 最大输出 token 数 */
  maxOutputTokens: number;
}
```

### 4.2 HybridProvider 包装器

```typescript
class HybridProvider implements Provider {
  constructor(
    private inner: Provider,
    private parser: TextBlockParser,
    private mapper: TextBlockToToolCallMapper,
  ) {}

  get capabilities(): ProviderCapabilities {
    return this.inner.capabilities;
  }

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
    // 如果 provider 支持 tool_use，直接透传
    if (this.inner.capabilities.toolUse) {
      yield* this.inner.chat(params);
      return;
    }

    // 不支持 tool_use：注入文本块协议到 system prompt
    const enhancedParams = this.injectTextBlockProtocol(params);

    // 调用底层 provider
    let fullText = '';
    for await (const event of this.inner.chat(enhancedParams)) {
      if (event.type === 'text_delta') {
        fullText += event.text;
        yield event; // 仍然透传文本流给 TUI
      } else {
        yield event;
      }
    }

    // 解析文本块，转换为 tool_use 事件
    const result = this.parser.parse(fullText);
    for (const block of result.blocks) {
      try {
        const toolCall = this.mapper.map(block);
        yield {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        };
      } catch (error) {
        yield {
          type: 'parse_error',
          block,
          error: error.message,
        };
      }
    }
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

Use these blocks when you need to read files, edit code, create files, run commands, or search the codebase.`;

    return {
      ...params,
      messages: [
        { role: 'system', content: protocolPrompt },
        ...params.messages,
      ],
    };
  }
}
```

---

## 5. System Prompt 注入策略

### 5.1 协议说明在 System Prompt 中的位置

文本块协议说明应插入 System Prompt 的**开头**，在项目上下文之前。原因：

1. 模型对 System Prompt 开头部分的注意力权重更高
2. 工具使用是最基础的能力，应优先建立
3. 与项目上下文无关，不会干扰

### 5.2 Few-shot 示例

在协议说明后附加 1-2 个 few-shot 示例，提高模型遵循格式的准确率：

```
When you need to read a file, use:
\`\`\`read
path: src/index.ts
\`\`\`

When you need to edit a file, use:
\`\`\`edit
path: src/utils.ts
\`\`\`
export function oldFunction() {
  return 1;
}
>>>>>>> REPLACE
export function newFunction() {
  return 2;
}
\`\`\`
```

### 5.3 Token 开销估算

- 协议说明：~200 tokens
- Few-shot 示例：~100 tokens
- 总计：~300 tokens

对于上下文窗口 8K+ 的模型，这个开销可以接受。

---

## 6. 容错与降级

### 6.1 解析错误处理

```typescript
interface ParseError {
  message: string;
  line: number;
  severity: 'error' | 'warning';
}

// 策略：
// 1. 未闭合的文本块 → warning，尝试继续解析
// 2. 未知块类型 → warning，跳过该块
// 3. 缺少必要参数 → error，告知模型该块格式不正确
// 4. 正文解析失败（如 edit 无分隔符）→ 降级为 create
```

### 6.2 模型格式漂移

某些模型可能不完全遵循文本块格式。应对策略：

1. **宽松匹配**：允许块类型后跟可选参数（如 ````edit path:/foo``` 单行格式）
2. **单行命令**：支持 `!command` 简写作为 `run` 的替代
3. **重试提示**：解析失败时，将错误信息追加到对话中，让模型修正格式

```typescript
// 单行命令支持
const INLINE_RUN = /^!\s*(.+)$/;  // !pnpm test → run: pnpm test
const INLINE_READ = /^@\s*(.+)$/;  // @src/foo.ts → read: src/foo.ts
```

---

## 7. 测试策略

### 7.1 解析器单元测试

```typescript
describe('TextBlockParser', () => {
  it('should parse a single read block', () => { /* ... */ });
  it('should parse a single edit block with separator', () => { /* ... */ });
  it('should parse a create block with body', () => { /* ... */ });
  it('should parse a run block with timeout param', () => { /* ... */ });
  it('should parse multiple blocks interleaved with text', () => { /* ... */ });
  it('should handle unclosed blocks with error', () => { /* ... */ });
  it('should handle edit without separator as create', () => { /* ... */ });
  it('should handle empty body', () => { /* ... */ });
  it('should handle nested code blocks (triple backtick in body)', () => { /* ... */ });
  it('should parse inline ! commands', () => { /* ... */ });
  it('should parse inline @ file references', () => { /* ... */ });
});
```

### 7.2 映射器单元测试

```typescript
describe('TextBlockToToolCallMapper', () => {
  it('should map read block to file_read tool call', () => { /* ... */ });
  it('should map edit block to file_edit tool call', () => { /* ... */ });
  it('should map create block to file_write tool call', () => { /* ... */ });
  it('should map run block to bash tool call', () => { /* ... */ });
  it('should map search block to grep tool call', () => { /* ... */ });
  it('should map glob block to glob tool call', () => { /* ... */ });
  it('should throw for unknown block types', () => { /* ... */ });
});
```

### 7.3 HybridProvider 集成测试

```typescript
describe('HybridProvider', () => {
  it('should pass through when provider supports tool_use', async () => { /* ... */ });
  it('should inject protocol prompt when provider lacks tool_use', async () => { /* ... */ });
  it('should parse text blocks from model output and emit tool_use events', async () => { /* ... */ });
  it('should emit parse_error for malformed blocks', async () => { /* ... */ });
  it('should handle mixed text and tool_use events', async () => { /* ... */ });
});
```

---

## 8. 实现优先级

| 优先级 | 任务 | 预计工时 |
|--------|------|---------|
| P0 | TextBlockParser 核心解析器 | 4h |
| P0 | TextBlockToToolCallMapper 映射器 | 2h |
| P0 | HybridProvider 包装器 | 3h |
| P1 | System Prompt 注入 + Few-shot | 2h |
| P1 | 容错与降级（宽松匹配、单行命令） | 3h |
| P2 | 重试提示（格式错误时自动修正） | 2h |
| P2 | 性能优化（流式解析，不等全文完成） | 3h |
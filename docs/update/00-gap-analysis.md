# HalfCopilot 文档差距分析与一致性修复

> 本文档梳理现有 `docs/specs/` 和 `docs/plans/` 之间的所有不一致，并给出统一方案。
> Agent 在实现时以本文档为准，覆盖旧文档中的冲突定义。

---

## 1. 命名风格不一致：TokenUsage 字段

| 文档 | input 字段 | output 字段 |
|------|-----------|-------------|
| `plans/halfcopilot-design.md` | `inputTokens` | `outputTokens` |
| `specs/provider-interface.ts` | `input_tokens` | `output_tokens` |
| `plans/halfcopilot-implementation.md` | `inputTokens` | `outputTokens` |

**决议：统一为 camelCase**（TypeScript 惯例）

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;   // Anthropic 专用
  cacheWriteTokens?: number;  // Anthropic 专用
}
```

**修复动作：** 更新 `specs/provider-interface.ts`，将 snake_case 改为 camelCase。

---

## 2. 权限模型三档 vs 二档

| 文档 | 权限级别 |
|------|---------|
| `specs/tool-system.md` | `safe` / `warn` / `unsafe` |
| `specs/security-model.md` | `safe` / `warn` / `unsafe`（含详细规则） |
| `plans/halfcopilot-implementation.md` | `safe: boolean`（只有二档） |

**决议：采用三档模型，与安全规格对齐**

```typescript
enum PermissionLevel {
  SAFE = 'safe',     // 自动批准：file_read, grep, glob, list_files
  WARN = 'warn',     // 首次会话确认：file_write, file_edit, notebook_edit
  UNSAFE = 'unsafe', // 每次确认：bash, delete_file
}

interface Tool {
  // ... 其他字段
  permissionLevel: PermissionLevel;  // 替代 safe: boolean
}
```

**修复动作：**
1. 更新 `Tool` 接口，用 `permissionLevel: PermissionLevel` 替代 `safe: boolean`
2. `PermissionChecker` 增加 `sessionApprovedTools: Set<string>` 实现会话级缓存
3. 更新 `PermissionChecker.check()` 逻辑：
   - `SAFE` → 直接通过
   - `WARN` → 首次请求用户确认，之后会话内自动通过
   - `UNSAFE` → 每次请求用户确认

---

## 3. Tool 接口精简过度

| 规格定义 | 实施计划 | 缺失 |
|---------|---------|------|
| `permissionLevel: PermissionLevel` | `safe: boolean` | 权限粒度 |
| `toProviderFormat()` | 无 | 模型适配 |
| `ToolContext` (projectRoot, signal, workingDirectory) | 无 | 上下文传递 |
| `ToolResult` (output, error, metadata) | `Promise<string>` | 结构化返回 |

**决议：恢复完整 Tool 接口**

```typescript
interface ToolContext {
  projectRoot: string;
  workingDirectory: string;
  signal: AbortSignal;
  sessionId: string;
  config: ResolvedConfig;
}

interface ToolResult {
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
  permissionLevel: PermissionLevel;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  toProviderFormat?(): ProviderToolDefinition;  // 可选，用于模型适配
}
```

---

## 4. Config 缺少 security 配置

`specs/security-model.md` 定义了完整的 `security` 配置节，但实施计划的 `ConfigSchema` 中完全缺失。

**决议：补充 security 配置**

```typescript
const SecuritySchema = z.object({
  permissionModel: z.enum(['ask', 'auto-safe', 'auto-all']).default('ask'),
  autoApprove: z.array(z.string()).default([]),       // 工具名 glob
  neverApprove: z.array(z.string()).default([]),       // 工具名 glob
  protectedPaths: z.array(z.string()).default([
    '/etc', '/System', '~/.ssh', '~/.gnupg'
  ]),
  sensitivePatterns: z.array(z.string()).default([
    '.env', '.env.*', '*.pem', '*.key', '*credentials*'
  ]),
  audit: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('~/.halfcopilot/audit.log'),
  }).default({}),
  sandbox: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(['docker', 'none']).default('none'),
  }).default({}),
});
```

在 `ConfigSchema` 中添加：`security: SecuritySchema.default({})`

---

## 5. AgentMode 缺少 review 模式

| 文档 | 模式定义 |
|------|---------|
| `specs/cli-commands.md` | Plan / Act / Review |
| `plans/halfcopilot-design.md` | Plan / Act |
| `plans/halfcopilot-implementation.md` | `'plan' \| 'act' \| 'auto'` |

**决议：统一为四档**

```typescript
enum AgentMode {
  PLAN = 'plan',       // 只读：file_read, grep, glob
  REVIEW = 'review',   // 审阅：file_read, grep, glob, diff（只读但可运行 diff）
  ACT = 'act',         // 完整权限：所有工具
  AUTO = 'auto',       // 自动切换：先 Plan 再 Act
}
```

各模式的工具白名单：

| 工具 | plan | review | act | auto |
|------|------|--------|-----|------|
| file_read | ✅ | ✅ | ✅ | ✅ |
| grep | ✅ | ✅ | ✅ | ✅ |
| glob | ✅ | ✅ | ✅ | ✅ |
| diff | ❌ | ✅ | ✅ | ✅ |
| file_write | ❌ | ❌ | ✅ | ✅ |
| file_edit | ❌ | ❌ | ✅ | ✅ |
| bash | ❌ | ❌ | ✅ | ✅ |

---

## 6. Anthropic Provider 流式 tool_use 事件时序问题

实施计划中 Anthropic Provider 在 `stream.finalMessage()` 后才处理所有 tool_use 事件，导致工具调用在流式输出末尾才出现，用户体验差。

**决议：流式处理 tool_use content blocks**

```typescript
// 改进方案：在流式循环中实时检测 tool_use content block
for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    // 开始收集 tool_use 参数
    currentToolCall = { id: event.content_block.id, name: event.content_block.name, input: '' };
  }
  if (event.type === 'content_block_delta' && currentToolCall) {
    // 追加参数片段
    currentToolCall.input += event.delta.partial_json;
  }
  if (event.type === 'content_block_stop' && currentToolCall) {
    // tool_use 完成，立即 yield
    yield { type: 'tool_use', ...currentToolCall, input: JSON.parse(currentToolCall.input) };
    currentToolCall = null;
  }
  // text 事件照常处理
}
```

---

## 7. ConversationCompactor 循环依赖

Compactor 需要 Provider 来生成摘要，但它是 AgentLoop 的内部组件，而 AgentLoop 持有 Provider。这造成循环：Compactor → Provider → AgentLoop → Compactor。

**决议：依赖注入，Compactor 接受摘要函数而非 Provider 实例**

```typescript
interface CompactorOptions {
  summarize: (messages: Message[]) => Promise<string>;
  maxTokens: number;
  compactThreshold: number;  // 触发压缩的 token 比例，默认 0.8
}

class ConversationCompactor {
  constructor(private options: CompactorOptions) {}

  async compact(messages: Message[], currentTokens: number): Promise<Message[]> {
    if (currentTokens < this.options.maxTokens * this.options.compactThreshold) {
      return messages;
    }
    // 保留 system + 首尾消息，压缩中间部分
    const summary = await this.options.summarize(messages.slice(1, -2));
    return [
      messages[0],  // system
      { role: 'assistant', content: `[对话摘要] ${summary}` },
      ...messages.slice(-2),  // 最近的交互
    ];
  }
}
```

---

## 8. package-lock.json 与 pnpm-lock.yaml 共存

**决议：删除 `package-lock.json`，添加到 `.gitignore`**

```bash
rm package-lock.json
echo "package-lock.json" >> .gitignore
```

---

## 9. 缺失的 ESLint / CI 配置

**决议：在 Phase 1 补充**

- 添加 `eslint.config.mjs`（flat config）
- 添加 `.prettierrc`
- 添加 `.github/workflows/ci.yml`（lint + test + build）
- `turbo.json` 中增加 lint pipeline

---

## 10. 汇总：需更新的旧文档

| 旧文档 | 修改内容 |
|-------|---------|
| `specs/provider-interface.ts` | TokenUsage 字段改 camelCase |
| `specs/tool-system.md` | 确认与本文档一致的 Tool 接口 |
| `specs/security-model.md` | 确认与本文档一致的 security config |
| `plans/halfcopilot-implementation.md` | 权限改三档、Tool 接口补全、AgentMode 改四档 |

**优先级：** Agent 实现时以 `docs/update/` 下的文档为准。旧文档仅作参考，冲突处以本文档决议为准。
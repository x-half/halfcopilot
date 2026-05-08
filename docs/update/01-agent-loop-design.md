# Agent Loop 详细设计

> 本文档是 HalfCopilot 核心引擎的完整设计，覆盖状态机、对话管理、工具调度、
> 错误恢复和流式输出。Agent 实现此模块时应以本文档为主参考。

---

## 1. 核心架构

```
┌─────────────────────────────────────────────────┐
│                    CLI / TUI                     │
├─────────────────────────────────────────────────┤
│                  Agent Loop                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │  Planner   │ │ Executor  │ │   Observer    │  │
│  │(模式切换)  │ │(工具调度) │ │(结果评估)     │  │
│  └─────┬─────┘ └─────┬─────┘ └───────┬───────┘  │
│        │             │               │          │
│  ┌─────┴─────────────┴───────────────┴───────┐  │
│  │          Conversation Manager             │  │
│  │  ┌─────────────┐  ┌──────────────────┐    │  │
│  │  │  Messages    │  │  Compactor       │    │  │
│  │  │  Store       │  │  (上下文压缩)    │    │  │
│  │  └─────────────┘  └──────────────────┘    │  │
│  └───────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  Provider Layer  │  Tool System  │  Memory      │
└─────────────────────────────────────────────────┘
```

---

## 2. Agent Loop 状态机

### 2.1 状态定义

```typescript
enum AgentState {
  IDLE = 'idle',               // 等待用户输入
  THINKING = 'thinking',       // 模型推理中
  TOOL_CALLING = 'tool_calling', // 等待工具执行
  TOOL_APPROVAL = 'tool_approval', // 等待用户审批
  COMPACTING = 'compacting',   // 上下文压缩中
  ERROR = 'error',             // 错误状态
  PAUSED = 'paused',           // 用户暂停
}
```

### 2.2 状态转换

```
IDLE ──(user input)──→ THINKING
THINKING ──(text response)──→ IDLE
THINKING ──(tool_use)──→ TOOL_APPROVAL (if needs approval)
THINKING ──(tool_use)──→ TOOL_CALLING (if auto-approved)
TOOL_APPROVAL ──(approve)──→ TOOL_CALLING
TOOL_APPROVAL ──(reject)──→ THINKING (inform model of rejection)
TOOL_APPROVAL ──(cancel)──→ IDLE
TOOL_CALLING ──(result)──→ THINKING
TOOL_CALLING ──(error, retryable)──→ TOOL_CALLING (retry)
TOOL_CALLING ──(error, fatal)──→ ERROR
THINKING ──(token limit near)──→ COMPACTING
COMPACTING ──(done)──→ THINKING
任何状态 ──(Ctrl+C)──→ PAUSED
PAUSED ──(resume)──→ IDLE
ERROR ──(retry)──→ THINKING
ERROR ──(abort)──→ IDLE
```

### 2.3 Agent Loop 主循环伪代码

```typescript
class AgentLoop {
  private state: AgentState = AgentState.IDLE;
  private abortController: AbortController | null = null;

  async *run(userInput: string): AsyncGenerator<AgentEvent> {
    this.abortController = new AbortController();
    const context: ToolContext = this.createContext();

    // 添加用户消息
    this.conversation.addUserMessage(userInput);

    while (this.state !== AgentState.IDLE || this.shouldContinue()) {
      switch (this.state) {
        case AgentState.IDLE:
          // 首轮或工具结果后继续
          if (this.hasPendingToolResults()) {
            this.state = AgentState.THINKING;
          } else {
            return; // 等待下一轮用户输入
          }
          break;

        case AgentState.THINKING: {
          yield { type: 'state_change', state: AgentState.THINKING };

          // 检查是否需要压缩
          if (this.shouldCompact()) {
            this.state = AgentState.COMPACTING;
            break;
          }

          // 调用模型
          const stream = this.provider.chat({
            messages: this.conversation.getMessages(),
            tools: this.getAvailableTools(),
            signal: this.abortController.signal,
          });

          let hasToolCall = false;
          for await (const event of this.processStream(stream, context)) {
            if (event.type === 'tool_use') {
              hasToolCall = true;
              const approval = await this.checkPermission(event.tool, context);
              if (approval === 'approved' || approval === 'session_approved') {
                this.state = AgentState.TOOL_CALLING;
                yield* this.executeTool(event, context);
                this.state = AgentState.THINKING; // 继续循环
              } else if (approval === 'rejected') {
                this.conversation.addToolResult(event.id, 'User rejected this tool call');
                this.state = AgentState.THINKING;
                yield { type: 'tool_rejected', toolName: event.name };
              } else {
                // 需要用户审批
                this.state = AgentState.TOOL_APPROVAL;
                yield { type: 'approval_required', tool: event };
                const decision = await this.waitForApproval(event);
                // 处理审批结果...
              }
            } else {
              yield event; // 透传 text/delta 事件
            }
          }

          if (!hasToolCall) {
            this.state = AgentState.IDLE;
          }
          break;
        }

        case AgentState.COMPACTING: {
          yield { type: 'state_change', state: AgentState.COMPACTING };
          await this.conversation.compact();
          this.state = AgentState.THINKING;
          break;
        }

        case AgentState.ERROR: {
          yield { type: 'error', error: this.lastError };
          return;
        }
      }
    }
  }
}
```

---

## 3. 对话管理 (Conversation Manager)

### 3.1 消息结构

```typescript
interface Message {
  id: string;                    // 唯一标识，用于追踪和压缩
  role: 'system' | 'user' | 'assistant' | 'tool_result';
  content: string | ContentBlock[];
  timestamp: number;
  metadata?: {
    tokens?: number;             // 该消息的 token 数
    model?: string;              // 生成该消息的模型
    toolName?: string;           // tool_result 关联的工具名
    duration?: number;           // 工具执行耗时(ms)
  };
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; output: string; error?: string };
```

### 3.2 对话压缩策略

```typescript
interface CompactStrategy {
  /** 触发压缩的 token 使用比例（相对于模型上下文窗口） */
  threshold: number;  // 默认 0.75

  /** 保留的最近消息数（不压缩） */
  keepRecent: number; // 默认 4

  /** 保留的首部消息数（system + 早期重要上下文） */
  keepHead: number;   // 默认 1 (system message)

  /** 压缩方法 */
  method: 'summarize' | 'truncate' | 'sliding_window';
}
```

**压缩流程：**

1. 检查 `currentTokens / maxTokens > threshold`
2. 分割消息为三段：`head`（首部）、`middle`（压缩目标）、`tail`（最近）
3. 对 `middle` 段调用 Provider 生成摘要
4. 用摘要消息替换 `middle` 段
5. 重新计算 token 数

**降级策略：** 如果摘要 API 调用失败，回退到 `truncate`（直接截断中间消息，保留首尾）。

### 3.3 会话持久化

```typescript
interface SessionStore {
  save(sessionId: string, messages: Message[]): Promise<void>;
  load(sessionId: string): Promise<Message[] | null>;
  list(): Promise<string[]>;
  delete(sessionId: string): Promise<void>;
}
```

存储位置：`~/.halfcopilot/sessions/{sessionId}.json`

---

## 4. 工具调度器 (Tool Executor)

### 4.1 执行流程

```
Tool Request → Permission Check → [Approval?] → Execute → [Retry?] → Result
                                     ↓ reject              ↓ error
                              Inform Model         Retry up to N times
                                                     then inform model
```

### 4.2 并发与超时

```typescript
interface ToolExecutionOptions {
  /** 单个工具超时（毫秒） */
  timeout: number;           // 默认 120_000 (2 分钟)
  /** 最大并发工具数 */
  maxConcurrency: number;    // 默认 1（串行，安全优先）
  /** 重试次数 */
  maxRetries: number;        // 默认 2
  /** 重试退避策略 */
  retryBackoff: 'fixed' | 'exponential';  // 默认 'exponential'
}
```

**V1 策略：串行执行，安全优先。** 并发工具调用留作 V2 特性。

### 4.3 工具结果格式化

```typescript
function formatToolResult(result: ToolResult, toolName: string): string {
  if (result.error) {
    return `[ERROR] ${toolName}: ${result.error}`;
  }
  // 截断过长输出
  const MAX_OUTPUT = 50_000; // 字符
  if (result.output.length > MAX_OUTPUT) {
    const head = result.output.slice(0, MAX_OUTPUT / 2);
    const tail = result.output.slice(-MAX_OUTPUT / 2);
    return `${head}\n\n... [truncated ${result.output.length - MAX_OUTPUT} chars] ...\n\n${tail}`;
  }
  return result.output;
}
```

---

## 5. Plan/Act 模式切换

### 5.1 模式定义

```typescript
interface ModeConfig {
  name: AgentMode;
  allowedTools: string[];     // 允许的工具名列表
  description: string;
  switchRequiresConfirmation: boolean;
}

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  plan: {
    name: 'plan',
    allowedTools: ['file_read', 'grep', 'glob', 'list_files'],
    description: '只读模式，仅可读取文件和搜索',
    switchRequiresConfirmation: false,  // plan → 其他模式需确认
  },
  review: {
    name: 'review',
    allowedTools: ['file_read', 'grep', 'glob', 'list_files', 'diff'],
    description: '审阅模式，可查看文件和运行 diff',
    switchRequiresConfirmation: false,
  },
  act: {
    name: 'act',
    allowedTools: ['*'],  // 所有工具
    description: '完整权限，可读写文件和执行命令',
    switchRequiresConfirmation: true,
  },
  auto: {
    name: 'auto',
    allowedTools: ['*'],  // 所有工具，但自动在 plan/act 间切换
    description: '自动模式，先分析后执行',
    switchRequiresConfirmation: true,
  },
};
```

### 5.2 Auto 模式逻辑

```
用户输入 → 以 plan 模式分析 → 模型决定需要执行操作
  → 请求切换到 act 模式 → 用户确认 → 执行操作
  → 操作完成 → 自动回到 plan 模式 → 继续分析
```

模型通过特殊工具 `switch_mode` 请求模式切换：

```typescript
const switchModeTool: Tool = {
  name: 'switch_mode',
  description: 'Request to switch agent mode (e.g., from plan to act)',
  inputSchema: {
    type: 'object',
    properties: {
      targetMode: { type: 'string', enum: ['plan', 'review', 'act'] },
      reason: { type: 'string' },
    },
    required: ['targetMode', 'reason'],
  },
  permissionLevel: PermissionLevel.SAFE,
  execute: async (input, context) => {
    // 触发模式切换审批流程
    return { output: `Mode switch to ${input.targetMode} requested: ${input.reason}` };
  },
};
```

---

## 6. 错误恢复

### 6.1 错误分类

```typescript
enum ErrorCategory {
  PROVIDER_ERROR = 'provider_error',     // API 调用失败
  RATE_LIMIT = 'rate_limit',             // 限流
  TOOL_ERROR = 'tool_error',             // 工具执行失败
  PERMISSION_DENIED = 'permission_denied', // 权限被拒
  CONTEXT_OVERFLOW = 'context_overflow',  // 上下文溢出
  NETWORK_ERROR = 'network_error',       // 网络错误
  INTERNAL = 'internal',                 // 内部错误
}
```

### 6.2 恢复策略

| 错误类型 | 策略 | 最大重试 |
|---------|------|---------|
| `PROVIDER_ERROR` (5xx) | 指数退避重试 | 3 |
| `RATE_LIMIT` | 等待 `retry-after` 头后重试 | 5 |
| `TOOL_ERROR` | 重试 + 简化参数 | 2 |
| `PERMISSION_DENIED` | 不重试，告知模型 | 0 |
| `CONTEXT_OVERFLOW` | 压缩对话后重试 | 1 |
| `NETWORK_ERROR` | 指数退避重试 | 3 |
| `INTERNAL` | 不重试，报告错误 | 0 |

### 6.3 错误事件

```typescript
interface AgentErrorEvent extends AgentEvent {
  type: 'error';
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  retryCount: number;
  maxRetries: number;
}
```

---

## 7. 流式输出协议

### 7.1 事件类型

```typescript
type AgentEvent =
  | { type: 'state_change'; state: AgentState }
  | { type: 'text_delta'; text: string }
  | { type: 'text_complete'; fullText: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_approval_required'; tool: ToolCallInfo }
  | { type: 'tool_executing'; toolName: string; toolId: string }
  | { type: 'tool_result'; toolId: string; output: string; error?: string; duration: number }
  | { type: 'tool_rejected'; toolName: string }
  | { type: 'mode_switch'; from: AgentMode; to: AgentMode }
  | { type: 'compacting'; reason: string }
  | { type: 'compact_complete'; tokensBefore: number; tokensAfter: number }
  | { type: 'error'; category: ErrorCategory; message: string; retryable: boolean }
  | { type: 'usage'; tokens: TokenUsage }
  | { type: 'done'; reason: 'complete' | 'cancelled' | 'error' };
```

### 7.2 TUI 消费方式

TUI 层通过 AsyncGenerator 消费事件：

```typescript
const agent = new AgentLoop(provider, tools, conversation, config);
for await (const event of agent.run(userInput)) {
  tui.handleEvent(event);
}
```

---

## 8. 中断处理

### 8.1 用户中断 (Ctrl+C)

- 第一次 Ctrl+C：设置 `PAUSED` 状态，停止当前工具执行
- 第二次 Ctrl+C：终止整个 Agent Loop，返回 `IDLE`
- 正在执行的工具通过 `AbortSignal` 收到取消信号

### 8.2 超时中断

- Provider 调用超时：由 Provider 层的 HTTP 超时处理
- 工具执行超时：由 `ToolExecutionOptions.timeout` 控制
- 整体会话超时：可选，由 CLI 参数 `--max-time` 控制

---

## 9. 实现优先级

| 优先级 | 组件 | 预计工时 | 依赖 |
|--------|------|---------|------|
| P0 | AgentLoop 主循环（IDLE → THINKING → IDLE） | 4h | Provider, Tools |
| P0 | 工具调度（THINKING → TOOL_APPROVAL → TOOL_CALLING → THINKING） | 3h | PermissionChecker |
| P0 | 流式事件输出 | 2h | Provider stream |
| P1 | 对话压缩 | 3h | Provider summarize |
| P1 | Plan/Act/Review 模式切换 | 2h | ModeConfig |
| P1 | 错误恢复与重试 | 2h | ErrorCategory |
| P2 | Auto 模式 | 2h | Mode switch tool |
| P2 | 会话持久化 | 2h | SessionStore |
| P2 | 中断处理（Ctrl+C, 超时） | 1h | AbortSignal |
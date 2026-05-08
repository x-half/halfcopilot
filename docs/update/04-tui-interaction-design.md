# TUI 交互详细设计

> HalfCopilot 的终端 UI 层设计，基于 ink 4.x (React for CLI)。
> 定义组件层级、流式渲染、审批交互和状态展示。

---

## 1. 组件层级

```
<App>
  ├── <StatusBar />          顶部状态栏：模型、模式、token 用量
  ├── <ChatView />           主聊天区域
  │   ├── <MessageList />    消息列表（虚拟滚动）
  │   │   ├── <UserMessage />
  │   │   ├── <AssistantMessage />
  │   │   │   ├── <TextContent />      流式 Markdown 渲染
  │   │   │   ├── <ToolCallBlock />    工具调用展示
  │   │   │   └── <ThinkingBlock />    思考过程（可折叠）
  │   │   └── <SystemMessage />        系统消息
  │   └── <InputField />     底部输入区
  ├── <ToolApproval />       工具审批弹层（覆盖在 ChatView 上）
  └── <ErrorOverlay />       错误提示覆盖层
```

---

## 2. 核心组件设计

### 2.1 StatusBar

```
┌──────────────────────────────────────────────────────────┐
│ ● deepseek-v3 │ plan │ ↑1.2k ↓0.8k │ /home/user/project │
└──────────────────────────────────────────────────────────┘
```

显示内容：
- **模型名称**：当前使用的模型（带连接状态指示器 ●/○）
- **Agent 模式**：plan / review / act / auto
- **Token 用量**：input ↑ / output ↓
- **工作目录**：当前项目路径

```typescript
interface StatusBarProps {
  modelName: string;
  modelConnected: boolean;
  mode: AgentMode;
  tokenUsage: TokenUsage;
  workingDirectory: string;
}
```

### 2.2 AssistantMessage（核心渲染组件）

```
╭─ assistant ──────────────────────────────────────────────╮
│                                                          │
│  我来帮你查看项目结构。                                    │
│                                                          │
│  📖 file_read: src/index.ts                              │
│  ┃ 1  import { app } from './app';                       │
│  ┃ 2  app.listen(3000);                                  │
│  ┃ ...                                                   │
│                                                          │
│  项目入口文件看起来正常。让我检查一下配置：                  │
│                                                          │
│  🔧 file_edit: src/config.ts                             │
│  ┃ - const PORT = 3000;                                  │
│  ┃ + const PORT = process.env.PORT || 3000;              │
│                                                          │
│  已将端口号改为从环境变量读取。                             │
│                                                          │
╰──────────────────────────────────────────────────────────╯
```

#### 流式 Markdown 渲染策略

1. **增量渲染**：收到 `text_delta` 事件时，追加到当前 Markdown 缓冲区
2. **防抖渲染**：每 16ms 最多渲染一次（约 60fps），避免频繁重绘
3. **语法高亮**：使用 `cli-highlight` 对代码块做语法高亮
4. **终端宽度适配**：根据 `process.stdout.columns` 自动换行

```typescript
// 流式 Markdown 渲染器
class StreamingMarkdownRenderer {
  private buffer: string = '';
  private renderTimer: NodeJS.Timeout | null = null;
  private readonly RENDER_INTERVAL = 16; // ms

  append(text: string): void {
    this.buffer += text;
    if (!this.renderTimer) {
      this.renderTimer = setTimeout(() => {
        this.render(this.buffer);
        this.renderTimer = null;
      }, this.RENDER_INTERVAL);
    }
  }

  finalize(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.render(this.buffer);
  }
}
```

### 2.3 ToolCallBlock

工具调用有 4 种状态，每种状态有不同的展示：

```
状态 1: executing（执行中）
┌─ 🔧 bash ──────────────────────────────────────┐
│ npm test                                         │
│ ⠋ running...                                     │
└──────────────────────────────────────────────────┘

状态 2: completed（完成）
┌─ ✅ bash ──────────────────────────────────────┐
│ npm test                                         │
│ 12 tests passed (2.3s)                           │
└──────────────────────────────────────────────────┘

状态 3: error（错误）
┌─ ❌ file_read ─────────────────────────────────┐
│ /etc/shadow                                      │
│ Error: Permission denied                         │
└──────────────────────────────────────────────────┘

状态 4: rejected（用户拒绝）
┌─ 🚫 bash ──────────────────────────────────────┐
│ rm -rf /                                         │
│ Rejected by user                                 │
└──────────────────────────────────────────────────┘
```

### 2.4 ToolApproval（审批交互）

```
╭─ ⚠️  Permission Required ────────────────────────────────╮
│                                                          │
│  Tool: bash                                              │
│  Command: npm install express                            │
│  Level: unsafe (requires confirmation every time)        │
│                                                          │
│  [y] Allow once  [s] Allow for session  [n] Reject      │
│                                                          │
╰──────────────────────────────────────────────────────────╯
```

交互方式：
- `y` / Enter：允许本次执行
- `s`：本次会话内允许该工具（仅对 `warn` 级别有效）
- `n` / Escape：拒绝
- `a`：查看工具详情（输入参数完整展示）

```typescript
interface ApprovalAction {
  type: 'allow_once' | 'allow_session' | 'reject' | 'view_details';
}

async function showToolApproval(tool: ToolCallInfo, level: PermissionLevel): Promise<ApprovalAction> {
  // warn 级别：显示 [y] [s] [n]
  // unsafe 级别：只显示 [y] [n]（没有 session 选项）
  // safe 级别：不显示（自动通过）
}
```

### 2.5 InputField

```
┌─ > ─────────────────────────────────────────────────────┐
│ 帮我重构这个函数，提取到单独的模块中                        │
└──────────────────────────────────────────────────────────┘
  [Enter] Send  [Ctrl+C] Cancel  [↑↓] History
```

功能：
- 多行输入：`Shift+Enter` 换行，`Enter` 发送
- 历史记录：`↑` / `↓` 浏览历史输入
- 自动补全：`Tab` 补全文件路径和命令
- 粘贴支持：检测大段粘贴内容，自动切换为多行模式

```typescript
interface InputFieldProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  history: string[];       // 历史输入
  disabled?: boolean;      // Agent 思考中时禁用
}
```

---

## 3. 事件到 UI 的映射

Agent Loop 产生的事件（见 `01-agent-loop-design.md` §7）如何映射到 UI 组件：

| AgentEvent | UI 行为 |
|-----------|---------|
| `state_change(thinking)` | StatusBar 显示思考状态，InputField 禁用 |
| `text_delta` | AssistantMessage 追加文本，StreamingMarkdownRenderer 增量渲染 |
| `text_complete` | StreamingMarkdownRenderer 执行 finalize() |
| `tool_use` | ToolCallBlock 出现，状态 executing |
| `tool_approval_required` | ToolApproval 弹层出现，等待用户输入 |
| `tool_executing` | ToolCallBlock 显示 spinner |
| `tool_result` | ToolCallBlock 更新为 completed/error |
| `tool_rejected` | ToolCallBlock 更新为 rejected |
| `mode_switch` | StatusBar 更新模式显示 |
| `compacting` | 显示 "Compressing conversation..." 提示 |
| `compact_complete` | 显示压缩前后 token 对比 |
| `error` | ErrorOverlay 显示错误信息 |
| `usage` | StatusBar 更新 token 计数 |
| `done` | InputField 重新启用 |

---

## 4. 按键绑定

| 按键 | 功能 | 上下文 |
|------|------|--------|
| `Enter` | 发送消息 | InputField 获焦 |
| `Shift+Enter` | 换行 | InputField 获焦 |
| `Ctrl+C` | 取消当前操作 / 退出 | 全局 |
| `Ctrl+C` (double) | 强制退出 | 等待 500ms 内第二次 |
| `Ctrl+L` | 清屏 | 全局 |
| `↑` / `↓` | 历史记录 | InputField 获焦 |
| `Tab` | 自动补全 | InputField 获焦 |
| `Escape` | 取消审批 / 关闭弹层 | 审批弹层 |
| `y` / `n` / `s` | 审批操作 | 审批弹层 |

---

## 5. 主题系统

### 5.1 主题定义

```typescript
interface Theme {
  name: string;
  colors: {
    primary: string;      // 主色
    secondary: string;    // 辅色
    success: string;      // 成功
    warning: string;      // 警告
    error: string;        // 错误
    muted: string;        // 弱化文本
    background: string;   // 背景
    foreground: string;   // 前景
  };
  styles: {
    userMessage: ink.StyleProps;
    assistantMessage: ink.StyleProps;
    toolCall: ink.StyleProps;
    codeBlock: ink.StyleProps;
  };
}

// 内置主题
const themes: Record<string, Theme> = {
  dark: { /* 深色终端默认 */ },
  light: { /* 浅色终端 */ },
  monokai: { /* Monokai 配色 */ },
  nord: { /* Nord 配色 */ },
};
```

### 5.2 主题检测

```typescript
function detectTheme(): Theme {
  // 检查终端是否支持真彩色
  const colorterm = process.env.COLORTERM;
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    return themes.dark;
  }
  // 检查终端背景色
  // 如果无法检测，返回 dark 主题
  return themes.dark;
}
```

---

## 6. 特殊场景处理

### 6.1 长输出截断

工具执行结果可能非常长（如 `cat large_file.ts`）。处理策略：

1. **初始显示**：最多显示 50 行
2. **展开**：用户按 `e` 或点击展开查看全部
3. **折叠**：用户按 `c` 折叠回截断视图
4. **搜索**：大型输出支持 `/pattern` 搜索

### 6.2 Diff 展示

`file_edit` 工具的输出应展示为 diff 格式：

```diff
- const PORT = 3000;
+ const PORT = process.env.PORT || 3000;
```

使用 `diff` 格式 + 语法高亮，红色删除、绿色新增。

### 6.3 中断与恢复

- Agent 思考中按 `Ctrl+C`：显示 "Stopping..." 状态，发送 AbortSignal
- 工具执行中按 `Ctrl+C`：显示 "Cancelling tool..." 状态
- 500ms 内再次按 `Ctrl+C`：强制退出

### 6.4 多行代码块

模型输出包含代码块时，使用语法高亮 + 行号：

```
┌─ src/config.ts ─────────────────────────────────┐
│  1 │ import { defineConfig } from './shared';    │
│  2 │                                              │
│  3 │ export const config = defineConfig({         │
│  4 │   port: process.env.PORT || 3000,            │
│  5 │ });                                          │
└──────────────────────────────────────────────────┘
```

---

## 7. ink 组件实现要点

### 7.1 关键依赖

```json
{
  "ink": "^4.4.1",
  "ink-text-input": "^5.0.1",
  "ink-spinner": "^5.0.0",
  "ink-markdown": "^1.0.0",
  "ink-select-input": "^5.0.0",
  "react": "^18.2.0"
}
```

> 注意：`ink-markdown` 可能不存在或质量不佳，可能需要自建 Markdown 渲染组件。
> 备选方案：使用 `marked` 解析 Markdown + 自定义 ink 组件渲染。

### 7.2 自建 Markdown 渲染器

```typescript
// 简化版 Markdown → ink 组件 映射
const markdownRenderers: Record<string, React.FC<{ children: React.ReactNode }>> = {
  paragraph: ({ children }) => <Text>{children}</Text>,
  heading: ({ children, level }) => <Text bold>{children}</Text>,
  code: ({ children, language }) => <CodeBlock language={language}>{children}</CodeBlock>,
  code_inline: ({ children }) => <Text color="yellow">{children}</Text>,
  strong: ({ children }) => <Text bold>{children}</Text>,
  em: ({ children }) => <Text italic>{children}</Text>,
  list: ({ children }) => <Box flexDirection="column">{children}</Box>,
  listItem: ({ children }) => <Text>• {children}</Text>,
  blockquote: ({ children }) => <Box borderStyle="round" paddingLeft={1}>{children}</Box>,
};
```

---

## 8. 实现优先级

| 优先级 | 组件 | 预计工时 | 说明 |
|--------|------|---------|------|
| P0 | App + StatusBar | 3h | 骨架 + 状态展示 |
| P0 | ChatView + MessageList | 4h | 基本消息展示 |
| P0 | InputField | 3h | 输入 + 发送 + 历史 |
| P0 | 事件映射层 | 2h | AgentEvent → UI 更新 |
| P1 | ToolCallBlock | 3h | 工具调用 4 种状态 |
| P1 | ToolApproval | 2h | 审批交互 |
| P1 | 流式 Markdown 渲染 | 4h | 增量渲染 + 语法高亮 |
| P2 | Diff 展示 | 2h | file_edit diff 格式 |
| P2 | 长输出截断/展开 | 2h | 大型输出处理 |
| P2 | 主题系统 | 2h | 多主题支持 |
| P2 | 自动补全 | 3h | Tab 补全文件路径 |

**总计：约 30 小时**（原估计 4-5 小时严重不足，实际需要 25-30 小时）
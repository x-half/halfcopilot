# HalfCopilot 记忆系统设计

## 概述

记忆系统使 Agent 能够记住用户偏好、历史决策和项目上下文，实现更智能的个性化交互。

---

## 记忆类型

### 4 种记忆类型

| 类型 | 作用域 | 文件位置 | 说明 |
|------|--------|----------|------|
| **user** | 用户级 | `~/.halfcopilot/memory/user.md` | 用户偏好、角色、知识 |
| **feedback** | 用户级 | `~/.halfcopilot/memory/feedback.md` | 用户纠正和指导 |
| **project** | 项目级 | `.halfcopilot/memory/project.md` | 项目上下文、技术栈、决策 |
| **reference** | 项目级 | `.halfcopilot/memory/references/` | 外部文档链接、API 文档 |

---

## 记忆文件格式

### user.md (用户记忆)

```markdown
# User Memory

## 角色
- 资深前端工程师
- 偏好 TypeScript
- 关注代码质量和可维护性

## 偏好
- 使用 pnpm 作为包管理器
- 偏好函数式编程风格
- 不喜欢使用 class
- 代码注释使用英文

## 常用命令
- 构建：pnpm build
- 测试：pnpm test --coverage
- 格式化：pnpm prettier --write

## 知识
- 熟悉 React、Vue、Angular
- 熟悉 Node.js 服务端开发
- 了解 Docker 和 Kubernetes
```

### feedback.md (反馈记忆)

```markdown
# Feedback Memory

## 纠正记录

### 2026-05-08
- 不要使用 var，统一使用 const/let
- 函数命名使用 camelCase，类命名使用 PascalCase
- 错误处理要具体，不要捕获所有异常

### 2026-05-07
- 优先使用 async/await 而不是 Promise.then
- 数组操作优先使用 map/filter/reduce
- 避免嵌套超过 3 层
```

### project.md (项目记忆)

```markdown
# Project Memory

## 项目信息
- 名称：halfcopilot
- 类型：TypeScript CLI
- 包管理器：pnpm

## 技术栈
- Node.js 20+
- TypeScript 5.x
- React 18 (ink for TUI)
- Turborepo monorepo

## 目录结构
- packages/cli: CLI 入口
- packages/core: Agent 核心
- packages/provider: 模型 Provider
- packages/tools: 工具系统

## 关键决策
- 使用 ink 而不是 blessed 作为 TUI 框架
- Provider 双轨设计 (OpenAI 兼容 + Anthropic 原生)
- 记忆系统使用 Markdown 格式

## 当前状态
- Phase 1: 设计文档完成
- 下一步：项目骨架初始化
```

### references/ (引用目录)

```
.halfcopilot/memory/references/
├── ink-docs.md         # ink 框架文档摘要
├── turbo-repo.md       # Turborepo 配置说明
├── anthropic-api.md    # Anthropic API 参考
└── project-links.md    # 项目相关链接
```

**引用文件示例：**

```markdown
# Ink Framework Reference

## 来源
https://github.com/vadimdemedes/ink

## 核心组件
- <Text> - 文本渲染
- <Box> - 布局容器
- <Static> - 静态输出
- <AppContext> - 应用上下文

## 使用示例
```tsx
import { render, Text } from 'ink';

function Hello() {
  return <Text>Hello World</Text>;
}

render(<Hello />);
```
```

---

## 记忆加载流程

```
启动 Agent
    │
    ▼
加载用户级记忆
├── ~/.halfcopilot/memory/user.md
└── ~/.halfcopilot/memory/feedback.md
    │
    ▼
加载项目级记忆 (如果存在)
├── .halfcopilot/memory/project.md
└── .halfcopilot/memory/references/
    │
    ▼
生成 MEMORY.md 摘要
    │
    ▼
注入到系统提示词
    │
    ▼
Agent 对话
```

---

## MEMORY.md 自动生成

### 生成逻辑

```typescript
interface MemorySummary {
  userContext: string;
  feedbackContext: string;
  projectContext: string;
  references: string[];
}

async function generateMemorySummary(ctx: AgentContext): Promise<string> {
  const memory = await ctx.memory.load();
  
  const summary = `
# Context Memory

## User Context
${memory.userContext}

## Feedback
${memory.feedbackContext}

## Project Context
${memory.projectContext}

## References
${memory.references.join('\n')}
`.trim();
  
  return summary;
}
```

### 注入系统提示词

```typescript
const systemPrompt = `
You are HalfCopilot, an expert AI coding assistant.

${memorySummary}

## Your Capabilities
- File operations (read, write, edit)
- Command execution (bash)
- Content search (grep, glob)
- Multi-turn conversation

## Response Format
- Use tool_use for operations
- Explain your reasoning
- Show code changes clearly
`.trim();
```

---

## 记忆管理 API

### 命令行接口

```bash
# 列出所有记忆
halfcopilot memory list

# 显示指定类型记忆
halfcopilot memory show user
halfcopilot memory show project

# 编辑记忆 (打开默认编辑器)
halfcopilot memory edit user
halfcopilot memory edit project

# 清空记忆
halfcopilot memory clear feedback

# 导出记忆
halfcopilot memory export --output memory-backup.zip

# 导入记忆
halfcopilot memory import memory-backup.zip
```

### 程序接口

```typescript
interface MemoryManager {
  // 加载记忆
  load(): Promise<MemorySummary>;
  
  // 保存记忆
  save(type: MemoryType, content: string): Promise<void>;
  
  // 追加记忆
  append(type: MemoryType, entry: string): Promise<void>;
  
  // 删除记忆
  delete(type: MemoryType): Promise<void>;
  
  // 搜索记忆
  search(query: string): Promise<MemoryResult[]>;
  
  // 导出记忆
  export(): Promise<Buffer>;
  
  // 导入记忆
  import(data: Buffer): Promise<void>;
}
```

---

## 记忆更新策略

### 自动更新

在某些情况下，Agent 可以自动更新记忆：

```typescript
// 检测到用户纠正时
if (userMessage.includes('不要') || userMessage.includes('应该')) {
  await ctx.memory.append('feedback', {
    date: new Date().toISOString(),
    content: userMessage,
  });
}

// 检测到项目决策时
if (agentEvent.type === 'decision_made') {
  await ctx.memory.append('project', {
    date: new Date().toISOString(),
    decision: agentEvent.decision,
    reason: agentEvent.reason,
  });
}
```

### 手动更新

用户通过命令手动更新：

```bash
# 添加用户偏好
halfcopilot memory edit user  # 打开编辑器手动添加

# 记录项目决策
halfcopilot memory append project "决定使用 ink 作为 TUI 框架"
```

---

## 记忆存储实现

### 存储抽象

```typescript
interface MemoryStorage {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(directory: string): Promise<string[]>;
}

class FileMemoryStorage implements MemoryStorage {
  async read(path: string): Promise<string> {
    return await fs.readFile(path, 'utf-8');
  }
  
  async write(path: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(path), { recursive: true });
    await fs.writeFile(path, content, 'utf-8');
  }
  
  async exists(path: string): Promise<boolean> {
    return await fs.access(path).then(() => true).catch(() => false);
  }
  
  async list(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);
  }
}
```

### 目录结构

```
~/.halfcopilot/memory/
├── user.md
├── feedback.md
└── .gitkeep

.halfcopilot/memory/  (项目级)
├── project.md
├── references/
│   └── *.md
└── .gitkeep
```

---

## 记忆搜索

### 关键词搜索

```typescript
async function searchMemory(
  memory: MemoryManager,
  query: string
): Promise<MemoryResult[]> {
  const allMemory = await memory.load();
  const keywords = query.toLowerCase().split(/\s+/);
  
  const results: MemoryResult[] = [];
  
  for (const [type, content] of Object.entries(allMemory)) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (keywords.every(kw => line.toLowerCase().includes(kw))) {
        results.push({
          type: type as MemoryType,
          line: i + 1,
          content: line,
          context: lines.slice(Math.max(0, i - 2), i + 3).join('\n'),
        });
      }
    }
  }
  
  return results;
}
```

### 语义搜索 (未来)

使用向量嵌入实现语义搜索：

```typescript
// 未来扩展
interface SemanticMemory {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
  search(query: string, topK: number): Promise<MemoryResult[]>;
}
```

---

## 记忆生命周期

```
创建 ──→ 加载 ──→ 使用 ──→ 更新 ──→ 归档
 │                                      │
 └──────────────────────────────────────┘
```

### 归档策略

- 用户级记忆：永久保留
- 反馈记忆：保留最近 100 条
- 项目记忆：项目删除时清理
- 引用记忆：手动管理

---

## 隐私和安全

### 数据隔离

- 用户级记忆：仅当前用户可访问
- 项目级记忆：项目成员共享
- 敏感信息：不存储 API Key 等敏感数据

### 加密存储 (可选)

```typescript
// 未来扩展：加密敏感记忆
interface EncryptedMemory {
  encrypt(content: string): Promise<string>;
  decrypt(encrypted: string): Promise<string>;
}
```

### 导出和删除

```bash
# 导出所有记忆 (用于备份)
halfcopilot memory export --output backup.zip

# 删除所有用户级记忆
halfcopilot memory clear user --confirm

# 完全卸载 (删除所有配置和记忆)
halfcopilot uninstall --purge
```

---

## 最佳实践

### 用户侧

1. **定期审查反馈记忆**
   ```bash
   halfcopilot memory show feedback
   ```

2. **为每个项目创建项目记忆**
   ```bash
   halfcopilot init --memory
   ```

3. **使用引用记忆记录重要文档**
   ```bash
   echo "# Project Links\n- API: https://api.example.com/docs" \
     > .halfcopilot/memory/references/api.md
   ```

### 开发侧

1. **自动记录重要决策**
   ```typescript
   // 在 Agent Loop 中
   if (event.type === 'decision') {
     await memory.append('project', formatDecision(event));
   }
   ```

2. **提供记忆建议**
   ```typescript
   // 检测到重复纠正时
   if (similarFeedbackCount > 3) {
     suggest('考虑将此反馈添加到用户记忆中');
   }
   ```

3. **记忆压缩**
   ```typescript
   // 定期压缩旧记忆
   if (feedbackEntries > 100) {
     await compressOldFeedback();
   }
   ```
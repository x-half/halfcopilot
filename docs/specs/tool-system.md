# HalfCopilot 工具系统设计

## 概述

工具系统是 Agent 与外部世界交互的桥梁，支持：
- **内置工具**：文件操作、命令执行、内容搜索
- **MCP 工具**：通过 MCP 协议扩展
- **混合模式**：tool_use API + 文本解析降级

---

## 工具分类

### 按权限级别

| 级别 | 工具 | 说明 |
|------|------|------|
| safe | file_read, grep, glob, list_files | 只读，自动批准 |
| warn | file_write, file_edit, notebook_edit | 写入，需确认 |
| unsafe | bash, delete_file | 执行/删除，每次确认 |

### 按功能

| 类别 | 工具 |
|------|------|
| 文件操作 | file_read, file_write, file_edit, delete_file, list_files |
| 命令执行 | bash |
| 内容搜索 | grep, glob |
| Notebook | notebook_edit |
| MCP | 动态注册 |

---

## 内置工具 API

### file_read

读取文件内容。

```json
{
  "name": "file_read",
  "description": "读取文件的完整内容或指定行数",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "文件路径（相对于项目根目录）"
      },
      "limit": {
        "type": "number",
        "description": "最大读取行数，默认 2000",
        "default": 2000
      },
      "offset": {
        "type": "number",
        "description": "起始行偏移，默认 0",
        "default": 0
      }
    },
    "required": ["path"]
  }
}
```

**实现要点：**
- 自动检测文件编码（UTF-8/GBK）
- 大文件分块读取
- 二进制文件返回错误提示
- 支持相对路径和绝对路径

### file_write

创建或覆盖文件。

```json
{
  "name": "file_write",
  "description": "创建新文件或覆盖现有文件",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "文件路径"
      },
      "content": {
        "type": "string",
        "description": "文件内容"
      },
      "encoding": {
        "type": "string",
        "description": "文件编码",
        "enum": ["utf-8", "gbk"],
        "default": "utf-8"
      }
    },
    "required": ["path", "content"]
  }
}
```

**实现要点：**
- 自动创建不存在的目录
- 覆盖前检查文件是否存在
- 敏感路径保护（见安全模型）

### file_edit

编辑文件（支持多替换）。

```json
{
  "name": "file_edit",
  "description": "使用字符串替换编辑文件内容",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "文件路径"
      },
      "edits": {
        "type": "array",
        "description": "编辑操作列表",
        "items": {
          "type": "object",
          "properties": {
            "old_string": {
              "type": "string",
              "description": "要替换的原始字符串（必须唯一匹配）"
            },
            "new_string": {
              "type": "string",
              "description": "替换后的新字符串"
            }
          },
          "required": ["old_string", "new_string"]
        }
      }
    },
    "required": ["path", "edits"]
  }
}
```

**实现要点：**
- `old_string` 必须在文件中唯一匹配
- 支持多个编辑操作批量执行
- 失败时返回具体哪个编辑失败
- 显示 diff 预览供用户确认

**响应示例：**
```json
{
  "success": true,
  "edits": [
    { "status": "success", "line": 15 },
    { "status": "success", "line": 42 }
  ],
  "diff": "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -15,1 +15,1 @@\n-const x = 1;\n+const x = 2;"
}
```

### bash

执行 shell 命令。

```json
{
  "name": "bash",
  "description": "在终端执行 shell 命令",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "要执行的命令"
      },
      "timeout": {
        "type": "number",
        "description": "超时时间（秒），默认 60",
        "default": 60
      },
      "cwd": {
        "type": "string",
        "description": "工作目录，默认项目根目录"
      }
    },
    "required": ["command"]
  }
}
```

**实现要点：**
- 命令白名单/黑名单检查
- 超时保护
- 输出截断（最大 10000 字符）
- 退出码检查
- 环境变量隔离

**响应示例：**
```json
{
  "exitCode": 0,
  "stdout": "Hello World\n",
  "stderr": "",
  "duration": 120,
  "truncated": false
}
```

### grep

在文件中搜索内容。

```json
{
  "name": "grep",
  "description": "在文件中搜索匹配的行",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "搜索模式（支持正则）"
      },
      "path": {
        "type": "string",
        "description": "搜索目录，默认项目根目录"
      },
      "include": {
        "type": "string",
        "description": "文件匹配模式，如 '*.ts'"
      },
      "exclude": {
        "type": "string",
        "description": "排除模式，如 'node_modules/**'"
      },
      "maxResults": {
        "type": "number",
        "description": "最大结果数，默认 100",
        "default": 100
      }
    },
    "required": ["pattern"]
  }
}
```

**实现要点：**
- 使用 ripgrep (rg) 实现
- 支持正则表达式
- 显示行号和文件名
- 上下文行（-B/-A 参数）

**响应示例：**
```json
{
  "matches": [
    {
      "file": "src/index.ts",
      "line": 15,
      "text": "const pattern = /hello/;",
      "preContext": [],
      "postContext": []
    }
  ],
  "totalMatches": 1
}
```

### glob

搜索匹配模式的文件。

```json
{
  "name": "glob",
  "description": "搜索匹配 glob 模式的文件",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "Glob 模式，如 '**/*.ts'"
      },
      "path": {
        "type": "string",
        "description": "搜索目录，默认项目根目录"
      },
      "exclude": {
        "type": "string",
        "description": "排除模式"
      },
      "maxResults": {
        "type": "number",
        "description": "最大结果数，默认 100",
        "default": 100
      }
    },
    "required": ["pattern"]
  }
}
```

**响应示例：**
```json
{
  "files": [
    "src/index.ts",
    "src/utils/helper.ts",
    "tests/index.test.ts"
  ],
  "count": 3
}
```

### list_files

列出目录内容。

```json
{
  "name": "list_files",
  "description": "列出目录中的文件和子目录",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "目录路径"
      },
      "recursive": {
        "type": "boolean",
        "description": "是否递归",
        "default": false
      },
      "maxDepth": {
        "type": "number",
        "description": "最大深度，默认 3",
        "default": 3
      }
    },
    "required": ["path"]
  }
}
```

### notebook_edit

编辑 Jupyter Notebook。

```json
{
  "name": "notebook_edit",
  "description": "编辑 Jupyter Notebook 单元格",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Notebook 文件路径"
      },
      "edits": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "cellIndex": { "type": "number" },
            "newSource": { "type": "string" },
            "cellType": { "type": "string", "enum": ["code", "markdown"] }
          }
        }
      }
    },
    "required": ["path", "edits"]
  }
}
```

---

## 文本解析降级策略

当 Provider 不支持 tool_use API 时，使用文本解析降级。

### 解析模式

#### 1. 编辑指令

**格式 A：EDIT 块**
```
EDIT src/index.ts
```typescript
const x = 2;
```
```

**格式 B：行号范围**
```
Edit src/index.ts:15-20
```typescript
const x = 2;
```
```

**解析逻辑：**
```typescript
interface EditInstruction {
  type: 'edit';
  path: string;
  lineStart?: number;
  lineEnd?: number;
  newContent: string;
}

function parseEditInstruction(content: string): EditInstruction[] {
  const pattern = /EDIT\s+(.+?)(?::(\d+)(?:-(\d+))?)?\n```(\w+)?\n([\s\S]*?)```/g;
  const edits: EditInstruction[] = [];
  
  for (const match of content.matchAll(pattern)) {
    edits.push({
      type: 'edit',
      path: match[1].trim(),
      lineStart: match[2] ? parseInt(match[2]) : undefined,
      lineEnd: match[3] ? parseInt(match[3]) : undefined,
      newContent: match[5].trim(),
    });
  }
  
  return edits;
}
```

#### 2. 命令执行指令

**格式 A：RUN 前缀**
```
RUN: pnpm install
```

**格式 B：bash 代码块**
```bash
pnpm install
```

**解析逻辑：**
```typescript
interface BashInstruction {
  type: 'bash';
  command: string;
}

function parseBashInstruction(content: string): BashInstruction[] {
  const instructions: BashInstruction[] = [];
  
  // 匹配 RUN: 前缀
  const runPattern = /RUN:\s*(.+)/g;
  for (const match of content.matchAll(runPattern)) {
    instructions.push({ type: 'bash', command: match[1].trim() });
  }
  
  // 匹配 bash 代码块
  const bashPattern = /```bash\n([\s\S]*?)\n```/g;
  for (const match of content.matchAll(bashPattern)) {
    instructions.push({ type: 'bash', command: match[1].trim() });
  }
  
  return instructions;
}
```

#### 3. 文件创建指令

**格式：**
```
CREATE src/utils.ts
```typescript
export const utils = {};
```
```

### 确认流程

```
解析出指令
    │
    ▼
显示预览
┌─────────────────────────────────┐
│ 📝 检测到编辑指令               │
│                                 │
│ 文件：src/index.ts              │
│ 修改：2 处                      │
│                                 │
│ - const x = 1;                  │
│ + const x = 2;                  │
│                                 │
│ [Y] 确认  [N] 拒绝  [E] 编辑    │
└─────────────────────────────────┘
    │
    ├── 确认 ──→ 执行
    │
    ├── 拒绝 ──→ 跳过，继续对话
    │
    └── 编辑 ──→ 打开编辑器修改后执行
```

---

## 工具注册表

```typescript
interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  permissionLevel: 'safe' | 'warn' | 'unsafe';
  
  // 执行函数
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  
  // 转换为 Provider 格式
  toProviderFormat(provider: 'anthropic' | 'openai'): Record<string, unknown>;
}

interface ToolContext {
  projectRoot: string;
  signal: AbortSignal;
  workingDirectory: string;
}

interface ToolResult {
  success: boolean;
  content: string | Record<string, unknown>;
  error?: string;
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  list(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  toProviderFormat(provider: 'anthropic' | 'openai'): Record<string, unknown>[] {
    return this.list().map(tool => tool.toProviderFormat(provider));
  }
}
```

---

## 工具执行流程

```
用户请求
    │
    ▼
Agent 决定调用工具
    │
    ▼
ToolRegistry.execute(name, input)
    │
    ├── 权限检查
    │   ├── safe ──→ 直接执行
    │   ├── warn ──→ 检查会话确认历史
    │   └── unsafe ──→ 请求用户确认
    │
    ├── 参数验证 (JSON Schema)
    │
    ├── 执行工具
    │
    └── 返回结果
        ├── 成功 ──→ 添加到对话历史
        │
        └── 失败 ──→ 返回错误信息
```

---

## 实现示例

### file_read 实现

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { detectEncoding } from '../utils/encoding';

const fileReadTool: Tool = {
  name: 'file_read',
  description: '读取文件的完整内容',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      limit: { type: 'number', description: '最大行数', default: 2000 },
    },
    required: ['path'],
  },
  permissionLevel: 'safe',
  
  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { path: filePath, limit = 2000 } = input as { path: string; limit?: number };
    
    // 解析路径
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.projectRoot, filePath);
    
    // 安全检查
    if (!resolvedPath.startsWith(context.projectRoot)) {
      return {
        success: false,
        error: '文件路径必须在项目根目录内',
      };
    }
    
    try {
      // 检测编码
      const encoding = await detectEncoding(resolvedPath);
      
      // 读取文件
      const content = await fs.readFile(resolvedPath, { encoding });
      
      // 限制行数
      const lines = content.split('\n');
      const truncated = lines.length > limit;
      const limitedContent = truncated ? lines.slice(0, limit).join('\n') : content;
      
      return {
        success: true,
        content: {
          path: filePath,
          content: limitedContent,
          truncated,
          totalLines: lines.length,
          encoding,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      };
    }
  },
  
  toProviderFormat(provider) {
    if (provider === 'anthropic') {
      return {
        name: this.name,
        description: this.description,
        input_schema: this.input_schema,
      };
    }
    // OpenAI 格式...
  },
};
```

### bash 实现

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const bashTool: Tool = {
  name: 'bash',
  description: '执行 shell 命令',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '命令' },
      timeout: { type: 'number', description: '超时 (秒)', default: 60 },
    },
    required: ['command'],
  },
  permissionLevel: 'unsafe',
  
  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { command, timeout = 60 } = input as { command: string; timeout?: number };
    
    // 安全检查
    if (isDangerousCommand(command)) {
      return {
        success: false,
        error: '命令被安全策略禁止',
      };
    }
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workingDirectory,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,  // 10MB
      });
      
      // 截断输出
      const maxOutput = 10000;
      const truncated = stdout.length > maxOutput || stderr.length > maxOutput;
      
      return {
        success: true,
        content: {
          stdout: truncated ? stdout.slice(0, maxOutput) + '... (truncated)' : stdout,
          stderr: truncated ? stderr.slice(0, maxOutput) + '... (truncated)' : stderr,
          truncated,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '命令执行失败',
        content: {
          stdout: '',
          stderr: error instanceof Error ? error.message : '未知错误',
        },
      };
    }
  },
};

function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /^rm\s+-rf/,
    /^sudo/,
    /mkfs/,
    /dd\s+of=/,
    /:\(\)\{:\|:\&\}\;/,  // fork bomb
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(command));
}
```

---

## 测试策略

### 单元测试

```typescript
import { describe, it, expect } from 'vitest';
import { fileReadTool } from '../src/tools/file-read';

describe('fileReadTool', () => {
  it('should read file content', async () => {
    const result = await fileReadTool.execute(
      { path: 'test.txt', limit: 100 },
      { projectRoot: '/tmp/test', signal: new AbortController().signal, workingDirectory: '/tmp/test' }
    );
    
    expect(result.success).toBe(true);
    expect(result.content).toHaveProperty('content');
  });
  
  it('should reject paths outside project root', async () => {
    const result = await fileReadTool.execute(
      { path: '/etc/passwd' },
      { projectRoot: '/tmp/test', signal: new AbortController().signal, workingDirectory: '/tmp/test' }
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('项目根目录');
  });
});
```

### 集成测试

```typescript
describe('Tool Execution Flow', () => {
  it('should handle tool approval flow', async () => {
    // 模拟用户确认流程
    const mockApprove = vi.fn().mockResolvedValue(true);
    
    const result = await executeWithApproval(
      bashTool,
      { command: 'echo hello' },
      mockApprove
    );
    
    expect(mockApprove).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
```
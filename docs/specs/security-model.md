# HalfCopilot 安全模型

## 安全原则

1. **最小权限原则**：默认使用最低必要权限
2. **显式确认**：危险操作必须用户确认
3. **完整审计**：所有操作记录可追溯
4. **防御性执行**：防止意外破坏

---

## 权限级别

### 三级权限模型

| 级别 | 工具 | 审批策略 | 示例 |
|------|------|----------|------|
| **safe** | file_read, grep, glob, list_files | 自动批准 | 读取、搜索、列出 |
| **warn** | file_write, file_edit, notebook_edit | 首次会话确认 | 创建、修改 |
| **unsafe** | bash, delete_file, exec | 每次确认 | 执行命令、删除 |

### 权限定义

```typescript
type PermissionLevel = 'safe' | 'warn' | 'unsafe';

interface ToolPermission {
  level: PermissionLevel;
  autoApprove?: boolean;           // 是否自动批准
  requireConfirm?: boolean;        // 是否需要确认
  confirmPattern?: string[];       // 确认提示关键词
}
```

---

## 命令白名单/黑名单

### 自动批准命令 (autoApprove)

这些 bash 命令无需确认即可执行：

```json
{
  "autoApprove": [
    "git status",
    "git diff",
    "git log --oneline",
    "git branch",
    "ls",
    "ls -la",
    "ls -l",
    "cat",
    "head",
    "tail",
    "wc",
    "pwd",
    "echo",
    "which",
    "whoami",
    "uname -a",
    "node --version",
    "pnpm --version"
  ]
}
```

### 禁止命令 (neverApprove)

这些命令永远不能自动执行：

```json
{
  "neverApprove": [
    "rm -rf",
    "rm -fr",
    "sudo",
    "chmod 777",
    "curl | bash",
    "wget | bash",
    "mkfs",
    "dd",
    ":(){:|:&};:",
    "> /dev/",
    "kill -9",
    "pkill",
    "killall"
  ]
}
```

### 模式匹配规则

```typescript
interface CommandPattern {
  pattern: string;      // 正则或前缀匹配
  action: 'allow' | 'deny' | 'confirm';
  reason?: string;      // 说明原因
}

// 示例
const commandPatterns: CommandPattern[] = [
  { pattern: '^rm -rf', action: 'deny', reason: '危险删除操作' },
  { pattern: '^sudo', action: 'deny', reason: '禁止提权操作' },
  { pattern: '^git (status|diff|log|branch)', action: 'allow' },
  { pattern: '^npm (install|run|test)', action: 'confirm' },
];
```

---

## 文件操作保护

### 受保护路径

以下路径默认禁止修改：

```typescript
const protectedPaths = [
  '/etc/',
  '/usr/',
  '/bin/',
  '/sbin/',
  process.env.HOME + '/.ssh/',
  process.env.HOME + '/.gnupg/',
  process.env.HOME + '/.aws/',
  process.env.HOME + '/.config/gcloud/',
];
```

### 敏感文件

```typescript
const sensitiveFiles = [
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'jest.config.js',
];
```

修改这些文件需要额外确认。

---

## 审批流程

### 流程图

```
用户请求
    │
    ▼
Agent 生成工具调用
    │
    ▼
检查工具权限级别
    │
    ├── safe ──────→ 自动执行
    │
    ├── warn ──────→ 检查会话历史
    │                 │
    │                 ├── 已确认过 ──→ 执行
    │                 │
    │                 └── 未确认 ────→ 用户确认 ──→ 执行
    │
    └── unsafe ────→ 用户确认 ──→ 执行
                      │
                      └── 拒绝 ─────→ 跳过
```

### 确认 UI

```
⚠️  确认执行以下操作：

📝 工具：bash
📋 命令：pnpm add -D eslint

─────────────────────────────────
[✓] 本次会话不再确认此类操作
─────────────────────────────────

[Y] 确认  [N] 拒绝  [A] 全部批准  [Q] 退出
```

---

## 审计日志

### 日志格式

所有 unsafe 操作记录到 `~/.halfcopilot/audit.log`：

```json
{
  "timestamp": "2026-05-08T10:30:00.000Z",
  "sessionId": "abc123",
  "tool": "bash",
  "input": { "command": "git commit -m 'fix: bug'" },
  "approvedBy": "user",
  "approvedAt": "2026-05-08T10:30:05.000Z",
  "result": { "exitCode": 0, "duration": 1200 }
}
```

### 日志保留

- 默认保留 30 天
- 可配置 `audit.retentionDays`
- 支持导出为 JSON/CSV

---

## 沙箱执行 (可选)

### Docker 沙箱

```bash
# 配置启用沙箱
halfcopilot config set sandbox.enabled true

# 执行时自动使用 Docker
docker run --rm -v $(pwd):/workspace halfcopilot-sandbox
```

### 系统调用限制

```typescript
// 使用 seccomp 限制系统调用
const seccompProfile = {
  defaultAction: 'SCMP_ACT_ALLOW',
  syscalls: [
    { names: ['open', 'read', 'write', 'close'], action: 'SCMP_ACT_ALLOW' },
    { names: ['execve'], action: 'SCMP_ACT_ERRNO' },  // 禁止 exec
  ],
};
```

---

## 配置示例

```json
{
  "security": {
    "permissionModel": {
      "file_read": "safe",
      "file_write": "warn",
      "file_edit": "warn",
      "bash": "unsafe",
      "grep": "safe",
      "glob": "safe"
    },
    "autoApprove": [
      "git status",
      "git diff",
      "ls -la"
    ],
    "neverApprove": [
      "rm -rf",
      "sudo"
    ],
    "protectedPaths": [
      "/etc/",
      "~/.ssh/"
    ],
    "audit": {
      "enabled": true,
      "logFile": "~/.halfcopilot/audit.log",
      "retentionDays": 30
    },
    "sandbox": {
      "enabled": false,
      "type": "docker"
    }
  }
}
```

---

## 安全最佳实践

### 用户侧

1. **定期审查审计日志**
   ```bash
   halfcopilot audit list --today
   ```

2. **配置项目级权限**
   ```json
   // .halfcopilot/settings.json
   {
     "security": {
       "maxTokensPerRequest": 10000,
       "requireConfirmFor": ["pnpm publish", "git push"]
     }
   }
   ```

3. **使用只读模式审查代码**
   ```bash
   halfcopilot chat --plan  # 只读，不能修改
   ```

### 开发侧

1. **所有工具必须有超时限制**
   ```typescript
   const DEFAULT_TIMEOUT = 60_000;  // 60 秒
   ```

2. **命令执行使用 shell 转义**
   ```typescript
   import { escape } from 'shell-quote';
   const safeCmd = `git diff ${escape(filePath)}`;
   ```

3. **文件路径验证**
   ```typescript
   function validatePath(inputPath: string): string {
     const resolved = path.resolve(inputPath);
     if (!resolved.startsWith(projectRoot)) {
       throw new Error('Path outside project root');
     }
     return resolved;
   }
   ```

---

## 应急响应

### 紧急停止

- `Ctrl+C` - 中断当前操作
- `Ctrl+D` - 退出程序
- `halfcopilot kill` - 强制终止所有会话

### 恢复操作

```bash
# 查看最近的操作历史
halfcopilot audit list --limit 50

# 撤销最近的文件修改
halfcopilot undo --last

# 恢复到某个时间点
halfcopilot restore --to "2026-05-08T10:00:00"
```
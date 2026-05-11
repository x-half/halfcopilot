# 安全模型实施方案

> 本文档将 `specs/security-model.md` 的安全规格转化为可实施的代码设计，
> 补充实施计划中完全缺失的安全配置和功能。

---

## 1. 权限系统实施

### 1.1 PermissionLevel 三档模型

```typescript
// packages/tools/src/permission.ts

export enum PermissionLevel {
  SAFE = 'safe',       // 自动批准
  WARN = 'warn',       // 首次会话确认
  UNSAFE = 'unsafe',   // 每次确认
}

export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // SAFE - 只读操作，无副作用
  file_read: PermissionLevel.SAFE,
  grep: PermissionLevel.SAFE,
  glob: PermissionLevel.SAFE,
  list_files: PermissionLevel.SAFE,
  diff: PermissionLevel.SAFE,

  // WARN - 有写操作但可逆
  file_write: PermissionLevel.WARN,
  file_edit: PermissionLevel.WARN,
  notebook_edit: PermissionLevel.WARN,

  // UNSAFE - 不可逆或高风险
  bash: PermissionLevel.UNSAFE,
  delete_file: PermissionLevel.UNSAFE,
};
```

### 1.2 PermissionChecker 实现

```typescript
export class PermissionChecker {
  /** 当前会话已批准的 warn 级别工具 */
  private sessionApproved: Set<string> = new Set();

  /** 用户配置的自动批准列表（glob 模式） */
  private autoApprovePatterns: string[];

  /** 用户配置的永不批准列表（glob 模式） */
  private neverApprovePatterns: string[];

  /** 审批回调，由 TUI 层提供 */
  private approvalCallback: (request: ApprovalRequest) => Promise<ApprovalDecision>;

  constructor(
    config: SecurityConfig,
    approvalCallback: (request: ApprovalRequest) => Promise<ApprovalDecision>,
  ) {
    this.autoApprovePatterns = config.autoApprove ?? [];
    this.neverApprovePatterns = config.neverApprove ?? [];
    this.approvalCallback = approvalCallback;
  }

  async check(toolName: string, input: Record<string, unknown>): Promise<PermissionDecision> {
    // 1. 检查永不批准列表
    if (this.matchesPatterns(toolName, this.neverApprovePatterns)) {
      return { allowed: false, reason: 'Tool is in never-approve list' };
    }

    // 2. 检查自动批准列表
    if (this.matchesPatterns(toolName, this.autoApprovePatterns)) {
      return { allowed: true, reason: 'Tool is in auto-approve list' };
    }

    // 3. 检查权限级别
    const level = TOOL_PERMISSIONS[toolName] ?? PermissionLevel.UNSAFE;

    switch (level) {
      case PermissionLevel.SAFE:
        return { allowed: true, reason: 'Safe tool, auto-approved' };

      case PermissionLevel.WARN:
        if (this.sessionApproved.has(toolName)) {
          return { allowed: true, reason: 'Already approved this session' };
        }
        // 请求用户确认
        const warnDecision = await this.approvalCallback({
          toolName,
          input,
          level,
          options: ['allow_once', 'allow_session', 'reject'],
        });
        if (warnDecision.type === 'allow_session') {
          this.sessionApproved.add(toolName);
        }
        return {
          allowed: warnDecision.type !== 'reject',
          reason: warnDecision.type === 'reject' ? 'User rejected' : 'User approved',
          sessionApproved: warnDecision.type === 'allow_session',
        };

      case PermissionLevel.UNSAFE:
        const unsafeDecision = await this.approvalCallback({
          toolName,
          input,
          level,
          options: ['allow_once', 'reject'],
        });
        return {
          allowed: unsafeDecision.type !== 'reject',
          reason: unsafeDecision.type === 'reject' ? 'User rejected' : 'User approved for this call only',
        };
    }
  }

  private matchesPatterns(toolName: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // 支持 glob 模式匹配
      if (pattern.includes('*')) {
        return minimatch(toolName, pattern);
      }
      return pattern === toolName;
    });
  }

  /** 重置会话批准（新会话时调用） */
  resetSession(): void {
    this.sessionApproved.clear();
  }
}
```

### 1.3 特殊权限规则

```typescript
// bash 命令的细粒度权限
const BASH_SAFE_PATTERNS = [
  'ls', 'cat', 'head', 'tail', 'grep', 'find', 'pwd',
  'echo', 'which', 'node --version', 'pnpm --version',
  'git status', 'git log', 'git diff', 'git branch',
];

const BASH_DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /:\(\)\{\s*:\|:\&\s*\}/,   // fork bomb
  /wget\s+.*\|\s*sh/,        // 下载并执行
  /curl\s+.*\|\s*bash/,      // 下载并执行
  />\s*\/dev\/sd/,           // 写入磁盘设备
  /mkfs/,                     // 格式化
  /dd\s+if=/,                // dd 写入
];

export function classifyBashCommand(command: string): PermissionLevel {
  // 检查危险模式
  for (const pattern of BASH_DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return PermissionLevel.UNSAFE;
    }
  }

  // 检查安全命令
  const baseCommand = command.trim().split(/\s+/)[0];
  if (BASH_SAFE_PATTERNS.some(safe => command.trimStart().startsWith(safe))) {
    return PermissionLevel.WARN;  // 即使是安全命令，bash 仍需至少 warn
  }

  return PermissionLevel.UNSAFE;
}
```

---

## 2. 受保护路径

### 2.1 默认受保护路径

```typescript
const DEFAULT_PROTECTED_PATHS = [
  '/etc',
  '/System',
  '/Library',
  '/usr',
  '/bin',
  '/sbin',
  '~/.ssh',
  '~/.gnupg',
  '~/.aws',
  '~/.kube',
  '~/.config/gcloud',
  '~/.npmrc',       // 可能包含 token
  '~/.pypirc',      // 可能包含 token
];
```

### 2.2 敏感文件模式

```typescript
const SENSITIVE_FILE_PATTERNS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*credentials*',
  '*secret*',
  '*token*',
  'id_rsa',
  'id_ed25519',
  '*.keystore',
  'package-lock.json',  // 防止意外修改
  'pnpm-lock.yaml',
];
```

### 2.3 路径检查器

```typescript
export class PathProtector {
  private protectedPaths: string[];
  private sensitivePatterns: RegExp[];

  constructor(config: SecurityConfig) {
    this.protectedPaths = [
      ...DEFAULT_PROTECTED_PATHS,
      ...(config.protectedPaths ?? []),
    ];
    this.sensitivePatterns = SENSITIVE_FILE_PATTERNS.map(p =>
      new RegExp(p.replace(/\./g, '\\.').replace(/\*/g, '.*'))
    );
  }

  /** 检查路径是否受保护，返回 null 或拒绝原因 */
  checkPath(filePath: string, operation: 'read' | 'write' | 'delete'): string | null {
    const resolved = path.resolve(filePath);

    // 读操作不检查受保护路径（只读是安全的）
    if (operation !== 'read') {
      for (const protectedPath of this.protectedPaths) {
        const resolvedProtected = path.resolve(protectedPath.replace('~', os.homedir()));
        if (resolved.startsWith(resolvedProtected)) {
          return `Path is protected: ${resolvedProtected}`;
        }
      }
    }

    // 写/删操作检查敏感文件
    if (operation !== 'read') {
      const basename = path.basename(resolved);
      for (const pattern of this.sensitivePatterns) {
        if (pattern.test(basename)) {
          return `File matches sensitive pattern: ${basename}`;
        }
      }
    }

    return null;
  }
}
```

---

## 3. 审计日志

### 3.1 日志格式

```typescript
interface AuditLogEntry {
  timestamp: string;           // ISO 8601
  sessionId: string;
  userId: string;              // os.userInfo().username
  toolName: string;
  input: Record<string, unknown>;
  result: 'approved' | 'rejected' | 'denied';
  reason: string;
  duration?: number;           // 工具执行耗时(ms)
  error?: string;
}
```

### 3.2 审计日志写入器

```typescript
export class AuditLogger {
  private stream: fs.WriteStream | null = null;
  private logPath: string;

  constructor(config: SecurityConfig) {
    if (config.audit?.enabled ?? true) {
      this.logPath = config.audit?.path?.replace('~', os.homedir())
        ?? path.join(os.homedir(), '.halfcopilot', 'audit.log');
      this.ensureLogDir();
      this.stream = fs.createWriteStream(this.logPath, { flags: 'a' });
    }
  }

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    if (!this.stream) return;
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.stream.write(JSON.stringify(fullEntry) + '\n');
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  close(): void {
    this.stream?.end();
  }
}
```

---

## 4. 安全配置 Schema

```typescript
// 合并到 ConfigSchema 中
const SecuritySchema = z.object({
  permissionModel: z.enum(['ask', 'auto-safe', 'auto-all']).default('ask'),
  autoApprove: z.array(z.string()).default([]),
  neverApprove: z.array(z.string()).default([]),
  protectedPaths: z.array(z.string()).default([]),
  sensitivePatterns: z.array(z.string()).default([]),
  audit: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('~/.halfcopilot/audit.log'),
  }).default({}),
  sandbox: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(['docker', 'none']).default('none'),
    image: z.string().default('halfcopilot-sandbox:latest'),
  }).default({}),
});
```

**permissionModel 说明：**
- `ask`：所有非 safe 工具都需要用户确认（默认）
- `auto-safe`：safe 和 warn 工具自动通过，unsafe 需要确认
- `auto-all`：所有工具自动通过（危险，仅用于受信环境）

---

## 5. 沙箱执行（V2 特性，V1 仅定义接口）

### 5.1 沙箱接口

```typescript
interface Sandbox {
  /** 在沙箱中执行命令 */
  execute(command: string, options: SandboxOptions): Promise<SandboxResult>;
  /** 检查沙箱是否可用 */
  isAvailable(): Promise<boolean>;
}

interface SandboxOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  /** 只读挂载路径 */
  readOnlyPaths?: string[];
  /** 读写挂载路径 */
  readWritePaths?: string[];
}

interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

### 5.2 Docker 沙箱实现（V2）

```typescript
class DockerSandbox implements Sandbox {
  async execute(command: string, options: SandboxOptions): Promise<SandboxResult> {
    const mounts = [
      ...(options.readOnlyPaths?.map(p => `-v ${p}:${p}:ro`) ?? []),
      ...(options.readWritePaths?.map(p => `-v ${p}:${p}:rw`) ?? []),
    ].join(' ');

    const dockerCommand = `docker run --rm ${mounts} -w ${options.cwd} ` +
      `--network none --memory 512m --cpus 1 ` +
      `halfcopilot-sandbox:latest ${command}`;

    return execAsync(dockerCommand, { timeout: options.timeout });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
```

### 5.3 Noop 沙箱（V1 默认）

```typescript
class NoopSandbox implements Sandbox {
  async execute(command: string, options: SandboxOptions): Promise<SandboxResult> {
    // V1: 直接在本地执行，无沙箱
    return execAsync(command, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
    });
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

---

## 6. 实施优先级

| 优先级 | 任务 | 预计工时 | 阶段 |
|--------|------|---------|------|
| P0 | PermissionLevel 三档枚举 + TOOL_PERMISSIONS 映射 | 1h | Phase 3 |
| P0 | PermissionChecker（含会话缓存） | 3h | Phase 3 |
| P0 | PathProtector（受保护路径 + 敏感文件） | 2h | Phase 3 |
| P0 | SecurityConfig Schema 合并到 ConfigSchema | 1h | Phase 3 |
| P1 | AuditLogger 审计日志 | 2h | Phase 5 |
| P1 | bash 命令细粒度分类 | 2h | Phase 3 |
| P1 | permissionModel 三种模式实现 | 2h | Phase 3 |
| P2 | Sandbox 接口 + NoopSandbox | 2h | Phase 5 |
| P2 | DockerSandbox 实现 | 4h | V2 |
| P2 | `halfcopilot undo --last` 命令 | 3h | V2 |
| P2 | `halfcopilot restore --to <timestamp>` | 3h | V2 |
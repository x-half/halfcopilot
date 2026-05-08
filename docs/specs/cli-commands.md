# HalfCopilot CLI 命令规范

## 命令结构

```bash
halfcopilot [mode] [options] [command]
```

## 运行模式

| 模式 | 参数 | 说明 | 权限 |
|------|------|------|------|
| Plan | `--plan` / `-p` | 只读模式，生成计划 | file_read, grep, glob |
| Act | `--act` / `-a` | 执行模式，可修改 | 全部工具 |
| Review | `--review` / `-r` | 审查模式 | file_read, diff |

## 核心命令

### halfcopilot chat (默认)

交互式对话模式。

```bash
halfcopilot chat [options]
halfcopilot                          # 简写，进入交互模式
halfcopilot chat --plan              # 以 Plan 模式启动
halfcopilot chat --model claude-sonnet
```

**选项：**
- `--model <name>` - 指定模型
- `--plan` - Plan 模式启动
- `--verbose` - 详细输出
- `--no-memory` - 不加载记忆

### halfcopilot run

单次执行模式，执行后退出。

```bash
halfcopilot run "为项目添加 ESLint 配置"
halfcopilot run "修复所有 TypeScript 错误" --plan
```

**选项：**
- `--plan` - 只生成计划不执行
- `--approve-all` - 自动批准所有操作
- `--output <file>` - 输出到文件

### halfcopilot init

项目初始化。

```bash
halfcopilot init              # 创建 .halfcopilot/settings.json
halfcopilot init --memory     # 同时初始化记忆目录
```

**选项：**
- `--memory` - 初始化记忆目录
- `--template <name>` - 使用模板（typescript/javascript/python）

### halfcopilot memory

记忆管理。

```bash
halfcopilot memory list              # 列出所有记忆
halfcopilot memory show user         # 显示用户记忆
halfcopilot memory show project      # 显示项目记忆
halfcopilot memory edit user         # 编辑用户记忆
halfcopilot memory clear project     # 清空项目记忆
halfcopilot memory export            # 导出记忆
```

**子命令：**
- `list` - 列出记忆
- `show <type>` - 显示指定类型记忆
- `edit <type>` - 编辑记忆
- `clear <type>` - 清空记忆
- `export` - 导出记忆
- `import <file>` - 导入记忆

### halfcopilot config

配置管理。

```bash
halfcopilot config list              # 列出所有配置
halfcopilot config get providers     # 获取指定配置
halfcopilot config set model claude-sonnet
halfcopilot config edit              # 打开配置文件
```

**子命令：**
- `list` - 列出配置
- `get <key>` - 获取配置值
- `set <key> <value>` - 设置配置值
- `edit` - 打开配置文件编辑器

### halfcopilot tools

工具管理。

```bash
halfcopilot tools list               # 列出所有工具
halfcopilot tools show file_read     # 显示工具详情
halfcopilot tools test file_read     # 测试工具
```

### halfcopilot providers

Provider 管理。

```bash
halfcopilot providers list           # 列出所有 Provider
halfcopilot providers test deepseek  # 测试连接
```

### halfcopilot doctor

诊断工具。

```bash
halfcopilot doctor                   # 检查配置和环境
```

## 全局选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--help` | `-h` | 显示帮助 |
| `--version` | `-v` | 显示版本 |
| `--verbose` | `--verbose` | 详细输出 |
| `--debug` | `-d` | 调试模式 |
| `--config <file>` | `-c` | 指定配置文件 |
| `--no-memory` | `--no-memory` | 不加载记忆 |

## 快捷键 (交互模式)

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` | 中断当前操作 |
| `Ctrl+D` | 退出 |
| `Ctrl+L` | 清屏 |
| `Ctrl+R` | 搜索历史 |
| `Esc` | 取消输入/关闭弹窗 |
| `Tab` | 自动补全 |
| `Ctrl+P/N` | 上一条/下一条历史 |
| `Ctrl+O` | 切换 Plan/Act 模式 |

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 配置错误 |
| 130 | 用户中断 (Ctrl+C) |

## 示例

```bash
# 进入交互模式
halfcopilot chat

# 以 Plan 模式启动
halfcopilot chat --plan

# 单次执行
halfcopilot run "检查项目中的 TODO 注释"

# 指定模型
halfcopilot run "重构这个函数" --model claude-sonnet

# 初始化新项目
halfcopilot init --memory

# 查看当前配置
halfcopilot config list

# 诊断问题
halfcopilot doctor
```
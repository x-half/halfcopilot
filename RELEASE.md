# HalfCopilot 构建与发布指南

## 目录结构

```
halfcopilot/
├── packages/           # 9 个 Monorepo 子包
│   ├── cli/           # CLI 入口 + TUI（tsup 打包）
│   ├── core/          # Agent 引擎（LangGraph StateGraph）
│   ├── provider/      # LLM 供应商抽象（6 家）
│   ├── tools/         # 工具系统（Zod + LangChain 格式）
│   ├── config/        # 配置加载/校验/保存
│   ├── memory/        # 记忆持久化
│   ├── skills/        # 技能系统
│   ├── mcp/           # MCP 协议适配
│   └── shared/        # 基础工具
├── scripts/
│   └── build-npm.mjs  # npm 发布包的组装脚本
├── npm/               # 发布目录（build-npm.mjs 输出）
├── .github/workflows/
│   ├── ci.yml         # PR/main 自动构建+测试
│   └── npm-publish.yml # Release 触发自动发布
├── turbo.json         # Turborepo 编排
└── pnpm-workspace.yaml
```

---

## 一、环境准备

### 1.1 前置要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 20 | 运行时 |
| pnpm | 9.x | 包管理（项目强制） |
| npm | 随 Node.js | npm registry 发布用 |
| Git | - | 版本管理 |

### 1.2 首次克隆

```bash
git clone git@github.com:x-half/halfcopilot.git
cd halfcopilot
pnpm install            # 安装所有依赖
pnpm build              # 全量构建
pnpm test               # 运行所有测试
```

### 1.3 npm 登录

发布到 npm registry 需要 token 或登录：

```bash
npm login --registry=https://registry.npmjs.org
```

或使用环境变量（CI 用）：

```bash
export NPM_TOKEN="npm_xxxxxxxxxxxx"
```

---

## 二、版本号管理

### 2.1 版本号位置

发布前需要统一修改以下文件中的版本号：

| 文件 | 字段 | 说明 |
|------|------|------|
| `package.json` | `version` | 根 package，应与 cli 一致 |
| `packages/cli/package.json` | `version` | **主版本号，以此为准** |
| `packages/cli/src/halfcop.ts` | `.version()` | CLI `--version` 输出 |
| `packages/cli/src/__tests__/cli.test.ts` | `version` 断言 | 测试用 |

> **注意：** `version` 是从 `packages/cli/package.json` 读取的，`build-npm.mjs` 会自动同步到 `npm/package.json`。因此只需改 `packages/cli/package.json`，其他位置需手动同步。

### 2.2 手动升级版本

```bash
# 替换所有文件中的旧版本号
sed -i 's/"version": "1.1.19"/"version": "1.2.0"/g' \
  package.json \
  packages/cli/package.json

sed -i 's/\.version("1.1.19")/.version("1.2.0")/g' \
  packages/cli/src/halfcop.ts \
  packages/cli/src/__tests__/cli.test.ts

sed -i 's/"version": "1.1.19"/"version": "1.2.0"/g' \
  packages/cli/src/__tests__/cli.test.ts
```

---

## 三、本地构建与验证

### 3.1 完整构建

```bash
# 清理旧构建产物
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo

# 全量构建（Turborepo 自动编排 9 个包的构建顺序）
pnpm build

# 验证所有包构建成功——输出应显示：
#   Tasks:    9 successful, 9 total
```

构建过程说明：

| 阶段 | 工具 | 产出 |
|------|------|------|
| `tsc -b`（8 个子包） | TypeScript 项目引用 | 各包 `dist/` 目录 |
| `tsc -b && tsup`（cli） | tsc 编译 + tsup 打包 | `dist/halfcop.js`（自包含 ESM bundle） |

### 3.2 运行测试

```bash
pnpm test
```

期望输出：

```
Tasks:    18 successful, 18 total
```

包含 9 个包的构建 + 9 个包的测试，共 130+ 个测试用例。

### 3.3 冒烟测试

```bash
# 1. 版本显示
node packages/cli/dist/halfcop.js --version
# 输出: 1.2.0

# 2. 诊断
node packages/cli/dist/halfcop.js doctor
# 输出: All checks passed! ✓

# 3. 单次运行（需要配置 API Key）
node packages/cli/dist/halfcop.js run "hello"
```

---

## 四、npm 发布包组装

### 4.1 构建脚本

`scripts/build-npm.mjs` 负责将构建产物组装到 `npm/` 目录：

| 步骤 | 说明 |
|------|------|
| 1. 清理 | 删除 `npm/dist/` |
| 2. 复制 CLI dist | 复制 `packages/cli/dist/` → `npm/dist/packages/cli/dist/`，仅 `.js`/`.mjs` 文件 |
| 3. 创建入口 | `npm/dist/index.js` 重新导出 bundle |
| 4. 创建 bin | `npm/bin/halfcop.js` — ESM 入口，`import()` 加载 bundle |
| 5. 同步版本 | 从 `packages/cli/package.json` 读取版本，写入 `npm/package.json` |
| 6. 附带文件 | README.md、LICENSE、postinstall.mjs |

### 4.2 执行打包

```bash
node scripts/build-npm.mjs
```

验证 `npm/` 目录结构：

```
npm/
├── bin/
│   └── halfcop.js          # CLI 入口（~500B）
├── dist/
│   ├── index.js             # 主入口 re-export
│   └── packages/cli/dist/
│       ├── halfcop.js       # 自包含 ESM bundle（~2.7MB）
│       └── tui/             # TUI 组件（--tui 模式需要）
├── package.json             # 版本已同步
├── scripts/
│   └── postinstall.mjs
├── README.md
└── LICENSE
```

### 4.3 包内容说明

| 文件 | 大小 | 说明 |
|------|------|------|
| `halfcop.js` | ~2.7MB | 自包含 ESM bundle，零 `@halfcopilot/*` 外部依赖 |
| `tui/*.js` | ~15KB | Ink React 组件，`--tui` 模式动态加载 |
| `bin/halfcop.js` | ~500B | 入口包装器，`import()` 加载 bundle |
| 外部依赖 | - | `commander`、`openai`、`@anthropic-ai/sdk`、`zod`、`ink`、`react` |

> `ink` 和 `react` 是 `optionalDependencies`，只有使用 `--tui` 模式时才需要。

---

## 五、发布到 npm

### 5.1 手动发布

```bash
# 写入 npm token（临时，用完即删）
echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > npm/.npmrc

# 发布
cd npm && npm publish --registry=https://registry.npmjs.org

# 清理 token
rm npm/.npmrc
```

发布成功输出示例：

```
+ halfcopilot@1.2.0
```

### 5.2 发布后验证

```bash
# 查看 npm 上最新版本
npm info halfcopilot version --registry=https://registry.npmjs.org

# 本地安装测试
npm install -g halfcopilot@1.2.0 --registry https://registry.npmjs.org
halfcop --version
halfcop doctor
```

---

## 六、CI/CD 自动发布

### 6.1 CI 流程

文件：`.github/workflows/ci.yml`

```yaml
触发条件: push/PR → main
流程:
  1. pnpm install
  2. pnpm build    # turbo 并行构建 9 包
  3. pnpm test     # turbo 并行运行 130+ 测试
```

### 6.2 npm 自动发布

文件：`.github/workflows/npm-publish.yml`

```yaml
触发条件: GitHub Release 发布
流程:
  1. pnpm install --frozen-lockfile
  2. pnpm build
  3. node scripts/build-npm.mjs    # 组装 npm/ 目录
  4. cd npm && npm publish          # 发布到 npm registry
```

**前置条件：**
- GitHub Secrets → `NPM_TOKEN`（npm automation token）
- 不需要 `NPM_TOKEN` 环境变量到 Action 的映射（workflow 已配置 `NODE_AUTH_TOKEN`）

### 6.3 GitHub Release 手动触发

```bash
# 1. 创建 tag
git tag v1.2.0
git push origin v1.2.0

# 2. 在 GitHub 创建 Release
#    或通过 gh CLI:
gh release create v1.2.0 --title "v1.2.0" --target main
```

GitHub Release 发布后，npm-publish.yml 自动触发。

---

## 七、完整发布流程速查

### 7.1 本地发布（推荐）

```bash
# 1. 升级版本号
sed -i 's/"version": "1.1.19"/"version": "1.2.0"/g' package.json packages/cli/package.json
sed -i 's/\.version("1.1.19")/.version("1.2.0")/g' packages/cli/src/halfcop.ts
sed -i 's/"1.1.19"/"1.2.0"/g' packages/cli/src/__tests__/cli.test.ts

# 2. 构建 + 测试
rm -rf packages/*/dist
pnpm build
pnpm test

# 3. 组装发布包
node scripts/build-npm.mjs

# 4. 发布
echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > npm/.npmrc
cd npm && npm publish --registry=https://registry.npmjs.org
rm .npmrc
cd ..

# 5. 提交 + 打 tag
git add -A
git commit -m "chore: bump version to 1.2.0"
git tag v1.2.0
git push origin main --tags
```

### 7.2 CI 发布

```bash
# 1. 升级版本号（同上）

# 2. 提交代码
git add -A && git commit -m "chore: bump version to 1.2.0"
git push origin main

# 3. 在 GitHub 创建 Release
#    https://github.com/x-half/halfcopilot/releases/new
#    - Tag: v1.2.0
#    - 发布后 CI 自动构建+发布 npm
```

---

## 八、常见问题

### 8.1 构建失败

```
Error: Cannot find module '@halfcopilot/xxx'
```

确认所有子包依赖声明一致——内部依赖必须用 `workspace:*` 协议：

```json
// 正确
"@halfcopilot/shared": "workspace:*"

// 错误（会导致 turbo 无法识别构建顺序）
"@halfcopilot/shared": "file:../shared"
```

### 8.2 npm 发布失败：403 Forbidden

```
403 Forbidden - PUT https://registry.npmjs.org/halfcopilot
```

| 原因 | 解决 |
|------|------|
| 版本已存在 | `npm view halfcopilot version` 查看最新版，升级后重试 |
| Token 无效 | 重新生成 npm token：`https://www.npmjs.com/settings/{user}/tokens` |
| 未登录 | `npm login --registry=https://registry.npmjs.org` |

### 8.3 npm 发布失败：unauthorized

npm registry 可能被镜像覆盖。检查 `.npmrc`：

```bash
# 查看当前 registry 配置
npm config list

# 确保发布时使用官方 registry
npm publish --registry=https://registry.npmjs.org
```

### 8.4 安装后 `halfcop` 命令找不到

```bash
# 确认全局安装路径在 PATH 中
npm list -g halfcopilot
which halfcop

# 如果使用 nvm，切换 Node 版本后需要重新安装
nvm use 22
npm install -g halfcopilot
```

### 8.5 `--version` 显示旧版本号

检查 `packages/cli/dist/halfcop.js` 中的版本号。如果显示的版本号不是最新：

```bash
# 1. 确认 source 中的版本号已更新
grep 'version' packages/cli/src/halfcop.ts | head -1

# 2. 确认 cli/package.json 版本号
grep '"version"' packages/cli/package.json

# 3. 重新构建
rm -rf packages/cli/dist && pnpm build
```

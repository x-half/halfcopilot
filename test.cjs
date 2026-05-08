#!/usr/bin/env node

/**
 * HalfCopilot 测试脚本
 * 测试小米 Token Plan API 集成
 */

const config = require('./packages/config/dist/index.js');
const provider = require('./packages/provider/dist/index.js');
const tools = require('./packages/tools/dist/index.js');
const core = require('./packages/core/dist/index.js');

async function test() {
  console.log('🧪 HalfCopilot 测试开始\n');

  // 1. 测试配置加载
  console.log('1️⃣ 测试配置加载...');
  const appConfig = config.loadConfig();
  console.log('   ✓ 配置加载成功');
  console.log(`   ✓ 默认提供商: ${appConfig.defaultProvider}`);
  console.log(`   ✓ 默认模型: ${appConfig.defaultModel}\n`);

  // 2. 测试 Provider 注册
  console.log('2️⃣ 测试 Provider 注册...');
  const providerRegistry = new provider.ProviderRegistry();
  providerRegistry.createFromConfig(appConfig);
  console.log(`   ✓ Provider 注册成功: ${providerRegistry.list().join(', ')}\n`);

  // 3. 测试工具注册
  console.log('3️⃣ 测试工具注册...');
  const toolRegistry = new tools.ToolRegistry();
  const builtinTools = tools.createBuiltinTools();
  builtinTools.forEach(t => toolRegistry.register(t));
  console.log(`   ✓ 工具注册成功: ${toolRegistry.list().join(', ')}\n`);

  // 4. 测试 Agent 对话
  console.log('4️⃣ 测试 Agent 对话...');
  const xiaomiProvider = providerRegistry.get('xiaomi');
  const permissions = new tools.PermissionChecker({
    autoApproveSafe: true,
    allow: appConfig.permissions.allow,
    deny: appConfig.permissions.deny,
  });
  const executor = new tools.ToolExecutor(toolRegistry, permissions);

  const agent = new core.AgentLoop({
    provider: xiaomiProvider,
    model: 'mimo-v2.5-pro',
    tools: toolRegistry,
    executor,
    permissions,
    maxTurns: 10,
    mode: 'auto',
  });

  console.log('   发送测试消息: "1+1等于几？"');
  for await (const event of agent.run('1+1等于几？')) {
    if (event.type === 'text') {
      process.stdout.write('   🤖 ');
      process.stdout.write(event.content ?? '');
    }
  }
  console.log('\n');

  console.log('✅ 所有测试通过！');
}

test().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});

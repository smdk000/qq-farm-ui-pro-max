/**
 * AI 编程助手使用示例
 */

const { contextManager } = require('./src/services/contextManager');
const { qwenAIAssistant } = require('./src/services/qwenAIAssistant');
const logger = require('./src/utils/logger');

async function runExamples() {
  console.log('🚀 开始 AI 编程助手示例...\n');

  // 1. 初始化上下文管理器
  console.log('📌 步骤 1: 初始化上下文管理器');
  const initialized = await contextManager.initialize();
  if (!initialized) {
    console.log('⚠️  上下文管理器初始化失败，将使用无上下文模式');
  } else {
    console.log('✅ 上下文管理器初始化成功\n');
  }

  // 2. 添加项目资源
  console.log('📌 步骤 2: 添加项目资源');
  await contextManager.addProjectResource(
    '/Users/smdk000/文稿/qq/qq-farm-bot-ui-main',
    'qq-farm-bot-ui'
  );
  console.log('✅ 项目资源添加成功\n');

  // 3. 添加开发记忆
  console.log('📌 步骤 3: 添加开发记忆');
  await contextManager.addMemory(
    '本项目使用 Node.js + Express 作为后端，Vue 3 + Vite 作为前端',
    'project_info'
  );
  await contextManager.addMemory(
    '代码风格：使用 ES6+ 语法，优先使用 async/await，函数使用驼峰命名',
    'coding_style'
  );
  await contextManager.addMemory(
    '错误处理：所有异步函数都要用 try-catch，错误信息要详细记录日志',
    'error_handling'
  );
  console.log('✅ 开发记忆添加成功\n');

  // 4. 代码生成示例
  console.log('📌 步骤 4: 代码生成示例');
  console.log('问题：生成一个 Express 中间件，用于验证 API 密钥\n');
  
  const codeGenResult = await qwenAIAssistant.generateCode(
    '创建一个 Express 中间件，验证请求头中的 API 密钥，如果密钥无效返回 401 错误',
    'javascript'
  );
  console.log('AI 回答：');
  console.log(codeGenResult.content);
  console.log('');

  // 5. 代码审查示例
  console.log('📌 步骤 5: 代码审查示例');
  const sampleCode = `
function getUserData(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.execute(query);
}
`;
  console.log('问题：审查以下代码的安全性\n');
  
  const reviewResult = await qwenAIAssistant.reviewCode(
    sampleCode,
    'javascript'
  );
  console.log('AI 回答：');
  console.log(reviewResult.content);
  console.log('');

  // 6. 代码解释示例
  console.log('📌 步骤 6: 代码解释示例');
  const codeToExplain = `
const debounce = (fn, delay) => {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};
`;
  console.log('问题：解释这个防抖函数的实现原理\n');
  
  const explainResult = await qwenAIAssistant.explainCode(
    codeToExplain,
    'javascript'
  );
  console.log('AI 回答：');
  console.log(explainResult.content);
  console.log('');

  // 7. 调试帮助示例
  console.log('📌 步骤 7: 调试帮助示例');
  const buggyCode = `
function sumArray(arr) {
  let sum = 0;
  for (let i = 0; i <= arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}
`;
  const errorMessage = 'TypeError: Cannot read property of undefined';
  console.log('问题：修复数组求和函数的错误\n');
  
  const debugResult = await qwenAIAssistant.debugCode(
    buggyCode,
    errorMessage
  );
  console.log('AI 回答：');
  console.log(debugResult.content);
  console.log('');

  // 8. 学习新知识
  console.log('📌 步骤 8: 学习新知识');
  await qwenAIAssistant.learn(
    '在 qq-farm-bot-ui 项目中，所有 API 路由都以 /api/v1 开头',
    'project_conventions'
  );
  console.log('✅ 新知识已学习\n');

  // 9. 使用上下文感知的问答
  console.log('📌 步骤 9: 上下文感知的问答');
  console.log('问题：这个项目的技术栈是什么？（会使用 OpenViking 中的记忆）\n');
  
  const contextResult = await qwenAIAssistant.generateWithContext(
    '这个项目的技术栈是什么？包括前端、后端、数据库等所有技术。',
    {
      useContext: true,
      includeMemories: true,
      includeResources: true
    }
  );
  console.log('AI 回答：');
  console.log(contextResult.content);
  console.log('');

  // 10. 列出所有记忆
  console.log('📌 步骤 10: 列出所有记忆');
  const memories = await contextManager.listMemories();
  console.log('已学习的记忆：');
  memories.forEach((memory, index) => {
    console.log(`  ${index + 1}. ${memory.uri || memory.name}`);
  });
  console.log('');

  console.log('✅ 所有示例执行完成！');

  // 清理
  await contextManager.close();
}

// 运行示例
runExamples().catch(error => {
  logger.error('示例执行失败', { error: error.message });
  process.exit(1);
});

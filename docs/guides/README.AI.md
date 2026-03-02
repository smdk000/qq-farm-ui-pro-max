# OpenViking + 千问 3.5 Plus AI 编程助手

本项目集成了 OpenViking 上下文管理系统和阿里云百炼千问 3.5 Plus 大模型，为 AI 编程提供强大的上下文记忆能力。

## 📋 功能特性

### 1. OpenViking 上下文管理
- **分层上下文加载**: L0/L1/L2三层结构，按需加载
- **文件系统管理**: 使用 `viking://` 协议统一管理记忆、资源和技能
- **语义搜索**: 基于向量相似度的智能检索
- **自动会话管理**: 自动压缩对话、提取长期记忆

### 2. 千问 3.5 Plus AI 能力
- **代码生成**: 根据描述生成高质量代码
- **代码审查**: 发现潜在问题和改进建议
- **代码解释**: 详细解释代码逻辑和原理
- **调试帮助**: 分析错误并提供解决方案
- **上下文感知**: 基于项目记忆和资源的智能回答

## 🚀 快速开始

### 前置要求

- **Python**: 3.10+
- **Node.js**: 20+
- **npm** 或 **pnpm**

### 安装步骤

#### 1. 安装 Python 依赖

```bash
cd openviking-service
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### 2. 配置环境变量

编辑 `openviking-service/.env` 文件：

```bash
# OpenViking 工作目录
OPENVIKING_WORKSPACE=./openviking_data

# OpenViking 服务端口
OPENVIKING_PORT=5000

# 阿里云百炼 API Key（千问 3.5 Plus）
DASHSCOPE_API_KEY=sk-2cabc0684b6943ef81020be207ec8f17
```

#### 3. 启动服务

**Linux/macOS:**

```bash
chmod +x start-with-ai.sh
./start-with-ai.sh
```

**Windows:**

```bash
start-with-ai.bat
```

或者手动启动：

```bash
# 终端 1: 启动 OpenViking 服务
cd openviking-service
source venv/bin/activate
python app.py

# 终端 2: 启动 Node.js 核心服务
cd core
npm install
npm start
```

## 📖 使用示例

### 1. 在代码中使用 AI 助手

```javascript
const { qwenAIAssistant } = require('./core/src/services/qwenAIAssistant');
const { contextManager } = require('./core/src/services/contextManager');

// 初始化
await contextManager.initialize();

// 代码生成
const result = await qwenAIAssistant.generateCode(
  '创建一个快速排序函数',
  'javascript'
);
console.log(result.content);

// 代码审查
const review = await qwenAIAssistant.reviewCode(
  yourCode,
  'javascript'
);
console.log(review.content);

// 上下文感知的问答
const answer = await qwenAIAssistant.generateWithContext(
  '这个项目的技术栈是什么？',
  {
    useContext: true,
    includeMemories: true,
    includeResources: true
  }
);
console.log(answer.content);
```

### 2. 添加项目记忆

```javascript
// 添加项目信息
await contextManager.addMemory(
  '本项目使用 Node.js + Express 作为后端，Vue 3 + Vite 作为前端',
  'project_info'
);

// 添加编码规范
await contextManager.addMemory(
  '代码风格：使用 ES6+ 语法，优先使用 async/await',
  'coding_style'
);

// 添加项目约定
await contextManager.addMemory(
  '所有 API 路由都以 /api/v1 开头',
  'project_conventions'
);
```

### 3. 运行完整示例

```bash
cd core
node examples/ai-assistant-example.js
```

## 🔧 API 接口

### OpenViking 服务 API

#### 健康检查
```bash
GET http://localhost:5000/health
```

#### 添加资源
```bash
POST http://localhost:5000/api/resource/add
{
  "path": "https://github.com/example/repo",
  "name": "my-project"
}
```

#### 搜索资源
```bash
POST http://localhost:5000/api/resource/search
{
  "query": "authentication",
  "target_uri": "viking://resources/"
}
```

#### 获取上下文
```bash
POST http://localhost:5000/api/context/get
{
  "query": "how to implement login",
  "include_memories": true,
  "include_resources": true
}
```

#### 添加记忆
```bash
POST http://localhost:5000/api/memory/add
{
  "content": "喜欢使用 TypeScript 进行开发",
  "category": "preferences"
}
```

## 📁 项目结构

```
qq-farm-bot-ui-main/
├── openviking-service/          # OpenViking Python 服务
│   ├── app.py                   # Flask 主应用
│   ├── client.js                # Node.js 客户端
│   ├── requirements.txt         # Python 依赖
│   ├── .env                     # 环境配置
│   ├── ov.conf                  # OpenViking 配置
│   └── test.js                  # 测试脚本
├── core/
│   ├── src/
│   │   └── services/
│   │       ├── contextManager.js     # 上下文管理器
│   │       └── qwenAIAssistant.js    # 千问 AI 助手
│   ├── examples/
│   │   └── ai-assistant-example.js   # 使用示例
│   └── .env.ai                  # AI 配置
├── start-with-ai.sh             # Linux/macOS 启动脚本
├── start-with-ai.bat            # Windows 启动脚本
└── README.AI.md                 # 本文档
```

## 🎯 使用场景

### 1. AI 辅助开发
- 生成样板代码
- 代码审查和优化
- 调试错误
- 学习新技术

### 2. 项目管理
- 记录项目决策
- 管理编码规范
- 存储常用代码片段
- 维护技术文档

### 3. 知识积累
- 记录解决问题的方法
- 存储最佳实践
- 建立团队知识库
- 新人培训资料

## ⚙️ 配置说明

### 千问模型参数

```javascript
{
  model: 'qwen3.5-plus',        // 模型名称
  temperature: 0.7,             // 创造性：0-1，越高越有创造性
  max_tokens: 4096,             // 最大生成长度
  top_p: 0.9                    // 核采样参数
}
```

### OpenViking 配置

```json
{
  "storage": {
    "workspace": "./openviking_data"
  },
  "embedding": {
    "api_base": "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1",
    "api_key": "sk-2cabc0684b6943ef81020be207ec8f17",
    "provider": "dashscope",
    "model": "text-embedding-v3"
  },
  "vlm": {
    "api_base": "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1",
    "api_key": "sk-2cabc0684b6943ef81020be207ec8f17",
    "model": "qwen3.5-plus"
  }
}
```

## 🔍 测试

### 测试 OpenViking 服务

```bash
cd openviking-service
node test.js
```

### 测试 AI 助手

```bash
cd core
node examples/ai-assistant-example.js
```

## 📝 注意事项

1. **API Key 安全**: 不要将 `.env` 文件提交到版本控制系统
2. **网络要求**: 需要能够访问阿里云百炼服务
3. **资源限制**: 注意 API 调用频率和 token 使用量
4. **数据隐私**: 敏感信息不要添加到 OpenViking 记忆库

## 🛠️ 故障排除

### OpenViking 服务无法启动

1. 检查 Python 版本是否为 3.10+
2. 确认已安装所有依赖：`pip install -r requirements.txt`
3. 检查端口 5000 是否被占用

### AI 助手无法使用

1. 检查 `DASHSCOPE_API_KEY` 是否正确配置
2. 确认网络连接正常
3. 查看日志文件了解详细错误信息

### 上下文检索不准确

1. 尝试添加更多相关记忆
2. 调整搜索查询的关键词
3. 检查 OpenViking 配置中的 embedding 模型

## 📚 相关文档

- [阿里云百炼千问 API 文档](https://help.aliyun.com/zh/model-studio/qwen-api-reference)
- [OpenViking 官方文档](https://www.openviking.ai/docs)
- [千问 3.5 Plus 模型介绍](https://help.aliyun.com/zh/model-studio/models#5ef284d4ed42p)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个集成！

## 📄 许可证

本项目遵循 MIT 许可证。

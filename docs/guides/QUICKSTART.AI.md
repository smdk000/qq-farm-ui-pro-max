# 🚀 快速入门指南

## 5 分钟快速启动 AI 编程助手

### 第一步：安装 Python 依赖（2 分钟）

```bash
# 进入 openviking-service 目录
cd openviking-service

# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 第二步：启动服务（1 分钟）

**方式 1：使用启动脚本（推荐）**

```bash
# 返回项目根目录
cd ..

# 启动所有服务（Linux/macOS）
./start-with-ai.sh

# 或者 Windows
# start-with-ai.bat
```

**方式 2：手动启动**

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

### 第三步：测试功能（2 分钟）

```bash
# 测试 OpenViking 服务
cd openviking-service
node test.js

# 运行完整示例
cd ../core
node examples/ai-assistant-example.js
```

## 🎯 核心功能一览

### 1. 代码生成

```javascript
const { qwenAIAssistant } = require('./core/src/services/qwenAIAssistant');

const result = await qwenAIAssistant.generateCode(
  '创建一个快速排序函数',
  'javascript'
);
console.log(result.content);
```

### 2. 代码审查

```javascript
const review = await qwenAIAssistant.reviewCode(
  yourCode,
  'javascript'
);
console.log(review.content);
```

### 3. 上下文感知问答

```javascript
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

### 4. 添加项目记忆

```javascript
const { contextManager } = require('./core/src/services/contextManager');

await contextManager.addMemory(
  '本项目使用 Node.js + Express 作为后端',
  'project_info'
);
```

## 📋 API Key 配置

已配置的 API Key：
- **阿里云百炼**: `sk-2cabc0684b6943ef81020be207ec8f17`
- **模型**: 千问 3.5 Plus (qwen3.5-plus)

如需修改，编辑以下文件：
- `openviking-service/.env`
- `openviking-service/ov.conf`

## 🔍 常见问题

### Q: OpenViking 服务启动失败？
A: 检查 Python 版本（需要 3.10+）和依赖是否安装完整

### Q: AI 助手无法使用？
A: 确认 API Key 正确，网络连接正常

### Q: 如何查看日志？
A: 查看终端输出或 `*.log` 文件

## 📚 完整文档

详细使用说明请查看 [README.AI.md](README.AI.md)

## 🎉 开始使用

现在你可以：
1. 在代码中集成 AI 助手
2. 让 AI 帮你写代码、审查代码、调试错误
3. 添加项目记忆，让 AI 更了解你的项目
4. 使用上下文感知功能，获得更精准的回答

祝你使用愉快！🚀

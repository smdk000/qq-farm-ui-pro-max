# ✅ 部署验证清单

## 部署完成检查

### 文件创建检查
- [ ] `openviking-service/app.py` - Python Flask 服务
- [ ] `openviking-service/client.js` - Node.js 客户端
- [ ] `openviking-service/requirements.txt` - Python 依赖
- [ ] `openviking-service/.env` - 环境配置
- [ ] `openviking-service/ov.conf` - OpenViking 配置
- [ ] `core/src/services/contextManager.js` - 上下文管理器
- [ ] `core/src/services/qwenAIAssistant.js` - AI 助手
- [ ] `core/examples/ai-assistant-example.js` - 使用示例
- [ ] `start-with-ai.sh` - Linux/macOS 启动脚本
- [ ] `start-with-ai.bat` - Windows 启动脚本
- [ ] `README.AI.md` - 完整文档
- [ ] `QUICKSTART.AI.md` - 快速入门
- [ ] `INTEGRATION_SUMMARY.md` - 集成总结

### 配置检查
- [ ] API Key 已配置：`sk-2cabc0684b6943ef81020be207ec8f17`
- [ ] 模型已配置：`qwen3.5-plus`
- [ ] 端口已配置：`5000`
- [ ] 工作目录已配置：`./openviking_data`

## 功能测试步骤

### 第一步：启动服务

```bash
# 方式 1：使用启动脚本
./start-with-ai.sh

# 方式 2：手动启动
# 终端 1
cd openviking-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py

# 终端 2
cd core
npm install
npm start
```

### 第二步：验证 OpenViking 服务

```bash
# 健康检查
curl http://localhost:5000/health

# 预期输出：
# {"status":"healthy","workspace":"./openviking_data"}
```

### 第三步：运行测试脚本

```bash
cd openviking-service
node test.js
```

**预期结果**：所有 8 个测试通过

### 第四步：运行完整示例

```bash
cd core
node examples/ai-assistant-example.js
```

**预期结果**：
- ✅ 上下文管理器初始化成功
- ✅ 项目资源添加成功
- ✅ 开发记忆添加成功
- ✅ 代码生成示例运行
- ✅ 代码审查示例运行
- ✅ 代码解释示例运行
- ✅ 调试帮助示例运行
- ✅ 学习功能测试通过
- ✅ 上下文感知问答成功

### 第五步：验证 AI 功能

#### 测试代码生成
```javascript
const { qwenAIAssistant } = require('./core/src/services/qwenAIAssistant');
const result = await qwenAIAssistant.generateCode(
  '创建快速排序函数',
  'javascript'
);
console.log(result.content);
```

#### 测试代码审查
```javascript
const review = await qwenAIAssistant.reviewCode(
  'function test() { return 1/0; }',
  'javascript'
);
console.log(review.content);
```

#### 测试上下文记忆
```javascript
const { contextManager } = require('./core/src/services/contextManager');
await contextManager.addMemory(
  '测试记忆：项目使用 ES6+ 语法',
  'coding_style'
);
const memories = await contextManager.listMemories();
console.log('记忆列表:', memories);
```

## 常见问题排查

### ❌ OpenViking 服务无法启动

**检查项**：
- [ ] Python 版本 >= 3.10
- [ ] 依赖已安装：`pip install -r requirements.txt`
- [ ] 端口 5000 未被占用
- [ ] `.env` 文件存在且配置正确

**解决方案**：
```bash
python3 --version  # 检查版本
pip list | grep -E 'flask|openviking'  # 检查依赖
lsof -i :5000  # 检查端口占用
```

### ❌ AI 助手无法使用

**检查项**：
- [ ] `DASHSCOPE_API_KEY` 环境变量已设置
- [ ] 网络连接正常
- [ ] API Key 有效
- [ ] OpenViking 服务已启动

**解决方案**：
```bash
# 检查环境变量
echo $DASHSCOPE_API_KEY

# 测试网络连接
curl https://dashscope.aliyuncs.com

# 检查服务状态
curl http://localhost:5000/health
```

### ❌ 上下文检索不准确

**检查项**：
- [ ] 已添加足够的项目记忆
- [ ] 搜索关键词准确
- [ ] OpenViking 配置正确
- [ ] Embedding 模型配置正确

**解决方案**：
```javascript
// 添加更多记忆
await contextManager.addMemory(
  '项目技术栈：Node.js + Express + Vue 3',
  'project_info'
);

// 测试检索
const context = await contextManager.getRelatedContext('技术栈');
console.log(context);
```

## 性能检查

### 响应时间
- [ ] OpenViking 健康检查：< 100ms
- [ ] 添加资源：< 5s
- [ ] 搜索上下文：< 3s
- [ ] AI 生成回复：< 10s

### 资源使用
- [ ] Python 服务内存：< 500MB
- [ ] Node.js 服务内存：< 200MB
- [ ] CPU 使用率：< 50%

## 安全检查

- [ ] `.env` 文件未提交到 Git
- [ ] API Key 未硬编码到代码中
- [ ] 服务仅监听 localhost
- [ ] 已配置 CORS（如需跨域）

## 文档检查

- [ ] README.AI.md 完整且准确
- [ ] QUICKSTART.AI.md 步骤清晰
- [ ] 示例代码可运行
- [ ] API 文档完整

## 最终验证

### 完整工作流测试

1. **启动服务** ✅
   ```bash
   ./start-with-ai.sh
   ```

2. **添加项目资源** ✅
   ```javascript
   await contextManager.addProjectResource(
     '/path/to/project',
     'my-project'
   );
   ```

3. **学习项目知识** ✅
   ```javascript
   await contextManager.addMemory(
     '使用 TypeScript 开发',
     'coding_style'
   );
   ```

4. **AI 辅助编程** ✅
   ```javascript
   const code = await qwenAIAssistant.generateCode(
     '创建 HTTP 服务器',
     'typescript'
   );
   ```

5. **代码审查** ✅
   ```javascript
   const review = await qwenAIAssistant.reviewCode(
     code.content,
     'typescript'
   );
   ```

6. **清理关闭** ✅
   ```javascript
   await contextManager.close();
   ```

## 验收标准

所有以下功能必须正常工作：

- ✅ OpenViking 服务启动成功
- ✅ 健康检查通过
- ✅ 可以添加资源
- ✅ 可以添加记忆
- ✅ 可以搜索上下文
- ✅ AI 助手可以生成代码
- ✅ AI 助手可以审查代码
- ✅ AI 助手可以解释代码
- ✅ AI 助手可以调试代码
- ✅ 上下文感知功能正常
- ✅ 学习功能正常

## 下一步

验证完成后，你可以：

1. 🎉 开始使用 AI 辅助编程
2. 📚 添加更多项目文档到 OpenViking
3. 🧠 建立项目专属知识库
4. 🚀 集成到日常开发工作流
5. 📊 监控 API 使用情况和性能

---

**验证完成日期**: _______________

**验证人**: _______________

**备注**: _______________

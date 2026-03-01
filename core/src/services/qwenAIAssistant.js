/**
 * 千问 3.5 Plus AI 编程助手服务
 * 使用 OpenViking 管理上下文记忆
 */

const axios = require('axios');
const logger = require('./utils/logger');
const { contextManager } = require('./contextManager');

class QwenAIAssistant {
  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY;
    this.baseURL = 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1';
    this.model = 'qwen3.5-plus';
    
    if (!this.apiKey) {
      logger.error('[QwenAIAssistant] 未配置 DASHSCOPE_API_KEY');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 生成代码上下文感知的回复
   * @param {string} prompt - 用户提示
   * @param {Object} options - 选项
   */
  async generateWithContext(prompt, options = {}) {
    try {
      // 获取相关上下文
      let systemContext = '';
      
      if (options.useContext !== false && contextManager.isEnabled()) {
        const context = await contextManager.getRelatedContext(prompt, {
          includeMemories: options.includeMemories !== false,
          includeResources: options.includeResources !== false
        });
        
        if (context) {
          systemContext = `以下是相关的项目上下文和记忆信息，请在回答时参考：\n\n${context}\n\n`;
        }
      }

      // 构建系统消息
      const systemMessage = options.systemPrompt || 
        '你是一个专业的 AI 编程助手，基于千问 3.5 Plus 模型。你擅长代码生成、代码审查、调试和技术咨询。你会根据提供的上下文信息给出精准、专业的回答。';

      // 构建消息
      const messages = [
        {
          role: 'system',
          content: systemContext + systemMessage
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      // 添加历史对话（如果有）
      if (options.messages && Array.isArray(options.messages)) {
        messages.push(...options.messages);
      }

      // 调用 API
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4096,
        top_p: options.topP || 0.9,
        stream: false,
        enable_thinking: options.enableThinking || false
      });

      const result = response.data;
      const assistantMessage = result.choices?.[0]?.message?.content || '';

      logger.info('[QwenAIAssistant] 生成成功', {
        promptLength: prompt.length,
        responseLength: assistantMessage.length,
        usage: result.usage
      });

      return {
        content: assistantMessage,
        usage: result.usage,
        model: result.model
      };

    } catch (error) {
      logger.error('[QwenAIAssistant] 生成失败', {
        prompt: prompt.substring(0, 100),
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * 代码生成
   * @param {string} description - 代码功能描述
   * @param {string} language - 编程语言
   * @param {Object} options - 选项
   */
  async generateCode(description, language = 'javascript', options = {}) {
    const prompt = `请生成${language}代码，实现以下功能：\n\n${description}\n\n要求：
1. 代码要遵循最佳实践
2. 添加必要的注释
3. 考虑错误处理
4. 如果有依赖，请说明如何安装`;

    return await this.generateWithContext(prompt, {
      ...options,
      systemPrompt: `你是一个专业的${language}开发工程师，擅长编写高质量、可维护的代码。`
    });
  }

  /**
   * 代码审查
   * @param {string} code - 代码内容
   * @param {string} language - 编程语言
   * @param {Object} options - 选项
   */
  async reviewCode(code, language = 'javascript', options = {}) {
    const prompt = `请审查以下${language}代码，指出潜在的问题并提供改进建议：\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n请从以下方面进行审查：
1. 代码风格和可读性
2. 潜在的错误和 bug
3. 性能问题
4. 安全性问题
5. 最佳实践的遵循情况`;

    return await this.generateWithContext(prompt, {
      ...options,
      systemPrompt: '你是一个经验丰富的代码审查专家，擅长发现代码中的问题并提供建设性的改进建议。'
    });
  }

  /**
   * 代码解释
   * @param {string} code - 代码内容
   * @param {string} language - 编程语言
   * @param {Object} options - 选项
   */
  async explainCode(code, language = 'javascript', options = {}) {
    const prompt = `请详细解释以下${language}代码的功能和实现逻辑：\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n请说明：
1. 代码的整体功能
2. 关键部分的工作原理
3. 使用的技术和模式
4. 可能的改进方向`;

    return await this.generateWithContext(prompt, {
      ...options,
      systemPrompt: '你是一个善于教学的编程导师，能够清晰地解释代码的工作原理和设计理念。'
    });
  }

  /**
   * 调试帮助
   * @param {string} code - 代码内容
   * @param {string} error - 错误信息
   * @param {Object} options - 选项
   */
  async debugCode(code, error, options = {}) {
    const prompt = `我在运行以下代码时遇到了错误：\n\n错误信息：\n${error}\n\n代码：\n\`\`\`\n${code}\n\`\`\`\n\n请帮我：
1. 分析错误原因
2. 提供解决方案
3. 给出修复后的代码`;

    return await this.generateWithContext(prompt, {
      ...options,
      systemPrompt: '你是一个专业的调试专家，擅长快速定位和解决各种编程问题。'
    });
  }

  /**
   * 学习记忆（将重要信息添加到 OpenViking）
   * @param {string} content - 要记忆的内容
   * @param {string} category - 分类
   */
  async learn(content, category = 'coding_knowledge') {
    if (!contextManager.isEnabled()) {
      logger.warn('[QwenAIAssistant] OpenViking 未启用，无法学习');
      return false;
    }

    try {
      await contextManager.addMemory(content, category);
      logger.info('[QwenAIAssistant] 学习成功', { category });
      return true;
    } catch (error) {
      logger.error('[QwenAIAssistant] 学习失败', {
        category,
        error: error.message
      });
      return false;
    }
  }
}

// 导出单例
const qwenAIAssistant = new QwenAIAssistant();

module.exports = {
  QwenAIAssistant,
  qwenAIAssistant
};

/**
 * OpenViking 上下文管理服务
 * 用于管理 AI 编程时的上下文记忆
 */

const OpenVikingClient = require('../openviking-service/client');
const logger = require('./utils/logger');

class ContextManager {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.currentContext = null;
  }

  /**
   * 初始化上下文管理器
   */
  async initialize() {
    try {
      const baseURL = process.env.OPENVIKING_URL || 'http://localhost:5000';
      this.client = new OpenVikingClient(baseURL);
      
      // 检查服务是否可用
      const health = await this.client.healthCheck();
      this.enabled = health.status === 'healthy';
      
      if (this.enabled) {
        logger.info('[ContextManager] OpenViking 服务已连接', {
          workspace: health.workspace
        });
      } else {
        logger.warn('[ContextManager] OpenViking 服务未就绪');
      }
      
      return this.enabled;
    } catch (error) {
      logger.error('[ContextManager] 初始化失败', { error: error.message });
      this.enabled = false;
      return false;
    }
  }

  /**
   * 添加项目资源
   * @param {string} projectPath - 项目路径
   * @param {string} projectName - 项目名称
   */
  async addProjectResource(projectPath, projectName) {
    if (!this.enabled) {
      logger.warn('[ContextManager] 服务未启用，跳过添加项目资源');
      return false;
    }

    try {
      const result = await this.client.addResource(projectPath, projectName);
      logger.info('[ContextManager] 项目资源添加成功', {
        projectName,
        uri: result.root_uri
      });
      return result;
    } catch (error) {
      logger.error('[ContextManager] 添加项目资源失败', {
        projectName,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 添加开发记忆
   * @param {string} content - 记忆内容
   * @param {string} category - 分类（如：coding_style, preferences, patterns 等）
   */
  async addMemory(content, category = 'coding_style') {
    if (!this.enabled) {
      logger.warn('[ContextManager] 服务未启用，跳过添加记忆');
      return false;
    }

    try {
      const result = await this.client.addMemory(content, category);
      logger.info('[ContextManager] 记忆添加成功', {
        category,
        uri: result.uri
      });
      return result;
    } catch (error) {
      logger.error('[ContextManager] 添加记忆失败', {
        category,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 获取相关上下文
   * @param {string} query - 查询内容
   * @param {Object} options - 选项
   */
  async getRelatedContext(query, options = {}) {
    if (!this.enabled) {
      logger.debug('[ContextManager] 服务未启用，返回空上下文');
      return '';
    }

    try {
      const {
        includeMemories = true,
        includeResources = true
      } = options;

      const result = await this.client.getContext(
        query,
        includeMemories,
        includeResources
      );

      this.currentContext = result.context;
      
      logger.info('[ContextManager] 获取上下文成功', {
        query,
        contextLength: result.context?.length || 0
      });

      return result.context || '';
    } catch (error) {
      logger.error('[ContextManager] 获取上下文失败', {
        query,
        error: error.message
      });
      return '';
    }
  }

  /**
   * 搜索项目资源
   * @param {string} query - 搜索查询
   */
  async searchResources(query) {
    if (!this.enabled) {
      return [];
    }

    try {
      const result = await this.client.searchResource(query);
      return result.results || [];
    } catch (error) {
      logger.error('[ContextManager] 搜索资源失败', {
        query,
        error: error.message
      });
      return [];
    }
  }

  /**
   * 列出所有记忆
   * @param {string} category - 分类（可选）
   */
  async listMemories(category = '') {
    if (!this.enabled) {
      return [];
    }

    try {
      const result = await this.client.listMemories(category);
      return result.memories || [];
    } catch (error) {
      logger.error('[ContextManager] 列出记忆失败', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * 清除当前上下文
   */
  async clearContext() {
    if (!this.enabled) {
      return false;
    }

    try {
      const result = await this.client.clearContext();
      this.currentContext = null;
      logger.info('[ContextManager] 上下文已清除');
      return result;
    } catch (error) {
      logger.error('[ContextManager] 清除上下文失败', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * 获取当前上下文
   */
  getCurrentContext() {
    return this.currentContext;
  }

  /**
   * 检查服务是否可用
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.enabled) {
      try {
        await this.client.shutdown();
        logger.info('[ContextManager] 服务已关闭');
      } catch (error) {
        logger.error('[ContextManager] 关闭服务失败', {
          error: error.message
        });
      }
    }
    this.enabled = false;
    this.client = null;
  }
}

// 导出单例
const contextManager = new ContextManager();

module.exports = {
  ContextManager,
  contextManager
};

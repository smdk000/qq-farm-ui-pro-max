/**
 * OpenViking Context Management Client
 * 用于与 OpenViking Python 服务通信的 Node.js 客户端
 */

const axios = require('axios');

class OpenVikingClient {
  constructor(baseURL = 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`健康检查失败：${error.message}`);
    }
  }

  /**
   * 添加资源（文档、代码等）
   * @param {string} path - 资源路径（URL 或文件路径）
   * @param {string} name - 资源名称
   */
  async addResource(path, name = 'default') {
    try {
      const response = await this.client.post('/api/resource/add', {
        path,
        name
      });
      return response.data;
    } catch (error) {
      throw new Error(`添加资源失败：${error.message}`);
    }
  }

  /**
   * 列出资源
   * @param {string} uri - 资源 URI，默认为 viking://resources/
   */
  async listResources(uri = 'viking://resources/') {
    try {
      const response = await this.client.get('/api/resource/list', {
        params: { uri }
      });
      return response.data;
    } catch (error) {
      throw new Error(`列出资源失败：${error.message}`);
    }
  }

  /**
   * 搜索资源
   * @param {string} query - 搜索查询
   * @param {string} targetUri - 目标 URI
   */
  async searchResource(query, targetUri = 'viking://resources/') {
    try {
      const response = await this.client.post('/api/resource/search', {
        query,
        target_uri: targetUri
      });
      return response.data;
    } catch (error) {
      throw new Error(`搜索资源失败：${error.message}`);
    }
  }

  /**
   * 读取资源内容
   * @param {string} uri - 资源 URI
   */
  async readResource(uri) {
    try {
      const response = await this.client.post('/api/resource/read', {
        uri
      });
      return response.data;
    } catch (error) {
      throw new Error(`读取资源失败：${error.message}`);
    }
  }

  /**
   * 获取资源摘要
   * @param {string} uri - 资源 URI
   */
  async getAbstract(uri) {
    try {
      const response = await this.client.post('/api/resource/abstract', {
        uri
      });
      return response.data;
    } catch (error) {
      throw new Error(`获取摘要失败：${error.message}`);
    }
  }

  /**
   * 获取资源概览
   * @param {string} uri - 资源 URI
   */
  async getOverview(uri) {
    try {
      const response = await this.client.post('/api/resource/overview', {
        uri
      });
      return response.data;
    } catch (error) {
      throw new Error(`获取概览失败：${error.message}`);
    }
  }

  /**
   * 添加记忆
   * @param {string} content - 记忆内容
   * @param {string} category - 记忆分类
   */
  async addMemory(content, category = 'general') {
    try {
      const response = await this.client.post('/api/memory/add', {
        content,
        category
      });
      return response.data;
    } catch (error) {
      throw new Error(`添加记忆失败：${error.message}`);
    }
  }

  /**
   * 列出记忆
   * @param {string} category - 记忆分类（可选）
   */
  async listMemories(category = '') {
    try {
      const response = await this.client.get('/api/memory/list', {
        params: { category }
      });
      return response.data;
    } catch (error) {
      throw new Error(`列出记忆失败：${error.message}`);
    }
  }

  /**
   * 获取上下文（用于 AI 编程）
   * @param {string} query - 查询内容
   * @param {boolean} includeMemories - 是否包含记忆
   * @param {boolean} includeResources - 是否包含资源
   */
  async getContext(query, includeMemories = true, includeResources = true) {
    try {
      const response = await this.client.post('/api/context/get', {
        query,
        include_memories: includeMemories,
        include_resources: includeResources
      });
      return response.data;
    } catch (error) {
      throw new Error(`获取上下文失败：${error.message}`);
    }
  }

  /**
   * 清除上下文
   */
  async clearContext() {
    try {
      const response = await this.client.post('/api/context/clear');
      return response.data;
    } catch (error) {
      throw new Error(`清除上下文失败：${error.message}`);
    }
  }

  /**
   * 关闭服务
   */
  async shutdown() {
    try {
      const response = await this.client.post('/shutdown');
      return response.data;
    } catch (error) {
      throw new Error(`关闭服务失败：${error.message}`);
    }
  }
}

module.exports = OpenVikingClient;

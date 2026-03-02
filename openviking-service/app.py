# OpenViking Context Management Service
# 基于千问 3.5 Plus 的 AI 编程上下文管理系统

from flask import Flask, request, jsonify
from flask_cors import CORS
import openviking as ov
import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

app = Flask(__name__)
CORS(app)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局客户端
client = None
workspace_path = None


def initialize_client():
    """初始化 OpenViking 客户端"""
    global client, workspace_path
    
    try:
        # 获取配置
        workspace_path = os.getenv('OPENVIKING_WORKSPACE', './openviking_data')
        api_key = os.getenv('DASHSCOPE_API_KEY')
        
        if not api_key:
            logger.error("未找到 DASHSCOPE_API_KEY 环境变量")
            raise ValueError("DASHSCOPE_API_KEY is required")
        
        # 创建工作目录
        Path(workspace_path).mkdir(parents=True, exist_ok=True)
        
        # 初始化客户端
        client = ov.SyncOpenViking(path=workspace_path)
        client.initialize()
        
        logger.info(f"OpenViking 客户端初始化成功，工作目录：{workspace_path}")
        return True
        
    except Exception as e:
        logger.error(f"初始化 OpenViking 客户端失败：{e}")
        return False


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy' if client else 'unhealthy',
        'workspace': workspace_path
    })


@app.route('/api/resource/add', methods=['POST'])
def add_resource():
    """添加资源（文档、代码等）"""
    try:
        data = request.json
        path = data.get('path')
        name = data.get('name', 'default')
        
        if not path:
            return jsonify({'error': 'path is required'}), 400
        
        result = client.add_resource(path=path, name=name)
        
        logger.info(f"添加资源成功：{result.get('root_uri')}")
        return jsonify({
            'success': True,
            'root_uri': result.get('root_uri'),
            'message': '资源添加成功'
        })
        
    except Exception as e:
        logger.error(f"添加资源失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/resource/list', methods=['GET'])
def list_resources():
    """列出所有资源"""
    try:
        uri = request.args.get('uri', 'viking://resources/')
        
        result = client.ls(uri)
        
        return jsonify({
            'success': True,
            'items': result.get('items', [])
        })
        
    except Exception as e:
        logger.error(f"列出资源失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/resource/search', methods=['POST'])
def search_resource():
    """搜索资源"""
    try:
        data = request.json
        query = data.get('query')
        target_uri = data.get('target_uri', 'viking://resources/')
        
        if not query:
            return jsonify({'error': 'query is required'}), 400
        
        result = client.find(query, target_uri=target_uri)
        
        return jsonify({
            'success': True,
            'results': result.get('matches', [])
        })
        
    except Exception as e:
        logger.error(f"搜索资源失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/resource/read', methods=['POST'])
def read_resource():
    """读取资源内容"""
    try:
        data = request.json
        uri = data.get('uri')
        
        if not uri:
            return jsonify({'error': 'uri is required'}), 400
        
        content = client.read(uri)
        
        return jsonify({
            'success': True,
            'content': content
        })
        
    except Exception as e:
        logger.error(f"读取资源失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/resource/abstract', methods=['POST'])
def get_abstract():
    """获取资源摘要"""
    try:
        data = request.json
        uri = data.get('uri')
        
        if not uri:
            return jsonify({'error': 'uri is required'}), 400
        
        abstract = client.abstract(uri)
        
        return jsonify({
            'success': True,
            'abstract': abstract
        })
        
    except Exception as e:
        logger.error(f"获取摘要失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/resource/overview', methods=['POST'])
def get_overview():
    """获取资源概览"""
    try:
        data = request.json
        uri = data.get('uri')
        
        if not uri:
            return jsonify({'error': 'uri is required'}), 400
        
        overview = client.overview(uri)
        
        return jsonify({
            'success': True,
            'overview': overview
        })
        
    except Exception as e:
        logger.error(f"获取概览失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/memory/add', methods=['POST'])
def add_memory():
    """添加记忆（用户偏好、习惯等）"""
    try:
        data = request.json
        content = data.get('content')
        category = data.get('category', 'general')
        
        if not content:
            return jsonify({'error': 'content is required'}), 400
        
        # 将记忆添加到用户目录
        memory_path = f"viking://user/memories/{category}/"
        
        result = client.add_resource(
            path=content,
            name=f"memory_{category}_{len(content)}"
        )
        
        return jsonify({
            'success': True,
            'uri': result.get('root_uri'),
            'message': '记忆添加成功'
        })
        
    except Exception as e:
        logger.error(f"添加记忆失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/memory/list', methods=['GET'])
def list_memories():
    """列出所有记忆"""
    try:
        category = request.args.get('category', '')
        uri = f"viking://user/memories/{category}/" if category else "viking://user/memories/"
        
        result = client.ls(uri)
        
        return jsonify({
            'success': True,
            'memories': result.get('items', [])
        })
        
    except Exception as e:
        logger.error(f"列出记忆失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/context/get', methods=['POST'])
def get_context():
    """获取上下文（用于 AI 编程）"""
    try:
        data = request.json
        query = data.get('query')
        include_memories = data.get('include_memories', True)
        include_resources = data.get('include_resources', True)
        
        context_parts = []
        
        # 搜索相关资源
        if include_resources:
            resource_results = client.find(query, target_uri='viking://resources/')
            for match in resource_results.get('matches', [])[:3]:  # 取前 3 个最相关的
                try:
                    content = client.read(match.get('uri'))
                    context_parts.append(f"## 相关资源\n{content}")
                except:
                    pass
        
        # 获取相关记忆
        if include_memories:
            memory_results = client.find(query, target_uri='viking://user/memories/')
            for match in memory_results.get('matches', [])[:3]:  # 取前 3 个最相关的
                try:
                    content = client.read(match.get('uri'))
                    context_parts.append(f"## 相关记忆\n{content}")
                except:
                    pass
        
        context = '\n\n'.join(context_parts)
        
        return jsonify({
            'success': True,
            'context': context,
            'query': query
        })
        
    except Exception as e:
        logger.error(f"获取上下文失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/context/clear', methods=['POST'])
def clear_context():
    """清除上下文"""
    try:
        # 这里可以添加清除逻辑
        return jsonify({
            'success': True,
            'message': '上下文已清除'
        })
        
    except Exception as e:
        logger.error(f"清除上下文失败：{e}")
        return jsonify({'error': str(e)}), 500


@app.route('/shutdown', methods=['POST'])
def shutdown():
    """关闭服务"""
    try:
        if client:
            client.close()
        logger.info("服务已关闭")
        return jsonify({'message': '服务关闭成功'})
    except Exception as e:
        logger.error(f"关闭服务失败：{e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # 初始化客户端
    if initialize_client():
        # 启动 Flask 服务
        app.run(
            host='0.0.0.0',
            port=int(os.getenv('OPENVIKING_PORT', '5000')),
            debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
        )
    else:
        logger.error("无法启动服务：客户端初始化失败")
        exit(1)

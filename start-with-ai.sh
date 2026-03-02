#!/bin/bash

# OpenViking + 千问 3.5 Plus 服务启动脚本

echo "🚀 启动 OpenViking 上下文管理服务..."

# 检查 Python 版本
python3 --version

# 进入 openviking-service 目录
cd "$(dirname "$0")/openviking-service"

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "📦 创建 Python 虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "📦 安装 Python 依赖..."
pip install -r requirements.txt

# 创建工作目录
mkdir -p openviking_data

# 启动 OpenViking 服务
echo "🔥 启动 OpenViking 服务（端口 5000）..."
python app.py &

OPENVIKING_PID=$!

# 等待服务启动
echo "⏳ 等待 OpenViking 服务启动..."
sleep 5

# 检查服务是否启动成功
if ps -p $OPENVIKING_PID > /dev/null; then
    echo "✅ OpenViking 服务已启动 (PID: $OPENVIKING_PID)"
else
    echo "❌ OpenViking 服务启动失败"
    exit 1
fi

# 返回项目根目录
cd ..

# 启动 Node.js 核心服务
echo "🔥 启动 Node.js 核心服务..."
cd core
npm install
npm start

# 清理（当 Node.js 服务停止时）
echo "⏹️  停止 OpenViking 服务..."
kill $OPENVIKING_PID

echo "👋 所有服务已停止"

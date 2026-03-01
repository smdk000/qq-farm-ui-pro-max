#!/bin/bash

# QQ 农场智能助手 - 快速启动脚本

echo "======================================"
echo "  QQ 农场智能助手 - 快速启动"
echo "======================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js 20+"
    echo "   访问：https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本：$(node -v)"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  未检测到 pnpm，尝试启用..."
    corepack enable
fi

echo "✅ pnpm 版本：$(pnpm -v)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 首次运行，正在安装依赖..."
    pnpm install
fi

# 检查前端构建
if [ ! -d "web/dist" ]; then
    echo ""
    echo "🔨 正在构建前端..."
    pnpm build:web
fi

# 设置管理员密码
echo ""
echo "🔐 管理员密码配置："
echo "   1. 使用默认密码：admin"
echo "   2. 自定义密码"
read -p "请选择 (1/2): " password_choice

if [ "$password_choice" = "2" ]; then
    read -s -p "输入管理员密码：" ADMIN_PASSWORD
    echo ""
    export ADMIN_PASSWORD
    echo "✅ 密码已设置"
fi

# 启动服务
echo ""
echo "🚀 正在启动服务..."
echo "======================================"
echo ""
echo "📌 访问地址：http://localhost:3000"
echo "📌 默认账号：admin / admin"
echo ""
echo "⚠️  按 Ctrl+C 停止服务"
echo "======================================"
echo ""

pnpm dev:core

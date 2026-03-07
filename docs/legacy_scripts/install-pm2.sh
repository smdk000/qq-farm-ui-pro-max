#!/usr/bin/env bash
# PM2 安装与部署 (T10e)
# 来源: NC 版 install-pm2.sh，已适配本项目

echo "=========================================="
echo "  使用 PM2 部署项目"
echo "=========================================="
echo ""

APP_NAME="qq-farm-bot"

if ! command -v pm2 &> /dev/null; then
    echo "🔧 正在全局安装 PM2..."
    npm install -g pm2
fi

echo "🚀 使用 PM2 启动项目..."
# 使用 pnpm 继续启动
pm2 start "pnpm dev:core" --name "$APP_NAME"

echo "💾 保存 PM2 进程列表以实现开机自启..."
pm2 save

echo "🔧 配置开机自启脚本..."
pm2 startup | awk 'NR>=2' | sh

echo "=========================================="
echo "✅ PM2 部署完成！"
echo ""
echo "常用命令:"
echo "  pm2 status       # 查看状态"
echo "  pm2 logs $APP_NAME  # 查看日志"
echo "  pm2 restart $APP_NAME  # 重启项目"
echo "  pm2 stop $APP_NAME     # 停止项目"
echo "=========================================="

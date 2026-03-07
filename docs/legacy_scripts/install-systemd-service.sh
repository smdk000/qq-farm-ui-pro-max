#!/usr/bin/env bash
# Systemd 服务部署 (T10f)
# 来源: NC 版 install-systemd-service.sh，已适配本项目 (注意: 仅适用于 Linux)

if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 sudo 运行此脚本 (例如: sudo ./install-systemd-service.sh)"
  exit 1
fi

APP_DIR=$(pwd)
APP_USER=$(who am i | awk '{print $1}')
NODE_PATH=$(command -v node)
PNPM_PATH=$(command -v pnpm)

if [ -z "$PNPM_PATH" ]; then
    echo "❌ 未找到 pnpm，请确保 pnpm 可在全局路径使用"
    exit 1
fi

SERVICE_FILE="/etc/systemd/system/qq-farm-bot.service"

echo "🔧 创建 systemd 配置文件..."
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=QQ Farm Bot Service
After=network.target mysql.service redis-server.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=${PNPM_PATH} dev:core
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "🔄 重载 systemd..."
systemctl daemon-reload

echo "🚀 启动服务并设置开机自启..."
systemctl enable qq-farm-bot
systemctl start qq-farm-bot

echo "=========================================="
echo "✅ systemd 服务部署完成！"
echo ""
echo "常用命令:"
echo "  sudo systemctl status qq-farm-bot    # 查看状态"
echo "  sudo journalctl -u qq-farm-bot -f    # 查看实时日志"
echo "  sudo systemctl restart qq-farm-bot   # 重启服务"
echo "  sudo systemctl stop qq-farm-bot      # 停止服务"
echo "=========================================="

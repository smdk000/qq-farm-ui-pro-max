#!/usr/bin/env bash
# MySQL 密码修复工具 (T10b)
# 来源: NC 版 fix-mysql-password.sh，已适配本项目

echo "=========================================="
echo "  MySQL 密码修复向导"
echo "=========================================="
echo ""
echo "此脚本将尝试重置本机 MySQL 的 root 密码为 '123456'"
echo "⚠️ 需要使用 sudo 权限"
echo ""

if ! command -v mysql &> /dev/null; then
    echo "❌ 错误: 未检测到 MySQL 安装"
    exit 1
fi

read -p "确认继续? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo "🔧 尝试绕过权限表重置密码..."
sudo systemctl stop mysql || sudo service mysql stop

sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

echo "ALTER USER 'root'@'localhost' IDENTIFIED BY '123456'; FLUSH PRIVILEGES;" > /tmp/mysql-init.sql
sudo mysqld --init-file=/tmp/mysql-init.sql &
MYSQLD_PID=$!

sleep 5
sudo kill $MYSQLD_PID
rm /tmp/mysql-init.sql

sudo systemctl start mysql || sudo service mysql start

echo "✅ 密码重置尝试完成！"
echo "尝试连接..."
if mysql -u root -p'123456' -e "SELECT 1;" &>/dev/null; then
    echo "🎉 修复成功！当前 root 密码已设置为 123456"
else
    echo "❌ 自动修复失败，可能您的 MySQL 版本不兼容此方式，由于是 Mac 环境，可能需要手动修复。"
fi

#!/usr/bin/env bash
# 快速启动向导 - 环境检测 + 引导式启动
# 来源: NC 版 quick-start.sh (T7)，已适配本项目目录结构

echo "=========================================="
echo "  QQ 农场 Bot - 快速启动向导"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    echo "   cd /path/to/qq-farm-bot-ui"
    exit 1
fi

echo "📋 启动前检查..."
echo ""

# 检查 MySQL
echo "1️⃣  检查 MySQL..."
if command -v mysql &> /dev/null; then
    echo "   ✅ MySQL 已安装"
    if mysql -u root -p'123456' -e "SELECT 1;" &>/dev/null 2>&1; then
        echo "   ✅ MySQL 连接正常"
        MYSQL_OK=1
    else
        echo "   ⚠️  MySQL 连接失败，可能密码不正确"
        MYSQL_OK=0
    fi
else
    echo "   ❌ MySQL 未安装"
    MYSQL_OK=0
fi
echo ""

# 检查 Redis
echo "2️⃣  检查 Redis..."
if command -v redis-cli &> /dev/null; then
    echo "   ✅ Redis 已安装"
    if redis-cli ping &>/dev/null 2>&1; then
        echo "   ✅ Redis 运行正常"
        REDIS_OK=1
    else
        echo "   ⚠️  Redis 未运行"
        REDIS_OK=0
    fi
else
    echo "   ❌ Redis 未安装"
    REDIS_OK=0
fi
echo ""

# 检查 Node.js
echo "3️⃣  检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    echo "   ✅ Node.js 已安装 (版本: $NODE_VERSION)"
    NODE_OK=1
else
    echo "   ❌ Node.js 未安装"
    NODE_OK=0
fi
echo ""

# 检查 pnpm
echo "4️⃣  检查 pnpm..."
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "   ✅ pnpm 已安装 (版本: $PNPM_VERSION)"
    PNPM_OK=1
else
    echo "   ❌ pnpm 未安装"
    PNPM_OK=0
fi
echo ""

# 决定启动方式
echo "=========================================="
echo "  诊断结果"
echo "=========================================="
echo ""

if [ $MYSQL_OK -eq 1 ] && [ $REDIS_OK -eq 1 ] && [ $NODE_OK -eq 1 ] && [ $PNPM_OK -eq 1 ]; then
    echo "✅ 所有依赖已就绪！"
    echo ""
    echo "启动命令: pnpm dev:core"
    echo ""
    echo "按 Enter 键启动项目，或按 Ctrl+C 取消..."
    read
    pnpm dev:core
elif [ $MYSQL_OK -eq 0 ]; then
    echo "⚠️  MySQL 需要修复"
    echo ""
    if [ -f "fix-mysql-password.sh" ]; then
        echo "可以尝试运行: ./fix-mysql-password.sh"
    else
        echo "请手动检查 MySQL 配置"
    fi
else
    echo "❌ 缺少必要依赖:"
    [ $NODE_OK -eq 0 ] && echo "  - 需要安装 Node.js 18+"
    [ $PNPM_OK -eq 0 ] && echo "  - 需要安装 pnpm"
    [ $MYSQL_OK -eq 0 ] && echo "  - 需要安装/配置 MySQL"
    [ $REDIS_OK -eq 0 ] && echo "  - 需要安装/启动 Redis"
fi

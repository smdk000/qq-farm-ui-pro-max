#!/bin/bash

# 敏感信息检查脚本
# 用法：./check-sensitive-info.sh [directory]

set -e

CHECK_DIR="${1:-.}"
FOUND_ISSUES=0

echo "🔍 开始检查敏感信息..."
echo "📁 检查目录：$CHECK_DIR"
echo ""

# 检查 API 密钥
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  检查阿里云 API 密钥..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if grep -r "sk-[a-zA-Z0-9]\{32\}" "$CHECK_DIR" --include="*.js" --include="*.ts" --include="*.vue" --include="*.json" --include="*.env" 2>/dev/null; then
    echo "⚠️  发现阿里云 API 密钥！请立即删除或脱敏！"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到阿里云 API 密钥"
fi
echo ""

# 检查微信 API 密钥
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  检查微信二维码 API 密钥..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if grep -r "ZoBsM8RqTA326a02tWgQOmOb" "$CHECK_DIR" --include="*.js" --include="*.ts" --include="*.vue" 2>/dev/null; then
    echo "⚠️  发现微信 API 密钥！请立即删除或脱敏！"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到微信 API 密钥"
fi
echo ""

# 检查密码哈希
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  检查密码哈希..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if grep -r "adminPasswordHash.*[a-f0-9]\{64\}" "$CHECK_DIR" --include="*.json" 2>/dev/null; then
    echo "⚠️  发现密码哈希！请确保为空字符串！"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到密码哈希"
fi
echo ""

# 检查数据库文件
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  检查数据库文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
DB_FILES=$(find "$CHECK_DIR" -name "*.db" -type f 2>/dev/null || true)
if [ -n "$DB_FILES" ]; then
    echo "⚠️  发现数据库文件："
    echo "$DB_FILES"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到数据库文件"
fi
echo ""

# 检查 .env 文件（除 .example 外）
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  检查 .env 文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ENV_FILES=$(find "$CHECK_DIR" -name ".env" -type f ! -name "*.example" 2>/dev/null || true)
if [ -n "$ENV_FILES" ]; then
    echo "⚠️  发现 .env 文件（不应包含在同步文件夹中）："
    echo "$ENV_FILES"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到 .env 文件"
fi
echo ""

# 检查 data 目录下的 JSON 文件
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  检查 data 目录的 JSON 文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
DATA_JSON=$(find "$CHECK_DIR" -path "*/data/*.json" -type f ! -name "*.example" 2>/dev/null || true)
if [ -n "$DATA_JSON" ]; then
    echo "⚠️  发现 data 目录的 JSON 文件（不应包含在同步文件夹中）："
    echo "$DATA_JSON"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到 data 目录的 JSON 文件"
fi
echo ""

# 检查日志文件
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  检查日志文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
LOG_FILES=$(find "$CHECK_DIR" -name "*.log" -type f 2>/dev/null || true)
if [ -n "$LOG_FILES" ]; then
    echo "⚠️  发现日志文件："
    echo "$LOG_FILES"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到日志文件"
fi
echo ""

# 检查 node_modules
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  检查 node_modules..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -d "$CHECK_DIR/node_modules" ]; then
    echo "⚠️  发现 node_modules 目录（应在 .gitignore 中）"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到 node_modules"
fi
echo ""

# 检查 AI 历史目录
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9️⃣  检查 AI 历史目录..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AI_DIRS=()
[ -d "$CHECK_DIR/.llm-chat-history" ] && AI_DIRS+=(".llm-chat-history")
[ -d "$CHECK_DIR/.specstory" ] && AI_DIRS+=(".specstory")
[ -d "$CHECK_DIR/.agent" ] && AI_DIRS+=(".agent")

if [ ${#AI_DIRS[@]} -gt 0 ]; then
    echo "⚠️  发现 AI 历史目录："
    printf '%s\n' "${AI_DIRS[@]}"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "✅ 未检测到 AI 历史目录"
fi
echo ""

# 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 检查总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FOUND_ISSUES -eq 0 ]; then
    echo "✅ 检查完成！未发现敏感信息！"
    echo ""
    echo "🎉 此文件夹可以安全地同步到 GitHub！"
else
    echo "⚠️  检查完成！发现 $FOUND_ISSUES 个问题！"
    echo ""
    echo "🔴 请在同步到 GitHub 前解决以上所有问题！"
fi
echo ""

exit $FOUND_ISSUES

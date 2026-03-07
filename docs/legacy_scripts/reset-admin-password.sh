#!/usr/bin/env bash
# 管理员密码重置工具
# 来源: NC 版 reset-admin-password.sh (T9)，已适配本项目目录结构

set -e

echo "=========================================="
echo "  管理员密码重置工具"
echo "=========================================="
echo ""

# 检查用户文件
USERS_FILE="core/data/users.json"
if [ ! -f "$USERS_FILE" ]; then
    echo "❌ 错误: 未找到 $USERS_FILE 文件"
    echo "   请确保在项目根目录运行此脚本"
    exit 1
fi

echo "当前 users.json 路径: $USERS_FILE"
echo ""

# 询问新密码
echo "请选择操作:"
echo "  1) 重置为默认密码 (admin)"
echo "  2) 重置为 qq007qq008"
echo "  3) 自定义密码"
echo "  4) 取消"
echo ""
read -p "请选择 [1-4]: " choice

case $choice in
    1) NEW_PASSWORD="admin" ;;
    2) NEW_PASSWORD="qq007qq008" ;;
    3)
        read -p "请输入新密码: " NEW_PASSWORD
        if [ -z "$NEW_PASSWORD" ]; then
            echo "❌ 密码不能为空"
            exit 1
        fi
        ;;
    *) echo "已取消"; exit 0 ;;
esac

echo ""
echo "⚠️  警告: 此操作将修改管理员密码"
echo "   新密码: $NEW_PASSWORD"
echo ""
read -p "确认继续? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "🔧 正在重置密码..."

# 备份原文件
cp "$USERS_FILE" "${USERS_FILE}.backup.$(date +%s)"
echo "  ✅ 已备份原文件"

# 使用 Node.js 脚本重置密码
cat > /tmp/reset-password.js << 'EOF'
const fs = require('fs');
const crypto = require('crypto');

function hashPassword(password) {
    const iterations = 10000;
    const keylen = 64;
    const digest = 'sha512';
    const salt = crypto.randomBytes(32);
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const usersFile = process.argv[2];
const newPassword = process.argv[3];

const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
const adminUser = data.users.find(u => u.username === 'admin');

if (!adminUser) {
    console.error('❌ 未找到 admin 用户');
    process.exit(1);
}

adminUser.password = hashPassword(newPassword);
adminUser.plainPassword = newPassword;
fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf8');
console.log('✅ 密码已更新');
EOF

if node /tmp/reset-password.js "$USERS_FILE" "$NEW_PASSWORD" 2>/dev/null; then
    echo "  ✅ 密码重置成功"
    echo ""
    echo "=========================================="
    echo "  新的登录信息"
    echo "=========================================="
    echo "  用户名: admin"
    echo "  密码: $NEW_PASSWORD"
    echo ""
    echo "🎉 现在可以使用新密码登录了！"
else
    echo "  ❌ 密码重置失败"
    echo "   请尝试手动修改 $USERS_FILE 文件"
    exit 1
fi

rm -f /tmp/reset-password.js

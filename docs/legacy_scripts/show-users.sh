#!/usr/bin/env bash
# 查看已注册用户
# 来源: NC 版 show-users.sh (T10a)，已适配本项目

USERS_FILE="core/data/users.json"

if [ ! -f "$USERS_FILE" ]; then
    echo "❌ 未找到 $USERS_FILE"
    echo "   请在项目根目录运行此脚本"
    exit 1
fi

echo "=========================================="
echo "  已注册用户列表"
echo "=========================================="
echo ""

# 使用 Node.js 解析 JSON
node -e "
const fs = require('fs');
try {
    const data = JSON.parse(fs.readFileSync('$USERS_FILE', 'utf8'));
    const users = data.users || [];
    if (users.length === 0) {
        console.log('  (暂无用户)');
        return;
    }
    users.forEach((u, i) => {
        const role = u.role || 'user';
        const status = u.disabled ? '🔴 禁用' : '🟢 正常';
        console.log(\`  \${i + 1}. \${u.username} [\${role}] \${status}\`);
    });
    console.log(\`\n  共 \${users.length} 个用户\`);
} catch (e) {
    console.error('解析失败:', e.message);
}
"
echo ""

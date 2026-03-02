#!/bin/bash

# GitHub 同步准备脚本
# 用法：./prepare-github-sync.sh

set -e

SYNC_DIR="github-sync"
echo "🚀 开始准备 GitHub 同步文件夹：$SYNC_DIR"
echo ""

# 检查是否在正确的项目目录
if [ ! -f "package.json" ] || [ ! -d "core" ] || [ ! -d "web" ]; then
    echo "❌ 错误：请在项目根目录执行此脚本"
    exit 1
fi

# 清理旧文件夹
if [ -d "$SYNC_DIR" ]; then
    echo "🗑️  清理旧的同步文件夹..."
    rm -rf "$SYNC_DIR"
fi

# 创建新文件夹
echo "📁 创建同步文件夹结构..."
mkdir -p "$SYNC_DIR/core/src"
mkdir -p "$SYNC_DIR/core/config"
mkdir -p "$SYNC_DIR/core/data"
mkdir -p "$SYNC_DIR/core/proto"
mkdir -p "$SYNC_DIR/core/gameConfig"
mkdir -p "$SYNC_DIR/web/src"
mkdir -p "$SYNC_DIR/docs"
mkdir -p "$SYNC_DIR/pic"
mkdir -p "$SYNC_DIR/.github/workflows"
mkdir -p "$SYNC_DIR/openviking-service"

# 复制核心代码
echo "📄 复制后端代码..."
if [ -d "core/src" ]; then
    cp -r core/src/* "$SYNC_DIR/core/src/"
fi
if [ -d "core/config" ]; then
    cp -r core/config/* "$SYNC_DIR/core/config/"
fi
if [ -d "core/proto" ]; then
    cp -r core/proto/* "$SYNC_DIR/core/proto/"
fi
if [ -d "core/gameConfig" ]; then
    cp -r core/gameConfig/* "$SYNC_DIR/core/gameConfig/"
fi

# 复制前端代码
echo "📄 复制前端代码..."
if [ -d "web/src" ]; then
    cp -r web/src/* "$SYNC_DIR/web/src/"
fi
if [ -f "web/index.html" ]; then
    cp web/index.html "$SYNC_DIR/web/"
fi

# 复制配置文件
echo "📄 复制配置文件..."
if [ -f "package.json" ]; then
    cp package.json "$SYNC_DIR/"
fi
if [ -f "core/package.json" ]; then
    cp core/package.json "$SYNC_DIR/core/"
fi
if [ -f "web/package.json" ]; then
    cp web/package.json "$SYNC_DIR/web/"
fi
if [ -f "pnpm-workspace.yaml" ]; then
    cp pnpm-workspace.yaml "$SYNC_DIR/"
fi
if [ -f "pnpm-lock.yaml" ]; then
    cp pnpm-lock.yaml "$SYNC_DIR/"
fi

# 复制示例配置（非敏感）
echo "📄 复制配置模板..."
if [ -f "core/.env.ai.example" ]; then
    cp core/.env.ai.example "$SYNC_DIR/core/"
else
    echo "⚠️  警告：core/.env.ai.example 不存在，创建默认模板..."
    cat > "$SYNC_DIR/core/.env.ai.example" << 'EOF'
# AI 编程助手配置

# OpenViking 服务地址
OPENVIKING_URL=http://localhost:5000

# 阿里云百炼 API Key（千问 3.5 Plus）
# 获取地址：https://dashscope.console.aliyun.com/
DASHSCOPE_API_KEY=sk-your-api-key-here

# 是否启用 AI 编程助手
AI_ASSISTANT_ENABLED=true

# 默认使用上下文记忆
AI_USE_CONTEXT=true

# AI 生成参数
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=4096
EOF
fi

if [ -f "openviking-service/.env.example" ]; then
    cp openviking-service/.env.example "$SYNC_DIR/openviking-service/"
else
    echo "⚠️  警告：openviking-service/.env.example 不存在，创建默认模板..."
    cat > "$SYNC_DIR/openviking-service/.env.example" << 'EOF'
# OpenViking 服务配置

# OpenViking 工作目录
OPENVIKING_WORKSPACE=./openviking_data

# OpenViking 服务端口
OPENVIKING_PORT=5000

# Flask 调试模式
FLASK_DEBUG=False

# 阿里云百炼 API Key（千问 3.5 Plus）
# 获取地址：https://dashscope.console.aliyun.com/
DASHSCOPE_API_KEY=sk-your-api-key-here

# OpenViking 配置文件路径（可选，默认 ~/.openviking/ov.conf）
# OPENVIKING_CONFIG=~/.openviking/ov.conf
EOF
fi

if [ -f "core/data/store.json.example" ]; then
    cp core/data/store.json.example "$SYNC_DIR/core/data/"
else
    echo "⚠️  警告：core/data/store.json.example 不存在，创建默认模板..."
    cat > "$SYNC_DIR/core/data/store.json.example" << 'EOF'
{
  "accountConfigs": {},
  "defaultAccountConfig": {
    "automation": {
      "farm": true,
      "friend": true,
      "friend_steal": true,
      "fertilizer": "none"
    },
    "plantingStrategy": "preferred",
    "preferredSeedId": 0,
    "intervals": {
      "farm": 2,
      "friend": 10
    }
  },
  "ui": {
    "theme": "dark",
    "loginBackground": "",
    "colorTheme": "default",
    "performanceMode": true
  },
  "offlineReminder": {
    "channel": "webhook",
    "endpoint": "",
    "token": ""
  },
  "adminPasswordHash": "",
  "trialCardConfig": {
    "enabled": true,
    "days": 1,
    "dailyLimit": 50
  }
}
EOF
fi

if [ -f "core/data/accounts.json.example" ]; then
    cp core/data/accounts.json.example "$SYNC_DIR/core/data/"
else
    echo "⚠️  警告：core/data/accounts.json.example 不存在，创建默认模板..."
    cat > "$SYNC_DIR/core/data/accounts.json.example" << 'EOF'
{
  "accounts": [],
  "nextId": 1
}
EOF
fi

# 复制文档
echo "📄 复制文档..."
if [ -f "README.md" ]; then
    cp README.md "$SYNC_DIR/"
fi
if [ -f "CHANGELOG.DEVELOPMENT.md" ]; then
    cp CHANGELOG.DEVELOPMENT.md "$SYNC_DIR/"
fi
if [ -f "PROJECT_ROADMAP.md" ]; then
    cp PROJECT_ROADMAP.md "$SYNC_DIR/"
fi
if [ -d "docs" ]; then
    cp -r docs/* "$SYNC_DIR/docs/"
fi
if [ -d "pic" ]; then
    cp -r pic/* "$SYNC_DIR/pic/"
fi

# 复制部署配置
echo "📄 复制部署配置..."
if [ -f "docker-compose.yml" ]; then
    cp docker-compose.yml "$SYNC_DIR/"
fi
if [ -f "Dockerfile" ]; then
    cp Dockerfile "$SYNC_DIR/"
fi
if [ -f "start.sh" ]; then
    cp start.sh "$SYNC_DIR/"
fi
if [ -f "start.bat" ]; then
    cp start.bat "$SYNC_DIR/"
fi

# 复制 GitHub Actions
echo "📄 复制 GitHub Actions..."
if [ -d ".github/workflows" ]; then
    cp -r .github/workflows/* "$SYNC_DIR/.github/workflows/" 2>/dev/null || echo "⚠️  无 GitHub Actions 配置"
fi

# 创建 .gitignore
echo "📄 创建 .gitignore..."
cat > "$SYNC_DIR/.gitignore" << 'GITIGNORE'
# 依赖
node_modules/
.pnpm-store/

# 敏感数据
.env
.env.local
.env.*.local
*.db
*.db-wal
*.db-shm
data/*.json
data/*.db

# 日志
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# AI 历史
.llm-chat-history/
.specstory/
.agent/

# IDE
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.cursor/

# 构建产物
dist/
build/
*.exe
*.app
*.dmg

# 临时文件
*.tmp
*.swp
.DS_Store
Thumbs.db

# 特定敏感文件
openviking-service/.env
core/.env.ai
core/data/*.json
core/data/*.db
GITIGNORE

# 创建 README（同步说明）
echo "📄 创建同步说明..."
cat > "$SYNC_DIR/SYNC_README.md" << 'SYNCREADME'
# GitHub 同步说明

> 此文件夹为 GitHub 同步专用，包含脱敏后的项目代码

## 📦 文件夹内容

- ✅ `core/src/` - 后端源代码（已脱敏）
- ✅ `web/src/` - 前端源代码（已脱敏）
- ✅ `docs/` - 项目文档
- ✅ `pic/` - 图片资源
- ✅ `*.md` - 项目说明文档
- ✅ `docker-compose.yml` - Docker 配置
- ✅ `.env.*.example` - 配置模板

## 🚫 不包含的内容

- ❌ `.env` 文件（包含真实 API 密钥）
- ❌ `data/*.json`（包含用户数据）
- ❌ `data/*.db`（SQLite 数据库）
- ❌ `logs/`（运行日志）
- ❌ `node_modules/`（依赖包）

## 🔄 同步步骤

1. 在项目根目录执行：
   ```bash
   ./prepare-github-sync.sh
   ```

2. 进入同步文件夹：
   ```bash
   cd github-sync
   ```

3. 初始化 Git 仓库并提交：
   ```bash
   git init
   git add .
   git commit -m "Initial commit: GitHub sync version"
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

## ⚠️ 重要提示

- 切勿将 `.env` 文件提交到 GitHub
- 使用 `.env.example` 作为配置模板
- 敏感信息请使用环境变量管理

## 📝 最近更新

### v3.3.3 - 回归修复：深色模式兼容性与性能模式覆盖遗漏

- ✅ 修复 `HelpCenter.vue` 独立重定义 `backdrop-filter`，不受性能模式管控
- ✅ 修复 `Friends.vue` Scoped CSS 中 `.dark` 选择器无法匹配 `<html>` 祖先
- ✅ 修复 `NotificationModal.vue` 底部动作条样式被意外修改

### v3.3.2 - Chrome 闪烁修复与性能模式全面增强

- ✅ 移除 `glass-panel` 的 `will-change`，改用 `contain: layout style paint`
- ✅ 降低 `mesh-orb` 光球模糊值 `blur(80px)` → `blur(60px)`
- ✅ 追加全局 `animation-duration: 0s !important` + `transition-duration: 0s !important`

### v3.3.1 - 好友列表按钮统一与公告弹窗品牌增强

- ✅ 引入 `op-btn` 基础类 + 6 种颜色变体
- ✅ 修复「除草」按钮与其他按钮形状不一致的问题
- ✅ 在「更新公告」弹窗底部注入作者防伪水印

### v3.3.0 - 自动控制功能提示与推荐建议系统

- ✅ `BaseSwitch.vue` 新增 `hint`/`recommend` prop + CSS Tooltip 气泡
- ✅ `Settings.vue` 全部 18 个开关添加功能解释 + 推荐建议标签

### v3.2.9 - 令牌桶进阶优化：紧急通道 & 冗余 Sleep 清理

- ✅ 新增 `sendMsgAsyncUrgent` 紧急通道，防偷不再被好友巡查长队列阻塞
- ✅ 移除 `farm.js` 中 2 处 + `friend.js` 中 5 处冗余 sleep（共 7 处）

### v3.2.8 - 性能优化：SQLite 防争用 & WebSocket 3QPS 令牌桶限流

- ✅ 追加 `busy_timeout = 5000`：并发写入遇锁时自旋最多 5 秒
- ✅ 追加 `wal_autocheckpoint = 1000`：每累积 1000 页自动合并 WAL
- ✅ 在 `sendMsgAsync` 前注入 Token Bucket 异步排队网关
- ✅ 所有业务请求强制以 **3 QPS（每帧 ≥ 334ms）** 匀速发出

SYNCREADME

echo ""
echo "✅ GitHub 同步文件夹准备完成！"
echo ""
echo "📁 同步文件夹位置：$PWD/$SYNC_DIR"
echo ""
echo "下一步操作："
echo "1. 检查 $SYNC_DIR/SYNC_README.md 了解同步说明"
echo "2. 进入 $SYNC_DIR 目录"
echo "3. 执行敏感信息检查："
echo "   cd $SYNC_DIR"
echo "   grep -r 'sk-[a-zA-Z0-9]\\{32\\}' . || echo '✅ 未检测到 API 密钥'"
echo "4. 执行 git init 并推送到 GitHub"
echo ""
echo "⚠️  重要提示："
echo "   - 切勿将 .env 文件提交到 GitHub"
echo "   - 使用 .env.example 作为配置模板"
echo "   - 敏感信息请使用环境变量管理"

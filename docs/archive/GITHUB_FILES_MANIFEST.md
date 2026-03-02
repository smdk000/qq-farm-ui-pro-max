# GitHub 同步文件清单

> **创建时间：** 2026-03-01  
> **用途：** 明确哪些文件上传 GitHub，哪些不上传

---

## ✅ 需要上传到 GitHub 的文件

### 1. 核心源代码

```
core/
├── src/                          ✅ 所有后端源代码
│   ├── config/                   ✅ 配置文件
│   ├── controllers/              ✅ HTTP API 控制器
│   ├── database/                 ✅ 数据库相关
│   │   └── migrations/           ✅ 数据库迁移脚本
│   ├── gameConfig/               ✅ 游戏静态数据
│   ├── models/                   ✅ 数据模型
│   ├── proto/                    ✅ Protobuf 协议定义
│   ├── runtime/                  ✅ 运行时引擎
│   └── services/                 ✅ 业务逻辑服务
├── config/                       ✅ 配置文件
├── client.js                     ✅ 主进程入口
└── package.json                  ✅ 依赖配置
```

### 2. 前端源代码

```
web/
├── src/                          ✅ 所有前端源代码
│   ├── api/                      ✅ API 客户端
│   ├── components/               ✅ Vue 组件
│   ├── data/                     ✅ 数据文件
│   ├── layouts/                  ✅ 布局组件
│   ├── router/                   ✅ 路由配置
│   ├── stores/                   ✅ Pinia 状态管理
│   ├── styles/                   ✅ 样式文件
│   └── views/                    ✅ 页面视图
├── index.html                    ✅ 入口 HTML
└── package.json                  ✅ 依赖配置
```

### 3. 文档

```
./
├── README.md                     ✅ 项目说明
├── CHANGELOG.DEVELOPMENT.md      ✅ 开发日志
├── PROJECT_ROADMAP.md            ✅ 项目路线图
├── DATABASE_HANDLING_GUIDE.md    ✅ 数据库处理指南
├── GITHUB_SYNC_PLAN.md           ✅ GitHub 同步计划
├── GITHUB_SYNC_COMPLETE.md       ✅ 同步完成报告
└── docs/                         ✅ 所有文档
    ├── DEPLOYMENT_GUIDE.md       ✅ 部署指南
    ├── API_REFERENCE.md          ✅ API 参考
    ├── HELP_CENTER_*.md          ✅ 帮助中心文档
    ├── 主题深度优化/             ✅ 主题优化文档
    └── ...                       ✅ 其他文档
```

### 4. 图片资源

```
pic/
├── architecture.svg              ✅ 系统架构图
├── dashboard.svg                 ✅ Dashboard 截图
├── analytics.svg                 ✅ 分析页截图
├── settings.svg                  ✅ 设置页截图
├── help-center.svg               ✅ 帮助中心截图
├── users.svg                     ✅ 用户管理截图
├── cards.svg                     ✅ 卡密管理截图
└── steal-settings.svg            ✅ 偷菜设置截图
```

### 5. Docker 配置

```
./
├── Dockerfile                    ✅ Docker 镜像定义
├── docker-compose.yml            ✅ Docker Compose 配置
├── docker-compose.prod.yml       ✅ 生产环境配置
└── core/Dockerfile               ✅ 核心 Dockerfile
```

### 6. GitHub Actions

```
.github/
└── workflows/
    ├── ci.yml                    ✅ 持续集成
    └── release.yml               ✅ 发布流程
```

### 7. 脚本文件

```
./
├── start.sh                      ✅ Linux 启动脚本
├── start.bat                     ✅ Windows 启动脚本
├── prepare-github-sync.sh        ✅ 同步准备脚本
└── check-sensitive-info.sh       ✅ 敏感信息检查脚本
```

### 8. 配置模板

```
core/
├── .env.ai.example               ✅ AI 配置模板
└── data/
    ├── store.json.example        ✅ 存储配置模板
    └── accounts.json.example     ✅ 账号配置模板

openviking-service/
└── .env.example                  ✅ OpenViking 配置模板
```

### 9. 项目配置文件

```
./
├── package.json                  ✅ 根配置
├── pnpm-workspace.yaml           ✅ pnpm 工作空间
└── pnpm-lock.yaml                ✅ 依赖锁定文件
```

---

## ❌ 不上传到 GitHub 的文件

### 1. 敏感数据

```
./
├── .env                          ❌ 环境变量（含 API 密钥）
├── core/.env.ai                  ❌ AI 配置（含真实密钥）
├── openviking-service/.env       ❌ 服务配置（含真实密钥）
└── core/data/
    ├── farm-bot.db               ❌ SQLite 数据库
    ├── farm-bot.db-wal           ❌ 数据库日志
    ├── farm-bot.db-shm           ❌ 数据库共享内存
    ├── store.json                ❌ 真实配置数据
    └── accounts.json             ❌ 真实账号数据
```

### 2. 依赖包

```
./
├── node_modules/                 ❌ npm 依赖包
└── web/node_modules/             ❌ 前端依赖包
```

### 3. 构建产物

```
./
├── dist/                         ❌ 发布包
├── web/dist/                     ❌ 前端构建产物
└── *.exe, *.app, *.dmg           ❌ 二进制文件
```

### 4. 日志文件

```
./
├── logs/                         ❌ 运行日志
├── *.log                         ❌ 日志文件
└── log 开发日志/                 ❌ 开发日志（可选上传）
```

### 5. AI 历史

```
./
├── .llm-chat-history/            ❌ AI 聊天历史
├── .specstory/                   ❌ 规范历史
└── .agent/                       ❌ AI 代理配置
```

### 6. IDE 配置

```
./
├── .idea/                        ❌ IntelliJ IDEA 配置
├── .vscode/                      ❌ VSCode 配置（部分可上传）
└── .cursor/                      ❌ Cursor IDE 配置
```

### 7. 临时文件

```
./
├── *.tmp                         ❌ 临时文件
├── *.swp                         ❌ Vim 交换文件
├── .DS_Store                     ❌ macOS 系统文件
└── Thumbs.db                     ❌ Windows 缩略图
```

---

## 📋 .gitignore 配置

```gitignore
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
```

---

## 📊 统计信息

| 类别 | 上传 | 不上传 | 说明 |
|------|------|--------|------|
| 源代码 | ✅ | ❌ | 全部上传 |
| 文档 | ✅ | ❌ | 全部上传 |
| 配置文件 | 模板 | 真实数据 | .example 上传，真实数据不上传 |
| 数据库 | ❌ | ✅ | 运行时自动生成 |
| 依赖包 | ❌ | ✅ | 通过 package.json 管理 |
| 构建产物 | ❌ | ✅ | 通过 CI/CD 生成 |
| 日志 | ❌ | ✅ | 不包含 |
| AI 历史 | ❌ | ✅ | 不包含 |

---

## 🚀 同步流程

1. **执行同步脚本**
   ```bash
   ./prepare-github-sync.sh
   ```

2. **检查敏感信息**
   ```bash
   ./check-sensitive-info.sh github-sync/
   ```

3. **初始化 Git 并提交**
   ```bash
   cd github-sync
   git init
   git add .
   git commit -m "Initial commit"
   ```

4. **推送到 GitHub**
   ```bash
   git remote add origin https://github.com/your-username/qq-farm-bot.git
   git push -u origin main
   ```

---

**维护说明：**
- 每次同步前检查此清单
- 新增文件时参考此分类
- 定期更新 .gitignore 配置

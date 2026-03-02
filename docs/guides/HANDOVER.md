# QQ Farm Bot UI 2.1 版本交接文档

## 📖 文档说明

**项目名称**: QQ Farm Bot UI  
**当前版本**: 1.0 (单包架构，含 AI 服务)  
**目标版本**: 2.1 (多包 workspace，纯农场自动化)  
**交接日期**: 2026-02-27  
**文档类型**: 项目交接文档

---

## 一、项目背景

### 1.1 项目定位变化

**旧版本定位 (1.0)**:
- 多用户 SaaS 平台
- 支持卡密收费系统
- 集成 AI 编程助手 (千问 3.5 Plus + OpenViking)
- 适合商业化运营

**新版本定位 (2.1)**:
- 单用户自用工具
- 纯农场自动化管理
- 移除 AI 集成，专注核心功能
- 适合个人使用

### 1.2 为什么要升级

**问题与痛点**:
1. 架构混乱 - 单一 package.json 管理所有依赖
2. AI 服务臃肿 - 与核心功能耦合，难以维护
3. 用户系统复杂 - 多用户权限管理增加复杂度
4. 部署困难 - 缺少容器化支持
5. 技术栈落后 - 前端缺少状态管理、TypeScript 支持不足

**升级收益**:
1. ✅ 架构清晰 - pnpm workspace 多包管理
2. ✅ 职责单一 - 专注农场自动化核心功能
3. ✅ 易于维护 - 模块化服务设计
4. ✅ 部署简单 - Docker 容器化支持
5. ✅ 技术先进 - Vue 3.5 + Pinia + TypeScript + UnoCSS

---

## 二、项目结构详解

### 2.1 新版本目录结构

```
qq-farm-bot-ui-main/
├── package.json                    # 根目录 package.json
├── pnpm-workspace.yaml             # pnpm 工作区配置
├── pnpm-lock.yaml                  # 依赖锁定文件
├── docker-compose.yml              # Docker Compose 配置
├── .dockerignore                   # Docker 忽略文件
├── .gitignore                      # Git 忽略文件
│
├── core/                           # 后端核心 (独立包)
│   ├── package.json                # 后端依赖配置
│   ├── client.js                   # 主入口文件
│   ├── Dockerfile                  # Docker 镜像构建
│   ├── eslint.config.mjs           # ESLint 配置
│   │
│   ├── src/
│   │   ├── controllers/
│   │   │   └── admin.js            # 管理面板 API (精简版)
│   │   │
│   │   ├── models/
│   │   │   └── store.js            # 数据存储 (简化版)
│   │   │
│   │   ├── services/               # 核心服务层 (20 个文件)
│   │   │   ├── farm.js             # 农场服务
│   │   │   ├── friend.js           # 好友服务
│   │   │   ├── task.js             # 任务服务
│   │   │   ├── mall.js             # 商城服务
│   │   │   ├── warehouse.js        # 仓库服务
│   │   │   ├── email.js            # 邮件服务
│   │   │   ├── qqvip.js            # QQ VIP 服务
│   │   │   ├── share.js            # 分享服务
│   │   │   ├── scheduler.js        # 调度器 (核心)
│   │   │   ├── stats.js            # 统计服务
│   │   │   ├── analytics.js        # 数据分析
│   │   │   ├── invite.js           # 邀请服务
│   │   │   ├── openserver.js       # 开服服务
│   │   │   ├── push.js             # 推送服务
│   │   │   ├── qrlogin.js          # 二维码登录
│   │   │   ├── status.js           # 状态服务
│   │   │   ├── monthcard.js        # 月卡服务
│   │   │   ├── logger.js           # 日志服务
│   │   │   ├── json-db.js          # JSON 数据库工具
│   │   │   └── account-resolver.js # 账号解析器
│   │   │
│   │   ├── proto/                  # Protocol Buffers (16 个.proto)
│   │   │   ├── game.proto
│   │   │   ├── corepb.proto
│   │   │   ├── plantpb.proto
│   │   │   ├── friendpb.proto
│   │   │   ├── taskpb.proto
│   │   │   ├── mallpb.proto
│   │   │   ├── userpb.proto
│   │   │   ├── itempb.proto
│   │   │   ├── sharepb.proto
│   │   │   ├── emailpb.proto
│   │   │   ├── redpacketpb.proto
│   │   │   ├── illustratedpb.proto
│   │   │   ├── visitpb.proto
│   │   │   ├── notifypb.proto
│   │   │   ├── shoppb.proto
│   │   │   └── qqvippb.proto
│   │   │
│   │   ├── utils/
│   │   │   ├── proto.js            # Proto 序列化工具
│   │   │   ├── network.js          # 网络工具
│   │   │   ├── utils.js            # 通用工具
│   │   │   └── qrutils.js          # 二维码工具
│   │   │
│   │   ├── config/
│   │   │   ├── config.js           # 主配置
│   │   │   ├── gameConfig.js       # 游戏配置
│   │   │   └── runtime-paths.js    # 运行时路径
│   │   │
│   │   ├── gameConfig/             # 游戏配置数据
│   │   │   ├── Plant.json          # 植物配置
│   │   │   ├── ItemInfo.json       # 物品配置
│   │   │   └── RoleLevel.json      # 等级配置
│   │   │
│   │   ├── core/
│   │   │   └── worker.js           # Worker 核心
│   │   │
│   │   └── runtime/
│   │       ├── runtime-engine.js   # 运行时引擎
│   │       ├── worker-manager.js   # Worker 管理
│   │       ├── data-provider.js    # 数据提供者
│   │       └── runtime-state.js    # 运行时状态
│   │
│   └── data/                       # 数据目录
│
├── web/                            # 前端 (独立包)
│   ├── package.json                # 前端依赖配置
│   ├── uno.config.ts               # UnoCSS 配置
│   ├── eslint.config.js            # ESLint 配置
│   ├── vite.config.ts              # Vite 配置
│   ├── tsconfig.json               # TypeScript 配置
│   │
│   ├── src/
│   │   ├── views/                  # 页面组件 (10 个)
│   │   │   ├── Login.vue           # 登录页 (重构)
│   │   │   ├── Dashboard.vue       # 仪表板 (重构)
│   │   │   ├── Personal.vue        # 个人中心
│   │   │   ├── Accounts.vue        # 账号管理
│   │   │   ├── Friends.vue         # 好友列表
│   │   │   ├── Analytics.vue       # 数据分析
│   │   │   └── Settings.vue        # 设置页
│   │   │
│   │   ├── components/             # 功能组件 (15 个)
│   │   │   ├── ThemeToggle.vue     # 主题切换
│   │   │   ├── DailyOverview.vue   # 每日概览
│   │   │   ├── LandCard.vue        # 土地卡片
│   │   │   ├── FarmPanel.vue       # 农场面板
│   │   │   ├── BagPanel.vue        # 背包面板
│   │   │   ├── TaskPanel.vue       # 任务面板
│   │   │   ├── AccountModal.vue    # 账号弹窗
│   │   │   ├── RemarkModal.vue     # 备注弹窗
│   │   │   ├── ToastContainer.vue  # 提示容器
│   │   │   ├── ConfirmModal.vue    # 确认弹窗
│   │   │   ├── Sidebar.vue         # 侧边栏
│   │   │   └── ui/                 # 基础 UI 组件
│   │   │       ├── BaseButton.vue
│   │   │       ├── BaseInput.vue
│   │   │       ├── BaseSelect.vue
│   │   │       ├── BaseTextarea.vue
│   │   │       └── BaseSwitch.vue
│   │   │
│   │   ├── stores/                 # Pinia Stores (8 个)
│   │   │   ├── account.ts          # 账号状态
│   │   │   ├── bag.ts              # 背包数据
│   │   │   ├── farm.ts             # 农场数据
│   │   │   ├── friend.ts           # 好友数据
│   │   │   ├── status.ts           # 运行状态
│   │   │   ├── setting.ts          # 设置数据
│   │   │   ├── app.ts              # 应用全局状态
│   │   │   └── toast.ts            # 提示消息
│   │   │
│   │   ├── router/
│   │   │   ├── index.ts            # 路由配置
│   │   │   └── menu.ts             # 菜单路由
│   │   │
│   │   ├── api/
│   │   │   └── index.ts            # API 封装
│   │   │
│   │   ├── layouts/
│   │   │   └── DefaultLayout.vue   # 默认布局
│   │   │
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   │
│   └── public/
│       └── icon.svg
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # CI 工作流
│       └── release.yml             # 发布工作流
│
└── 文档/
    ├── README.md                   # 主文档 (已更新)
    ├── CHANGELOG.md                # 变更日志
    ├── UPDATE_PLAN.md              # 更新计划
    └── HANDOVER.md                 # 交接文档 (本文件)
```

### 2.2 核心模块说明

#### 后端核心模块

**1. 主入口 (client.js)**
- 职责：启动运行时引擎、初始化服务
- 变化：移除 AI 服务启动逻辑
- 关键代码：
```javascript
const isWorkerProcess = process.env.FARM_WORKER === '1';
if (isWorkerProcess) {
    require('./src/core/worker');
} else {
    const runtimeEngine = createRuntimeEngine({...});
    runtimeEngine.start({...});
}
```

**2. API 控制器 (admin.js)**
- 职责：提供管理面板 API 接口
- 变化：从 944 行精简到 737 行，移除用户/卡密管理
- 保留接口：
  - `POST /api/login` - 登录
  - `POST /api/logout` - 登出
  - `GET /api/accounts` - 获取账号列表
  - `POST /api/accounts` - 添加账号
  - `PUT /api/accounts/:id` - 更新账号
  - `DELETE /api/accounts/:id` - 删除账号
  - `GET /api/stats` - 获取统计数据
  - `WS /socket.io/` - WebSocket 连接

**3. 数据存储 (store.js)**
- 职责：管理账号配置、运行状态等数据
- 变化：移除偷菜过滤配置，简化默认配置
- 数据结构：
```javascript
{
  adminPasswordHash: '...',  // 管理员密码哈希
  accounts: [                // 账号列表
    {
      id: 1,
      qqNumber: '123456',
      nickname: '...',
      config: {
        automation: {
          harvest: true,
          water: true,
          weed: true,
          pest: true,
          fertilizer: 'none'
        }
      }
    }
  ],
  runtimeState: { ... }      // 运行时状态
}
```

**4. 调度器 (scheduler.js) - 核心新增**
- 职责：定时任务管理、延迟执行、周期性任务
- 关键功能：
  - 添加定时任务
  - 取消任务
  - 任务快照记录
  - 任务持久化
- 使用示例：
```javascript
const scheduler = require('./services/scheduler');

// 添加周期性任务
scheduler.addJob({
  id: 'farm-check-1',
  accountId: 1,
  cron: '*/5 * * * *',  // 每 5 分钟
  handler: async () => {
    await farmService.checkAndHarvest(1);
  }
});

// 添加延迟任务
scheduler.addDelayJob({
  id: 'water-plant-1',
  accountId: 1,
  delay: 30 * 60 * 1000,  // 30 分钟后
  handler: async () => {
    await farmService.waterPlant(1, 'plant-123');
  }
});
```

**5. JSON 数据库工具 (json-db.js) - 核心新增**
- 职责：安全地读写 JSON 数据文件
- 关键特性：
  - 原子写入 (防止数据损坏)
  - 文件锁机制 (防止并发冲突)
  - 自动备份 (数据损坏时恢复)
- 使用示例：
```javascript
const JsonDB = require('./services/json-db');

const db = new JsonDB('./data/store.json');

// 读取数据
const data = await db.read();

// 写入数据 (原子操作)
await db.write({
  adminPasswordHash: '...',
  accounts: [...]
});
```

**6. 农场服务 (farm.js)**
- 职责：农场核心操作
- 功能列表：
  - 收获作物
  - 浇水
  - 除草
  - 除虫
  - 施肥
  - 自动巡田
  - 植物生长周期管理
- 关键方法：
```javascript
// 检查并收获
async function checkAndHarvest(accountId) {
  const lands = await getLands(accountId);
  for (const land of lands) {
    if (land.crop && land.crop.state === 'ripe') {
      await harvest(accountId, land.id);
    }
  }
}

// 自动巡田
async function autoPatrol(accountId) {
  await checkAndHarvest(accountId);
  await checkAndWater(accountId);
  await checkAndWeed(accountId);
  await checkAndPest(accountId);
}
```

**7. 好友服务 (friend.js)**
- 职责：好友互动功能
- 功能列表：
  - 偷菜
  - 帮忙浇水
  - 帮忙除草
  - 帮忙除虫
  - 好友黑名单管理
  - 静默时段控制
  - 好友申请处理
- 关键方法：
```javascript
// 偷菜
async function stealFromFriend(accountId, friendId, plantId) {
  // 检查黑名单
  if (isInBlacklist(accountId, friendId)) {
    return;
  }
  
  // 检查静默时段
  if (isSilentPeriod()) {
    return;
  }
  
  await steal(accountId, friendId, plantId);
}

// 好友列表
async function getFriendList(accountId) {
  const friends = await api.getFriendList(accountId);
  return friends.filter(f => !isInBlacklist(accountId, f.id));
}
```

#### 前端核心模块

**1. 状态管理 (Pinia Stores)**

**account.ts** - 账号状态管理:
```typescript
export const useAccountStore = defineStore('account', {
  state: () => ({
    accounts: [],
    selectedAccount: null,
    loading: false,
  }),
  
  actions: {
    async fetchAccounts() {
      this.loading = true;
      const res = await api.getAccounts();
      this.accounts = res.data;
      this.loading = false;
    },
    
    async addAccount(account) {
      await api.addAccount(account);
      await this.fetchAccounts();
    },
    
    async updateAccount(id, config) {
      await api.updateAccount(id, config);
      await this.fetchAccounts();
    },
    
    async deleteAccount(id) {
      await api.deleteAccount(id);
      await this.fetchAccounts();
    },
  },
});
```

**farm.ts** - 农场数据管理:
```typescript
export const useFarmStore = defineStore('farm', {
  state: () => ({
    lands: [],
    crops: [],
    decorations: [],
  }),
  
  actions: {
    async fetchFarmData(accountId) {
      const res = await api.getFarmData(accountId);
      this.lands = res.lands;
      this.crops = res.crops;
      this.decorations = res.decorations;
    },
    
    async harvest(landId) {
      await api.harvest(this.selectedAccountId, landId);
      await this.fetchFarmData(this.selectedAccountId);
    },
  },
});
```

**2. API 封装 (api/index.ts)**
```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器 - 添加 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const api = {
  // 认证
  login: (password) => apiClient.post('/login', { password }),
  logout: () => apiClient.post('/logout'),
  
  // 账号管理
  getAccounts: () => apiClient.get('/accounts'),
  addAccount: (data) => apiClient.post('/accounts', data),
  updateAccount: (id, config) => apiClient.put(`/accounts/${id}`, { config }),
  deleteAccount: (id) => apiClient.delete(`/accounts/${id}`),
  
  // 农场操作
  getFarmData: (accountId) => apiClient.get(`/farm/${accountId}`),
  harvest: (accountId, landId) => apiClient.post(`/farm/${accountId}/harvest`, { landId }),
  
  // 统计数据
  getStats: () => apiClient.get('/stats'),
};
```

**3. 路由配置 (router/index.ts)**
```typescript
import { createRouter, createWebHistory } from 'vue-router';
import NProgress from 'nprogress';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
      {
        path: 'accounts',
        name: 'Accounts',
        component: () => import('@/views/Accounts.vue'),
      },
      {
        path: 'friends',
        name: 'Friends',
        component: () => import('@/views/Friends.vue'),
      },
      {
        path: 'analytics',
        name: 'Analytics',
        component: () => import('@/views/Analytics.vue'),
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫 - 检查登录
router.beforeEach((to, from, next) => {
  NProgress.start();
  const token = localStorage.getItem('token');
  if (to.path !== '/login' && !token) {
    next('/login');
  } else {
    next();
  }
});

router.afterEach(() => {
  NProgress.done();
});

export default router;
```

---

## 三、开发环境搭建

### 3.1 系统要求

- **Node.js**: 18.x 或更高版本
- **pnpm**: 10.x 或更高版本
- **Git**: 最新版本
- **Docker** (可选): 最新版本

### 3.2 安装步骤

**1. 克隆项目**
```bash
git clone <repo-url>
cd qq-farm-bot-ui-main
```

**2. 安装依赖**
```bash
# 安装根目录依赖
pnpm install

# 或分别安装
pnpm -C core install
pnpm -C web install
```

**3. 配置环境变量**
```bash
# 创建 core/.env 文件
cp core/.env.example core/.env

# 编辑配置
# ADMIN_PASSWORD=你的管理密码
# QQ_BOT_ACCOUNT=你的 QQ 账号
# QQ_BOT_PASSWORD=你的 QQ 密码
```

**4. 开发模式运行**
```bash
# 开发后端
pnpm dev:core

# 开发前端 (新终端)
pnpm dev:web

# 或同时开发 (先构建前端)
pnpm dev
```

**5. 构建生产版本**
```bash
# 构建前端
pnpm build:web

# 打包后端
pnpm -C core build
```

### 3.3 Docker 部署

**1. 使用 Docker Compose**
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**2. 单独构建镜像**
```bash
# 构建后端镜像
docker build -t qq-farm-bot:core ./core

# 构建前端镜像
docker build -t qq-farm-bot:web ./web
```

---

## 四、关键功能实现指南

### 4.1 添加账号

**后端 API** (`core/src/controllers/admin.js`):
```javascript
app.post('/api/accounts', authenticated, (req, res) => {
  const { qqNumber, nickname, password } = req.body;
  
  const accounts = store.getAccounts();
  const newId = Math.max(...accounts.map(a => a.id), 0) + 1;
  
  const newAccount = {
    id: newId,
    qqNumber,
    nickname: nickname || qqNumber,
    config: { ...DEFAULT_ACCOUNT_CONFIG },
    createdAt: Date.now(),
  };
  
  accounts.push(newAccount);
  store.setAccounts(accounts);
  
  res.json({ ok: true, data: newAccount });
});
```

**前端实现** (`web/src/views/Accounts.vue`):
```vue
<script setup>
import { ref } from 'vue';
import { useAccountStore } from '@/stores/account';
import { api } from '@/api';

const accountStore = useAccountStore();
const showModal = ref(false);
const formData = ref({
  qqNumber: '',
  nickname: '',
  password: '',
});

const handleSubmit = async () => {
  try {
    await api.addAccount(formData.value);
    await accountStore.fetchAccounts();
    showModal.value = false;
    // 显示成功提示
  } catch (error) {
    // 显示错误提示
  }
};
</script>
```

### 4.2 实现定时任务

**调度器服务** (`core/src/services/scheduler.js`):
```javascript
const cron = require('node-cron');
const store = require('../models/store');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.loadJobs();
  }
  
  addJob(job) {
    const { id, accountId, cron: cronExpr, handler } = job;
    
    const task = cron.schedule(cronExpr, async () => {
      try {
        await handler();
        this.logJobSuccess(id);
      } catch (error) {
        this.logJobError(id, error);
      }
    });
    
    this.jobs.set(id, { task, ...job });
    task.start();
  }
  
  removeJob(id) {
    const job = this.jobs.get(id);
    if (job) {
      job.task.stop();
      this.jobs.delete(id);
    }
  }
  
  loadJobs() {
    // 从存储加载已保存的任务
    const jobs = store.getSchedulerJobs();
    jobs.forEach(job => this.addJob(job));
  }
  
  saveJobs() {
    // 保存任务到存储
    const jobs = Array.from(this.jobs.values()).map(({ task, ...rest }) => rest);
    store.setSchedulerJobs(jobs);
  }
}

module.exports = new Scheduler();
```

**使用示例**:
```javascript
const scheduler = require('./services/scheduler');
const farmService = require('./services/farm');

// 为每个账号添加定时任务
accounts.forEach(account => {
  scheduler.addJob({
    id: `farm-check-${account.id}`,
    accountId: account.id,
    cron: '*/5 * * * *',  // 每 5 分钟
    handler: async () => {
      await farmService.autoPatrol(account.id);
    }
  });
});
```

### 4.3 实现 WebSocket 实时通信

**后端** (`core/client.js`):
```javascript
const { Server } = require('socket.io');

const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // 加入账号房间
  socket.on('join-account', (accountId) => {
    socket.join(`account:${accountId}`);
  });
  
  // 离开账号房间
  socket.on('leave-account', (accountId) => {
    socket.leave(`account:${accountId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 向账号房间广播消息
function broadcastToAccount(accountId, event, data) {
  io.to(`account:${accountId}`).emit(event, data);
}

module.exports = { io, broadcastToAccount };
```

**前端** (`web/src/stores/status.ts`):
```typescript
import { io, Socket } from 'socket.io-client';

export const useStatusStore = defineStore('status', {
  state: () => ({
    socket: null as Socket | null,
    connected: false,
    accountStatus: {} as Record<number, any>,
  }),
  
  actions: {
    connect() {
      this.socket = io();
      
      this.socket.on('connect', () => {
        this.connected = true;
      });
      
      this.socket.on('disconnect', () => {
        this.connected = false;
      });
      
      this.socket.on('account-status', ({ accountId, status }) => {
        this.accountStatus[accountId] = status;
      });
    },
    
    joinAccount(accountId: number) {
      this.socket?.emit('join-account', accountId);
    },
    
    leaveAccount(accountId: number) {
      this.socket?.emit('leave-account', accountId);
    },
    
    disconnect() {
      this.socket?.disconnect();
      this.socket = null;
      this.connected = false;
    },
  },
});
```

---

## 五、常见问题与解决方案

### 5.1 依赖安装失败

**问题**: `pnpm install` 报错
**解决方案**:
```bash
# 清除缓存
pnpm store prune

# 删除 node_modules 和 lock 文件
rm -rf node_modules pnpm-lock.yaml
rm -rf core/node_modules core/pnpm-lock.yaml
rm -rf web/node_modules web/pnpm-lock.yaml

# 重新安装
pnpm install
```

### 5.2 TypeScript 类型错误

**问题**: 编译时出现类型错误
**解决方案**:
```bash
# 检查 TypeScript 配置
pnpm -C web tsc --noEmit

# 更新类型定义
pnpm -C web add -D @types/node@latest
```

### 5.3 Docker 构建失败

**问题**: `docker-compose build` 失败
**解决方案**:
```bash
# 清除 Docker 缓存
docker system prune -a

# 重新构建
docker-compose build --no-cache
```

### 5.4 数据库文件损坏

**问题**: `store.json` 数据损坏
**解决方案**:
```javascript
// json-db.js 会自动备份和恢复
// 手动恢复备份
const fs = require('fs');
const backupFile = './data/store.json.bak';
const mainFile = './data/store.json';

if (fs.existsSync(backupFile)) {
  fs.copyFileSync(backupFile, mainFile);
}
```

### 5.5 调度器任务不执行

**问题**: 定时任务没有按时执行
**解决方案**:
```javascript
// 检查调度器状态
const scheduler = require('./services/scheduler');
console.log(scheduler.jobs);

// 重启调度器
scheduler.jobs.forEach((job, id) => {
  scheduler.removeJob(id);
  scheduler.addJob(job);
});
```

---

## 六、测试指南

### 6.1 单元测试

**后端测试** (`core/tests/`):
```javascript
const assert = require('assert');
const store = require('../src/models/store');

describe('Store', () => {
  it('should get accounts', () => {
    const accounts = store.getAccounts();
    assert(Array.isArray(accounts));
  });
  
  it('should add account', () => {
    const newAccount = {
      id: 1,
      qqNumber: '123456',
      nickname: 'Test',
    };
    store.addAccount(newAccount);
    const accounts = store.getAccounts();
    assert(accounts.some(a => a.id === 1));
  });
});
```

**运行测试**:
```bash
pnpm -C core test
```

### 6.2 前端测试

**组件测试** (`web/tests/`):
```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Login from '@/views/Login.vue';

describe('Login', () => {
  it('renders login form', () => {
    const wrapper = mount(Login);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });
  
  it('submits form with password', async () => {
    const wrapper = mount(Login);
    await wrapper.find('input[type="password"]').setValue('test123');
    await wrapper.find('form').trigger('submit.prevent');
    // 验证提交逻辑
  });
});
```

**运行测试**:
```bash
pnpm -C web test
```

### 6.3 集成测试

**端到端测试**:
```javascript
const axios = require('axios');
const assert = require('assert');

describe('API Integration', () => {
  const baseURL = 'http://localhost:3000/api';
  
  it('should login successfully', async () => {
    const res = await axios.post(`${baseURL}/login`, {
      password: 'test123',
    });
    assert(res.data.ok);
    assert(res.data.data.token);
  });
  
  it('should get accounts', async () => {
    const loginRes = await axios.post(`${baseURL}/login`, {
      password: 'test123',
    });
    const token = loginRes.data.data.token;
    
    const accountsRes = await axios.get(`${baseURL}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(accountsRes.data.ok);
    assert(Array.isArray(accountsRes.data.data));
  });
});
```

---

## 七、性能优化建议

### 7.1 后端优化

**1. 数据库查询优化**
```javascript
// 使用缓存
const cache = new Map();

async function getAccountData(accountId) {
  if (cache.has(accountId)) {
    return cache.get(accountId);
  }
  
  const data = await db.read();
  const accountData = data.accounts.find(a => a.id === accountId);
  
  cache.set(accountId, accountData);
  setTimeout(() => cache.delete(accountId), 5 * 60 * 1000); // 5 分钟缓存
  
  return accountData;
}
```

**2. 批量操作优化**
```javascript
// 批量处理农场操作
async function batchFarmOperations(operations) {
  const results = await Promise.allSettled(
    operations.map(op => executeOperation(op))
  );
  
  const successes = results.filter(r => r.status === 'fulfilled');
  const failures = results.filter(r => r.status === 'rejected');
  
  return { successes, failures };
}
```

### 7.2 前端优化

**1. 组件懒加载**
```typescript
const routes = [
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('@/views/Analytics.vue'), // 懒加载
  },
];
```

**2. 数据缓存**
```typescript
import { useQuery } from '@vueuse/core';

export function useAccountData(accountId: number) {
  return useQuery(
    ['account', accountId],
    () => api.getAccountData(accountId),
    {
      staleTime: 5 * 60 * 1000, // 5 分钟
      cacheTime: 10 * 60 * 1000, // 10 分钟
    }
  );
}
```

**3. 虚拟滚动**
```vue
<template>
  <div class="virtual-scroll">
    <div
      v-for="item in visibleItems"
      :key="item.id"
      :style="{ transform: `translateY(${item.top}px)` }"
    >
      {{ item.name }}
    </div>
  </div>
</template>
```

---

## 八、安全建议

### 8.1 认证安全

**1. 密码哈希**
```javascript
const crypto = require('crypto');

function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password + process.env.SALT)
    .digest('hex');
}
```

**2. Token 验证**
```javascript
const tokens = new Set();

function issueToken() {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);
  return token;
}

function verifyToken(token) {
  return tokens.has(token);
}
```

### 8.2 数据安全

**1. 输入验证**
```javascript
function validateAccountData(data) {
  const schema = {
    qqNumber: { type: 'string', required: true, pattern: /^\d{5,15}$/ },
    nickname: { type: 'string', maxLength: 20 },
    password: { type: 'string', required: true, minLength: 6 },
  };
  
  // 验证逻辑
}
```

**2. SQL 注入防护**
```javascript
// 使用参数化查询
const account = accounts.find(a => a.id === accountId);
// 而不是拼接字符串
```

---

## 九、监控与日志

### 9.1 日志配置

**Winston 日志** (`core/src/services/logger.js`):
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

module.exports = logger;
```

### 9.2 监控指标

**关键指标**:
- API 响应时间
- 任务执行成功率
- 内存使用率
- WebSocket 连接数
- 数据库读写次数

**监控实现**:
```javascript
const stats = {
  apiRequests: 0,
  taskExecutions: 0,
  taskFailures: 0,
  startTime: Date.now(),
};

// 中间件统计 API 请求
app.use((req, res, next) => {
  stats.apiRequests++;
  next();
});

// 统计任务执行
scheduler.on('job-complete', () => {
  stats.taskExecutions++;
});

scheduler.on('job-error', () => {
  stats.taskFailures++;
});

// 提供统计 API
app.get('/api/stats', (req, res) => {
  res.json({
    ...stats,
    uptime: Date.now() - stats.startTime,
  });
});
```

---

## 十、部署清单

### 10.1 生产环境部署

**部署前检查**:
- [ ] 所有测试通过
- [ ] ESLint 检查通过
- [ ] TypeScript 类型检查通过
- [ ] 性能测试达标
- [ ] 安全漏洞扫描通过

**部署步骤**:
```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
pnpm install

# 3. 构建前端
pnpm build:web

# 4. 构建后端
pnpm -C core build

# 5. 配置环境变量
cp core/.env.example core/.env
# 编辑 core/.env

# 6. 启动服务
pm2 start core/client.js --name qq-farm-bot

# 或使用 Docker
docker-compose up -d

# 7. 检查日志
pm2 logs qq-farm-bot
# 或
docker-compose logs -f

# 8. 验证服务
curl http://localhost:3000/api/stats
```

### 10.2 回滚方案

**回滚步骤**:
```bash
# 1. 停止服务
pm2 stop qq-farm-bot
# 或
docker-compose down

# 2. 切换到上一个版本
git checkout <previous-tag>

# 3. 重新构建
pnpm install
pnpm build:web
pnpm -C core build

# 4. 启动服务
pm2 start qq-farm-bot
# 或
docker-compose up -d

# 5. 验证服务
curl http://localhost:3000/api/stats
```

---

## 十一、联系方式与支持

### 11.1 问题反馈

如遇到问题，请提供以下信息:
- 问题描述
- 复现步骤
- 错误日志
- 环境信息 (Node.js 版本、操作系统等)

### 11.2 文档更新

本文档应随项目更新而更新:
- 重大功能变更后需更新文档
- API 接口变更需及时同步
- 部署流程变化需更新清单

---

## 十二、附录

### 12.1 依赖版本清单

**后端依赖** (`core/package.json`):
```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "express": "^4.21.0",
    "long": "^5.3.2",
    "protobufjs": "^8.0.0",
    "pushoo": "^0.1.11",
    "qrcode": "^1.5.4",
    "socket.io": "^4.8.3",
    "winston": "^3.18.3",
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^7.4.3",
    "@types/node": "^24.10.1",
    "eslint": "^9.39.1",
    "pkg": "^5.8.1"
  }
}
```

**前端依赖** (`web/package.json`):
```json
{
  "dependencies": {
    "@vueuse/core": "^14.2.1",
    "axios": "^1.13.5",
    "nprogress": "^0.2.0",
    "pinia": "^3.0.4",
    "socket.io-client": "^4.8.3",
    "vue": "^3.5.25",
    "vue-router": "^5.0.3"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^7.4.3",
    "@iconify-json/carbon": "^1.2.18",
    "@iconify-json/fa-solid": "^1.2.2",
    "@iconify-json/svg-spinners": "^1.2.4",
    "@unocss/eslint-plugin": "^66.5.12",
    "@unocss/reset": "^66.5.12",
    "@vitejs/plugin-vue": "^6.0.2",
    "@vue/tsconfig": "^0.8.1",
    "eslint": "^9.39.1",
    "eslint-plugin-format": "^1.4.0",
    "rollup-plugin-visualizer": "^7.0.0",
    "typescript": "~5.9.3",
    "unocss": "^66.5.12",
    "vite": "^7.3.1",
    "vite-plugin-compression": "^0.5.1",
    "vue-tsc": "^3.1.5"
  }
}
```

### 12.2 配置文件示例

**core/.env.example**:
```bash
# 管理员密码
ADMIN_PASSWORD=your_admin_password

# QQ 账号信息
QQ_BOT_ACCOUNT=your_qq_account
QQ_BOT_PASSWORD=your_qq_password

# 推送配置 (可选)
PUSHOO_CHANNEL=bark
PUSHOO_TOKEN=your_push_token

# 环境变量
NODE_ENV=production
PORT=3000
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  core:
    build:
      context: ./core
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./core/data:/app/data
      - ./core/logs:/app/logs
    environment:
      - NODE_ENV=production
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    restart: unless-stopped

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - core
    restart: unless-stopped
```

---

**文档状态**: ✅ 已完成  
**最后更新**: 2026-02-27  
**维护者**: 开发团队  
**版本**: 2.1

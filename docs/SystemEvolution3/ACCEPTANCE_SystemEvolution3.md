# 阶段验收文档 (ACCEPTANCE) - 系统演进 Phase 3

## 验收目标
完成由于历史原因产生的近 2000 行 `friend.js` 神仙代码（上帝类）的解耦作业，以及在前端实现刚打通的 `system_logs` 数据图表展示。

## 验收清单

### 1. 后端接口集成
- [x] 在 `admin.js` 中新增 `/api/system-logs` 端点。
- [x] 实现基于 `offset` 和 `limit` 的安全分页。
- [x] 实现了依据 `level`、`accountId` 和 `keyword` (模糊搜索) 的动态下推查询。

### 2. 前端面板扩展
- [x] 移除了对外部组件库（如 ant-design-vue, dayjs）的重度依赖，改为原生 UnoCSS 和内置原子组件。
- [x] 新增 `SystemLogs.vue` 组件以及过滤搜索框。
- [x] 将审计日志入口加入到 `web/src/router/menu.ts` 管理菜单下。
- [x] `npm run build` 正确通过，依赖安全。

### 3. 解耦 `friend.js` 战略重构
- [x] 创建 `core/src/services/friend/` 子域模块。
- [x] **`friend-state.js`**: 提取所有跨模块的共享缓存和映射器。
- [x] **`friend-actions.js`**: 纯粹处理针对网络的原子操作，诸如抽水、下毒、偷菜。
- [x] **`friend-decision.js`**: 处理时机过滤、防封判定算法核心。
- [x] **`friend-scanner.js`**: 绑定上述模块，专门从事 `checkFriendsThreePhase` 循环轮序。
- [x] **`friend.js` (门面模式)**: 重置为透明门面出口，接防原生接口，对外零断代迁移。
- [x] **环形依赖剥离**: 采用 `Object.assign` 模式修正了传统 CommonJS 导致的无序闭包异常，通过了整体 lint 检测。

## 结论
所有代码已通过 ESLint 和 VITE AST 分析。架构干净整洁。
**验收状态：通过 (APPROVED)**

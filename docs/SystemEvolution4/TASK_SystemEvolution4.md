# 任务拆解与契约文档 (TASK) - 农场系统演进 Phase 4

## 当前阶段 (Phase)
Phase 4: 熔断机制、数据图表可视化与路由器剥离

## 原子任务拆分 (Atomic Tasks)

### 任务 1: 实现风控熔断器底层架构 (Circuit Breaker)
- **输入**: 连续错误拦截。
- **输出**: `core/src/services/circuit-breaker.js` 的新增。
- **动作**:
  - 创建类或闭包管理 `circuitState` (CLOSED, HALF_OPEN, OPEN)。
  - 定义 `recordFailure()` 被触发 N 次时转换状态。
  - 定义 `recordSuccess()` 用以复位或半开转闭合。
  - 在 `worker-manager.js` 或网络收发层判断若处于 `OPEN` 则自动抛弃执行或挂起队列。
- **依赖 (Mermaid)**:
  ```mermaid
  graph LR
    friend-scanner.js --> |catch 1002003| circuit-breaker.js
    network.js --> |拦截发出| circuit-breaker.js
  ```

### 任务 2: 在后端聚合日历报表流 (Chart Endpoint)
- **输入**: HTTP 请求。
- **输出**: `/api/stats/trend` 等支持 Echarts 的时间序列数据。
- **动作**:
  - 修改 `core/src/controllers/admin.js`。
  - 提取 `stats` 里按日统计的金额、经验涨幅。
  - 格式化输出为 `{ dates: [...], series: { exp: [...], items: [...] } }`。

### 任务 3: Vue 前端 Echarts 高端展示集成
- **输入**: VITE 编译系统。
- **输出**: `package.json` 加入 `echarts`, 新增 `AnalyticsEcharts.vue`。
- **动作**:
  - 在概览大屏最上端渲染深色科技感的数据曲线。
  - 展示近 7 天偷菜与金币进账。
- **预检**: 确保 `npm run build` 打包后体积不会严重膨胀，按需引入图表。

### 4. 任务 4: 分离 Farm Tools 等臃肿路由
- **动作**:
  - 新建 `core/src/routes/farm-tools-routing.js`。
  - 将 `/api/time_crops`、`/api/lands_for_level`、`/api/calculator`、`/api/level_exp_calc` 完整移动。
  - 在 `admin.js` 开头 `app.use('/api/tools', require(...))` 挂载。
  - 在 `web/src/api` 和 `FarmsTools.vue` 替换原有的后端 API 调用。

# 共识文档 (CONSENSUS) - 农场系统演进 Phase 4

## 前置共识
1. 本期是《农场系统演进系列》的终局之战，将重点转向“风控自保”、“数据大屏展现”以及“遗留路由梳理”。
2. **熔断定义**：风控熔断（Circuit Breaker）不是关闭整个 Docker 容器，而是通过修改 `globalConfig.runMode` 或设置应用级拦截器（如在 `drainQueue` 或 `worker-manager` 中拦截任务发布），并推送到前端的“系统状态”中。
3. **图表技术栈**：严格采用 Vue 原生环境支持的 Echarts（如果项目中未安装，我们也可以通过在 Vue 组件内引入 Echarts CDN 或直接 `npm install echarts vue-echarts` 静默执行）。

## 交付产物与验收标准 (Acceptance Criteria)

### 1. 全局风控熔断器 (Circuit Breaker)
**需求描述**：
- 监听 `friend-scanner` 及深层网络请求中抛出的 `1002003`（或类似危险验证码）风控报文。
- 在 10 分钟内累积 N 次（如 5 次）失败，拉响熔断警报（Trigger Circuit Breaker Open）。
- 熔断开启后：
  - `status.js` 报告状态变为 `CIRCUIT_BREAKER_OPEN`。
  - 所有排队的常规 API 停止消费，避免无意义作死。
  - 自动通过企微/WebPush 触发一次特级告警：“账户出现异常风控阻断，引擎已保护性急停”。

### 2. 统计数据可视化大屏 (Vue Echarts)
**需求描述**：
- 读取 MySQL `stats` / `system_logs` 或者本地已有的数据。
- 在 `web/src/views/Analytics.vue`（或者 Dashboard 的一部分）引入折线图或柱状图。
- 图形需能展现“最近 7 天”各账号的“成功偷菜次数”或者“异常发生频率走势”。

### 3. API 微服务化转写 (Farm Tools API 剥离)
**需求描述**：
- 把 `admin.js` 文件内的以下路由抽离：
  - `/api/time_crops`
  - `/api/lands_for_level`
  - `/api/calculator`
  - `/api/level_exp_calc`
- 新建文件 `core/src/routes/farm-tools-routing.js` 统一接管，并在 `admin.js` 中 `app.use('/api/tools', farmToolsRouter)`。前端调用处需同步修改，消灭面条代码。

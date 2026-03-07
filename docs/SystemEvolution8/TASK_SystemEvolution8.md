# Phase 8: 集群智能流控与网关抽象 (Smart Rebalance & NGINX Routing) - Task

## Atomize 原子任务拆解

### [ ] Task 1: 后端存储配置层实现 (Backend Models & Settings)
- **目标**: 扩展 `core/src/models/store.js`
- **步骤**:
  - 增加对 `clusterConfig` (包含 `dispatcherStrategy` 等) 的 get/set 支持。
  - 在 `admin.js` 中暴漏对应的 `GET /api/admin/cluster-config` 与 `POST` 接口用于保存这些选项。

### [ ] Task 2: 前端管理面板集成 (Admin Frontend UI)
- **目标**: 扩展 `web/src/views/Settings.vue` 或 `stores/setting.ts`。
- **步骤**:
  - 创建独立区域卡片：“分布式与集群流控”。
  - 引入 `BaseSelect` 供用户切换：`round_robin` (轮询) 和 `least_load` (最小负载 / 自动推流未满载集群)。

### [ ] Task 3: 核心调度器状态机与智能分发法 (Least Load Dispatcher Algorithm)
- **目标**: 改造 `core/src/cluster/master-dispatcher.js`。
- **步骤**:
  - 阅读刚才缓存的配置策略。
  - 改变单纯全量清空的 `rebalance`：引入 `this.accountToWorker = new Map()` 实施粘性映射。如果账号已有归属且 Worker 在线则保留分发；对于新增或离线重排期，如果选择了 `least_load`，则寻找所有 `w.assigned.length` 最小的 Node 进行精准打击推流。

### [ ] Task 4: NGINX 反代网关建设 (Nginx Integration)
- **目标**: 将负载重任从单一 `client.js` 切向正规军。
- **步骤**:
  - 新建 `nginx/nginx.conf`，写入 `upstream master` 并且包含经典的 `Upgrade WebSocket` 处理。
  - 修改最新版 `docker-compose.yml`，编排 nginx 容器并暴露在 `3000` 或其他主端口顶配层。

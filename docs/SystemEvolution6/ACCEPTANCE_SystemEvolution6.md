# Phase 6: 分布式 Master-Worker 集群化架构 (ACCEPTANCE)

## 验证项清单 (Verification Checklist)

### 1. 通信调度与事件抽象验证 (Unit: `worker-client.js` 和 `master-dispatcher.js`)
- [x] Node.js 通过 `ROLE` 环境变量能够按需启动两种不同的服务，Master 仅加载网络前端面板与数据库连线，不进入抓取死循环。
- [x] 新增的 `MasterDispatcher` 借助 Socket.IO 能正确挂载至 `admin.js` 内的框架 HTTP 服务，并监听 `worker:*` 级别的专有命令。
- [x] 新增的 `WorkerClient` 可以通过 `io` 对象，通过带凭据的长连接握手正确寻址 Master，且在运行时只加载调度队列不启动任何面板服务。
- [x] Worker 在完成状态更新或心跳回调时，能无缝对接 `provider.getStatus` 和 `emitRealtimeLog` 的代理传输通道，让前台依然实时可见日志。

### 2. 集群扩容与部署映射 (Unit: `docker-compose.yml`)
- [x] 成功构造包含 Master 以及 `scale>1` 的 Worker 的复合拓扑网络。
- [x] `docker-compose` 环境正确映射了虚拟内部网络 `farm-master:3000` 并向下传递给所有 worker，实现了开箱即用（Out-Of-The-Box）。

### 遗留隐患预警 (Risk Alerts)
> 随着架构一分为二，存在一个重要且尚未完全闭环的卡点，需要在真实部署后测试：由于账号配置（Account Store）依赖读库并在初始化内存态（Store）下发，后续如果在 Web 面板“新增”或者“修改密码”，Master 需要动态补发账号实例更新通过 `master:assign:accounts` 推给相关的 Worker（本次实现基于全量的 assigned Set 逻辑覆盖来达到下发替换的目的）。

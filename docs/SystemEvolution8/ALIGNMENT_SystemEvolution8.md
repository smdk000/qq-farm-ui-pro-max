# Phase 8: 集群智能流控与网关抽象 (Smart Rebalance & NGINX Routing) - Alignment

## 1. 任务目标分析 (Align)
前序 Phase 7 虽然实现了 Worker 内部差分热更新，解决了账户不间断重连的问题，但 Master 分发逻辑本身依然处于原始的轮询重洗（Round-Robin 全量重分配）阶段。本阶段重点响应用户的最终级架构诉求：
1. **策略支持**: 在 Admin 面板新增集群调度策略切换（轮询 / 最小负载分配）。
2. **扫码推流**: 新用户扫码登录或新增账号时，不再打乱原有账号的绑定节点（剥离旧的 rebalance，引入 Stickiness 粘性绑定），直接计算出“当前压力最小 (未满载)”的 Worker 节点，将该账号定向推流。
3. **NGINX 网关抽象**: 为配合真正的万号商用跨宿主机挂机体系，把 Docker 体系从单调的 Node 暴露上升到工业界标准的 NGINX 反向代理层，专职处理 WebSocket 负载拆包，让基础设施彻底圆满。

## 2. 歧义消除与约束 (Constraints)
- **后端持久化与调度**: 在 `store.js` 扩展一个 `getClusterConfig()` 接口，使 Master 调度器能随时知道目前的策略。改写 `master-dispatcher.js`，引入 `this.accountToWorker` 持久缓存。
- **网关抽象**: 利用官方 `nginx:alpine` 镜像作为 `docker-compose.yml` 的对外出入口（暴漏 80 端口或原定 3000），通过配置 `proxy_set_header Upgrade $http_upgrade` 进行无缝的 WS 穿透。
- **安全保障**: NGINX 反代后要注意获取用户的真实 IP 问题（`X-Forwarded-For`），这关系到黑名单与体验卡 IP 限制的准确性。

# Phase 8: 集群智能流控与网关抽象 (Smart Rebalance & NGINX Routing) - Consensus

## 1. 共识需求 (Requirements Consensus)
系统向无限极横向扩展过渡，扫除架构最后一公里痛点。
- 需求 1: 提供管理员可视化的“集群调度配置”面板（Settings -> 集群分布式流控）。
- 需求 2: 改变 Master 面板盲目分配的行为，使得某个账户一旦分配给了 Worker A，除非 Worker A 死了，否则它永久粘附在该节点。只有新进来扫码的账号才会被分配到当前分配池最少（Least Load）的闲置节点。
- 需求 3: 提供内置的标准 NGINX 代理模版，接办前端与 Socket的入口并发，真正落实“基础设施就绪”。

## 2. 验收标准 (Acceptance Criteria)
- [ ] 前端《高级设置》页面出现 “分布式与集群调度” 卡片选项（配置选项包含：轮询、最小负载推流）。能够前后端保存生效。
- [ ] 后台查阅 `master-dispatcher` 日志：在执行增加一个新小号后，老号不再被重洗牌发往别的 Worker，而是老号巍然不动，新号精准掉落到负荷最轻的 Worker 手中。
- [ ] `docker-compose.yml` 现提供 `nginx` 节点，并且内置 `nginx/nginx.conf` 用于 websocket 的自动晋升协议转发。
- [ ] `help-articles-complete.ts` 与更新日志中准确无误传达本次功能扩展。

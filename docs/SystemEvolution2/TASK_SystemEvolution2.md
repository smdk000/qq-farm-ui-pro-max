# TASK: 农场系统演进 Phase 2 拆解

- [x] **任务 1**：搭建数据库事务支持
  - [x] 在 `mysql-db.js` 添加 `withTransaction()` 函数。
  - [x] 改造 `store.js` 里的高危存储行为，使用 transaction 裹挟。
- [x] **任务 2**：加权 TTL 限流重构
  - [x] 编辑 `network.js`，为 Task 实体添加 `{ ttl, isRetryable }`。
  - [x] 将超时行为替换成静默的“可恢复异常(RecoverableError)”。
- [x] **任务 3**：平台抽象层开发 (Strategy)
  - [x] 创建 `core/src/platform/` 目录编排抽象。
  - [x] 替换 `friend.js` 中相关逻辑为 `userState.platform.allowAutoSteal()` 等接口控制。
- [x] **任务 4**：结构化日志引擎
  - [x] 创建并执行 `002-logs-schema.sql` 建表。
  - [x] 对接 Master 的 logger，以 Batch 模式异步灌入 MySQL 避免 I/O 阻塞。

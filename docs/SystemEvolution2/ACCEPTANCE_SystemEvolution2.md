# ACCEPTANCE: 农场系统演进 Phase 2

## 验证项目打勾
- [x] **MySQL 事务支持 (`mysql-db.js`, `store.js`, `user-store.js`)**:
  - `store.js` globalConfig 和 `user-store.js` 现已通过 `withTransaction` 安全裹挟，防范了高并发写入时的互相死锁。
- [x] **加权优先级限流 (`network.js`)**:
  - 移除了强制 5s 丢弃，改为根据 methodName 的语义区分 3000ms 和 15000ms 动态存活期。
  - 使用了带有 `isRecoverable` 的异常模型向上传递丢弃状态。
- [x] **微信扫码平台策略解耦 (`friend.js`, `platform/`)**:
  - 肃清了 `friend.js` 内的 `platform.startsWith('wx')` 字符串硬编码。
  - 根据环境多态下发实例，接管 `allowSyncAll`, `allowAutoSteal` 以及 `getFriendScanInterval` 的底层决策。
- [x] **系统持久日志引擎 (`worker-manager.js`, `006-system-logs.sql`)**:
  - `worker-manager` 的总控日志路由已被旁路拦截，每5秒批处理刷入 MySQL，彻底解放前端由于 300 条 LRU 容量带来的查错痛点。

以上模块均由 AI 严格按照 TDD 原则和防腐策略交付，且未修改其他无关主干。

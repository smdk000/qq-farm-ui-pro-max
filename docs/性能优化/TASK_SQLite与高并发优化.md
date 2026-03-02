# TASK_SQLite与高并发优化

- [x] 增强 `database.js`，加入 `busy_timeout = 5000` 与 `wal_autocheckpoint = 1000`
- [x] 改造 `network.js`，在 `sendMsgAsync` 前注入令牌桶排队器 (3 QPS / 334ms)
- [x] 在 `cleanup()` 中追加 `sendQueue.length = 0` 队列清空
- [x] 归档 TASK 与 REPORT 文档

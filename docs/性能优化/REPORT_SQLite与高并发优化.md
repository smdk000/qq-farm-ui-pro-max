# REPORT_SQLite与高并发优化

## 完成概述

✅ **SQLite 防争用增强**：在 `core/src/services/database.js` 中追加了 `busy_timeout = 5000`（遇锁自旋最多 5 秒）和 `wal_autocheckpoint = 1000`（自动合并 WAL 文件）。

✅ **WebSocket 令牌桶限流器**：在 `core/src/utils/network.js` 中实现了 Token Bucket 异步排队网关，所有业务请求强制以 **3 QPS（每帧间隔 ≥ 334ms）** 的绝对速率发出，从物理层杜绝高频风控触发。

✅ **队列清理安全保障**：在 `cleanup()` 函数中追加了 `sendQueue.length = 0` 和 `drainRunning = false`，确保断线重连时不carry旧请求。

## 修改文件清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `core/src/services/database.js` | 追加 2 行 | `busy_timeout` + `wal_autocheckpoint` |
| `core/src/utils/network.js` | 追加 ~40 行 + 修改 cleanup | 令牌桶限流器 + 队列清空 |

## 验证建议
1. 重启服务后观察日志无 `SQLITE_BUSY` 或 `database is locked` 错误
2. 同时触发偷菜+捣乱+浇水复合操作，观察 WebSocket 发包时间戳间隔 ≥ 334ms

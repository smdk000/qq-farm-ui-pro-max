# PLAN_SQLite与高并发网络优化方案

## 1. 现状调研与核心误区澄清

针对您提出的两点优化方向，经过对 2.1 版本核心源码的全景盘点，发现了当前架构的一些实际情况，为您作出相应的澄清与方案修正：

### 1.1 SQLite 持久化层现状
- **实际情况**：审查 `core/src/services/database.js` (Line 20) 发现，**开发阶段已通过 `db.pragma('journal_mode = WAL');` 默认启用了预写式日志模式**，并配合了 `synchronous = NORMAL`。
- **隐患留存**：即使在 WAL 模式下，当高频写入操作（如定时写日志、任务存盘备份）发生时，如果没有配合 `busy_timeout`（忙等待超时），进程间的锁争用依然可能立刻抛出 `database is locked` 异常。

### 1.2 高并发动作（偷菜/捣乱）网络层现状
- **核心误区**：系统农场数据的交换与好友操作（剥离了早期的 HTTP 接口），**目前完全基于同一条双向长连接 (`WebSocket`) 的 Protobuf 封包进行通信**。详见 `core/src/utils/network.js` 中的 `ws.send(encoded)`。
- **因此**：传统的在 Axios / Native Fetch 上配置 `MaxSockets`（或 `http.Agent` 池化限制）在此场景下**完全无效**，因为根本不存在建立多个 HTTP TCP 连接的情况。腾讯风控针对的是**单连接内短时间收到的 RPC Method 调用帧数量过于密集（QPS 过高）**。

---

## 2. 优化实施方案设计 (Proposal)

综上所述，为您量身定制以下契合当前底层的架构修改方案：

### 2.1 SQLite 进阶防争用改造方案
文件目标：修改 `core/src/services/database.js`
- **注入防锁死等待机制**：追加 `db.pragma('busy_timeout = 5000');`，使数据库在遇到并发写入时，自动进入自旋等待（最长5秒），而不是直接暴毙报错。
- **自动检查点优化**：追加 `db.pragma('wal_autocheckpoint = 1000');` 确保 WAL 缓存文件 (farm-bot.db-wal) 不会无限膨胀，保障读取无性能损耗。

### 2.2 WebSocket 令牌桶全量限流 (针对 3 发/秒)
文件目标：修改 `core/src/utils/network.js` 及各服务调用层
- **弃用单纯的 Sleep**：目前在 `friend.js` 的批处理如 `runBatchWithFallback` 或 `putPlantItemsDetailed` 中仅使用了粗暴的 `await sleep(100)` 或 `await sleep(200)` 控制间隔，这不仅不精准，且多任务并发时会互相重叠（比如：农场轮询刚好碰上了自动同意好友的轮询）。
- **全局令牌桶队列器设计**：
  1. 在 `network.js` 中拦截底层的 `sendMsgAsync` 函数。
  2. 实现一个基于 `Promise` 分发的 **“漏桶 / 令牌桶” (Token Bucket)**。
  3. 设定放行速率：**每秒最多允许 3 个请求数据帧离开系统 (`ws.send`)**，平均发送间隔强制卡死在 `333ms` 每一帧（哪怕上层应用是同时 `Promise.all` 砸过来 10 个请求，底层也会严格以每秒 3 个的速度匀速发给腾讯服务器）。
  4. 这种方式能从物理发送层级**100%避免触发 QPS 超过 3 次/秒 的高频风控限制**。

---

## 3. 验收验证标准

若您同意该计划，接下来的 `TASK` 将直接落地该代码：
1. 观察 `network.js` 重构后的收发日志，同时下达“捣乱+偷菜+浇水”复合操作，确认发出的 WebSocket payload 时间戳严格相差 `>= 333ms`。
2. 观察 SQLite 日志，无 `locked` 错误，读写流畅。

> **审批请求**：请问您是否同意此修订版的 Plan（即改用 WebSocket 底层 Token Bucket 令牌队列实现每秒 3 串行）？如同意，将立即进入编码阶段修改这两份核心文件。

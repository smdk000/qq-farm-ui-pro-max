# DESIGN: 农场系统演进 Phase 2

## 1. 架构总览

```mermaid
graph TD
    subgraph Platform Layer
        Factory[PlatformFactory]
        Base[BasePlatform]
        WX[WeChatPlatform]
        QQ[QQPlatform]
        Factory -->|注入| QQ
        Factory -->|注入| WX
        QQ --|> Base
        WX --|> Base
    end

    subgraph Core Logic
        Friend[friend.js]
        Farm[farm.js]
        Friend -->|询问| Factory
        Farm -->|询问| Factory
    end
    
    subgraph Network Layer
        Net[network.js - Weighted Queue]
        Net -->|TTL=3s| Minor[Minor Task]
        Net -->|TTL=15s| Core[Core Task]
        Net -->|TTL=INF| Urgent[Urgent Harvest Task]
    end
    
    subgraph Data Layer
        Pool[MySQL Pool]
        Trans[Transaction Helper]
        Logger[Database Logger]
        Trans --> Pool
        Logger --> Pool
    end
    
    Core Logic --> Net
    Core Logic --> Trans
```

## 2. 模块依赖与接口契约
- **平台策略契约**：接口需包含 `getFriendInterval()`, `allowFullSync()`, `allowAutoSteal()` 等布尔或数值返回类型。
- **事务契约**：`db.withTransaction(async (conn) => { ... })`
- **队列契约**：`enqueueSend(task, { reject, ttl: 3000, retryWait: 1000 })`

## 3. 数据流向 (日志落库)
1. Worker `log()`触发
2. 发送 ipc 消息 `account_log` 面向 Master
3. Master `worker-manager.js` 拦截
4. 一路推向 Pinia (通过 WebSocket 保留最新 300 条)
5. 另一路写入 MySQL `system_logs` 表 (利用批量Insert节约开销)

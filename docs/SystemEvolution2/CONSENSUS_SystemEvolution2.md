# CONSENSUS: 农场系统演进 Phase 2

## 🎯 业务共识

1. **结构化日志分离**：
   - 建立 `system_logs` 数据表专门负责持久化日志。前端首页保持最近 300 条内存级渲染；额外增设“全量日志API”供管理面板检索历史。
2. **轻量级 ACID 支持**：
   - 封装基于现有 MySQL Pool 的 `withTransaction` 高阶函数，在涉及 `saveUsers`（资产变更）及核心设定修改时保证原子性，遇到失败能正确回滚。
3. **加权生存时间队列 (Weighted TTL)**：
   - 将原先一刀切的 5000ms 强制抛弃，升级为：闲杂状态类分配 3s TTL，核心播种/铲除类分配 15s TTL。超时后抛出特定类别的异常，通知前端重试而非报错弹窗。
4. **平台策略库 (Strategy Pattern)**：
   - 提取 `platform/BasePlatform.js`, `platform/WeChatPlatform.js`, `platform/QQPlatform.js`。通过工厂方法在账号初始化时根据 `platform` 标识注入实例，接管 `canSteal`、`getFriendScanInterval` 等方法。

## 📏 验收标准 (AC)
- [ ] 数据库新增 `account_logs` 结构并在新老账号下运作正常。
- [ ] 代码库搜索不到裸露的 `if (platform.startsWith('wx'))` 业务逻辑判断。
- [ ] 网络断开/高频积压时，前端请求超时会触发无感知的重试，而不是满屏飘红。
- [ ] 资金和等级数据更新时，若遇死锁能触发 Rollback 日志。

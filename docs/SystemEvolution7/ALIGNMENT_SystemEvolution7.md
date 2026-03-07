# Phase 7: 系统演进与隐患治理 (SystemEvolution7) - Alignment

## 1. 任务目标分析 (Align)
前序审查 (REVIEW_20260306) 指出了 v4.3.0 分布式重构后的四大待解决缺陷，本阶段致力于将其彻底抹平，实现无死角闭环：
1. **启动阻断防错机制**: 防止用户未配好 MySQL 强行启动导致的崩溃海啸。
2. **Master-Worker 差分更新 (Diff Loading)**: 避免在主控面板改了一次密码就强行打断所有子节点的热分配中断问题。
3. **运维脚本废弃警告**: 将分散精力的 nohup/pm2 等旧派脚本重命名或打入废弃标记，全量推行 Docker-compose 规范。
4. **大屏按需加载的白屏优化**: 在 Vue 前端加载巨型图表时，补充 `<Suspense>` 与 Loading Spin 避免用户在拆包加载期认为程序卡死。

## 2. 歧义消除与约束 (Constraints)
- **Diff Loading 实现**: 不改动整体 Round-Robin 架构，但在 `worker-client.js` 内部收到 `accounts` 更新时，不再无脑覆盖执行 `worker.start()`，而是先对比新旧集合，仅针对**新增/修改密码等凭据变化**的单号进行 `restartAccount`，对**被删除/冻结**的账号执行 `stopAccount`，对**毫无变化**的账号保持原有 `Timeout` 继续运转。
- **环境监测点**: `client.js` 或 `data-provider.js`，在拉起 `app.listen` 或 `Master/Worker` 逻辑前执行强制探测，一旦连接池建立失败立即 `process.exit(1)` 并用极醒目的中文给予提示。
- **运维脚本处理**: 不直接 `rm` 删除，而是统一移动至 `legacy_scripts/` 目录，并在根目录放置 `README-MIGRATION.txt` 宣告旧版脚本已退役。

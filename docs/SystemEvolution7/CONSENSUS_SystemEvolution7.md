# Phase 7: 系统演进与隐患治理 (SystemEvolution7) - Consensus

## 1. 共识需求 (Requirements Consensus)
系统必须能够优雅、丝滑地处理因高并发与扩容带来的细支末节问题，真正迈向商用化级稳定性：
- 需求 1: 提供对新旧玩家环境（特别是数据库与包管理不匹配时）的防御性退出（Defensive Exit）。
- 需求 2: 做到百级账号热更新时的“毫秒级无感热替换”，切断大规模下发导致的时间轴卡死重构。
- 需求 3: UI 切片交互流畅度提升，使用户不感知由于 Lazy-loading (defineAsyncComponent) 引起的网络停顿。
- 需求 4: 收口系统运维文档与脚本规范，降低新手心智负担。

## 2. 验收标准 (Acceptance Criteria)
- [ ] 破坏/切断本地的 MySQL 测试，运行 `node core/client.js` 应能不抛满屏的 Promise Unhandled 错误，而是温和地红字提示“【致命启动错误】无法连接到 MySQL 数据库...”，然后安静退出进程。
- [ ] Worker 日志验证：在 Admin 修改或添加任意一个账号，Worker 端的控制台不再输出全体账号被重新拉起的日志，而是只输出 `[Cluster] Account changed: 12345, reloading...` 类似字眼。
- [ ] 前端侧边栏点击进入 “作战大屏” 的首屏空白期内，屏幕中间将出现呼吸灯/Loading转圈的平滑过渡动画。
- [ ] 根目录 `quick-start.sh`, `farm-bot.sh` 等 8 个纯裸机单机脚本被移至 `scripts/legacy_sh`，确保新入行开发者直插 `docker-compose`。

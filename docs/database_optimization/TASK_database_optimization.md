# TASK: 数据库存储与信息保存优化

## 阶段 1: 数据库迁移与结构补全 (Atomize 1)
- [x] **TASK-1.1**: 创建 SQLite 迁移脚本 `core/src/database/migrations/002-optimize_storage.sql`。
- [x] **TASK-1.2**: 新增 `daily_statistics` 表，记录日期、总收益经验、总收益金币，建立基于日期和账号ID的唯一索引。
- [x] **TASK-1.3**: 修改 `accounts` 表，追加 `status` (TINYINT/VARCHAR) 与 `api_error_count` (INTEGER DEFAULT 0)。由于 SQLite 对 ALTER TABLE 支持有限，考虑通过 ADD COLUMN 或重命名表方案实现。
- [x] **TASK-1.4**: 修改 `account_configs` 表，追加 `advanced_settings` (TEXT JSON)。

## 阶段 2: 后端日志轮转与定时结算逻辑 (Atomize 2)
- [x] **TASK-2.1**: 新增 `core/src/jobs/logCleanupJob.js`，每天定时执行一次，清理并保留最近 7 天的 `operation_logs` 和 `config_audit_log`。
- [x] **TASK-2.2**: 新增 `core/src/jobs/dailyStatsJob.js`，每日自动汇总当天的 `operation_logs` 的偷菜和收获记录，持久化保存到 `daily_statistics`。
- [x] **TASK-2.3**: 将前述两个 Job 挂载到应用启动流程（如 `core/src/jobs/index.js` 或主程序）。
- [x] **TASK-2.4**: 修改保存和获取 `account_configs` 的 API，以支持解析和合并 `advanced_settings` JSON。

## 阶段 3: 前端状态防抖与全局持久化体验 (Atomize 3)
- [x] **TASK-3.1**: 在前端页面（如 Dashboard 统计查询等），由请求全量的 operation_logs 切换至直接获取 `daily_statistics`（如需要）或保持现有但减少依赖。
- [x] **TASK-3.2**: 封装通用的 `useTablePersistence` 组合式函数或使用 `@vueuse/core` 中的 `useStorage`，记录各个表格组件的筛选条件、分页大小。
- [x] **TASK-3.3**: 在 Settings 等页面持久化常用的下拉选项和展开面板状态。

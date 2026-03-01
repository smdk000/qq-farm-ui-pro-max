# ACCEPTANCE: 数据库存储与信息保存优化

## 阶段 1: 数据库迁移与结构补全
- [ ] `002-optimize_storage.sql` 迁移脚本被成功执行，不报错，且原有数据未丢失。
- [ ] `daily_statistics` 表结构存在。
- [ ] `accounts` 表新增了 `status` 和 `api_error_count` 字段。
- [ ] `account_configs` 表新增了 `advanced_settings` 字段。

## 阶段 2: 后端日志轮转与定时结算逻辑
- [ ] 系统中能够自动注册并启动 `logCleanupJob` 定时任务。
- [ ] 系统中能够自动注册并启动 `dailyStatsJob` 定时任务。
- [ ] （可选测试）手动执行/或触发这些 Job 后，能观察到旧日志正确清理，以及最新数据汇总至 `daily_statistics`。
- [ ] 后端关于 `account_configs` 读写接口正常处理并存入 `advanced_settings` 中而无需后续再执行 `ALTER TABLE` 即可存储新的特性配置。

## 阶段 3: 前端状态防抖与全局持久化体验
- [ ] 页面表格（如日志列表、账号列表）的 `pageSize` 等参数能在刷新浏览器后自动恢复到上次设置的值。
- [ ] 配置页面切换不同选项后，刷新仍能保持用户首选状态。

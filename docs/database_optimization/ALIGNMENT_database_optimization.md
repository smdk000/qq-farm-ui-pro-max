# ALIGNMENT: 数据库存储与信息保存优化

## 1. 目标与背景
用户要求检查前后端，特别是数据库保存的信息内容部分，详细解析数据库已保存的内容、未考虑到/可优化的策略和内容，并提供详细的优化升级计划（Plan）和任务（Task）。

## 2. 现状分析 (As-Is)
经过对项目的源码分析：
- **后端持久化**：采用 `better-sqlite3`（`core/src/database/migrations/001-init.sql`），包含：
  - `users` (管理员/用户)
  - `cards` (卡密)
  - `accounts` (绑定的 QQ 账号)
  - `account_configs` (账号挂机配置策略，极其宽的表，包含 20+ 个字段)
  - `account_friend_blacklist`, `account_plant_filter`, `account_friend_steal_filter` (过滤名单)
  - `ui_settings` (UI 设置记录)
  - `operation_logs`, `config_audit_log` (操作与审计日志)
- **前端本地化**：在 `web/src/stores/app.ts` 和 `api/index.ts` 中使用了 `localStorage`：
  - `ui_theme` (主题模式)
  - `login_background` (登录背景)
  - `admin_token` (鉴权 Token)
  - `current_account_id` (当前选中的账号 ID)

## 3. 痛点与未考虑到可优化的点 (Gap Analysis)
1. **日统计与数据分析缺失**：
   - 现状：没有专门保存“每日收益、经验、金币”快照的表，完全依赖于实时累加或频繁查询日志，可能导致前端“今日数据”统计卡顿或丢失。
   - 优化：新增 `daily_statistics` 表。
2. **账号配置表（account_configs）扩展性差**：
   - 现状：配置全平铺为列，每次加一个开关（如新出的某个过滤）都要执行 ALTER TABLE 迁移。
   - 优化：将高级/零散配置整合为 JSON 类型的 `advanced_settings` 列，减少 schema 变更。
3. **日志无限膨胀问题**：
   - 现状：`operation_logs` 仅作插入，未见定期清理策略，长时间挂机会把 SQLite 撑爆。
   - 优化：引入基于策略的自动清理任务（例如只保留最近 7 天的日志）。
4. **前端状态缓存不足**：
   - 现状：前端仅存了当前账户ID和主题，页面刷新时会导致整个列表重新加载。表格的每页显示条数、列过滤等也没做本地持久化。
5. **系统监控或运行态快照缺失**：
   - 现状：未保存 Bot 运行的健康状态（如网络延迟、Cookie失效频率）。

## 4. 共识要求 (Consensus)
- 认可上述的优化方向，并同意由于 SQLite 的特性，优化应侧重于清理冗余日志和聚合冷端数据。
- 采用 6A 流程执行后续步骤。

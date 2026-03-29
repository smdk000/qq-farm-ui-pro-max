# 经营汇报状态与恢复审计

日期: 2026-03-29

范围:
- `core/src/services/report-service.js`
- `core/src/controllers/admin/settings-report-routes.js`
- `core/src/models/store.js`
- `core/src/repositories/account-repository.js`
- `core/src/services/mysql-db.js`
- `core/src/database/migrations/025-account-configs-unique.sql`

## 1. 结论摘要

本轮检查确认:

- 经营汇报主链路本身正常:
  - 配置读取正常
  - 测试发送 / 小时汇报 / 日报逻辑正常
  - 历史记录落库、导出、删除接口正常
  - SMTP 邮件模板链路正常
- 但现场数据层存在两类真实问题:
  - `account_configs` 历史上存在大量同一 `account_id` 的重复记录
  - `store.loadAllFromDB()` 在 MySQL 返回对象型 `advanced_settings` 时，账号级 `reportConfig` 会被误丢弃，导致重载后回退到默认关闭
- 以上两类问题均已修复
- 当前真实账号里，明确有经营汇报历史的账号只有:
  - `1009`
  - `1005`
- 其中:
  - `1009` 已恢复经营汇报，并完成真实测试发送验证
  - `1005` 仅有一次早期 webhook 失败记录，当前没有可安全复用的目标配置，未自动恢复

## 2. 现场发现

### 2.1 配置表重复写入风险

检查 `account_configs` 时发现:

- 同一账号存在大量重复配置行
- `account_id` 只有普通索引，没有唯一索引
- 代码里多处依赖 `INSERT ... ON DUPLICATE KEY UPDATE`，但在没有唯一键的情况下，这个 upsert 语义并不会真正生效

这会带来以下风险:

- 账号列表查询被重复配置污染
- 读取到旧配置或不确定配置
- 经营汇报、账号模式、时间参数等账号级设置出现“看起来保存了，但重启后状态不一致”

### 2.2 MySQL JSON 返回兼容问题

在当前现场环境中，`account_configs.advanced_settings` 由驱动直接返回对象，而不是 JSON 字符串。

原实现只处理:

- `typeof r.advanced_settings === 'string'`

导致:

- `adv` 为空对象
- `adv.reportConfig` 丢失
- `store.getReportConfig(accountId)` 重载后回退为默认值:
  - `enabled: false`
  - `channel: webhook`
  - SMTP 相关字段为空

这也是为什么现场会出现:

- 数据库里某次手工恢复后的 `reportConfig` 看起来已写入
- 但全新进程重载后又掉回默认关闭

## 3. 已实施修复

### 3.1 数据库去重与唯一化

新增迁移:

- [025-account-configs-unique.sql](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/database/migrations/025-account-configs-unique.sql)

内容:

- 删除同一 `account_id` 的历史重复记录，只保留最新一条
- 为 `account_configs(account_id)` 添加唯一索引 `uniq_account_configs_account_id`

启动迁移检查已接入:

- [mysql-db.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/services/mysql-db.js)

现场执行结果:

- 重复账号配置数已清零
- 唯一索引已存在

### 3.2 读取路径收口为“每账号最新一条配置”

已调整:

- [account-repository.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/repositories/account-repository.js)
- [store.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/models/store.js)

处理方式:

- 查询账号配置时优先只取每个账号最新一条配置
- `getConfig(accountId)` 读取时按 `updated_at DESC, id DESC LIMIT 1`

这样即便线上暂时仍有历史脏数据残留，读取结果也更稳定。

### 3.3 修复 MySQL 对象型 `advanced_settings` 兼容

已调整:

- [store.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/models/store.js)

修复后逻辑:

- 如果 `advanced_settings` 已经是对象，直接浅拷贝使用
- 如果是字符串，再做 `JSON.parse`

修复目标:

- 避免账号级 `reportConfig` 在重载时被误丢弃

## 4. 账号审计结果

### 4.1 账号 `1009`

账号名:

- `尤隔情窗唤梦回`

历史经营汇报情况:

- 历史总记录数: `18`
- 成功: `13`
- 失败: `5`
- 历史渠道: `email`

本轮处理:

- 结合历史经营汇报记录与现有 BUG 邮件 SMTP 配置，恢复 `1009` 的邮件经营汇报
- 当前生效配置:
  - `enabled: true`
  - `channel: email`
  - `smtpHost: smtp.qq.com`
  - `smtpUser: 278050013@qq.com`
  - `emailFrom: 278050013@qq.com`
  - `emailTo: 278050013@qq.com`
  - `dailyEnabled: true`
  - `dailyHour: 21`
  - `dailyMinute: 0`
  - `hourlyEnabled: false`

真实验证:

- 已执行真实测试发送
- SMTP 返回: `250 OK: queued as.`
- 最新历史记录:
  - `mode: test`
  - `ok: 1`
  - `channel: email`
  - `createdAt: 2026-03-29 13:11:20`

结论:

- `1009` 的经营汇报目前已恢复正常

### 4.2 账号 `1005`

历史经营汇报情况:

- 历史总记录数: `1`
- 成功: `0`
- 失败: `1`
- 历史渠道: `webhook`
- 历史标题: `历史记录验证 · 经营汇报测试 · 3400470486`
- 历史错误: `connect ECONNREFUSED 127.0.0.1:9`

当前配置:

- `enabled: false`
- `channel: webhook`
- `endpoint: ''`

补充排查:

- 已复查 `account_configs`
- 已复查 [core/data/store.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/data/store.json)
- 已复查 `data/store.json`
- 已复查 `data/backup/store.json.*`
- 未找到可复用的 webhook `endpoint` / `token`

结论:

- 当前没有足够证据安全恢复
- 不建议根据一条失败 webhook 历史强行启用
- 当前更接近“早期本地验证残留”，不是一个具备完整恢复条件的正式经营汇报账号

## 5. 回归验证

已执行的验证包括:

- `node --check core/src/services/mysql-db.js`
- `node --check core/src/repositories/account-repository.js`
- `node --check core/src/models/store.js`
- `node --test --test-reporter spec core/__tests__/admin-settings-report-routes.test.js core/__tests__/report-email-payload.test.js core/__tests__/report-service-delivery-failure.test.js core/__tests__/report-service-restart-broadcast.test.js core/__tests__/store-account-settings-persistence.test.js core/__tests__/store-system-settings.test.js core/__tests__/data-provider-save-settings.test.js core/__tests__/admin-account-settings-routes.test.js`
- `node --test --test-reporter spec core/__tests__/store-account-settings-persistence.test.js core/__tests__/store-system-settings.test.js`

本轮新增回归覆盖:

- `loadAllFromDB keeps account reportConfig when mysql returns advanced_settings as object`

验证结论:

- 相关测试通过
- 真实邮件发送通过
- 全新进程重载后，`1009.reportConfig` 仍保持启用态

## 6. 当前最终状态

截至 2026-03-29，本地现场的经营汇报状态如下:

- `1009`: 已启用，邮件日报正常，已真实发送验证通过
- `1005`: 未启用，无安全可复用目标配置，不自动恢复
- 其他账号: 未发现真实经营汇报历史，不做擅自开启

## 7. 后续建议

建议后续继续保持以下原则:

- 若账号历史上没有明确经营汇报成功记录，不要批量自动启用
- 若要恢复其他账号，优先满足以下至少一项:
  - 历史成功记录可证明渠道与目标
  - 当前设置页里已有人为确认的完整配置
  - 有可审计的备份文件可恢复
- 后续如果再次出现“设置已保存但重启后失效”，优先检查:
  - `account_configs` 是否有重复行
  - `advanced_settings` 当前驱动返回类型
  - `core/data/store.json`
  - `system_settings.global_config`

## 8. 相邻链路复查: 下线提醒

本轮按与经营汇报相同的思路，对“下线提醒”链路做了相邻复查。

结论:

- 当前未发现与经营汇报同类的持久化隐患

原因:

- 下线提醒走的是全局配置链路
- 实际持久化位置为:
  - `system_settings.global_config.offlineReminder`
  - `core/data/store.json` fallback
- 它不依赖 `account_configs`
- 因此不会受到本轮 `account_configs` 重复写入问题影响

补充验证:

- 已新增回归测试:
  - `offline reminder persists to system_settings and reloads without store.json fallback`
- 验证内容包括:
  - 保存下线提醒
  - 落库到 `system_settings.global_config`
  - 同步写入 `core/data/store.json`
  - 删除 fallback 文件后重新初始化
  - 仍能从 MySQL 正常恢复

结论补充:

- 经营汇报和下线提醒虽然在设置页相邻显示，但底层持久化路径不同
- 本轮需要修的是经营汇报账号级配置链
- 下线提醒当前无需额外修复

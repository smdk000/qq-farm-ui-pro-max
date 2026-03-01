-- 数据库优化与扩展脚本
-- 版本：v2
-- 日期：2026-02-28

-- 1. 每日统计表 (daily_statistics)
CREATE TABLE IF NOT EXISTS daily_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    total_exp INTEGER DEFAULT 0, -- 获得的经验
    total_gold INTEGER DEFAULT 0, -- 获得的金币
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
    UNIQUE (account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_account_date ON daily_statistics (account_id, date);

-- 2. 账号表新增字段: status, api_error_count
-- 由于 SQLite 的 ALTER TABLE 限制，我们需要安全地添加列。如果在之前版本尚未添加过，这里会生效。
ALTER TABLE accounts ADD COLUMN status TEXT DEFAULT 'valid';

ALTER TABLE accounts ADD COLUMN api_error_count INTEGER DEFAULT 0;

-- 3. 账号配置表新增字段: advanced_settings
ALTER TABLE account_configs
ADD COLUMN advanced_settings TEXT DEFAULT '{}';
-- QQ 农场机器人数据库初始化脚本
-- 版本：v1.0
-- 日期：2026-02-28

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',  -- 'admin' | 'user'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 卡密表
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,  -- D|W|M|F
  description TEXT,
  used_by INTEGER,     -- users.id
  enabled BOOLEAN DEFAULT true,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (used_by) REFERENCES users(id)
);

-- 账号表
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uin TEXT UNIQUE NOT NULL,  -- QQ 号
  nick TEXT,
  name TEXT,  -- 备注名
  platform TEXT DEFAULT 'qq',  -- qq|wx
  running BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 账号配置表（核心！解决设置丢失问题）
CREATE TABLE IF NOT EXISTS account_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  
  -- 自动化开关
  automation_farm BOOLEAN DEFAULT true,
  automation_farm_push BOOLEAN DEFAULT true,
  automation_land_upgrade BOOLEAN DEFAULT true,
  automation_friend BOOLEAN DEFAULT true,
  automation_friend_help_exp_limit BOOLEAN DEFAULT true,
  automation_friend_steal BOOLEAN DEFAULT true,
  automation_friend_help BOOLEAN DEFAULT true,
  automation_friend_bad BOOLEAN DEFAULT false,
  automation_task BOOLEAN DEFAULT true,
  automation_email BOOLEAN DEFAULT true,
  automation_fertilizer_gift BOOLEAN DEFAULT false,
  automation_fertilizer_buy BOOLEAN DEFAULT false,
  automation_free_gifts BOOLEAN DEFAULT true,
  automation_share_reward BOOLEAN DEFAULT true,
  automation_vip_gift BOOLEAN DEFAULT true,
  automation_month_card BOOLEAN DEFAULT true,
  automation_open_server_gift BOOLEAN DEFAULT true,
  automation_sell BOOLEAN DEFAULT true,
  automation_fertilizer TEXT DEFAULT 'none',
  
  -- 种植策略
  planting_strategy TEXT DEFAULT 'preferred',
  preferred_seed_id INTEGER DEFAULT 0,
  
  -- 时间间隔
  interval_farm INTEGER DEFAULT 2,
  interval_friend INTEGER DEFAULT 10,
  interval_farm_min INTEGER DEFAULT 2,
  interval_farm_max INTEGER DEFAULT 2,
  interval_friend_min INTEGER DEFAULT 10,
  interval_friend_max INTEGER DEFAULT 10,
  
  -- 好友静默时段
  friend_quiet_hours_enabled BOOLEAN DEFAULT false,
  friend_quiet_hours_start TEXT DEFAULT '23:00',
  friend_quiet_hours_end TEXT DEFAULT '07:00',
  
  -- 偷菜过滤
  steal_filter_enabled BOOLEAN DEFAULT false,
  steal_filter_mode TEXT DEFAULT 'blacklist',  -- 'blacklist' | 'whitelist'
  
  -- 偷好友过滤
  steal_friend_filter_enabled BOOLEAN DEFAULT false,
  steal_friend_filter_mode TEXT DEFAULT 'blacklist',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 好友黑名单表
CREATE TABLE IF NOT EXISTS account_friend_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  friend_id TEXT NOT NULL,
  friend_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, friend_id)
);

-- 偷菜植物过滤表
CREATE TABLE IF NOT EXISTS account_plant_filter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  plant_id INTEGER NOT NULL,
  plant_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, plant_id)
);

-- 偷好友过滤表
CREATE TABLE IF NOT EXISTS account_friend_steal_filter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  friend_id TEXT NOT NULL,
  friend_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, friend_id)
);

-- UI 设置表
CREATE TABLE IF NOT EXISTS ui_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  theme TEXT DEFAULT 'dark',  -- 'light' | 'dark' | 'auto'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 操作日志表（可选，用于分析）
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  action TEXT NOT NULL,
  result TEXT,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 配置变更审计日志
CREATE TABLE IF NOT EXISTS config_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  old_config JSON,
  new_config JSON,
  changed_by TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_accounts_uin ON accounts(uin);
CREATE INDEX IF NOT EXISTS idx_account_configs_account_id ON account_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_cards_code ON cards(code);
CREATE INDEX IF NOT EXISTS idx_operation_logs_account_id ON operation_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_friend_blacklist_account_id ON account_friend_blacklist(account_id);
CREATE INDEX IF NOT EXISTS idx_plant_filter_account_id ON account_plant_filter(account_id);
CREATE INDEX IF NOT EXISTS idx_friend_steal_filter_account_id ON account_friend_steal_filter(account_id);

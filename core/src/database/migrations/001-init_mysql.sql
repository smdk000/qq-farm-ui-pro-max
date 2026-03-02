-- 农场监控系统 MySQL 初始化脚本 (Phase 1)
-- 包含日常统计报表与 JSON 设置支持的大宽表优化

SET NAMES utf8mb4;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(100) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50) DEFAULT 'user',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 2. 卡密表
CREATE TABLE IF NOT EXISTS `cards` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(100) NOT NULL UNIQUE,
    `type` VARCHAR(20) NOT NULL,
    `description` TEXT,
    `used_by` INT NULL,
    `enabled` TINYINT(1) DEFAULT 1,
    `expires_at` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`used_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 3. 游戏账号挂载表
CREATE TABLE IF NOT EXISTS `accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `uin` VARCHAR(50) NOT NULL UNIQUE,
  `nick` VARCHAR(100),
  `name` VARCHAR(100),
  `platform` VARCHAR(20) DEFAULT 'qq',
  `running` TINYINT(1) DEFAULT 0,

-- 新阶段追加: 账号失效状态与容错审计

`status` VARCHAR(50) DEFAULT 'valid',
  `api_error_count` INT DEFAULT 0,
  
  `auth_data` JSON NULL,
  `username` VARCHAR(100),
  
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 账号自动化配置表 (携带 JSON 载体)
CREATE TABLE IF NOT EXISTS `account_configs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `account_id` INT NOT NULL,

-- 自动化旧有 Boolean 群
`automation_farm` TINYINT(1) DEFAULT 1,
`automation_farm_push` TINYINT(1) DEFAULT 1,
`automation_land_upgrade` TINYINT(1) DEFAULT 1,
`automation_friend` TINYINT(1) DEFAULT 1,
`automation_friend_help_exp_limit` TINYINT(1) DEFAULT 1,
`automation_friend_steal` TINYINT(1) DEFAULT 1,
`automation_friend_help` TINYINT(1) DEFAULT 1,
`automation_friend_bad` TINYINT(1) DEFAULT 0,
`automation_task` TINYINT(1) DEFAULT 1,
`automation_email` TINYINT(1) DEFAULT 1,
`automation_fertilizer_gift` TINYINT(1) DEFAULT 0,
`automation_fertilizer_buy` TINYINT(1) DEFAULT 0,
`automation_free_gifts` TINYINT(1) DEFAULT 1,
`automation_share_reward` TINYINT(1) DEFAULT 1,
`automation_vip_gift` TINYINT(1) DEFAULT 1,
`automation_month_card` TINYINT(1) DEFAULT 1,
`automation_open_server_gift` TINYINT(1) DEFAULT 1,
`automation_sell` TINYINT(1) DEFAULT 1,
`automation_fertilizer` VARCHAR(50) DEFAULT 'none',
`planting_strategy` VARCHAR(50) DEFAULT 'preferred',
`preferred_seed_id` INT DEFAULT 0,
`interval_farm` INT DEFAULT 2,
`interval_friend` INT DEFAULT 10,
`interval_farm_min` INT DEFAULT 2,
`interval_farm_max` INT DEFAULT 2,
`interval_friend_min` INT DEFAULT 10,
`interval_friend_max` INT DEFAULT 10,
`friend_quiet_hours_enabled` TINYINT(1) DEFAULT 0,
`friend_quiet_hours_start` VARCHAR(20) DEFAULT '23:00',
`friend_quiet_hours_end` VARCHAR(20) DEFAULT '07:00',
`steal_filter_enabled` TINYINT(1) DEFAULT 0,
`steal_filter_mode` VARCHAR(20) DEFAULT 'blacklist',
`steal_friend_filter_enabled` TINYINT(1) DEFAULT 0,
`steal_friend_filter_mode` VARCHAR(20) DEFAULT 'blacklist',

-- 新增: 将复杂设置(如蹲守策略 stakeoutSteal) 放进 JSON 字段, 避免再改 Schema

`advanced_settings` JSON NULL,

  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 好友黑名单
CREATE TABLE IF NOT EXISTS `account_friend_blacklist` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `friend_id` VARCHAR(100) NOT NULL,
    `friend_name` VARCHAR(255),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `idx_account_friend` (`account_id`, `friend_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 6. 植物过滤表
CREATE TABLE IF NOT EXISTS `account_plant_filter` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `plant_id` INT NOT NULL,
    `plant_name` VARCHAR(255),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `idx_account_plant` (`account_id`, `plant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 7. 偷好友过滤表
CREATE TABLE IF NOT EXISTS `account_friend_steal_filter` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `friend_id` VARCHAR(100) NOT NULL,
    `friend_name` VARCHAR(255),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `idx_acc_friend_sf` (`account_id`, `friend_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 8. UI 环境与用户主题绑定
CREATE TABLE IF NOT EXISTS `ui_settings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `theme` VARCHAR(50) DEFAULT 'dark',
    `performance_mode` TINYINT(1) DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 9. 日志总流水 (后续依赖 LogCleaner Job 按 7 天滚动截断)
CREATE TABLE IF NOT EXISTS `operation_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `result` VARCHAR(50),
    `details` JSON,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_acc_created` (`account_id`, `created_at`),
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 10. 配置更迭审计表 (保留7天)
CREATE TABLE IF NOT EXISTS `config_audit_log` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `old_config` JSON,
    `new_config` JSON,
    `changed_by` VARCHAR(100),
    `changed_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_acc_changed` (`account_id`, `changed_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 11. [新] 每日统计快照 (取代以前从海量operation_logs聚合)
CREATE TABLE IF NOT EXISTS `daily_statistics` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `stat_date` DATE NOT NULL,
    `exp_earned` INT DEFAULT 0,
    `gold_earned` INT DEFAULT 0,
    `steal_count` INT DEFAULT 0,
    `help_count` INT DEFAULT 0,
    `plant_count` INT DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_daily_acc_date` (`account_id`, `stat_date`),
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
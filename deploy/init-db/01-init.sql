/*
QQ 农场助手 - 数据库自动初始化脚本
MySQL 首次启动时自动执行（docker-entrypoint-initdb.d）

注意：此脚本仅在数据卷为空时执行一次，后续重启不会重复执行
*/

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 用户表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` int NOT NULL AUTO_INCREMENT,
    `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    `role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'user',
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `username` (`username`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 账号表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `accounts` (
    `id` int NOT NULL AUTO_INCREMENT,
    `uin` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
    `nick` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `platform` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'qq',
    `running` tinyint(1) DEFAULT '0',
    `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'valid',
    `api_error_count` int DEFAULT '0',
    `auth_data` json DEFAULT NULL,
    `username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `avatar` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uin` (`uin`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 账号配置表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `account_configs` (
    `id` int NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `account_mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'main',
    `harvest_delay_min` int DEFAULT 180,
    `harvest_delay_max` int DEFAULT 300,
    `automation_farm` tinyint(1) DEFAULT '1',
    `automation_farm_push` tinyint(1) DEFAULT '1',
    `automation_land_upgrade` tinyint(1) DEFAULT '1',
    `automation_friend` tinyint(1) DEFAULT '1',
    `automation_friend_help_exp_limit` tinyint(1) DEFAULT '1',
    `automation_friend_steal` tinyint(1) DEFAULT '1',
    `automation_friend_help` tinyint(1) DEFAULT '1',
    `automation_friend_bad` tinyint(1) DEFAULT '0',
    `automation_task` tinyint(1) DEFAULT '1',
    `automation_email` tinyint(1) DEFAULT '1',
    `automation_fertilizer_gift` tinyint(1) DEFAULT '0',
    `automation_fertilizer_buy` tinyint(1) DEFAULT '0',
    `automation_free_gifts` tinyint(1) DEFAULT '1',
    `automation_share_reward` tinyint(1) DEFAULT '1',
    `automation_vip_gift` tinyint(1) DEFAULT '1',
    `automation_month_card` tinyint(1) DEFAULT '1',
    `automation_open_server_gift` tinyint(1) DEFAULT '1',
    `automation_sell` tinyint(1) DEFAULT '1',
    `automation_fertilizer` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'none',
    `planting_strategy` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'preferred',
    `preferred_seed_id` int DEFAULT '0',
    `interval_farm` int DEFAULT '30',
    `interval_friend` int DEFAULT '60',
    `interval_farm_min` int DEFAULT '30',
    `interval_farm_max` int DEFAULT '120',
    `interval_friend_min` int DEFAULT '60',
    `interval_friend_max` int DEFAULT '180',
    `friend_quiet_hours_enabled` tinyint(1) DEFAULT '0',
    `friend_quiet_hours_start` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '23:00',
    `friend_quiet_hours_end` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '07:00',
    `steal_filter_enabled` tinyint(1) DEFAULT '0',
    `steal_filter_mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'blacklist',
    `steal_friend_filter_enabled` tinyint(1) DEFAULT '0',
    `steal_friend_filter_mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'blacklist',
    `advanced_settings` json DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `account_id` (`account_id`),
    CONSTRAINT `account_configs_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 好友黑名单表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `account_friend_blacklist` (
    `id` int NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `friend_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `friend_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_account_friend` (`account_id`, `friend_id`),
    CONSTRAINT `account_friend_blacklist_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 偷取好友过滤表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `account_friend_steal_filter` (
    `id` int NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `friend_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `friend_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_acc_friend_sf` (`account_id`, `friend_id`),
    CONSTRAINT `account_friend_steal_filter_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 植物过滤表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `account_plant_filter` (
    `id` int NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `plant_id` int NOT NULL,
    `plant_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_account_plant` (`account_id`, `plant_id`),
    CONSTRAINT `account_plant_filter_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 卡密表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `cards` (
    `id` int NOT NULL AUTO_INCREMENT,
    `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    `description` text COLLATE utf8mb4_unicode_ci,
    `used_by` int DEFAULT NULL,
    `enabled` tinyint(1) DEFAULT '1',
    `expires_at` datetime DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `code` (`code`),
    KEY `used_by` (`used_by`),
    CONSTRAINT `cards_ibfk_1` FOREIGN KEY (`used_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 配置审计日志表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `config_audit_log` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `old_config` json DEFAULT NULL,
    `new_config` json DEFAULT NULL,
    `changed_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `changed_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_acc_changed` (`account_id`, `changed_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 每日统计表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `daily_statistics` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `stat_date` date NOT NULL,
    `exp_earned` int DEFAULT '0',
    `gold_earned` int DEFAULT '0',
    `steal_count` int DEFAULT '0',
    `help_count` int DEFAULT '0',
    `plant_count` int DEFAULT '0',
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_daily_acc_date` (`account_id`, `stat_date`),
    CONSTRAINT `daily_statistics_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 操作日志表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `operation_logs` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `account_id` int NOT NULL,
    `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
    `result` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    `details` json DEFAULT NULL,
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_acc_created` (`account_id`, `created_at`),
    CONSTRAINT `operation_logs_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- UI 设置表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ui_settings` (
    `id` int NOT NULL AUTO_INCREMENT,
    `user_id` int NOT NULL,
    `theme` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'dark',
    `performance_mode` tinyint(1) DEFAULT '0',
    `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `user_id` (`user_id`),
    CONSTRAINT `ui_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 系统日志表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `system_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `account_id` VARCHAR(50) NOT NULL COMMENT '账号ID',
    `level` VARCHAR(20) NOT NULL DEFAULT 'info' COMMENT '日志级别',
    `category` VARCHAR(50) NOT NULL COMMENT '日志分类',
    `text` TEXT NOT NULL COMMENT '日志内容',
    `meta_data` JSON DEFAULT NULL COMMENT '额外数据',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
    INDEX `idx_account_level` (`account_id`, `level`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '系统全局执行日志表';

-- ----------------------------
-- 公告表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `announcements` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL DEFAULT '',
    `version` VARCHAR(50) DEFAULT '',
    `publish_date` VARCHAR(50) DEFAULT '',
    `content` TEXT NOT NULL,
    `enabled` TINYINT(1) DEFAULT 1,
    `created_by` VARCHAR(100) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------
-- 每日收益统计表（全局聚合）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `stats_daily` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `record_date` DATE NOT NULL,
    `total_exp` INT DEFAULT 0,
    `total_gold` INT DEFAULT 0,
    `total_steal` INT DEFAULT 0,
    `total_help` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_date` (`record_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
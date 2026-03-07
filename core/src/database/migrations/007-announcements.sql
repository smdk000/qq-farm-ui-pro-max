-- 公告表：支持管理员动态发布系统公告
SET NAMES utf8mb4;

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
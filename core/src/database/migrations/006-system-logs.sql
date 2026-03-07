-- Phase 2 系统演进：补足前端剔除历史日志后的后端归档查询能力
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
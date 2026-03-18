const { loadProjectEnv } = require('../config/load-env');
const mysql = require('mysql2/promise');
const { createModuleLogger } = require('./logger');

loadProjectEnv();

const logger = createModuleLogger('mysql-db');

// 从环境变量读取配置，兼容 docker-compose 和本地开发
const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_PORT = Number.parseInt(process.env.MYSQL_PORT || '4409', 10);
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || '123456';
const DB_NAME = process.env.MYSQL_DATABASE || 'qq_farm_bot';
const DB_LIMIT = Number.parseInt(process.env.MYSQL_POOL_LIMIT || '100', 10);

if (!/^\w+$/.test(DB_NAME)) {
    throw new Error(`Invalid MYSQL_DATABASE: "${DB_NAME}". Only alphanumeric and underscore allowed.`);
}

// MySQL 连接池配置 — Phase 2 扩容
// connectionLimit: 100 可支撑数百账号的 Worker 并发 + UI 面板查询
let poolInstance = null;

function createMainPool() {
    return mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: DB_LIMIT,
        queueLimit: DB_LIMIT * 2, // 排队上限为连接池的2倍，超额直接抛出快速失败
        connectTimeout: 10000,    // 连接建立超时 10 秒，避免网络异常时长时间阻塞
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        // 空闲连接超时回收（毫秒），避免连接囤积占用 MySQL 资源
        idleTimeout: 60000,
        // 最大空闲连接数，超出的空闲连接会被回收
        maxIdle: 20,
    });
}

function getOrCreatePool() {
    if (!poolInstance) {
        poolInstance = createMainPool();
    }
    return poolInstance;
}

const pool = new Proxy({}, {
    get(_target, property) {
        return getOrCreatePool()[property];
    },
});

let _initialized = false;

/**
 * 获取连接池实时状态快照（用于监控和告警）。
 * @returns {{ activeConnections: number, idleConnections: number, waitingQueue: number, connectionLimit: number }} 连接池状态快照。
 */
function getPoolStatus() {
    try {
        const p = pool.pool; // mysql2 内部 pool 对象
        return {
            activeConnections: p._allConnections ? p._allConnections.length : 0,
            idleConnections: p._freeConnections ? p._freeConnections.length : 0,
            waitingQueue: p._connectionQueue ? p._connectionQueue.length : 0,
            connectionLimit: DB_LIMIT,
        };
    } catch {
        return { activeConnections: -1, idleConnections: -1, waitingQueue: -1, connectionLimit: DB_LIMIT };
    }
}

let poolMonitorHandle = null;

function startPoolMonitor() {
    if (poolMonitorHandle) {
        return poolMonitorHandle;
    }

    poolMonitorHandle = setInterval(() => {
        try {
            const status = getPoolStatus();
            if (status.activeConnections < 0) return;
            const usagePercent = (status.activeConnections / status.connectionLimit) * 100;
            if (usagePercent > 80) {
                logger.warn(`⚠️ 连接池使用率过高: ${usagePercent.toFixed(1)}% (活跃=${status.activeConnections}, 空闲=${status.idleConnections}, 排队=${status.waitingQueue}, 上限=${status.connectionLimit})`);
            }
        } catch {
            // 监控本身不应影响业务
        }
    }, 30000);
    if (poolMonitorHandle && typeof poolMonitorHandle.unref === 'function') {
        poolMonitorHandle.unref();
    }
    return poolMonitorHandle;
}

function stopPoolMonitor() {
    if (!poolMonitorHandle) {
        return;
    }
    clearInterval(poolMonitorHandle);
    poolMonitorHandle = null;
}

async function runMigrationFile(sqlPath, description) {
    const fs = require('node:fs');
    if (!fs.existsSync(sqlPath)) {
        logger.error(`❌ 缺失迁移脚本: ${sqlPath}`);
        return;
    }
    logger.info(`${description}...`);
    const conn = await mysql.createConnection({
        host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS,
        database: DB_NAME, multipleStatements: true,
    });
    try {
        await conn.query(fs.readFileSync(sqlPath, 'utf8'));
        logger.info(`✅ ${description} — 完成`);
    } finally {
        await conn.end();
    }
}

async function initMysql() {
    try {
        const tempPool = mysql.createPool({
            host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS,
        });
        await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await tempPool.end();

        const path = require('node:path');
        const migrationsDir = path.join(__dirname, '../database/migrations');

        const [rows] = await pool.execute(`SHOW TABLES LIKE 'accounts'`);
        if (rows.length === 0) {
            await runMigrationFile(
                path.join(migrationsDir, '001-init_mysql.sql'),
                '检测到空载数据库，正在自动执行建表初始化',
            );
        } else {
            const [cols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'avatar'`,
                [DB_NAME]
            );
            if (cols.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '005-add-avatar.sql'),
                    '检测到 accounts 表缺少 avatar 列，正在执行迁移 005-add-avatar.sql',
                );
            }

            const [codeCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'code'`,
                [DB_NAME]
            );
            if (codeCols.length === 0) {
                logger.info('检测到 accounts 表缺少 code 列，正在添加...');
                await pool.query(`ALTER TABLE accounts ADD COLUMN code VARCHAR(512) DEFAULT '' AFTER uin`);
                logger.info('✅ accounts.code 列添加完成');
            }

            const [lastLoginCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'last_login_at'`,
                [DB_NAME]
            );
            if (lastLoginCols.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '013-account-last-login.sql'),
                    '检测到 accounts 表缺少 last_login_at 列，正在执行迁移 013-account-last-login.sql',
                );
            }

            const [usedAtCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'used_at'`,
                [DB_NAME]
            );
            if (usedAtCols.length === 0) {
                logger.info('检测到 cards 表缺少 used_at 列，正在添加...');
                await pool.query(`ALTER TABLE cards ADD COLUMN used_at DATETIME NULL AFTER used_by`);
                logger.info('✅ cards.used_at 列添加完成');
            }

            const [cardDaysCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'days'`,
                [DB_NAME]
            );
            if (cardDaysCols.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '010-card-days.sql'),
                    '检测到 cards 表缺少 days 列，正在执行迁移 010-card-days.sql',
                );
            }

            const [cardLogTable] = await pool.execute(`SHOW TABLES LIKE 'card_operation_logs'`);
            if (cardLogTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '012-card-management.sql'),
                    '检测到缺少 card_operation_logs 表，正在执行迁移 012-card-management.sql',
                );
            }

            const [adminOperationLogTable] = await pool.execute(`SHOW TABLES LIKE 'admin_operation_logs'`);
            if (adminOperationLogTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '014-admin-operation-logs.sql'),
                    '检测到缺少 admin_operation_logs 表，正在执行迁移 014-admin-operation-logs.sql',
                );
            }

            const cardColumnEnsures = [
                ['batch_no', "ALTER TABLE cards ADD COLUMN batch_no VARCHAR(64) DEFAULT NULL AFTER code", 'cards.batch_no'],
                ['batch_name', "ALTER TABLE cards ADD COLUMN batch_name VARCHAR(100) DEFAULT NULL AFTER batch_no", 'cards.batch_name'],
                ['source', "ALTER TABLE cards ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual' AFTER days", 'cards.source'],
                ['channel', "ALTER TABLE cards ADD COLUMN channel VARCHAR(64) DEFAULT '' AFTER source", 'cards.channel'],
                ['note', "ALTER TABLE cards ADD COLUMN note TEXT DEFAULT NULL AFTER channel", 'cards.note'],
                ['created_by', "ALTER TABLE cards ADD COLUMN created_by VARCHAR(100) DEFAULT NULL AFTER note", 'cards.created_by'],
                ['updated_at', "ALTER TABLE cards ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at", 'cards.updated_at'],
            ];
            for (const [columnName, alterSql, label] of cardColumnEnsures) {
                const [columnRows] = await pool.execute(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards' AND COLUMN_NAME = ?`,
                    [DB_NAME, columnName]
                );
                if (columnRows.length === 0) {
                    logger.info(`检测到缺少 ${label}，正在添加...`);
                    await pool.query(alterSql);
                    logger.info(`✅ ${label} 添加完成`);
                }
            }

            const cardIndexEnsures = [
                ['idx_cards_batch_no', 'ALTER TABLE cards ADD INDEX idx_cards_batch_no (batch_no)'],
                ['idx_cards_source_enabled', 'ALTER TABLE cards ADD INDEX idx_cards_source_enabled (source, enabled)'],
                ['idx_cards_created_by', 'ALTER TABLE cards ADD INDEX idx_cards_created_by (created_by)'],
            ];
            for (const [indexName, alterSql] of cardIndexEnsures) {
                const [indexRows] = await pool.execute(
                    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards' AND INDEX_NAME = ?`,
                    [DB_NAME, indexName]
                );
                if (indexRows.length === 0) {
                    logger.info(`检测到 cards 表缺少索引 ${indexName}，正在添加...`);
                    await pool.query(alterSql);
                    logger.info(`✅ cards.${indexName} 添加完成`);
                }
            }

            const [modeCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'account_configs' AND COLUMN_NAME = 'account_mode'`,
                [DB_NAME]
            );
            if (modeCols.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '002-account-mode.sql'),
                    '检测到 account_configs 表缺少 account_mode 列，正在执行迁移 002-account-mode.sql',
                );
            }

            const [logsTable] = await pool.execute(`SHOW TABLES LIKE 'system_logs'`);
            if (logsTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '006-system-logs.sql'),
                    '检测到缺少 system_logs 表，正在执行迁移 006-system-logs.sql',
                );
            }

            const [annTable] = await pool.execute(`SHOW TABLES LIKE 'announcements'`);
            if (annTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '007-announcements.sql'),
                    '检测到缺少 announcements 表，正在执行迁移 007-announcements.sql',
                );
            } else {
                const [verCols] = await pool.execute(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'announcements' AND COLUMN_NAME = 'version'`,
                    [DB_NAME]
                );
                if (verCols.length === 0) {
                    logger.info('检测到 announcements 表缺少 version 和 publish_date 列，正在添加...');
                    await pool.query(`ALTER TABLE announcements ADD COLUMN version VARCHAR(50) DEFAULT '' AFTER title, ADD COLUMN publish_date VARCHAR(50) DEFAULT '' AFTER version`);
                    logger.info('✅ announcements.version 列添加完成');
                }
            }

            const [rtTable] = await pool.execute(`SHOW TABLES LIKE 'refresh_tokens'`);
            if (rtTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '008-refresh-tokens.sql'),
                    '检测到缺少 refresh_tokens 表，正在执行迁移 008-refresh-tokens.sql',
                );
            }

            const [userStatusCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'`,
                [DB_NAME]
            );
            if (userStatusCols.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '009-user-status.sql'),
                    '检测到 users 表缺少 status 列，正在执行迁移 009-user-status.sql',
                );
            }

            const [fkRows] = await pool.execute(
                `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND CONSTRAINT_NAME = 'fk_accounts_username'`,
                [DB_NAME]
            );
            if (fkRows.length === 0) {
                logger.info('检测到 accounts 表缺少 username 外键约束，正在添加...');
                try {
                    await pool.query(`
                        UPDATE accounts
                        SET username = NULL
                        WHERE username IS NOT NULL
                          AND (TRIM(username) = '' OR username NOT IN (SELECT username FROM users))
                    `);
                    await pool.query(`ALTER TABLE accounts ADD CONSTRAINT fk_accounts_username FOREIGN KEY (username) REFERENCES users(username) ON DELETE SET NULL ON UPDATE CASCADE`);
                    logger.info('✅ accounts.username 外键约束添加完成');
                } catch (fkErr) {
                    logger.warn('添加 accounts.username 外键约束失败(可忽略):', fkErr.message);
                }
            }

            const [statsTable] = await pool.execute(`SHOW TABLES LIKE 'stats_daily'`);
            if (statsTable.length === 0) {
                logger.info('检测到缺少 stats_daily 表，正在自动创建...');
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS stats_daily (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        record_date DATE NOT NULL,
                        total_exp INT DEFAULT 0,
                        total_gold INT DEFAULT 0,
                        total_steal INT DEFAULT 0,
                        total_help INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY \`uk_date\` (\`record_date\`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
                logger.info('✅ stats_daily 收益表创建完成');
            }

            const [reportLogsTable] = await pool.execute(`SHOW TABLES LIKE 'report_logs'`);
            if (reportLogsTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '011-report-logs.sql'),
                    '检测到缺少 report_logs 表，正在执行迁移 011-report-logs.sql',
                );
            }

            const [bugReportsTable] = await pool.execute(`SHOW TABLES LIKE 'bug_reports'`);
            if (bugReportsTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '018-bug-reports.sql'),
                    '检测到缺少 bug_reports 表，正在执行迁移 018-bug-reports.sql',
                );
            }

            const [systemSettingsTable] = await pool.execute(`SHOW TABLES LIKE 'system_settings'`);
            if (systemSettingsTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '014-system-settings.sql'),
                    '检测到缺少 system_settings 表，正在执行迁移 014-system-settings.sql',
                );
            }

            const [userPreferencesTable] = await pool.execute(`SHOW TABLES LIKE 'user_preferences'`);
            if (userPreferencesTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '015-user-preferences.sql'),
                    '检测到缺少 user_preferences 表，正在执行迁移 015-user-preferences.sql',
                );
            }
            const [confirmedUserPreferencesTable] = userPreferencesTable.length > 0
                ? [userPreferencesTable]
                : await pool.execute(`SHOW TABLES LIKE 'user_preferences'`);
            if (confirmedUserPreferencesTable.length > 0) {
                const userPreferenceColumnEnsures = [
                    ['announcement_dismissed_id', "ALTER TABLE user_preferences ADD COLUMN announcement_dismissed_id VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT '' AFTER current_account_id", 'user_preferences.announcement_dismissed_id'],
                    ['notification_last_read_date', "ALTER TABLE user_preferences ADD COLUMN notification_last_read_date VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT '' AFTER announcement_dismissed_id", 'user_preferences.notification_last_read_date'],
                    ['app_seen_version', "ALTER TABLE user_preferences ADD COLUMN app_seen_version VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT '' AFTER notification_last_read_date", 'user_preferences.app_seen_version'],
                    ['accounts_view_state', "ALTER TABLE user_preferences ADD COLUMN accounts_view_state JSON DEFAULT NULL AFTER app_seen_version", 'user_preferences.accounts_view_state'],
                    ['accounts_action_history', "ALTER TABLE user_preferences ADD COLUMN accounts_action_history JSON DEFAULT NULL AFTER accounts_view_state", 'user_preferences.accounts_action_history'],
                    ['dashboard_view_state', "ALTER TABLE user_preferences ADD COLUMN dashboard_view_state JSON DEFAULT NULL AFTER accounts_action_history", 'user_preferences.dashboard_view_state'],
                    ['analytics_view_state', "ALTER TABLE user_preferences ADD COLUMN analytics_view_state JSON DEFAULT NULL AFTER dashboard_view_state", 'user_preferences.analytics_view_state'],
                    ['report_history_view_state', "ALTER TABLE user_preferences ADD COLUMN report_history_view_state JSON DEFAULT NULL AFTER analytics_view_state", 'user_preferences.report_history_view_state'],
                    ['cards_view_state', "ALTER TABLE user_preferences ADD COLUMN cards_view_state JSON DEFAULT NULL AFTER report_history_view_state", 'user_preferences.cards_view_state'],
                    ['system_logs_view_state', "ALTER TABLE user_preferences ADD COLUMN system_logs_view_state JSON DEFAULT NULL AFTER cards_view_state", 'user_preferences.system_logs_view_state'],
                ];
                for (const [columnName, alterSql, label] of userPreferenceColumnEnsures) {
                    const [columnRows] = await pool.execute(
                        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_preferences' AND COLUMN_NAME = ?`,
                        [DB_NAME, columnName],
                    );
                    if (columnRows.length === 0) {
                        logger.info(`检测到缺少 ${label}，正在添加...`);
                        await pool.query(alterSql);
                        logger.info(`✅ ${label} 添加完成`);
                    }
                }
            }

            const [accountBagPreferencesTable] = await pool.execute(`SHOW TABLES LIKE 'account_bag_preferences'`);
            if (accountBagPreferencesTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '016-account-bag-preferences.sql'),
                    '检测到缺少 account_bag_preferences 表，正在执行迁移 016-account-bag-preferences.sql',
                );
            }
            const [confirmedAccountBagPreferencesTable] = accountBagPreferencesTable.length > 0
                ? [accountBagPreferencesTable]
                : await pool.execute(`SHOW TABLES LIKE 'account_bag_preferences'`);
            if (confirmedAccountBagPreferencesTable.length > 0) {
                const accountBagPreferenceColumnEnsures = [
                    ['plantable_seed_snapshot', "ALTER TABLE account_bag_preferences ADD COLUMN plantable_seed_snapshot JSON DEFAULT NULL AFTER activity_history", 'account_bag_preferences.plantable_seed_snapshot'],
                    ['mall_resolver_cache', "ALTER TABLE account_bag_preferences ADD COLUMN mall_resolver_cache JSON DEFAULT NULL AFTER plantable_seed_snapshot", 'account_bag_preferences.mall_resolver_cache'],
                ];
                for (const [columnName, alterSql, label] of accountBagPreferenceColumnEnsures) {
                    const [columnRows] = await pool.execute(
                        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'account_bag_preferences' AND COLUMN_NAME = ?`,
                        [DB_NAME, columnName],
                    );
                    if (columnRows.length === 0) {
                        logger.info(`检测到缺少 ${label}，正在添加...`);
                        await pool.query(alterSql);
                        logger.info(`✅ ${label} 添加完成`);
                    }
                }
            }

            const [updateJobsTable] = await pool.execute(`SHOW TABLES LIKE 'update_jobs'`);
            if (updateJobsTable.length === 0) {
                await runMigrationFile(
                    path.join(migrationsDir, '017-system-update-jobs.sql'),
                    '检测到缺少 update_jobs 表，正在执行迁移 017-system-update-jobs.sql',
                );
            }
            const [confirmedUpdateJobsTable] = updateJobsTable.length > 0
                ? [updateJobsTable]
                : await pool.execute(`SHOW TABLES LIKE 'update_jobs'`);
            if (confirmedUpdateJobsTable.length > 0) {
                const updateJobColumnEnsures = [
                    ['batch_key', "ALTER TABLE update_jobs ADD COLUMN batch_key VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER target_version", 'update_jobs.batch_key'],
                    ['target_agent_id', "ALTER TABLE update_jobs ADD COLUMN target_agent_id VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER created_by", 'update_jobs.target_agent_id'],
                ];
                for (const [columnName, alterSql, label] of updateJobColumnEnsures) {
                    const [columnRows] = await pool.execute(
                        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'update_jobs' AND COLUMN_NAME = ?`,
                        [DB_NAME, columnName],
                    );
                    if (columnRows.length === 0) {
                        logger.info(`检测到缺少 ${label}，正在添加...`);
                        await pool.query(alterSql);
                        logger.info(`✅ ${label} 添加完成`);
                    }
                }

                const updateJobIndexEnsures = [
                    ['idx_update_jobs_batch_key', 'ALTER TABLE update_jobs ADD KEY idx_update_jobs_batch_key (batch_key)'],
                    ['idx_update_jobs_target_status', 'ALTER TABLE update_jobs ADD KEY idx_update_jobs_target_status (target_agent_id, status)'],
                ];
                for (const [indexName, alterSql] of updateJobIndexEnsures) {
                    const [indexRows] = await pool.execute(
                        `SELECT INDEX_NAME
                         FROM INFORMATION_SCHEMA.STATISTICS
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'update_jobs' AND INDEX_NAME = ?`,
                        [DB_NAME, indexName],
                    );
                    if (indexRows.length === 0) {
                        logger.info(`检测到缺少 update_jobs.${indexName}，正在添加...`);
                        await pool.query(alterSql);
                        logger.info(`✅ update_jobs.${indexName} 添加完成`);
                    }
                }
            }

            const [uiSettingsTable] = await pool.execute(`SHOW TABLES LIKE 'ui_settings'`);
            if (uiSettingsTable.length > 0) {
                const uiSettingColumnEnsures = [
                    ['login_background', "ALTER TABLE ui_settings ADD COLUMN login_background VARCHAR(2048) COLLATE utf8mb4_unicode_ci DEFAULT '' AFTER performance_mode", 'ui_settings.login_background'],
                    ['background_scope', "ALTER TABLE ui_settings ADD COLUMN background_scope VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT 'login_only' AFTER login_background", 'ui_settings.background_scope'],
                    ['login_background_overlay_opacity', "ALTER TABLE ui_settings ADD COLUMN login_background_overlay_opacity INT DEFAULT 30 AFTER background_scope", 'ui_settings.login_background_overlay_opacity'],
                    ['login_background_blur', "ALTER TABLE ui_settings ADD COLUMN login_background_blur INT DEFAULT 2 AFTER login_background_overlay_opacity", 'ui_settings.login_background_blur'],
                    ['workspace_visual_preset', "ALTER TABLE ui_settings ADD COLUMN workspace_visual_preset VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT 'console' AFTER login_background_blur", 'ui_settings.workspace_visual_preset'],
                    ['app_background_overlay_opacity', "ALTER TABLE ui_settings ADD COLUMN app_background_overlay_opacity INT DEFAULT 54 AFTER workspace_visual_preset", 'ui_settings.app_background_overlay_opacity'],
                    ['app_background_blur', "ALTER TABLE ui_settings ADD COLUMN app_background_blur INT DEFAULT 8 AFTER app_background_overlay_opacity", 'ui_settings.app_background_blur'],
                    ['color_theme', "ALTER TABLE ui_settings ADD COLUMN color_theme VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT 'default' AFTER app_background_blur", 'ui_settings.color_theme'],
                    ['theme_background_linked', "ALTER TABLE ui_settings ADD COLUMN theme_background_linked TINYINT(1) DEFAULT 0 AFTER color_theme", 'ui_settings.theme_background_linked'],
                    ['ui_timestamp', "ALTER TABLE ui_settings ADD COLUMN ui_timestamp BIGINT DEFAULT 0 AFTER theme_background_linked", 'ui_settings.ui_timestamp'],
                ];
                for (const [columnName, alterSql, label] of uiSettingColumnEnsures) {
                    const [columnRows] = await pool.execute(
                        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ui_settings' AND COLUMN_NAME = ?`,
                        [DB_NAME, columnName],
                    );
                    if (columnRows.length === 0) {
                        logger.info(`检测到缺少 ${label}，正在添加...`);
                        await pool.query(alterSql);
                        logger.info(`✅ ${label} 添加完成`);
                    }
                }

                const [uiUniqueIndexRows] = await pool.execute(
                    `SELECT INDEX_NAME
                     FROM INFORMATION_SCHEMA.STATISTICS
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ui_settings' AND INDEX_NAME = 'uk_ui_settings_user_id'`,
                    [DB_NAME],
                );
                if (uiUniqueIndexRows.length === 0) {
                    logger.info('检测到 ui_settings 缺少 user_id 唯一索引，正在清理重复数据并补齐...');
                    await pool.query(`
                        DELETE older
                        FROM ui_settings older
                        INNER JOIN ui_settings newer
                            ON older.user_id = newer.user_id
                            AND older.id < newer.id
                    `);
                    await pool.query('ALTER TABLE ui_settings ADD UNIQUE KEY uk_ui_settings_user_id (user_id)');
                    logger.info('✅ ui_settings.uk_ui_settings_user_id 添加完成');
                }
            }
        }

        const connection = await pool.getConnection();
        logger.info(`✅ MySQL 数据库连接池初始化成功 (${DB_HOST}:${DB_PORT}, 上限=${DB_LIMIT})`);
        connection.release();
        _initialized = true;
        startPoolMonitor();
    } catch (e) {
        logger.error('❌ MySQL 初始化失败:', e.message);
        throw e;
    }
}

/**
 * 封装的快捷执行方法 (带有连接自动重试功能防 Socket 闪断)
 */
async function query(sql, params = [], retries = 1) {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (e) {
        if (retries > 0 && (e.code === 'ECONNRESET' || e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'ETIMEDOUT')) {
            logger.warn(`SQL执行遇到坏链 [${e.code}]，尝试重新获取可用连接再执行 (剩余: ${retries})`);
            return query(sql, params, retries - 1);
        }
        logger.error(`SQL执行错误 [${sql}]:`, e.message);
        throw e;
    }
}

/**
 * 获取连接以执行事务
 */
async function transaction(fn, retries = 1) {
    let connection;
    try {
        connection = await pool.getConnection();
    } catch (err) {
        if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT')) {
            logger.warn(`[mysql-db] 获取事务连接防老化判定触发 ${err.code}，正在重试 (剩余: ${retries})`);
            return transaction(fn, retries - 1);
        }
        throw err;
    }

    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        try { await connection.rollback(); } catch { /* transaction may not have started */ }
        if (retries > 0 && (e.code === 'ECONNRESET' || e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'ETIMEDOUT')) {
            logger.warn(`[mysql-db] 事务执行期遭逢断链 ${e.code}，回滚并移交重试管道 (剩余: ${retries})`);
            try { connection.release(); } catch { }
            return transaction(fn, retries - 1);
        }
        logger.error('事务已回滚:', e.message);
        throw e;
    } finally {
        if (connection && connection.release) {
            try { connection.release(); } catch { }
        }
    }
}

function getPool() {
    if (!_initialized) {
        throw new Error('MySQL pool is not initialized. Call initMysql() first.');
    }
    return pool;
}

function isMysqlInitialized() {
    return _initialized;
}

async function closeMysql() {
    stopPoolMonitor();

    if (!_initialized) {
        return;
    }

    await pool.end();
    poolInstance = null;
    _initialized = false;
    logger.info('MySQL closed');
}

module.exports = {
    initMysql,
    closeMysql,
    query,
    transaction,
    getPool,
    getPoolStatus,
    isMysqlInitialized,
};

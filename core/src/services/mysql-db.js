const mysql = require('mysql2/promise');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('mysql-db');

// 从环境变量读取配置，兼容 docker-compose 和本地开发
const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_PORT = Number.parseInt(process.env.MYSQL_PORT || '4409', 10);
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || '123456';
const DB_NAME = process.env.MYSQL_DATABASE || 'qq_farm_bot';
const DB_LIMIT = Number.parseInt(process.env.MYSQL_POOL_LIMIT || '100', 10);

if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error(`Invalid MYSQL_DATABASE: "${DB_NAME}". Only alphanumeric and underscore allowed.`);
}

// MySQL 连接池配置 — Phase 2 扩容
// connectionLimit: 100 可支撑数百账号的 Worker 并发 + UI 面板查询
const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: DB_LIMIT,
    queueLimit: DB_LIMIT * 2, // 排队上限为连接池的2倍，超额直接抛出快速失败
    acquireTimeout: 10000,    // 取连接最大容忍 10 秒死等，防止高并发夯死
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // 空闲连接超时回收（毫秒），避免连接囤积占用 MySQL 资源
    idleTimeout: 60000,
    // 最大空闲连接数，超出的空闲连接会被回收
    maxIdle: 20,
});

let _initialized = false;

/**
 * 获取连接池实时状态快照（用于监控和告警）
 * @returns {{ activeConnections: number, idleConnections: number, waitingQueue: number, connectionLimit: number }}
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
    } catch (e) {
        return { activeConnections: -1, idleConnections: -1, waitingQueue: -1, connectionLimit: DB_LIMIT };
    }
}

// 连接池使用率告警：每 30 秒检测，超过 80% 时输出 warn 日志
setInterval(() => {
    try {
        const status = getPoolStatus();
        if (status.activeConnections < 0) return;
        const usagePercent = (status.activeConnections / status.connectionLimit) * 100;
        if (usagePercent > 80) {
            logger.warn(`⚠️ 连接池使用率过高: ${usagePercent.toFixed(1)}% (活跃=${status.activeConnections}, 空闲=${status.idleConnections}, 排队=${status.waitingQueue}, 上限=${status.connectionLimit})`);
        }
    } catch (e) {
        // 监控本身不应影响业务
    }
}, 30000).unref();

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

            const [usedAtCols] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'used_at'`,
                [DB_NAME]
            );
            if (usedAtCols.length === 0) {
                logger.info('检测到 cards 表缺少 used_at 列，正在添加...');
                await pool.query(`ALTER TABLE cards ADD COLUMN used_at DATETIME NULL AFTER used_by`);
                logger.info('✅ cards.used_at 列添加完成');
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

            const [fkRows] = await pool.execute(
                `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND CONSTRAINT_NAME = 'fk_accounts_username'`,
                [DB_NAME]
            );
            if (fkRows.length === 0) {
                logger.info('检测到 accounts 表缺少 username 外键约束，正在添加...');
                try {
                    await pool.query(`DELETE FROM accounts WHERE username IS NOT NULL AND username NOT IN (SELECT username FROM users)`);
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
        }

        const connection = await pool.getConnection();
        logger.info(`✅ MySQL 数据库连接池初始化成功 (${DB_HOST}:${DB_PORT}, 上限=${DB_LIMIT})`);
        connection.release();
        _initialized = true;
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
        const [rows, fields] = await pool.execute(sql, params);
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
            try { connection.release(); } catch (ignore) { }
            return transaction(fn, retries - 1);
        }
        logger.error('事务已回滚:', e.message);
        throw e;
    } finally {
        if (connection && connection.release) {
            try { connection.release(); } catch (ignore) { }
        }
    }
}

function getPool() {
    if (!_initialized) {
        throw new Error('MySQL pool is not initialized. Call initMysql() first.');
    }
    return pool;
}

module.exports = {
    initMysql,
    query,
    transaction,
    getPool,
    getPoolStatus
};

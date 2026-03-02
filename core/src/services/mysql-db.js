const mysql = require('mysql2/promise');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('mysql-db');

// MySQL 连接池配置 — Phase 2 扩容
// connectionLimit: 100 可支撑数百账号的 Worker 并发 + UI 面板查询
const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 4409,
    user: 'root',
    password: '123456',
    database: 'qq_farm_bot',
    waitForConnections: true,
    connectionLimit: 100,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // 空闲连接超时回收（毫秒），避免连接囤积占用 MySQL 资源
    idleTimeout: 60000,
    // 最大空闲连接数，超出的空闲连接会被回收
    maxIdle: 20,
});

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
            connectionLimit: 100,
        };
    } catch (e) {
        return { activeConnections: -1, idleConnections: -1, waitingQueue: -1, connectionLimit: 100 };
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

async function initMysql() {
    try {
        // 先测试连接并创建数据库（若不存在）
        const tempPool = mysql.createPool({
            host: '127.0.0.1',
            port: 4409,
            user: 'root',
            password: '123456',
        });
        await tempPool.query('CREATE DATABASE IF NOT EXISTS `qq_farm_bot` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
        await tempPool.end();

        // 测试主池的连通性
        const connection = await pool.getConnection();
        logger.info('✅ MySQL 数据库连接池初始化成功 (127.0.0.1:4409, 上限=100)');
        connection.release();
    } catch (e) {
        logger.error('❌ MySQL 初始化失败:', e.message);
        throw e;
    }
}

/**
 * 封装的快捷执行方法
 */
async function query(sql, params = []) {
    try {
        const [rows, fields] = await pool.execute(sql, params);
        return rows;
    } catch (e) {
        logger.error(`SQL执行错误 [${sql}]:`, e.message);
        throw e;
    }
}

/**
 * 获取连接以执行事务
 */
async function transaction(fn) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        await connection.rollback();
        logger.error('事务已回滚:', e.message);
        throw e;
    } finally {
        connection.release();
    }
}

function getPool() {
    return pool;
}

module.exports = {
    initMysql,
    query,
    transaction,
    getPool,
    getPoolStatus
};

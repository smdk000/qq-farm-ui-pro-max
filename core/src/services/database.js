const { initMysql, getPool } = require('./mysql-db');
const { initRedis, getRedisClient } = require('./redis-cache');
const circuitBreaker = require('./circuit-breaker');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('database');

let initPromise = null;

async function initDatabase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            await initMysql();
            logger.info('MySQL initialized');
            try {
                await initRedis();
                logger.info('Redis initialized');
            } catch (rErr) {
                // Redis 初始化失败：熔断器已在 initRedis 内部自动切换到 OPEN 状态
                logger.error('⚠️ Redis 初始化失败，已启动熔断保护模式。Worker 重度查询将被降级处理。', rErr.message);
            }
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    })();
    return initPromise;
}

function getDb() {
    return getPool();
}

async function closeDatabase() {
    await flushLogBatch();
    const pool = getPool();
    if (pool) {
        await pool.end();
        logger.info('MySQL closed');
    }
}

async function transaction(fn) {
    const pool = getPool();
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

// For operations logs:
const logBatch = [];

async function flushLogBatch() {
    if (logBatch.length === 0) return;
    const batch = logBatch.splice(0, logBatch.length);
    try {
        const pool = getPool();
        if (!pool) return;
        const values = batch.map(b => [b.accountId, b.action, b.result, b.details]);
        // mysql2/promise `query` handles `[[]]` as batch insert if statement is string: `VALUES ?`
        await pool.query('INSERT INTO operation_logs (account_id, action, result, details, created_at) VALUES ?', [values]);
    } catch (e) {
        logger.error('Batch inserts failed:', e.message);
    }
}

// 日志批量写入 — 缩短到 3 秒刷盘，减少高并发下的堆积
setInterval(() => {
    flushLogBatch().catch(() => { });
}, 3000).unref();

function bufferedInsertLog(accountId, action, result, details) {
    logBatch.push({
        accountId, action, result,
        details: typeof details === 'string' ? details : JSON.stringify(details || {})
    });
    // 阈值从 200 降到 100，避免单次批量 INSERT 过大
    if (logBatch.length >= 100) {
        flushLogBatch().catch(() => { });
    }
}

async function updateFriendsCache(accountId, friendsList, retryCount = 0) {
    try {
        const redis = getRedisClient();
        if (!redis) return;
        const valid = (friendsList || []).filter(f => f && f.gid);
        if (!valid.length) return;

        const mapped = valid.map(f => ({
            gid: Number(f.gid),
            uin: String(f.uin || ''),
            name: String(f.name || f.remark || ''),
            avatarUrl: String(f.avatarUrl || f.avatar_url || '')
        }));

        await redis.set(`account:${accountId}:friends_cache`, JSON.stringify(mapped), 'EX', 86400 * 3); // 3 days Cache
    } catch (e) {
        logger.error(`save friends cache failed: ${e.message}`);
    }
}

async function getCachedFriends(accountId) {
    // 熔断器检查：Redis 不可用时直接返回空数组，防止回源 MySQL 造成雪崩
    if (!circuitBreaker.isAvailable()) {
        logger.warn(`Redis 熔断中，跳过好友缓存查询 (account: ${accountId})`);
        return [];
    }
    try {
        const redis = getRedisClient();
        if (!redis) return [];
        const str = await redis.get(`account:${accountId}:friends_cache`);
        circuitBreaker.recordSuccess();
        if (str) return JSON.parse(str);
        return [];
    } catch (e) {
        circuitBreaker.recordFailure();
        logger.error(`get friends cache failed: ${e.message}`);
        return [];
    }
}

/**
 * 检查 Redis 缓存是否可用（供 Worker 层查询）
 */
function isRedisCacheAvailable() {
    return circuitBreaker.isAvailable();
}

module.exports = {
    initDatabase,
    getDb,
    closeDatabase,
    transaction,
    bufferedInsertLog,
    updateFriendsCache,
    getCachedFriends,
    isRedisCacheAvailable,
};

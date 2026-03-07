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

async function transaction(fn, retries = 1) {
    const pool = getPool();
    let connection;
    try {
        connection = await pool.getConnection();
    } catch (err) {
        if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT')) {
            logger.warn(`[database] 获取事务连接抛出 ${err.code}，尝试重试 (剩余: ${retries})`);
            return transaction(fn, retries - 1);
        }
        throw err;
    }

    await connection.beginTransaction();
    try {
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        await connection.rollback();
        // 如果在事务查询中依然遇到断链，同样消耗重试并重新发配
        if (retries > 0 && (e.code === 'ECONNRESET' || e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'ETIMEDOUT')) {
            logger.warn(`[database] 事务执行中抛出断链 ${e.code}，回滚并尝试整体重试 (剩余: ${retries})`);
            connection.release(); // 先释放坏链
            return transaction(fn, retries - 1);
        }
        throw e;
    } finally {
        if (connection && connection.release) {
            try { connection.release(); } catch (ignore) { }
        }
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

// ============ 公告管理 (支持多版本历史) ============
const ANNOUNCEMENT_CACHE_KEY = 'announcements:list';
const ANNOUNCEMENT_CACHE_TTL = 300; // 5 分钟

async function getAnnouncements() {
    try {
        const redis = getRedisClient();
        if (redis) {
            const cached = await redis.get(ANNOUNCEMENT_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) {
        logger.warn(`公告 Redis 缓存读取失败: ${e.message}`);
    }

    const pool = getPool();
    if (!pool) return [];
    try {
        // 按照 ID 倒序排列获取所有有效和非有效公告
        const [rows] = await pool.execute(
            'SELECT id, title, version, publish_date, content, enabled, created_by, created_at, updated_at FROM announcements ORDER BY id DESC'
        );
        const data = rows.map(row => ({
            id: row.id,
            title: row.title || '',
            version: row.version || '',
            publish_date: row.publish_date || '',
            content: row.content || '',
            enabled: !!row.enabled,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        try {
            const redis = getRedisClient();
            if (redis) {
                await redis.set(ANNOUNCEMENT_CACHE_KEY, JSON.stringify(data), 'EX', ANNOUNCEMENT_CACHE_TTL);
            }
        } catch (rErr) { /* ignore */ }
        return data;
    } catch (e) {
        logger.error(`getAnnouncements failed: ${e.message}`);
        return [];
    }
}

async function saveAnnouncement(data) {
    const pool = getPool();
    if (!pool) throw new Error('MySQL 不可用');
    const { id, title = '', version = '', publish_date = '', content = '', enabled = true, createdBy = null } = data || {};
    try {
        if (id) {
            await pool.execute(
                'UPDATE announcements SET title = ?, version = ?, publish_date = ?, content = ?, enabled = ?, created_by = ? WHERE id = ?',
                [title, version, publish_date, content, enabled ? 1 : 0, createdBy, id]
            );
        } else {
            await pool.execute(
                'INSERT INTO announcements (title, version, publish_date, content, enabled, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                [title, version, publish_date, content, enabled ? 1 : 0, createdBy]
            );
        }
        await invalidateAnnouncementCache();
        return { ok: true };
    } catch (e) {
        logger.error(`saveAnnouncement failed: ${e.message}`);
        throw e;
    }
}

async function deleteAnnouncement(id) {
    const pool = getPool();
    if (!pool) throw new Error('MySQL 不可用');
    try {
        if (id) {
            await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);
        } else {
            await pool.query('TRUNCATE TABLE announcements'); // 使用 query 代替 execute 并且 TRUNCATE，重置自增顺序
        }
        await invalidateAnnouncementCache();
        return { ok: true };
    } catch (e) {
        logger.error(`deleteAnnouncement failed: ${e.message}`);
        throw e;
    }
}

async function invalidateAnnouncementCache() {
    try {
        const redis = getRedisClient();
        if (redis) await redis.del(ANNOUNCEMENT_CACHE_KEY);
    } catch (e) { /* ignore */ }
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
    getAnnouncements,
    saveAnnouncement,
    deleteAnnouncement,
    invalidateAnnouncementCache,
};

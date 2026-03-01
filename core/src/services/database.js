const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getDataFile } = require('../config/runtime-paths');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('database');
const DB_PATH = getDataFile('farm-bot.db');

let db = null;

/**
 * 初始化数据库
 */
function initDatabase() {
    try {
        db = new Database(DB_PATH);

        // 性能优化配置
        db.pragma('journal_mode = WAL'); // Write-Ahead Logging
        db.pragma('busy_timeout = 5000'); // 并发写入遇锁时最多等待 5 秒，避免直接抛出 SQLITE_BUSY
        db.pragma('wal_autocheckpoint = 1000'); // 每累积 1000 页自动合并 WAL，防止 .db-wal 膨胀
        db.pragma('foreign_keys = ON');  // 启用外键约束
        db.pragma('cache_size = 10000'); // 缓存大小（页）
        db.pragma('temp_store = MEMORY'); // 临时存储使用内存
        db.pragma('synchronous = NORMAL'); // 平衡性能和安全性

        // 运行迁移
        runMigrations();

        logger.info(`数据库初始化成功：${DB_PATH}`);
        return db;
    } catch (error) {
        logger.error('数据库初始化失败:', error);
        throw error;
    }
}

/**
 * 运行数据库迁移
 */
function runMigrations() {
    try {
        const dir = path.join(__dirname, '../database/migrations');
        if (!fs.existsSync(dir)) {
            logger.warn('迁移目录不存在，跳过迁移');
            return;
        }

        // 获取当前数据库版本
        const { user_version } = db.prepare('PRAGMA user_version').get();
        let newVersion = user_version;

        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.sql'))
            .sort(); // 确保按名称排序如 001-init.sql, 002-optimize_storage.sql

        // 假设文件名格式如 001-xxx.sql，002-xxx.sql
        for (const file of files) {
            const versionMatch = file.match(/^(\d+)-/);
            if (versionMatch) {
                const version = parseInt(versionMatch[1], 10);
                if (version > user_version) {
                    logger.info(`正在执行迁移: ${file}`);
                    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
                    db.exec(sql);
                    newVersion = Math.max(newVersion, version);
                }
            }
        }

        if (newVersion > user_version) {
            db.exec(`PRAGMA user_version = ${newVersion}`);
            logger.info(`数据库迁移完成，当前版本: ${newVersion}`);
        } else {
            logger.info('数据库已是最新版本，无需迁移');
        }

    } catch (error) {
        logger.error('数据库迁移失败:', error);
        throw error;
    }
}

/**
 * 获取数据库实例
 */
function getDb() {
    if (!db) {
        throw new Error('数据库未初始化');
    }
    return db;
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
    if (db) {
        try {
            // 检查点操作，确保所有数据写入磁盘
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            db.close();
            logger.info('数据库已关闭');
        } catch (error) {
            logger.error('关闭数据库失败:', error);
        } finally {
            db = null;
        }
    }
}

/**
 * 执行事务（便捷方法）
 */
function transaction(fn) {
    const database = getDb();
    return database.transaction(fn)();
}

/**
 * 备份数据库（创建快照）
 */
function backupDatabase(backupPath) {
    try {
        const db = getDb();
        const backup = new Database(backupPath);
        db.backup(backup);
        backup.close();
        logger.info(`数据库备份成功：${backupPath}`);
        return true;
    } catch (error) {
        logger.error('数据库备份失败:', error);
        return false;
    }
}

module.exports = {
    initDatabase,
    getDb,
    closeDatabase,
    transaction,
    backupDatabase,

    // 好友缓存相关
    updateFriendsCache: (accountId, friendsList, retryCount = 0) => {
        try {
            const db = getDb();
            // 首先筛选出有效的好友
            const valid = (friendsList || []).filter(f => f && f.gid);
            if (!valid.length) return;

            const stmt = db.prepare(`
                INSERT INTO account_friends_cache (account_id, friend_gid, friend_uin, name, avatar_url, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(account_id, friend_gid) DO UPDATE SET
                    friend_uin=excluded.friend_uin,
                    name=excluded.name,
                    avatar_url=excluded.avatar_url,
                    updated_at=CURRENT_TIMESTAMP
            `);
            const runMany = db.transaction((list) => {
                for (const f of list) {
                    // gid: 必需，其他可空
                    stmt.run(
                        Number(accountId),
                        String(f.gid),
                        String(f.uin || ''),
                        String(f.name || f.remark || ''),
                        String(f.avatarUrl || f.avatar_url || '')
                    );
                }
            });

            // 尝试使用 immediate 以避免在并发下发生 deadlocks
            if (typeof runMany.immediate === 'function') {
                runMany.immediate(valid);
            } else {
                runMany(valid);
            }
        } catch (e) {
            // 检查是不是被并发锁阻挡，最多重试 3 次
            if (e.code === 'SQLITE_BUSY' && retryCount < 3) {
                const delay = 500 + Math.random() * 1500; // 500ms ~ 2000ms 避开拥堵峰值
                logger.warn(`账号[${accountId}]更新好友缓存遇写锁(繁忙)，${Math.round(delay)}ms后重试(次/${retryCount + 1})...`);
                setTimeout(() => {
                    module.exports.updateFriendsCache(accountId, friendsList, retryCount + 1);
                }, delay);
            } else {
                // 转换错误对象，防止被 logger 里的正则把 code 字段 redact （屏蔽）掉
                logger.error(`账号[${accountId}]更新好友缓存彻底失败:`, {
                    errMsg: e.message,
                    errCode: e.code,
                    retryRound: retryCount
                });
            }
        }
    },

    getCachedFriends: (accountId) => {
        try {
            const db = getDb();
            const rows = db.prepare('SELECT friend_gid as gid, friend_uin as uin, name, avatar_url as avatarUrl FROM account_friends_cache WHERE account_id = ?').all(Number(accountId));
            const stateIds = new Set();
            return rows.map(r => {
                return {
                    gid: Number(r.gid),
                    uin: r.uin,
                    name: r.name,
                    avatarUrl: r.avatarUrl,
                };
            });
        } catch (e) {
            logger.error('读取好友缓存失败:', e);
            return [];
        }
    }
};

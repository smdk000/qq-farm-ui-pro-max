const { getDb, transaction } = require('../services/database');
const { createModuleLogger } = require('../services/logger');

const logger = createModuleLogger('account-repository');

class AccountRepository {
    /**
     * 获取所有账号（含配置）
     */
    findAll() {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT 
                    a.id,
                    a.uin,
                    a.nick,
                    a.name,
                    a.platform,
                    a.running,
                    a.created_at,
                    a.updated_at,
                    c.automation_farm,
                    c.automation_friend,
                    c.automation_friend_steal,
                    c.automation_friend_help,
                    c.planting_strategy,
                    c.preferred_seed_id,
                    c.interval_farm,
                    c.interval_friend,
                    c.steal_filter_enabled,
                    c.steal_filter_mode
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                ORDER BY a.created_at DESC
            `);
            const rows = stmt.all();
            return rows.map(r => {
                if (r.advanced_settings) {
                    try { r.advanced_settings = JSON.parse(r.advanced_settings); } catch (e) { }
                }
                return r;
            });
        } catch (error) {
            logger.error('查询所有账号失败:', error);
            throw error;
        }
    }

    /**
     * 根据 ID 查找账号
     */
    findById(id) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT a.*, c.*
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                WHERE a.id = ?
            `);
            const row = stmt.get(id);
            if (row && row.advanced_settings) {
                try { row.advanced_settings = JSON.parse(row.advanced_settings); } catch (e) { }
            }
            return row;
        } catch (error) {
            logger.error('根据 ID 查询账号失败:', error);
            throw error;
        }
    }

    /**
     * 根据 UIN 查找账号
     */
    findByUin(uin) {
        try {
            const db = getDb();
            const stmt = db.prepare('SELECT * FROM accounts WHERE uin = ?');
            return stmt.get(uin);
        } catch (error) {
            logger.error('根据 UIN 查询账号失败:', error);
            throw error;
        }
    }

    /**
     * 创建账号（含默认配置）
     */
    create(accountData) {
        try {
            const db = getDb();

            return transaction(() => {
                // 1. 插入账号
                const insertAccount = db.prepare(`
                    INSERT INTO accounts (uin, nick, name, platform, running)
                    VALUES (?, ?, ?, ?, ?)
                `);

                const accountResult = insertAccount.run(
                    accountData.uin,
                    accountData.nick || '',
                    accountData.name || '',
                    accountData.platform || 'qq',
                    false
                );

                const accountId = accountResult.lastInsertRowid;

                // 2. 插入默认配置
                const insertConfig = db.prepare(`
                    INSERT INTO account_configs (account_id)
                    VALUES (?)
                `);

                insertConfig.run(accountId);

                logger.info(`创建账号成功：${accountData.uin}, ID: ${accountId}`);

                return { id: accountId, ...accountData };
            });
        } catch (error) {
            logger.error('创建账号失败:', error);
            throw error;
        }
    }

    /**
     * 更新账号配置
     */
    updateConfig(accountId, configData) {
        try {
            const db = getDb();

            // 构建动态更新语句
            const fields = Object.keys(configData);
            if (fields.length === 0) {
                return { changes: 0 };
            }

            const setClause = fields.map(f => `${f} = ?`).join(', ');
            const stmt = db.prepare(`
                UPDATE account_configs 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ?
            `);

            const values = fields.map(f => {
                if (f === 'advanced_settings' && typeof configData[f] === 'object') {
                    return JSON.stringify(configData[f]);
                }
                return configData[f];
            });
            values.push(accountId);

            const result = stmt.run(...values);

            logger.info(`更新账号配置成功：${accountId}, 影响行数：${result.changes}`);

            return result;
        } catch (error) {
            logger.error('更新账号配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取账号配置
     */
    getConfig(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare('SELECT * FROM account_configs WHERE account_id = ?');
            const row = stmt.get(accountId);
            if (row && row.advanced_settings) {
                try { row.advanced_settings = JSON.parse(row.advanced_settings); } catch (e) { }
            }
            return row;
        } catch (error) {
            logger.error('获取账号配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取账号好友黑名单
     */
    getFriendBlacklist(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT friend_id, friend_name, created_at
                FROM account_friend_blacklist
                WHERE account_id = ?
                ORDER BY created_at DESC
            `);
            return stmt.all(accountId);
        } catch (error) {
            logger.error('获取好友黑名单失败:', error);
            throw error;
        }
    }

    /**
     * 添加好友到黑名单
     */
    addToFriendBlacklist(accountId, friendId, friendName) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO account_friend_blacklist (account_id, friend_id, friend_name)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(accountId, friendId, friendName || '');
            logger.info(`添加好友到黑名单：${accountId}, ${friendId}`);
            return result;
        } catch (error) {
            logger.error('添加好友到黑名单失败:', error);
            throw error;
        }
    }

    /**
     * 从好友黑名单移除
     */
    removeFromFriendBlacklist(accountId, friendId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                DELETE FROM account_friend_blacklist
                WHERE account_id = ? AND friend_id = ?
            `);
            const result = stmt.run(accountId, friendId);
            logger.info(`从好友黑名单移除：${accountId}, ${friendId}`);
            return result;
        } catch (error) {
            logger.error('从好友黑名单移除失败:', error);
            throw error;
        }
    }

    /**
     * 获取偷菜植物过滤列表
     */
    getPlantFilter(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT plant_id, plant_name, created_at
                FROM account_plant_filter
                WHERE account_id = ?
                ORDER BY created_at DESC
            `);
            return stmt.all(accountId);
        } catch (error) {
            logger.error('获取植物过滤列表失败:', error);
            throw error;
        }
    }

    /**
     * 添加植物到过滤列表
     */
    addToPlantFilter(accountId, plantId, plantName) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO account_plant_filter (account_id, plant_id, plant_name)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(accountId, plantId, plantName || '');
            logger.info(`添加植物到过滤列表：${accountId}, ${plantId}`);
            return result;
        } catch (error) {
            logger.error('添加植物到过滤列表失败:', error);
            throw error;
        }
    }

    /**
     * 从植物过滤列表移除
     */
    removeFromPlantFilter(accountId, plantId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                DELETE FROM account_plant_filter
                WHERE account_id = ? AND plant_id = ?
            `);
            const result = stmt.run(accountId, plantId);
            logger.info(`从植物过滤列表移除：${accountId}, ${plantId}`);
            return result;
        } catch (error) {
            logger.error('从植物过滤列表移除失败:', error);
            throw error;
        }
    }

    /**
     * 删除账号
     */
    delete(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
            const result = stmt.run(accountId);
            logger.info(`删除账号成功：${accountId}`);
            return result;
        } catch (error) {
            logger.error('删除账号失败:', error);
            throw error;
        }
    }

    /**
     * 更新账号运行状态
     */
    updateRunningStatus(accountId, running) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                UPDATE accounts 
                SET running = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            const result = stmt.run(running ? 1 : 0, accountId);
            logger.info(`更新账号运行状态：${accountId}, running: ${running}`);
            return result;
        } catch (error) {
            logger.error('更新账号运行状态失败:', error);
            throw error;
        }
    }

    /**
     * 记录配置变更审计日志
     */
    logConfigChange(accountId, oldConfig, newConfig, changedBy) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT INTO config_audit_log (account_id, old_config, new_config, changed_by)
                VALUES (?, ?, ?, ?)
            `);
            const result = stmt.run(
                accountId,
                JSON.stringify(oldConfig),
                JSON.stringify(newConfig),
                changedBy || 'system'
            );
            logger.info(`记录配置变更审计日志：${accountId}`);
            return result;
        } catch (error) {
            logger.error('记录配置变更审计日志失败:', error);
            throw error;
        }
    }

    /**
     * 获取配置变更历史
     */
    getConfigHistory(accountId, limit = 10) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT old_config, new_config, changed_by, changed_at
                FROM config_audit_log
                WHERE account_id = ?
                ORDER BY changed_at DESC
                LIMIT ?
            `);
            return stmt.all(accountId, limit);
        } catch (error) {
            logger.error('获取配置变更历史失败:', error);
            throw error;
        }
    }
}

module.exports = new AccountRepository();

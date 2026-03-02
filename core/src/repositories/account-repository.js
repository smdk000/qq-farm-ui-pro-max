const { getPool, transaction } = require('../services/mysql-db');
const { createModuleLogger } = require('../services/logger');

const logger = createModuleLogger('account-repository');

class AccountRepository {

    async findAll() {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT 
                    a.id,
                    a.uin,
                    a.nick,
                    a.name,
                    a.platform,
                    a.running,
                    a.status,
                    a.api_error_count,
                    a.username,
                    a.auth_data,
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
                    c.steal_filter_mode,
                    c.advanced_settings
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                ORDER BY a.created_at DESC
            `);
            return rows.map(r => {
                if (r.auth_data && typeof r.auth_data === 'string') {
                    try { r.auth_data = JSON.parse(r.auth_data); } catch (e) { }
                }
                if (r.advanced_settings && typeof r.advanced_settings === 'string') {
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
     * 轻量级列表查询 — 仅返回列表展示所需的字段
     * 不拉取 auth_data / advanced_settings 等大 JSON 字段
     * 适用于：主面板账号列表刷新、账号数量统计、批量状态查询
     * 优化效果：消除万级 JSON.parse 同步阻塞
     */
    async findAllLite() {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT 
                    a.id,
                    a.uin,
                    a.nick,
                    a.name,
                    a.platform,
                    a.running,
                    a.status,
                    a.api_error_count,
                    a.username,
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
            return rows; // 无 JSON.parse，直接返回原生行
        } catch (error) {
            logger.error('轻量查询所有账号失败:', error);
            throw error;
        }
    }

    /**
     * 分页查询 — 支持万级/百万级大量数据场景
     * @param {number} page - 页码（从 1 开始）
     * @param {number} pageSize - 每页数量（上限 200）
     * @param {object} options - { withJson: false } 是否包含 auth_data/advanced_settings JSON 字段
     * @returns {{ rows: Array, total: number, page: number, pageSize: number }}
     */
    async findAllPaged(page = 1, pageSize = 50, options = {}) {
        try {
            const pool = getPool();
            const offset = (Math.max(1, page) - 1) * pageSize;
            const limit = Math.min(Math.max(1, pageSize), 200);

            // 总数查询
            const [[{ total }]] = await pool.execute(
                'SELECT COUNT(*) as total FROM accounts'
            );

            const jsonFields = options.withJson
                ? ', a.auth_data, c.advanced_settings'
                : '';

            const [rows] = await pool.execute(`
                SELECT 
                    a.id, a.uin, a.nick, a.name, a.platform, 
                    a.running, a.status, a.api_error_count, 
                    a.username, a.created_at, a.updated_at,
                    c.automation_farm, c.automation_friend,
                    c.automation_friend_steal, c.automation_friend_help,
                    c.planting_strategy, c.preferred_seed_id,
                    c.interval_farm, c.interval_friend,
                    c.steal_filter_enabled, c.steal_filter_mode
                    ${jsonFields}
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                ORDER BY a.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `);

            // 仅在需要时解析 JSON（按需而非全量）
            if (options.withJson) {
                for (const r of rows) {
                    if (r.auth_data && typeof r.auth_data === 'string') {
                        try { r.auth_data = JSON.parse(r.auth_data); } catch (e) { }
                    }
                    if (r.advanced_settings && typeof r.advanced_settings === 'string') {
                        try { r.advanced_settings = JSON.parse(r.advanced_settings); } catch (e) { }
                    }
                }
            }

            return { rows, total, page, pageSize: limit };
        } catch (error) {
            logger.error('分页查询账号失败:', error);
            throw error;
        }
    }

    async findById(id) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT a.*, c.*
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                WHERE a.id = ?
            `, [id]);
            const row = rows[0];
            if (row && row.auth_data && typeof row.auth_data === 'string') {
                try { row.auth_data = JSON.parse(row.auth_data); } catch (e) { }
            }
            if (row && row.advanced_settings && typeof row.advanced_settings === 'string') {
                try { row.advanced_settings = JSON.parse(row.advanced_settings); } catch (e) { }
            }
            return row;
        } catch (error) {
            logger.error('根据 ID 查询账号失败:', error);
            throw error;
        }
    }

    async findByUin(uin) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute('SELECT * FROM accounts WHERE uin = ?', [uin]);
            const row = rows[0];
            if (row && row.auth_data && typeof row.auth_data === 'string') {
                try { row.auth_data = JSON.parse(row.auth_data); } catch (e) { }
            }
            return row;
        } catch (error) {
            logger.error('根据 UIN 查询账号失败:', error);
            throw error;
        }
    }

    async create(accountData) {
        try {
            return await transaction(async (connection) => {
                // 1. 插入账号
                const [accountResult] = await connection.execute(`
                    INSERT INTO accounts (uin, nick, name, platform, running, username, auth_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    accountData.uin,
                    accountData.nick || '',
                    accountData.name || '',
                    accountData.platform || 'qq',
                    0,
                    accountData.username || '',
                    accountData.auth_data ? JSON.stringify(accountData.auth_data) : '{}'
                ]);

                const accountId = accountResult.insertId;

                // 2. 插入默认配置
                await connection.execute(`
                    INSERT INTO account_configs (account_id)
                    VALUES (?)
                `, [accountId]);

                logger.info(`创建账号成功：${accountData.uin}, ID: ${accountId}`);

                return { id: accountId, ...accountData };
            });
        } catch (error) {
            logger.error('创建账号失败:', error);
            throw error;
        }
    }

    async updateConfig(accountId, configData) {
        try {
            const pool = getPool();
            const fields = Object.keys(configData);
            if (fields.length === 0) {
                return { changes: 0 };
            }

            const setClause = fields.map(f => `${f} = ?`).join(', ');

            const values = fields.map(f => {
                if (f === 'advanced_settings' && typeof configData[f] === 'object') {
                    return JSON.stringify(configData[f]);
                }
                return configData[f];
            });
            values.push(accountId);

            const [result] = await pool.execute(`
                UPDATE account_configs 
                SET ${setClause}
                WHERE account_id = ?
            `, values);

            logger.info(`更新账号配置成功：${accountId}, 影响行数：${result.affectedRows}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('更新账号配置失败:', error);
            throw error;
        }
    }

    async getConfig(accountId) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute('SELECT * FROM account_configs WHERE account_id = ?', [accountId]);
            const row = rows[0];
            if (row && row.advanced_settings && typeof row.advanced_settings === 'string') {
                try { row.advanced_settings = JSON.parse(row.advanced_settings); } catch (e) { }
            }
            return row;
        } catch (error) {
            logger.error('获取账号配置失败:', error);
            throw error;
        }
    }

    async getFriendBlacklist(accountId) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT friend_id, friend_name, created_at
                FROM account_friend_blacklist
                WHERE account_id = ?
                ORDER BY created_at DESC
            `, [accountId]);
            return rows;
        } catch (error) {
            logger.error('获取好友黑名单失败:', error);
            throw error;
        }
    }

    async addToFriendBlacklist(accountId, friendId, friendName) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                INSERT IGNORE INTO account_friend_blacklist (account_id, friend_id, friend_name)
                VALUES (?, ?, ?)
            `, [accountId, friendId, friendName || '']);
            logger.info(`添加好友到黑名单：${accountId}, ${friendId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('添加好友到黑名单失败:', error);
            throw error;
        }
    }

    async removeFromFriendBlacklist(accountId, friendId) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                DELETE FROM account_friend_blacklist
                WHERE account_id = ? AND friend_id = ?
            `, [accountId, friendId]);
            logger.info(`从好友黑名单移除：${accountId}, ${friendId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('从好友黑名单移除失败:', error);
            throw error;
        }
    }

    async getPlantFilter(accountId) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT plant_id, plant_name, created_at
                FROM account_plant_filter
                WHERE account_id = ?
                ORDER BY created_at DESC
            `, [accountId]);
            return rows;
        } catch (error) {
            logger.error('获取植物过滤列表失败:', error);
            throw error;
        }
    }

    async addToPlantFilter(accountId, plantId, plantName) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                INSERT IGNORE INTO account_plant_filter (account_id, plant_id, plant_name)
                VALUES (?, ?, ?)
            `, [accountId, plantId, plantName || '']);
            logger.info(`添加植物到过滤列表：${accountId}, ${plantId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('添加植物到过滤列表失败:', error);
            throw error;
        }
    }

    async removeFromPlantFilter(accountId, plantId) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                DELETE FROM account_plant_filter
                WHERE account_id = ? AND plant_id = ?
            `, [accountId, plantId]);
            logger.info(`从植物过滤列表移除：${accountId}, ${plantId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('从植物过滤列表移除失败:', error);
            throw error;
        }
    }

    async delete(accountId) {
        try {
            const pool = getPool();
            const [result] = await pool.execute('DELETE FROM accounts WHERE id = ?', [accountId]);
            logger.info(`删除账号成功：${accountId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('删除账号失败:', error);
            throw error;
        }
    }

    async updateRunningStatus(accountId, running) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                UPDATE accounts 
                SET running = ?
                WHERE id = ?
            `, [running ? 1 : 0, accountId]);
            logger.info(`更新账号运行状态：${accountId}, running: ${running}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('更新账号运行状态失败:', error);
            throw error;
        }
    }

    async logConfigChange(accountId, oldConfig, newConfig, changedBy) {
        try {
            const pool = getPool();
            const [result] = await pool.execute(`
                INSERT INTO config_audit_log (account_id, old_config, new_config, changed_by)
                VALUES (?, ?, ?, ?)
            `, [
                accountId,
                JSON.stringify(oldConfig),
                JSON.stringify(newConfig),
                changedBy || 'system'
            ]);
            logger.info(`记录配置变更审计日志：${accountId}`);
            return { changes: result.affectedRows };
        } catch (error) {
            logger.error('记录配置变更审计日志失败:', error);
            throw error;
        }
    }

    async getConfigHistory(accountId, limit = 10) {
        try {
            const pool = getPool();
            const [rows] = await pool.execute(`
                SELECT old_config, new_config, changed_by, changed_at
                FROM config_audit_log
                WHERE account_id = ?
                ORDER BY changed_at DESC
                LIMIT ?
            `, [accountId, limit]);

            // 处理 MySQL 预设 JSON/String
            return rows.map(r => {
                if (typeof r.old_config === 'string') {
                    try { r.old_config = JSON.parse(r.old_config); } catch (e) { }
                }
                if (typeof r.new_config === 'string') {
                    try { r.new_config = JSON.parse(r.new_config); } catch (e) { }
                }
                return r;
            });
        } catch (error) {
            logger.error('获取配置变更历史失败:', error);
            throw error;
        }
    }
}

module.exports = new AccountRepository();

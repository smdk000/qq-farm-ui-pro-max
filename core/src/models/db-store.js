const { getPool, query: executeQuery } = require('../services/mysql-db');
const { createModuleLogger } = require('../services/logger');
const logger = createModuleLogger('db-store');

/**
 * 封装 DB 存取服务
 */
class DbStore {
    async getAccounts() {
        const pool = getPool();
        if(!pool) return [];
        const [rows] = await pool.query("SELECT * FROM accounts");
        return rows;
    }
}
module.exports = new DbStore();

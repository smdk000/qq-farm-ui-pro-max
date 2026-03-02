const { getDb } = require('../services/database');
const { createModuleLogger } = require('../services/logger');
const logger = createModuleLogger('job-log-cleanup');

async function runLogCleanup() {
    try {
        const db = getDb();
        if (!db) return;
        const [info1] = await db.query(`DELETE FROM operation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
        const [info2] = await db.query(`DELETE FROM config_audit_log WHERE changed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`);

        logger.info(`日志清理完成: 删除了 ${info1.affectedRows} 条操作日志, ${info2.affectedRows} 条配置审计日志`);
    } catch (err) {
        logger.error('执行日志清理任务失败', { error: err.message });
    }
}

function startLogCleanupJob(scheduler) {
    // 每天执行一次 (24小时 = 86400000 ms)
    scheduler.setIntervalTask('log-cleanup-job', 86400000, runLogCleanup, { runImmediately: true });
    logger.info('已注册每日日志清理任务');
}

module.exports = { startLogCleanupJob, runLogCleanup };

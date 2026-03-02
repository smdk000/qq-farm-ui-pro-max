const { getDb } = require('../services/database');
const { createModuleLogger } = require('../services/logger');
const logger = createModuleLogger('job-daily-stats');

async function runDailyStats() {
    try {
        const db = getDb();
        if (!db) return;

        // 获取昨天的日期 YYYY-MM-DD
        const [rows] = await db.query(`SELECT DATE(DATE_SUB(NOW(), INTERVAL 1 DAY)) AS d`);
        const targetDate = rows[0].d;

        // 获取昨天的日志
        const [logs] = await db.query(`
            SELECT account_id, action, details 
            FROM operation_logs 
            WHERE DATE(created_at) = ?
        `, [targetDate]);

        const statsMap = {}; // account_id -> { exp: 0, gold: 0 }

        for (const log of logs) {
            if (!statsMap[log.account_id]) {
                statsMap[log.account_id] = { exp: 0, gold: 0 };
            }
            if (!log.details) continue;
            try {
                const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                const exp = Number(details.exp) || 0;
                const gold = Number(details.gold || details.money || details.coin) || 0;

                statsMap[log.account_id].exp += exp;
                statsMap[log.account_id].gold += gold;
            } catch (e) {
                // Ignore JSON parse errors for single log
            }
        }

        const accountIds = Object.keys(statsMap);
        if (accountIds.length > 0) {
            for (const accountId of accountIds) {
                const stat = statsMap[accountId];
                await db.query(`
                    INSERT INTO daily_statistics (account_id, stat_date, exp_earned, gold_earned) 
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        exp_earned = VALUES(exp_earned),
                        gold_earned = VALUES(gold_earned),
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    Number(accountId),
                    targetDate,
                    stat.exp,
                    stat.gold
                ]);
            }
            logger.info(`已完成 ${accountIds.length} 个账号的每日收益汇总：${targetDate}`);
        }

    } catch (err) {
        logger.error('执行每日统计汇总失败:', err);
    }
}

function startDailyStatsJob(scheduler) {
    // 每天执行一次 (24 * 60 * 60 * 1000)
    scheduler.setIntervalTask('daily-stats-job', 86400000, runDailyStats, { runImmediately: true });
    logger.info('已注册每日收益汇总任务');
}

module.exports = { startDailyStatsJob, runDailyStats };

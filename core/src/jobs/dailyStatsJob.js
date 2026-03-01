const { getDb } = require('../services/database');
const { createModuleLogger } = require('../services/logger');
const logger = createModuleLogger('job-daily-stats');

async function runDailyStats() {
    try {
        const db = getDb();
        // 获取昨天的日期 YYYY-MM-DD
        const targetDate = db.prepare(`SELECT date('now', 'localtime', '-1 day') AS d`).get().d;

        // 我们只在汇总昨天及以前的数据，避免今天数据还没产生完就汇总
        const logs = db.prepare(`
            SELECT account_id, action, details 
            FROM operation_logs 
            WHERE date(created_at, 'localtime') = ?
        `).all(targetDate);

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

        const insertStmt = db.prepare(`
            INSERT INTO daily_statistics (account_id, date, total_exp, total_gold) 
            VALUES (@accountId, @date, @exp, @gold)
            ON CONFLICT(account_id, date) DO UPDATE SET 
                total_exp = excluded.total_exp,
                total_gold = excluded.total_gold,
                updated_at = CURRENT_TIMESTAMP
        `);

        const runTx = db.transaction((stats) => {
            let count = 0;
            for (const accountId of Object.keys(stats)) {
                insertStmt.run({
                    accountId: Number(accountId),
                    date: targetDate,
                    exp: stats[accountId].exp,
                    gold: stats[accountId].gold
                });
                count++;
            }
            return count;
        });

        const updatedCount = runTx(statsMap);
        if (updatedCount > 0) {
            logger.info(`已完成 ${updatedCount} 个账号的每日收益汇总：${targetDate}`);
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

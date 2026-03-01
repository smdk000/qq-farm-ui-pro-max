const { createScheduler } = require('../services/scheduler');
const { startLogCleanupJob } = require('./logCleanupJob');
const { startDailyStatsJob } = require('./dailyStatsJob');

function initJobs() {
    const jobScheduler = createScheduler('system-jobs');

    // 启动日志清理任务（保留最近7天记录）
    startLogCleanupJob(jobScheduler);

    // 启动每日数据汇总任务（记录每日收益数据）
    startDailyStatsJob(jobScheduler);
}

module.exports = { initJobs };

/**
 * 用户操作日志工具
 * 记录注册、续费等关键操作到日志文件
 * 支持日志轮转：单文件超过 MAX_LOG_SIZE 自动归档，保留最近 MAX_LOG_FILES 份
 */

const fs = require('fs');
const path = require('path');
const { getDataDir } = require('../config/runtime-paths');

/** 单个日志文件最大字节数（默认 2MB） */
const MAX_LOG_SIZE = 2 * 1024 * 1024;
/** 归档日志文件保留份数 */
const MAX_LOG_FILES = 5;
/** 日志文件名 */
const LOG_FILENAME = 'user-actions.log';

/**
 * 获取日志目录路径
 * @returns {string} 日志目录绝对路径
 */
function getLogsDir() {
    return path.join(getDataDir(), 'logs');
}

/**
 * 日志轮转：当日志文件超过 MAX_LOG_SIZE 时，
 * 将当前文件重命名为 .1 → .2 → … 依次推后，超过 MAX_LOG_FILES 的删除
 * @param {string} logFile - 日志文件绝对路径
 */
function rotateIfNeeded(logFile) {
    try {
        if (!fs.existsSync(logFile)) return;
        const stat = fs.statSync(logFile);
        if (stat.size < MAX_LOG_SIZE) return;

        // 删除最旧的归档（.MAX_LOG_FILES）
        const oldest = `${logFile}.${MAX_LOG_FILES}`;
        if (fs.existsSync(oldest)) {
            fs.unlinkSync(oldest);
        }

        // 依次向后推送编号 .4→.5, .3→.4, …, .1→.2
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
            const src = `${logFile}.${i}`;
            const dst = `${logFile}.${i + 1}`;
            if (fs.existsSync(src)) {
                fs.renameSync(src, dst);
            }
        }

        // 当前日志 → .1
        fs.renameSync(logFile, `${logFile}.1`);
    } catch (err) {
        // 轮转失败不阻断主流程
        console.error('[日志轮转失败]', err.message);
    }
}

/**
 * 清理超期归档日志（安全兜底，删除编号超出 MAX_LOG_FILES 的文件）
 * @param {string} logsDir - 日志目录
 */
function cleanupOldLogs(logsDir) {
    try {
        const files = fs.readdirSync(logsDir);
        for (const file of files) {
            const match = file.match(/^user-actions\.log\.(\d+)$/);
            if (match && parseInt(match[1], 10) > MAX_LOG_FILES) {
                fs.unlinkSync(path.join(logsDir, file));
            }
        }
    } catch (_) {
        // 静默忽略
    }
}

/**
 * 记录用户操作日志
 * @param {string} action - 操作类型（register/renew/login 等）
 * @param {string} username - 用户名
 * @param {object} details - 详细信息
 */
function logUserAction(action, username, details = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        username,
        details,
    };

    try {
        const logsDir = getLogsDir();
        // 确保日志目录存在
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logFile = path.join(logsDir, LOG_FILENAME);

        // 写入前检查轮转
        rotateIfNeeded(logFile);

        // 追加日志
        fs.appendFileSync(
            logFile,
            JSON.stringify(logEntry) + '\n',
            'utf8'
        );

        // 定期清理（每次写入后顺便检查一次，开销极小）
        cleanupOldLogs(logsDir);
    } catch (err) {
        // 日志写入失败不应阻断主流程，仅控制台输出
        console.error('[日志写入失败]', err.message);
    }

    console.log(`[用户操作] ${action} - ${username}`, details);
}

module.exports = {
    logUserAction,
};

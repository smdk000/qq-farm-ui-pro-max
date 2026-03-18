const { getPool } = require('./mysql-db');

function toJson(value) {
    return JSON.stringify(value === undefined ? null : value);
}

async function insertBugReport(entry = {}) {
    const pool = getPool();
    const [result] = await pool.query(
        `INSERT INTO bug_reports (
            report_no, username, account_id, account_name, category, severity, title, description,
            steps_to_reproduce, expected_result, actual_result, contact, route, page_title,
            client_context, frontend_errors, system_logs_excerpt, runtime_logs_excerpt,
            account_logs_excerpt, server_context, mail_sent, mail_status, mail_message, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            String(entry.reportNo || '').trim(),
            String(entry.username || '').trim(),
            String(entry.accountId || '').trim(),
            String(entry.accountName || '').trim(),
            String(entry.category || 'other').trim(),
            String(entry.severity || 'medium').trim(),
            String(entry.title || '').trim(),
            String(entry.description || '').trim(),
            String(entry.stepsToReproduce || '').trim(),
            String(entry.expectedResult || '').trim(),
            String(entry.actualResult || '').trim(),
            String(entry.contact || '').trim(),
            String(entry.route || '').trim(),
            String(entry.pageTitle || '').trim(),
            toJson(entry.clientContext),
            toJson(entry.frontendErrors),
            toJson(entry.systemLogsExcerpt),
            toJson(entry.runtimeLogsExcerpt),
            toJson(entry.accountLogsExcerpt),
            toJson(entry.serverContext),
            entry.mailSent ? 1 : 0,
            String(entry.mailStatus || '').trim(),
            String(entry.mailMessage || '').trim().slice(0, 500),
            entry.sentAt || null,
        ],
    );

    return {
        id: Number(result && result.insertId) || 0,
        reportNo: String(entry.reportNo || '').trim(),
    };
}

async function updateBugReportMailStatus(id, payload = {}) {
    const bugReportId = Number(id) || 0;
    if (bugReportId <= 0) {
        return false;
    }

    const pool = getPool();
    const [result] = await pool.query(
        `UPDATE bug_reports
         SET mail_sent = ?, mail_status = ?, mail_message = ?, sent_at = ?
         WHERE id = ?`,
        [
            payload.mailSent ? 1 : 0,
            String(payload.mailStatus || '').trim(),
            String(payload.mailMessage || '').trim().slice(0, 500),
            payload.sentAt || null,
            bugReportId,
        ],
    );
    return Number(result && result.affectedRows) > 0;
}

async function findRecentUserReports(username = '', cooldownSeconds = 0) {
    const normalizedUsername = String(username || '').trim();
    const seconds = Math.max(0, Number.parseInt(cooldownSeconds, 10) || 0);
    if (!normalizedUsername || seconds <= 0) {
        return [];
    }

    const pool = getPool();
    const since = new Date(Date.now() - seconds * 1000);
    const [rows] = await pool.query(
        `SELECT id, report_no, created_at
         FROM bug_reports
         WHERE username = ? AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 5`,
        [normalizedUsername, since],
    );
    return Array.isArray(rows) ? rows : [];
}

module.exports = {
    insertBugReport,
    updateBugReportMailStatus,
    findRecentUserReports,
};

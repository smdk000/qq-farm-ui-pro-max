function normalizeString(value) {
    return String(value || '').trim();
}

async function resolveVisibleAccountIds(currentUser, getAccountsSnapshot) {
    if (!currentUser || currentUser.role === 'admin') {
        return null;
    }
    const snapshot = await getAccountsSnapshot();
    const accounts = Array.isArray(snapshot && snapshot.accounts) ? snapshot.accounts : [];
    return accounts
        .filter(item => String(item && item.username || '').trim() === String(currentUser.username || '').trim())
        .map(item => String(item && item.id || '').trim())
        .filter(Boolean);
}

async function querySystemLogsForUser({
    getPool,
    currentUser,
    getAccountsSnapshot,
    page = 1,
    limit = 50,
    level = '',
    levels = [],
    accountId = '',
    keyword = '',
}) {
    const pool = typeof getPool === 'function' ? getPool() : getPool;
    const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const normalizedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
    const offset = (normalizedPage - 1) * normalizedLimit;
    const normalizedAccountId = normalizeString(accountId);
    const normalizedKeyword = normalizeString(keyword);
    const normalizedLevel = normalizeString(level).toLowerCase();
    const normalizedLevels = Array.isArray(levels)
        ? levels.map(item => normalizeString(item).toLowerCase()).filter(Boolean)
        : [];
    const effectiveLevels = normalizedLevels.length > 0
        ? normalizedLevels
        : (normalizedLevel ? [normalizedLevel] : []);

    let querySql = 'SELECT * FROM system_logs WHERE 1=1';
    let countSql = 'SELECT COUNT(*) AS total FROM system_logs WHERE 1=1';
    const params = [];

    const visibleAccountIds = await resolveVisibleAccountIds(currentUser, getAccountsSnapshot);
    if (Array.isArray(visibleAccountIds)) {
        if (visibleAccountIds.length === 0) {
            return { total: 0, page: normalizedPage, limit: normalizedLimit, items: [] };
        }
        if (normalizedAccountId && !visibleAccountIds.includes(normalizedAccountId)) {
            return { total: 0, page: normalizedPage, limit: normalizedLimit, items: [] };
        }
        const placeholders = visibleAccountIds.map(() => '?').join(',');
        querySql += ` AND account_id IN (${placeholders})`;
        countSql += ` AND account_id IN (${placeholders})`;
        params.push(...visibleAccountIds);
    }

    if (effectiveLevels.length === 1) {
        querySql += ' AND level = ?';
        countSql += ' AND level = ?';
        params.push(effectiveLevels[0]);
    } else if (effectiveLevels.length > 1) {
        const placeholders = effectiveLevels.map(() => '?').join(',');
        querySql += ` AND level IN (${placeholders})`;
        countSql += ` AND level IN (${placeholders})`;
        params.push(...effectiveLevels);
    }

    if (normalizedAccountId) {
        querySql += ' AND account_id = ?';
        countSql += ' AND account_id = ?';
        params.push(normalizedAccountId);
    }

    if (normalizedKeyword) {
        querySql += ' AND text LIKE ?';
        countSql += ' AND text LIKE ?';
        params.push(`%${normalizedKeyword}%`);
    }

    querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, normalizedLimit, offset];
    const [countRows] = await pool.query(countSql, params);
    const [rows] = await pool.query(querySql, queryParams);

    return {
        total: Number(countRows && countRows[0] && countRows[0].total) || 0,
        page: normalizedPage,
        limit: normalizedLimit,
        items: Array.isArray(rows) ? rows : [],
    };
}

module.exports = {
    querySystemLogsForUser,
    resolveVisibleAccountIds,
};

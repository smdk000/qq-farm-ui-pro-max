const { initMysql, closeMysql, getPool, isMysqlInitialized } = require('./mysql-db');
const { initRedis, closeRedis, getRedisClient } = require('./redis-cache');
const { cacheCircuitBreaker } = require('./circuit-breaker');
const { createModuleLogger } = require('./logger');
const { initJwtSecretPersistence } = require('./jwt-service');
const { parseJsonSafely } = require('./system-update-utils');

const logger = createModuleLogger('database');
const EMPTY_ACCOUNT_UIN_DB_PREFIX = '__ACCOUNT_ID__:';
const FRIENDS_CACHE_SCOPE_MEMO_TTL_MS = 60 * 1000;
const FRIENDS_CACHE_TTL_SEC = 86400 * 3;

let initPromise = null;
let logFlushHandle = null;
const friendsCacheScopeMemo = new Map();

function startLogFlushLoop() {
    if (logFlushHandle) {
        return logFlushHandle;
    }

    logFlushHandle = setInterval(() => {
        flushLogBatch().catch(() => { });
    }, 3000);
    if (logFlushHandle && typeof logFlushHandle.unref === 'function') {
        logFlushHandle.unref();
    }
    return logFlushHandle;
}

function stopLogFlushLoop() {
    if (!logFlushHandle) {
        return;
    }
    clearInterval(logFlushHandle);
    logFlushHandle = null;
}

async function initDatabase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            startLogFlushLoop();
            await initMysql();
            logger.info('MySQL initialized');
            await initJwtSecretPersistence();
            logger.info('JWT secret initialized');
            try {
                const redisReady = await initRedis();
                if (redisReady) {
                    logger.info('Redis initialized');
                } else {
                    logger.warn('Redis unavailable, continuing in degraded mode');
                }
            } catch (rErr) {
                // Redis 初始化失败：熔断器已在 initRedis 内部自动切换到 OPEN 状态
                logger.error('⚠️ Redis 初始化失败，已启动熔断保护模式。Worker 重度查询将被降级处理。', rErr.message);
            }
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    })();
    return initPromise;
}

function getDb() {
    return getPool();
}

async function closeDatabase() {
    const errors = [];

    stopLogFlushLoop();

    try {
        await flushLogBatch();
    } catch (error) {
        errors.push(error);
    }

    try {
        await closeRedis();
    } catch (error) {
        errors.push(error);
    }

    try {
        if (isMysqlInitialized()) {
            await closeMysql();
        }
    } catch (error) {
        errors.push(error);
    }

    initPromise = null;

    if (errors.length > 0) {
        throw errors[0];
    }
}

async function transaction(fn, retries = 1) {
    const pool = getPool();
    let connection;
    try {
        connection = await pool.getConnection();
    } catch (err) {
        if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT')) {
            logger.warn(`[database] 获取事务连接抛出 ${err.code}，尝试重试 (剩余: ${retries})`);
            return transaction(fn, retries - 1);
        }
        throw err;
    }

    await connection.beginTransaction();
    try {
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        await connection.rollback();
        // 如果在事务查询中依然遇到断链，同样消耗重试并重新发配
        if (retries > 0 && (e.code === 'ECONNRESET' || e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'ETIMEDOUT')) {
            logger.warn(`[database] 事务执行中抛出断链 ${e.code}，回滚并尝试整体重试 (剩余: ${retries})`);
            connection.release(); // 先释放坏链
            return transaction(fn, retries - 1);
        }
        throw e;
    } finally {
        if (connection && connection.release) {
            try { connection.release(); } catch { }
        }
    }
}

// For operations logs:
const logBatch = [];

async function flushLogBatch() {
    if (logBatch.length === 0) return;
    const batch = logBatch.splice(0, logBatch.length);
    try {
        const pool = getPool();
        const values = batch.map(b => [b.accountId, b.action, b.result, b.details]);
        // mysql2/promise `query` handles `[[]]` as batch insert if statement is string: `VALUES ?`
        await pool.query('INSERT INTO operation_logs (account_id, action, result, details, created_at) VALUES ?', [values]);
    } catch (e) {
        logger.error('Batch inserts failed:', e.message);
    }
}

function bufferedInsertLog(accountId, action, result, details) {
    startLogFlushLoop();
    logBatch.push({
        accountId, action, result,
        details: typeof details === 'string' ? details : JSON.stringify(details || {})
    });
    // 阈值从 200 降到 100，避免单次批量 INSERT 过大
    if (logBatch.length >= 100) {
        flushLogBatch().catch(() => { });
    }
}

function normalizeFriendCacheEntry(friend) {
    const gid = Number(friend && friend.gid);
    if (!Number.isFinite(gid) || gid <= 0) return null;
    const rawUin = String((friend && friend.uin) || '').trim();
    const rawOpenId = String((friend && (friend.openId || friend.open_id)) || '').trim();
    const gidText = String(gid);
    let normalizedUin = rawUin === gidText ? '' : rawUin;
    let normalizedOpenId = rawOpenId === gidText ? '' : rawOpenId;

    // Legacy QQ cache/runtime paths may store openId-like tokens in `uin`.
    // A real QQ uin is numeric; move non-numeric identifiers back into openId.
    if (normalizedUin && !/^\d+$/.test(normalizedUin)) {
        if (!normalizedOpenId) normalizedOpenId = normalizedUin;
        normalizedUin = '';
    }

    return {
        gid,
        uin: normalizedUin,
        openId: normalizedOpenId,
        name: String((friend && (friend.name || friend.remark)) || '').trim(),
        avatarUrl: String((friend && (friend.avatarUrl || friend.avatar_url)) || '').trim(),
    };
}

function isGenericFriendName(name, gid) {
    const text = String(name || '').trim();
    return !text || text === `GID:${gid}`;
}

function mergeFriendCacheEntries(currentList = [], incomingList = []) {
    const merged = new Map();

    for (const item of currentList) {
        const normalized = normalizeFriendCacheEntry(item);
        if (!normalized) continue;
        merged.set(normalized.gid, {
            gid: normalized.gid,
            uin: normalized.uin,
            openId: normalized.openId,
            name: normalized.name || `GID:${normalized.gid}`,
            avatarUrl: normalized.avatarUrl,
        });
    }

    for (const item of incomingList) {
        const normalized = normalizeFriendCacheEntry(item);
        if (!normalized) continue;
        const prev = merged.get(normalized.gid) || {
            gid: normalized.gid,
            uin: '',
            openId: '',
            name: `GID:${normalized.gid}`,
            avatarUrl: '',
        };

        const nextName = !isGenericFriendName(normalized.name, normalized.gid)
            ? normalized.name
            : (!isGenericFriendName(prev.name, normalized.gid) ? prev.name : `GID:${normalized.gid}`);

        merged.set(normalized.gid, {
            gid: normalized.gid,
            uin: normalized.uin || prev.uin,
            openId: normalized.openId || prev.openId,
            name: nextName,
            avatarUrl: normalized.avatarUrl || prev.avatarUrl,
        });
    }

    return Array.from(merged.values())
        .sort((a, b) => Number(a.gid || 0) - Number(b.gid || 0));
}

function normalizeFriendCachePlatform(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    return text.startsWith('wx') ? 'wx' : 'qq';
}

function normalizeNumericIdentity(value) {
    const text = String(value || '').trim();
    return /^\d+$/.test(text) ? text : '';
}

function normalizeTextIdentity(value) {
    return String(value || '').trim();
}

function buildFriendsCacheIdentity(source = {}) {
    const normalizedSource = (source && typeof source === 'object') ? source : {};
    const platform = normalizeFriendCachePlatform(normalizedSource.platform);
    if (!platform) return null;

    const rawUin = normalizeTextIdentity(normalizedSource.uin);
    const rawQq = normalizeNumericIdentity(normalizedSource.qq || normalizedSource.selfQq);
    const rawOpenId = normalizeTextIdentity(normalizedSource.openId || normalizedSource.open_id);

    if (platform === 'qq') {
        const qq = rawQq || normalizeNumericIdentity(rawUin);
        const openId = rawOpenId || (!qq ? rawUin : '');
        if (!qq && !openId) return null;
        return {
            platform,
            uin: qq,
            qq,
            openId,
            identityType: qq ? 'qq' : 'openid',
            identityValue: qq || openId,
        };
    }

    const uin = rawUin || rawOpenId;
    const openId = rawOpenId;
    if (!uin && !openId) return null;
    return {
        platform,
        uin,
        qq: '',
        openId,
        identityType: uin ? 'uin' : 'openid',
        identityValue: uin || openId,
    };
}

function buildFriendsCacheLegacyKey(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    return normalizedAccountId ? `account:${normalizedAccountId}:friends_cache` : '';
}

function buildFriendsCacheScopeKey(identity) {
    const normalizedIdentity = buildFriendsCacheIdentity(identity);
    if (!normalizedIdentity || !normalizedIdentity.identityValue) return '';
    return `friends_scope:${normalizedIdentity.platform}:${normalizedIdentity.identityType}:${encodeURIComponent(normalizedIdentity.identityValue)}:friends_cache`;
}

function buildFriendsCacheMetaKey(key) {
    const normalizedKey = String(key || '').trim();
    return normalizedKey ? `${normalizedKey}:meta` : '';
}

function normalizeFriendsCacheScopeRecord(accountId, identity = null) {
    const normalizedAccountId = String(accountId || '').trim();
    const normalizedIdentity = buildFriendsCacheIdentity(identity);
    const legacyKey = buildFriendsCacheLegacyKey(normalizedAccountId);
    const scopeKey = buildFriendsCacheScopeKey(normalizedIdentity);
    const readKeys = [];
    if (scopeKey) readKeys.push(scopeKey);
    if (legacyKey && legacyKey !== scopeKey) readKeys.push(legacyKey);
    const writeKeys = [];
    if (scopeKey) writeKeys.push(scopeKey);
    if (legacyKey && legacyKey !== scopeKey) writeKeys.push(legacyKey);
    return {
        accountId: normalizedAccountId,
        identity: normalizedIdentity,
        legacyKey,
        scopeKey,
        readKeys,
        writeKeys,
    };
}

function detectFriendsCacheScopeFromKey(key, scope = null) {
    const normalizedKey = String(key || '').trim();
    const normalizedScope = (scope && typeof scope === 'object') ? scope : {};
    if (!normalizedKey) return '';
    if (normalizedScope.scopeKey && normalizedKey === String(normalizedScope.scopeKey || '').trim()) {
        return 'identity';
    }
    if (normalizedScope.legacyKey && normalizedKey === String(normalizedScope.legacyKey || '').trim()) {
        return 'legacy';
    }
    return '';
}

function normalizeFriendsCacheMetaRecord(record = {}, defaults = {}) {
    const normalizedRecord = (record && typeof record === 'object') ? record : {};
    const normalizedDefaults = (defaults && typeof defaults === 'object') ? defaults : {};
    const updatedAtValue = Object.prototype.hasOwnProperty.call(normalizedRecord, 'updatedAt')
        ? normalizedRecord.updatedAt
        : (Object.prototype.hasOwnProperty.call(normalizedRecord, 'updated_at')
            ? normalizedRecord.updated_at
            : normalizedDefaults.updatedAt);
    const entryCountValue = Object.prototype.hasOwnProperty.call(normalizedRecord, 'entryCount')
        ? normalizedRecord.entryCount
        : (Object.prototype.hasOwnProperty.call(normalizedRecord, 'entry_count')
            ? normalizedRecord.entry_count
            : normalizedDefaults.entryCount);
    const seededCountValue = Object.prototype.hasOwnProperty.call(normalizedRecord, 'seededCount')
        ? normalizedRecord.seededCount
        : (Object.prototype.hasOwnProperty.call(normalizedRecord, 'seeded_count')
            ? normalizedRecord.seeded_count
            : normalizedDefaults.seededCount);

    return {
        updatedAt: Math.max(0, Number(updatedAtValue || 0)),
        entryCount: Math.max(0, Number(entryCountValue || 0)),
        seededCount: Math.max(0, Number(seededCountValue || 0)),
        cacheScope: String(normalizedRecord.cacheScope || normalizedRecord.cache_scope || normalizedDefaults.cacheScope || '').trim(),
        cacheSource: String(normalizedRecord.cacheSource || normalizedRecord.cache_source || normalizedDefaults.cacheSource || '').trim(),
        identityType: String(normalizedRecord.identityType || normalizedRecord.identity_type || normalizedDefaults.identityType || '').trim(),
        platform: normalizeFriendCachePlatform(normalizedRecord.platform || normalizedDefaults.platform || ''),
    };
}

function buildFriendsCacheMetaPayload(key, scope = null, options = {}, entryCount = 0) {
    const normalizedOptions = (options && typeof options === 'object') ? options : {};
    const normalizedScope = (scope && typeof scope === 'object') ? scope : {};
    const hasExplicitUpdatedAt = Object.prototype.hasOwnProperty.call(normalizedOptions, 'updatedAt');
    const updatedAt = hasExplicitUpdatedAt
        ? normalizedOptions.updatedAt
        : Date.now();
    return normalizeFriendsCacheMetaRecord({
        updatedAt,
        entryCount,
        seededCount: normalizedOptions.seededCount,
        cacheScope: detectFriendsCacheScopeFromKey(key, normalizedScope),
        cacheSource: normalizedOptions.cacheSource,
        identityType: normalizedScope.identity && normalizedScope.identity.identityType,
        platform: (normalizedScope.identity && normalizedScope.identity.platform) || normalizedOptions.platform,
    });
}

function buildEmptyFriendsCacheDetails(scope = null) {
    const normalizedScope = (scope && typeof scope === 'object') ? scope : {};
    return {
        found: false,
        key: '',
        metaKey: '',
        friends: [],
        updatedAt: 0,
        entryCount: 0,
        seededCount: 0,
        cacheScope: '',
        cacheSource: '',
        identityType: String(normalizedScope.identity && normalizedScope.identity.identityType || '').trim(),
        platform: normalizeFriendCachePlatform(normalizedScope.identity && normalizedScope.identity.platform || ''),
    };
}

function buildFriendsCacheDetails(key, friendsList, meta = {}, scope = null) {
    const normalizedFriends = mergeFriendCacheEntries([], Array.isArray(friendsList) ? friendsList : []);
    const normalizedScope = (scope && typeof scope === 'object') ? scope : {};
    const normalizedMeta = normalizeFriendsCacheMetaRecord(meta, {
        entryCount: normalizedFriends.length,
        cacheScope: detectFriendsCacheScopeFromKey(key, normalizedScope),
        identityType: normalizedScope.identity && normalizedScope.identity.identityType,
        platform: normalizedScope.identity && normalizedScope.identity.platform,
    });
    return {
        found: normalizedFriends.length > 0,
        key: String(key || '').trim(),
        metaKey: buildFriendsCacheMetaKey(key),
        friends: normalizedFriends,
        updatedAt: normalizedMeta.updatedAt,
        entryCount: normalizedMeta.entryCount,
        seededCount: normalizedMeta.seededCount,
        cacheScope: normalizedMeta.cacheScope,
        cacheSource: normalizedMeta.cacheSource,
        identityType: normalizedMeta.identityType,
        platform: normalizedMeta.platform,
    };
}

function extractAccountIdFromFriendsCacheKey(key) {
    const match = String(key || '').match(/^account:(.+):friends_cache$/);
    return match ? String(match[1] || '').trim() : '';
}

function decodePlaceholderAccountUin(value) {
    const normalized = String(value || '').trim();
    if (!normalized.startsWith(EMPTY_ACCOUNT_UIN_DB_PREFIX)) {
        return normalized;
    }
    return '';
}

function parseJsonObject(raw) {
    if (!raw || typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function getFriendsCacheScopeMemo(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) return null;
    const cached = friendsCacheScopeMemo.get(normalizedAccountId);
    if (!cached) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > FRIENDS_CACHE_SCOPE_MEMO_TTL_MS) {
        friendsCacheScopeMemo.delete(normalizedAccountId);
        return null;
    }
    return cached;
}

function rememberFriendsCacheScope(accountId, identity = null) {
    const normalizedAccountId = String(accountId || '').trim();
    const normalizedIdentity = buildFriendsCacheIdentity(identity);
    if (!normalizedAccountId || !normalizedIdentity) return null;
    const scope = {
        accountId: normalizedAccountId,
        ...normalizedIdentity,
        cachedAt: Date.now(),
    };
    friendsCacheScopeMemo.set(normalizedAccountId, scope);
    return scope;
}

async function loadAccountIdentityForFriendsCache(accountId) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId || !isMysqlInitialized()) {
        return null;
    }

    try {
        const pool = getPool();
        if (!pool || typeof pool.query !== 'function') return null;
        const [rows] = await pool.query(
            'SELECT id, uin, open_id, platform, auth_data FROM accounts WHERE id = ? LIMIT 1',
            [normalizedAccountId],
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return null;
        const authData = parseJsonObject(row && row.auth_data);
        return buildFriendsCacheIdentity({
            platform: row && row.platform,
            uin: decodePlaceholderAccountUin(row && row.uin) || authData.uin || '',
            qq: authData.qq || '',
            openId: (row && row.open_id) || authData.openId || '',
        });
    } catch (error) {
        logger.error(`load account identity for friends cache failed: ${error.message}`);
        return null;
    }
}

async function resolveFriendsCacheScope(accountId, options = {}) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return normalizeFriendsCacheScopeRecord('', null);
    }

    const source = (options && typeof options === 'object') ? options : {};
    const explicitIdentity = buildFriendsCacheIdentity({
        platform: source.platform || (source.account && source.account.platform) || (source.userState && source.userState.platform),
        uin: source.uin || source.selfUin || (source.account && source.account.uin) || (source.userState && source.userState.uin),
        qq: source.qq || source.selfQq || (source.account && source.account.qq),
        openId: source.openId
            || source.open_id
            || (source.account && (source.account.openId || source.account.open_id))
            || (source.userState && (source.userState.openId || source.userState.open_id)),
    });
    if (explicitIdentity) {
        rememberFriendsCacheScope(normalizedAccountId, explicitIdentity);
        return normalizeFriendsCacheScopeRecord(normalizedAccountId, explicitIdentity);
    }

    const memoized = getFriendsCacheScopeMemo(normalizedAccountId);
    if (memoized) {
        return normalizeFriendsCacheScopeRecord(normalizedAccountId, memoized);
    }

    const loadedIdentity = await loadAccountIdentityForFriendsCache(normalizedAccountId);
    if (loadedIdentity) {
        rememberFriendsCacheScope(normalizedAccountId, loadedIdentity);
    }
    return normalizeFriendsCacheScopeRecord(normalizedAccountId, loadedIdentity);
}

async function readFriendsCacheKey(redis, key) {
    if (!redis || typeof redis.get !== 'function' || !key) {
        return {
            found: false,
            raw: '',
            normalized: [],
        };
    }

    const raw = await redis.get(key);
    if (!raw) {
        return {
            found: false,
            raw: '',
            normalized: [],
        };
    }

    const parsed = parseJsonSafely(raw, []);
    return {
        found: true,
        raw,
        normalized: mergeFriendCacheEntries([], Array.isArray(parsed) ? parsed : []),
    };
}

async function readFriendsCacheMetaKey(redis, key, defaults = {}) {
    if (!redis || typeof redis.get !== 'function') {
        return normalizeFriendsCacheMetaRecord({}, defaults);
    }

    const metaKey = buildFriendsCacheMetaKey(key);
    if (!metaKey) {
        return normalizeFriendsCacheMetaRecord({}, defaults);
    }

    const raw = await redis.get(metaKey);
    if (!raw) {
        return normalizeFriendsCacheMetaRecord({}, defaults);
    }

    return normalizeFriendsCacheMetaRecord(parseJsonSafely(raw, {}), defaults);
}

async function readFriendsCacheDetailsByKey(redis, key, scope = null) {
    const cache = await readFriendsCacheKey(redis, key);
    if (!cache.found) {
        return {
            found: false,
            raw: '',
            details: buildEmptyFriendsCacheDetails(scope),
        };
    }

    const cacheMeta = await readFriendsCacheMetaKey(redis, key, {
        entryCount: cache.normalized.length,
        cacheScope: detectFriendsCacheScopeFromKey(key, scope),
        identityType: scope && scope.identity && scope.identity.identityType,
        platform: scope && scope.identity && scope.identity.platform,
    });

    return {
        found: true,
        raw: cache.raw,
        details: buildFriendsCacheDetails(key, cache.normalized, cacheMeta, scope),
    };
}

async function syncFriendsCacheKeys(redis, keys, friendsList, options = {}) {
    if (!redis || typeof redis.set !== 'function') return;
    const normalizedFriends = mergeFriendCacheEntries([], friendsList);
    const payload = JSON.stringify(normalizedFriends);
    const normalizedOptions = (options && typeof options === 'object') ? options : {};
    const scope = normalizedOptions.scope && typeof normalizedOptions.scope === 'object'
        ? normalizedOptions.scope
        : null;
    await Promise.all(
        (Array.isArray(keys) ? keys : [])
            .filter(Boolean)
            .map(async (key) => {
                const metaPayload = buildFriendsCacheMetaPayload(key, scope, normalizedOptions, normalizedFriends.length);
                const metaKey = buildFriendsCacheMetaKey(key);
                await redis.set(key, payload, 'EX', FRIENDS_CACHE_TTL_SEC);
                if (metaKey) {
                    await redis.set(metaKey, JSON.stringify(metaPayload), 'EX', FRIENDS_CACHE_TTL_SEC);
                }
            })
    );
    return normalizedFriends;
}

async function findRelatedAccountIdsForFriendsCache(accountId, options = {}) {
    const normalizedAccountId = String(accountId || '').trim();
    const platform = String(options.platform || '').trim();
    const selfName = String(options.selfName || '').trim();
    const identityRefs = new Set(
        [options.selfUin, options.selfQq]
            .map(value => String(value || '').trim())
            .filter(Boolean)
    );

    if (!normalizedAccountId || !platform || (!selfName && identityRefs.size === 0)) {
        return [];
    }
    if (!isMysqlInitialized()) {
        return [];
    }

    try {
        const pool = getPool();
        if (!pool || typeof pool.query !== 'function') return [];

        const [rows] = await pool.query(
            'SELECT id, uin, nick, name, platform, auth_data, last_login_at, updated_at FROM accounts WHERE id <> ? AND platform = ?',
            [normalizedAccountId, platform]
        );

        return (Array.isArray(rows) ? rows : [])
            .map((row) => {
                const authData = parseJsonObject(row && row.auth_data);
                return {
                    accountId: String(row && row.id || '').trim(),
                    uin: decodePlaceholderAccountUin(row && row.uin),
                    qq: String(authData.qq || '').trim(),
                    authUin: String(authData.uin || '').trim(),
                    name: String(row && row.name || '').trim(),
                    nick: String(row && row.nick || '').trim(),
                    lastLoginAt: row && row.last_login_at ? new Date(row.last_login_at).getTime() : 0,
                    updatedAt: row && row.updated_at ? new Date(row.updated_at).getTime() : 0,
                };
            })
            .filter((row) => {
                if (!row.accountId) return false;
                if (identityRefs.size > 0) {
                    if (identityRefs.has(row.uin) || identityRefs.has(row.qq) || identityRefs.has(row.authUin)) {
                        return true;
                    }
                }
                if (!selfName) return false;
                return row.name === selfName || row.nick === selfName;
            })
            .sort((a, b) => (b.lastLoginAt - a.lastLoginAt) || (b.updatedAt - a.updatedAt))
            .map(row => row.accountId);
    } catch (e) {
        logger.error(`find related account ids for friends cache failed: ${e.message}`);
        return [];
    }
}

function scoreReusableFriendsCache(friendsList = [], options = {}) {
    const selfGid = Number(options.selfGid) || 0;
    const selfName = String(options.selfName || '').trim();

    if (selfGid > 0) {
        return friendsList.some(item => Number(item && item.gid) === selfGid) ? 100 : 0;
    }
    if (selfName) {
        return friendsList.some(item => String(item && item.name || '').trim() === selfName) ? 10 : 0;
    }
    return 0;
}

async function writeFriendsCache(accountId, friendsList, options = {}) {
    const redis = getRedisClient();
    if (!redis) return null;
    const mapped = mergeFriendCacheEntries([], friendsList);
    if (!mapped.length) return null;
    const scope = await resolveFriendsCacheScope(accountId, options);
    const writeKeys = Array.isArray(scope.writeKeys) && scope.writeKeys.length > 0
        ? scope.writeKeys
        : [buildFriendsCacheLegacyKey(accountId)];
    await syncFriendsCacheKeys(redis, writeKeys, mapped, {
        ...options,
        scope,
    });
    const preferredKey = String(scope.scopeKey || writeKeys[0] || '').trim();
    const preferredMeta = buildFriendsCacheMetaPayload(preferredKey, scope, options, mapped.length);
    return buildFriendsCacheDetails(preferredKey, mapped, preferredMeta, scope);
}

async function updateFriendsCache(accountId, friendsList, options = {}) {
    try {
        return await writeFriendsCache(accountId, friendsList, options); // 3 days Cache
    } catch (e) {
        logger.error(`save friends cache failed: ${e.message}`);
        return null;
    }
}

async function mergeFriendsCache(accountId, friendsList, options = {}) {
    try {
        const normalizedAccountId = String(accountId || '').trim();
        if (!normalizedAccountId) return;
        const incoming = mergeFriendCacheEntries([], friendsList);
        if (!incoming.length) return;
        const current = await getCachedFriends(normalizedAccountId, options);
        const merged = mergeFriendCacheEntries(current, incoming);
        return await writeFriendsCache(normalizedAccountId, merged, options);
    } catch (e) {
        logger.error(`merge friends cache failed: ${e.message}`);
        return null;
    }
}

async function getCachedFriendsDetails(accountId, options = {}) {
    // 熔断器检查：Redis 不可用时直接返回空数组，防止回源 MySQL 造成雪崩
    if (!cacheCircuitBreaker.isAvailable()) {
        logger.warn(`Redis 熔断中，跳过好友缓存查询 (account: ${accountId})`);
        return buildEmptyFriendsCacheDetails();
    }
    try {
        const redis = getRedisClient();
        if (!redis) return buildEmptyFriendsCacheDetails();

        const scope = await resolveFriendsCacheScope(accountId, options);
        const readKeys = Array.isArray(scope.readKeys) && scope.readKeys.length > 0
            ? scope.readKeys
            : [buildFriendsCacheLegacyKey(accountId)];

        for (const key of readKeys) {
            const { found, raw, details } = await readFriendsCacheDetailsByKey(redis, key, scope);
            if (!found) continue;
            cacheCircuitBreaker.recordSuccess();
            if (details.friends.length > 0) {
                const normalizedText = JSON.stringify(details.friends);
                const hitScopedKey = !!(scope.scopeKey && key === scope.scopeKey);
                const hasAliasKeys = readKeys.some(candidate => candidate && candidate !== key);
                if (normalizedText !== raw) {
                    const normalizeKeys = hitScopedKey
                        ? scope.writeKeys
                        : [key];
                    syncFriendsCacheKeys(redis, normalizeKeys, details.friends, {
                        scope,
                        updatedAt: details.updatedAt,
                        cacheSource: details.cacheSource,
                        seededCount: details.seededCount,
                    }).catch(() => { });
                } else if (hitScopedKey && hasAliasKeys) {
                    syncFriendsCacheKeys(redis, scope.writeKeys, details.friends, {
                        scope,
                        updatedAt: details.updatedAt,
                        cacheSource: details.cacheSource,
                        seededCount: details.seededCount,
                    }).catch(() => { });
                }
            }
            return details;
        }
        cacheCircuitBreaker.recordSuccess();
        return buildEmptyFriendsCacheDetails(scope);
    } catch (e) {
        cacheCircuitBreaker.recordFailure();
        logger.error(`get friends cache failed: ${e.message}`);
        return buildEmptyFriendsCacheDetails();
    }
}

async function getCachedFriends(accountId, options = {}) {
    const details = await getCachedFriendsDetails(accountId, options);
    return Array.isArray(details && details.friends) ? details.friends : [];
}

async function findReusableFriendsCache(accountId, options = {}) {
    if (!cacheCircuitBreaker.isAvailable()) {
        logger.warn(`Redis 熔断中，跳过共享好友缓存查询 (account: ${accountId})`);
        return null;
    }

    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return null;
    }

    try {
        const scope = await resolveFriendsCacheScope(normalizedAccountId, options);
        if (!scope.scopeKey) return null;
        const redis = getRedisClient();
        if (!redis) return null;
        const { normalized } = await readFriendsCacheKey(redis, scope.scopeKey);
        cacheCircuitBreaker.recordSuccess();
        if (!Array.isArray(normalized) || normalized.length === 0) {
            return null;
        }
        return {
            sourceAccountId: '',
            friends: normalized,
        };
    } catch (e) {
        cacheCircuitBreaker.recordFailure();
        logger.error(`find reusable friends cache failed: ${e.message}`);
        return null;
    }
}

async function findFriendInSharedCaches(friendGid, options = {}) {
    if (!cacheCircuitBreaker.isAvailable()) {
        logger.warn(`Redis 熔断中，跳过共享好友昵称查询 (gid: ${friendGid})`);
        return null;
    }

    const numericGid = Number(friendGid) || 0;
    if (numericGid <= 0) {
        return null;
    }

    try {
        const preferredAccountId = String(options.accountId || '').trim();
        if (!preferredAccountId) return null;
        const friends = await getCachedFriends(preferredAccountId, options);
        cacheCircuitBreaker.recordSuccess();
        const matched = (Array.isArray(friends) ? friends : [])
            .find(item => Number(item && item.gid) === numericGid) || null;
        if (!matched || isGenericFriendName(matched.name, numericGid)) {
            return null;
        }
        return {
            sourceAccountId: '',
            friend: matched,
        };
    } catch (e) {
        cacheCircuitBreaker.recordFailure();
        logger.error(`find friend in shared caches failed: ${e.message}`);
        return null;
    }
}

async function clearFriendsCache(accountId, options = {}) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return {
            ok: false,
            deletedCount: 0,
            keys: [],
            metaKeys: [],
            scopeKey: '',
            legacyKey: '',
            reason: 'missing_account_id',
        };
    }

    if (!cacheCircuitBreaker.isAvailable()) {
        logger.warn(`Redis 熔断中，跳过好友缓存清理 (account: ${accountId})`);
        return {
            ok: false,
            deletedCount: 0,
            keys: [],
            metaKeys: [],
            scopeKey: '',
            legacyKey: buildFriendsCacheLegacyKey(normalizedAccountId),
            reason: 'circuit_open',
        };
    }

    try {
        const redis = getRedisClient();
        if (!redis || typeof redis.del !== 'function') {
            return {
                ok: false,
                deletedCount: 0,
                keys: [],
                metaKeys: [],
                scopeKey: '',
                legacyKey: buildFriendsCacheLegacyKey(normalizedAccountId),
                reason: 'redis_unavailable',
            };
        }

        const scope = await resolveFriendsCacheScope(normalizedAccountId, options);
        const keys = Array.from(new Set(
            []
                .concat(Array.isArray(scope.writeKeys) ? scope.writeKeys : [])
                .concat(buildFriendsCacheLegacyKey(normalizedAccountId))
                .filter(Boolean)
        ));
        const metaKeys = Array.from(new Set(keys.map(buildFriendsCacheMetaKey).filter(Boolean)));
        const deleteKeys = Array.from(new Set([].concat(keys).concat(metaKeys)));

        let deletedCount = 0;
        if (deleteKeys.length > 0) {
            deletedCount = Number(await redis.del(...deleteKeys)) || 0;
        }
        friendsCacheScopeMemo.delete(normalizedAccountId);
        cacheCircuitBreaker.recordSuccess();
        return {
            ok: true,
            deletedCount,
            keys,
            metaKeys,
            scopeKey: String(scope.scopeKey || ''),
            legacyKey: String(scope.legacyKey || ''),
        };
    } catch (e) {
        cacheCircuitBreaker.recordFailure();
        logger.error(`clear friends cache failed: ${e.message}`);
        return {
            ok: false,
            deletedCount: 0,
            keys: [],
            metaKeys: [],
            scopeKey: '',
            legacyKey: buildFriendsCacheLegacyKey(normalizedAccountId),
            reason: 'error',
            error: e.message,
        };
    }
}

/**
 * 检查 Redis 缓存是否可用（供 Worker 层查询）
 */
function isRedisCacheAvailable() {
    return cacheCircuitBreaker.isAvailable();
}

// ============ 公告管理 (支持多版本历史) ============
const ANNOUNCEMENT_CACHE_KEY = 'announcements:list';
const ANNOUNCEMENT_CACHE_TTL = 300; // 5 分钟

async function getAnnouncements() {
    try {
        const redis = getRedisClient();
        if (redis) {
            const cached = await redis.get(ANNOUNCEMENT_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) {
        logger.warn(`公告 Redis 缓存读取失败: ${e.message}`);
    }

    const pool = getPool();
    try {
        // 按照 ID 倒序排列获取所有有效和非有效公告
        const [rows] = await pool.execute(
            `SELECT
                id, title, version, publish_date, summary, content, enabled,
                source_type, source_key, release_url, assets_json,
                installed_version, installed_at, created_by, created_at, updated_at
            FROM announcements
            ORDER BY id DESC`
        );
        const data = rows.map(row => ({
            id: row.id,
            title: row.title || '',
            version: row.version || '',
            publish_date: row.publish_date || '',
            publishDate: row.publish_date || '',
            summary: row.summary || '',
            content: row.content || '',
            enabled: !!row.enabled,
            sourceType: row.source_type || 'manual',
            sourceKey: row.source_key || '',
            releaseUrl: row.release_url || '',
            assets: parseJsonSafely(row.assets_json, []),
            installedVersion: row.installed_version || '',
            installedAt: row.installed_at || null,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        try {
            const redis = getRedisClient();
            if (redis) {
                await redis.set(ANNOUNCEMENT_CACHE_KEY, JSON.stringify(data), 'EX', ANNOUNCEMENT_CACHE_TTL);
            }
        } catch { /* ignore */ }
        return data;
    } catch (e) {
        logger.error(`getAnnouncements failed: ${e.message}`);
        return [];
    }
}

async function saveAnnouncement(data) {
    const pool = getPool();
    const {
        id,
        title = '',
        version = '',
        publish_date = '',
        summary = '',
        content = '',
        enabled = true,
        createdBy = null,
        sourceType = 'manual',
        sourceKey = '',
        releaseUrl = '',
        assets = [],
        installedVersion = '',
        installedAt = null,
    } = data || {};
    const normalizedSourceKey = String(sourceKey || '').trim() || null;
    const normalizedAssets = Array.isArray(assets) ? assets : [];
    try {
        if (id) {
            await pool.execute(
                `UPDATE announcements
                SET title = ?, version = ?, publish_date = ?, summary = ?, content = ?, enabled = ?, created_by = ?,
                    source_type = ?, source_key = ?, release_url = ?, assets_json = ?, installed_version = ?, installed_at = ?
                WHERE id = ?`,
                [
                    title,
                    version,
                    publish_date,
                    summary,
                    content,
                    enabled ? 1 : 0,
                    createdBy,
                    sourceType,
                    normalizedSourceKey,
                    releaseUrl,
                    normalizedAssets.length > 0 ? JSON.stringify(normalizedAssets) : null,
                    installedVersion || '',
                    installedAt || null,
                    id,
                ]
            );
        } else if (normalizedSourceKey) {
            await pool.execute(
                `INSERT INTO announcements (
                    title, version, publish_date, summary, content, enabled, created_by,
                    source_type, source_key, release_url, assets_json, installed_version, installed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    version = VALUES(version),
                    publish_date = VALUES(publish_date),
                    summary = VALUES(summary),
                    content = VALUES(content),
                    enabled = VALUES(enabled),
                    created_by = VALUES(created_by),
                    source_type = VALUES(source_type),
                    release_url = VALUES(release_url),
                    assets_json = VALUES(assets_json),
                    installed_version = VALUES(installed_version),
                    installed_at = VALUES(installed_at)`,
                [
                    title,
                    version,
                    publish_date,
                    summary,
                    content,
                    enabled ? 1 : 0,
                    createdBy,
                    sourceType,
                    normalizedSourceKey,
                    releaseUrl,
                    normalizedAssets.length > 0 ? JSON.stringify(normalizedAssets) : null,
                    installedVersion || '',
                    installedAt || null,
                ]
            );
        } else {
            await pool.execute(
                `INSERT INTO announcements (
                    title, version, publish_date, summary, content, enabled, created_by,
                    source_type, source_key, release_url, assets_json, installed_version, installed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    title,
                    version,
                    publish_date,
                    summary,
                    content,
                    enabled ? 1 : 0,
                    createdBy,
                    sourceType,
                    null,
                    releaseUrl,
                    normalizedAssets.length > 0 ? JSON.stringify(normalizedAssets) : null,
                    installedVersion || '',
                    installedAt || null,
                ]
            );
        }
        await invalidateAnnouncementCache();
        return { ok: true };
    } catch (e) {
        logger.error(`saveAnnouncement failed: ${e.message}`);
        throw e;
    }
}

async function deleteAnnouncement(id) {
    const pool = getPool();
    try {
        if (id) {
            await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);
        } else {
            await pool.query('TRUNCATE TABLE announcements'); // 使用 query 代替 execute 并且 TRUNCATE，重置自增顺序
        }
        await invalidateAnnouncementCache();
        return { ok: true };
    } catch (e) {
        logger.error(`deleteAnnouncement failed: ${e.message}`);
        throw e;
    }
}

async function invalidateAnnouncementCache() {
    try {
        const redis = getRedisClient();
        if (redis) await redis.del(ANNOUNCEMENT_CACHE_KEY);
    } catch { /* ignore */ }
}

async function insertReportLog(entry = {}) {
    const pool = getPool();
    if (!pool) return { ok: false };
    const payload = (entry && typeof entry === 'object') ? entry : {};
    await pool.execute(
        `INSERT INTO report_logs
        (account_id, account_name, mode, ok, channel, title, content, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            String(payload.accountId || '').trim(),
            String(payload.accountName || '').trim(),
            String(payload.mode || 'test').trim(),
            payload.ok ? 1 : 0,
            String(payload.channel || '').trim(),
            String(payload.title || '').trim(),
            String(payload.content || ''),
            String(payload.errorMessage || '').trim(),
        ],
    );
    return { ok: true };
}

function normalizeReportLogFilters(options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const rawMode = String(opts.mode || '').trim().toLowerCase();
    const rawStatus = String(opts.status || '').trim().toLowerCase();
    const rawSortOrder = String(opts.sortOrder !== undefined ? opts.sortOrder : (opts.order || '')).trim().toLowerCase();
    const keyword = String(opts.keyword !== undefined ? opts.keyword : (opts.q || '')).trim().slice(0, 100);
    const allowedModes = new Set(['test', 'hourly', 'daily']);
    const allowedStatus = new Set(['success', 'failed']);
    const allowedSortOrders = new Set(['asc', 'desc']);
    return {
        mode: allowedModes.has(rawMode) ? rawMode : '',
        status: allowedStatus.has(rawStatus) ? rawStatus : '',
        sortOrder: allowedSortOrders.has(rawSortOrder) ? rawSortOrder : 'desc',
        keyword,
    };
}

function buildReportLogWhereClause(accountId, options = {}) {
    const normalizedAccountId = String(accountId || '').trim();
    const filters = normalizeReportLogFilters(options);
    const params = [normalizedAccountId];
    let whereSql = 'WHERE account_id = ?';
    if (filters.mode) {
        whereSql += ' AND mode = ?';
        params.push(filters.mode);
    }
    if (filters.status) {
        whereSql += filters.status === 'success' ? ' AND ok = 1' : ' AND ok = 0';
    }
    if (filters.keyword) {
        const keywordPattern = `%${filters.keyword}%`;
        whereSql += ' AND (title LIKE ? OR content LIKE ? OR error_message LIKE ?)';
        params.push(keywordPattern, keywordPattern, keywordPattern);
    }
    return { whereSql, params, filters };
}

function mapReportLogRows(rows) {
    return (rows || []).map(row => ({
        id: row.id,
        accountId: String(row.account_id || ''),
        accountName: row.account_name || '',
        mode: row.mode || 'test',
        ok: !!row.ok,
        channel: row.channel || '',
        title: row.title || '',
        content: row.content || '',
        errorMessage: row.error_message || '',
        createdAt: row.created_at,
    }));
}

function createEmptyReportLogStats() {
    return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        testCount: 0,
        hourlyCount: 0,
        dailyCount: 0,
    };
}

async function getReportLogs(accountId, options = {}) {
    const pool = getPool();
    if (!pool) {
        return { items: [], total: 0, page: 1, pageSize: 3, totalPages: 1 };
    }
    const opts = (options && typeof options === 'object') ? options : { pageSize: options };
    const pageSize = 3;
    const page = Math.max(1, Number.parseInt(opts.page, 10) || 1);
    const offset = (page - 1) * pageSize;
    const { whereSql, params, filters } = buildReportLogWhereClause(accountId, opts);
    const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS total FROM report_logs ${whereSql}`,
        params,
    );
    const total = Math.max(0, Number(countRow && countRow.total) || 0);
    const [rows] = await pool.execute(
        `SELECT id, account_id, account_name, mode, ok, channel, title, content, error_message, created_at
         FROM report_logs
         ${whereSql}
         ORDER BY id ${filters.sortOrder === 'asc' ? 'ASC' : 'DESC'}
         LIMIT ${pageSize} OFFSET ${offset}`,
        params,
    );
    return {
        items: mapReportLogRows(rows),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}

async function getReportLogStats(accountId, options = {}) {
    const pool = getPool();
    if (!pool) {
        return createEmptyReportLogStats();
    }
    const { whereSql, params } = buildReportLogWhereClause(accountId, options);
    const [[row]] = await pool.execute(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS successCount,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failedCount,
            SUM(CASE WHEN mode = 'test' THEN 1 ELSE 0 END) AS testCount,
            SUM(CASE WHEN mode = 'hourly' THEN 1 ELSE 0 END) AS hourlyCount,
            SUM(CASE WHEN mode = 'daily' THEN 1 ELSE 0 END) AS dailyCount
         FROM report_logs
         ${whereSql}`,
        params,
    );
    return {
        total: Number(row && row.total) || 0,
        successCount: Number(row && row.successCount) || 0,
        failedCount: Number(row && row.failedCount) || 0,
        testCount: Number(row && row.testCount) || 0,
        hourlyCount: Number(row && row.hourlyCount) || 0,
        dailyCount: Number(row && row.dailyCount) || 0,
    };
}

async function exportReportLogs(accountId, options = {}) {
    const pool = getPool();
    if (!pool) {
        return { items: [], total: 0, maxRows: 1000, truncated: false };
    }
    const opts = (options && typeof options === 'object') ? options : {};
    const maxRows = Math.max(1, Math.min(2000, Number.parseInt(opts.maxRows, 10) || 1000));
    const { whereSql, params, filters } = buildReportLogWhereClause(accountId, opts);
    const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS total FROM report_logs ${whereSql}`,
        params,
    );
    const total = Math.max(0, Number(countRow && countRow.total) || 0);
    const [rows] = await pool.execute(
        `SELECT id, account_id, account_name, mode, ok, channel, title, content, error_message, created_at
         FROM report_logs
         ${whereSql}
         ORDER BY id ${filters.sortOrder === 'asc' ? 'ASC' : 'DESC'}
         LIMIT ${maxRows}`,
        params,
    );
    return {
        items: mapReportLogRows(rows),
        total,
        maxRows,
        truncated: total > rows.length,
    };
}

async function deleteReportLogsByIds(accountId, ids = []) {
    const pool = getPool();
    if (!pool) return { ok: false, affectedRows: 0, requestedIds: 0 };
    const normalizedAccountId = String(accountId || '').trim();
    const normalizedIds = Array.from(new Set(
        (Array.isArray(ids) ? ids : [ids])
            .map(id => Number.parseInt(id, 10))
            .filter(id => Number.isFinite(id) && id > 0),
    ));
    if (!normalizedAccountId || normalizedIds.length === 0) {
        return { ok: false, affectedRows: 0, requestedIds: 0 };
    }
    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [result] = await pool.execute(
        `DELETE FROM report_logs
         WHERE account_id = ?
           AND id IN (${placeholders})`,
        [normalizedAccountId, ...normalizedIds],
    );
    return {
        ok: true,
        affectedRows: Number(result && result.affectedRows) || 0,
        requestedIds: normalizedIds.length,
    };
}

async function clearReportLogs(accountId) {
    const pool = getPool();
    if (!pool) return { ok: false, affectedRows: 0 };
    const [result] = await pool.execute(
        'DELETE FROM report_logs WHERE account_id = ?',
        [String(accountId || '').trim()],
    );
    return {
        ok: true,
        affectedRows: Number(result && result.affectedRows) || 0,
    };
}

async function pruneReportLogs(accountId, options = {}) {
    const pool = getPool();
    if (!pool) return { ok: false, affectedRows: 0 };
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) return { ok: false, affectedRows: 0 };
    const opts = (options && typeof options === 'object') ? options : { retentionDays: options };
    const parsedRetentionDays = Number.parseInt(opts.retentionDays, 10);
    const retentionDays = Math.max(0, Math.min(365, Number.isFinite(parsedRetentionDays) ? parsedRetentionDays : 30));
    if (retentionDays <= 0) {
        return { ok: true, affectedRows: 0, retentionDays };
    }
    const [result] = await pool.execute(
        `DELETE FROM report_logs
         WHERE account_id = ?
           AND created_at < DATE_SUB(NOW(), INTERVAL ${retentionDays} DAY)`,
        [normalizedAccountId],
    );
    return {
        ok: true,
        affectedRows: Number(result && result.affectedRows) || 0,
        retentionDays,
    };
}

module.exports = {
    initDatabase,
    getDb,
    closeDatabase,
    transaction,
    bufferedInsertLog,
    updateFriendsCache,
    mergeFriendsCache,
    getCachedFriendsDetails,
    getCachedFriends,
    clearFriendsCache,
    findReusableFriendsCache,
    findFriendInSharedCaches,
    isRedisCacheAvailable,
    getAnnouncements,
    saveAnnouncement,
    deleteAnnouncement,
    invalidateAnnouncementCache,
    insertReportLog,
    getReportLogs,
    getReportLogStats,
    exportReportLogs,
    deleteReportLogsByIds,
    clearReportLogs,
    pruneReportLogs,
};

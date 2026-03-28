const { cacheFriendSeeds } = require('./friend-cache-seeds');
const { getInteractRecords } = require('./interact');
const { getServerTimeSec, logWarn, toNum } = require('../utils/utils');

const LOOKUP_LIMIT = 50;
const LOOKUP_CACHE_TTL_MS = 15000;
const LOOKUP_FAILURE_COOLDOWN_MS = 30000;
const LOOKUP_MAX_RECORD_AGE_SEC = 300;
const LOOKUP_RETRY_DELAY_MS = 900;

let recentRecordsCache = [];
let recentRecordsFetchedAt = 0;
let recentRecordsLookupPromise = null;
let recentRecordsLookupFailedAt = 0;

function isAnonymousVisitorName(name, gid = 0) {
    const text = String(name || '').trim();
    if (!text) return true;
    return gid > 0 ? text === `GID:${gid}` : /^GID:\d+$/.test(text);
}

function buildVisitorDisplayName(name, gid = 0) {
    const text = String(name || '').trim();
    if (text) return text;
    return gid > 0 ? `GID:${gid}` : '';
}

function getNowSec() {
    const serverNow = toNum(getServerTimeSec());
    if (serverNow > 0) return serverNow;
    return Math.floor(Date.now() / 1000);
}

function getAllowedActionTypes(kind) {
    if (kind === 'steal') return new Set([1]);
    if (kind === 'weed' || kind === 'insect') return new Set([3]);
    return new Set();
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isRecordRecentEnough(record, nowSec) {
    const recordSec = toNum(record && record.serverTimeSec);
    if (recordSec <= 0) return true;
    return Math.abs(nowSec - recordSec) <= LOOKUP_MAX_RECORD_AGE_SEC;
}

function pickVisitorMatch(records = [], kind, landId) {
    const allowedActionTypes = getAllowedActionTypes(kind);
    const numericLandId = toNum(landId);
    const nowSec = getNowSec();

    return (Array.isArray(records) ? records : [])
        .filter((record) => {
            const actionType = toNum(record && record.actionType);
            const recordLandId = toNum(record && record.landId);
            if (numericLandId > 0 && recordLandId !== numericLandId) return false;
            if (allowedActionTypes.size > 0 && !allowedActionTypes.has(actionType)) return false;
            if (!isRecordRecentEnough(record, nowSec)) return false;

            const visitorGid = toNum(record && record.visitorGid);
            const nick = String(record && record.nick || '').trim();
            return visitorGid > 0 || !isAnonymousVisitorName(nick, visitorGid);
        })
        .sort((a, b) => {
            const timeDiff = toNum(b && b.serverTimeSec) - toNum(a && a.serverTimeSec);
            if (timeDiff !== 0) return timeDiff;
            return toNum(b && b.visitorGid) - toNum(a && a.visitorGid);
        })[0] || null;
}

function pickVisitorMatchByGid(records = [], gid, kind, landId) {
    const numericGid = toNum(gid);
    if (numericGid <= 0) return null;
    return (Array.isArray(records) ? records : [])
        .filter(record => toNum(record && record.visitorGid) === numericGid)
        .filter(record => {
            const candidate = pickVisitorMatch([record], kind, landId);
            return !!candidate;
        })[0] || null;
}

async function loadRecentInteractRecords(options = {}) {
    const forceRefresh = !!options.forceRefresh;
    const now = Date.now();
    if (!forceRefresh && (now - recentRecordsFetchedAt) <= LOOKUP_CACHE_TTL_MS && recentRecordsCache.length > 0) {
        return recentRecordsCache;
    }
    if (!forceRefresh && (now - recentRecordsLookupFailedAt) <= LOOKUP_FAILURE_COOLDOWN_MS) {
        return recentRecordsCache;
    }
    if (recentRecordsLookupPromise) {
        return recentRecordsLookupPromise;
    }

    recentRecordsLookupPromise = (async () => {
        try {
            const records = await getInteractRecords(LOOKUP_LIMIT);
            recentRecordsCache = Array.isArray(records) ? records : [];
            recentRecordsFetchedAt = Date.now();
            recentRecordsLookupFailedAt = 0;
            return recentRecordsCache;
        } catch (error) {
            recentRecordsLookupFailedAt = Date.now();
            logWarn('访客', `匿名访客补全失败，已保留匿名展示: ${error.message || error}`);
            return recentRecordsCache;
        } finally {
            recentRecordsLookupPromise = null;
        }
    })();

    return recentRecordsLookupPromise;
}

async function findVisitorMatchWithRetry(kind, landId, finder) {
    let records = await loadRecentInteractRecords();
    let match = finder(records);
    if (match) {
        return { records, match };
    }

    await wait(LOOKUP_RETRY_DELAY_MS);
    records = await loadRecentInteractRecords({ forceRefresh: true });
    match = finder(records);
    return { records, match };
}

function buildVisitorFriendCacheOptions(options = {}) {
    const normalizedOptions = (options && typeof options === 'object') ? options : {};
    const userState = normalizedOptions.userState && typeof normalizedOptions.userState === 'object'
        ? normalizedOptions.userState
        : null;
    const account = normalizedOptions.account && typeof normalizedOptions.account === 'object'
        ? normalizedOptions.account
        : null;
    const accountId = String(normalizedOptions.accountId || (userState && userState.accountId) || '').trim();
    if (!accountId) return null;
    return {
        accountId,
        platform: String(
            normalizedOptions.platform
            || (account && account.platform)
            || (userState && userState.platform)
            || ''
        ).trim(),
        uin: String(
            normalizedOptions.uin
            || (account && account.uin)
            || (userState && userState.uin)
            || ''
        ).trim(),
        qq: String(
            normalizedOptions.qq
            || (account && account.qq)
            || ''
        ).trim(),
        openId: String(
            normalizedOptions.openId
            || normalizedOptions.open_id
            || (account && (account.openId || account.open_id))
            || (userState && (userState.openId || userState.open_id))
            || ''
        ).trim(),
        userState,
        account,
        immediate: true,
    };
}

async function resolveVisitorIdentity(options = {}) {
    const numericGid = toNum(options.gid);
    const getFriendNameByGid = typeof options.getFriendNameByGid === 'function'
        ? options.getFriendNameByGid
        : async () => '';

    if (numericGid > 0) {
        const directName = String(await getFriendNameByGid(numericGid) || '').trim();
        if (!isAnonymousVisitorName(directName, numericGid)) {
            return {
                gid: numericGid,
                name: directName,
                source: 'land_owner',
                known: true,
            };
        }

        const { records, match } = await findVisitorMatchWithRetry(
            options.kind,
            options.landId,
            candidateRecords => pickVisitorMatchByGid(candidateRecords, numericGid, options.kind, options.landId)
        );
        if (match) {
            const matchedName = String(match.nick || '').trim();
            const cacheOptions = buildVisitorFriendCacheOptions(options);
            const resolvedName = !isAnonymousVisitorName(matchedName, numericGid)
                ? matchedName
                : '';
            if (cacheOptions) {
                await cacheFriendSeeds([{
                    gid: numericGid,
                    name: resolvedName,
                    avatarUrl: String(match.avatarUrl || '').trim(),
                }], cacheOptions);
            }
            if (resolvedName) {
                return {
                    gid: numericGid,
                    name: resolvedName,
                    source: 'interact_records',
                    known: true,
                };
            }
        }

        return {
            gid: numericGid,
            name: buildVisitorDisplayName(directName, numericGid),
            source: 'land_owner',
            known: false,
        };
    }

    const { match } = await findVisitorMatchWithRetry(
        options.kind,
        options.landId,
        candidateRecords => pickVisitorMatch(candidateRecords, options.kind, options.landId)
    );
    if (!match) {
        return {
            gid: 0,
            name: '',
            source: 'unknown',
        };
    }

    const matchedGid = toNum(match.visitorGid);
    let matchedName = String(match.nick || '').trim();
    if (isAnonymousVisitorName(matchedName, matchedGid) && matchedGid > 0) {
        matchedName = String(await getFriendNameByGid(matchedGid) || '').trim();
    }
    const known = !isAnonymousVisitorName(matchedName, matchedGid);
    if (!known) matchedName = '';

    const cacheOptions = buildVisitorFriendCacheOptions(options);
    if (cacheOptions && matchedGid > 0) {
        await cacheFriendSeeds([{
            gid: matchedGid,
            name: matchedName,
            avatarUrl: String(match.avatarUrl || '').trim(),
        }], cacheOptions);
    }

    return {
        gid: matchedGid,
        name: buildVisitorDisplayName(matchedName, matchedGid),
        source: 'interact_records',
        known,
    };
}

function __resetVisitorIdentityCacheForTest() {
    recentRecordsCache = [];
    recentRecordsFetchedAt = 0;
    recentRecordsLookupPromise = null;
    recentRecordsLookupFailedAt = 0;
}

module.exports = {
    resolveVisitorIdentity,
    __resetVisitorIdentityCacheForTest,
};

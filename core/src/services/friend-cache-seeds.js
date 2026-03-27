const process = require('node:process');

const { CONFIG } = require('../config/config');
const { createModuleLogger } = require('./logger');
const { toNum } = require('../utils/utils');

const logger = createModuleLogger('friend-cache-seeds');
const DEFAULT_FLUSH_DELAY_MS = 800;
const pendingSeedBuckets = new Map();

function getMergeFriendsCache() {
    const databaseApi = require('./database');
    return (databaseApi && typeof databaseApi.mergeFriendsCache === 'function')
        ? databaseApi.mergeFriendsCache
        : null;
}

async function persistFriendSeeds(accountId, friends, options = {}) {
    const mergeFriendsCache = getMergeFriendsCache();
    if (typeof mergeFriendsCache !== 'function') {
        throw new TypeError('mergeFriendsCache is not a function');
    }
    await mergeFriendsCache(accountId, friends, options);
}

function resolveFriendSeedAccountId(accountId = '', userState = null) {
    const resolved = String(
        accountId
        || (userState && userState.accountId)
        || CONFIG.accountId
        || process.env.FARM_ACCOUNT_ID
        || '',
    ).trim();
    return resolved || null;
}

function normalizeFriendSeed(seed) {
    const gid = toNum(
        seed && (seed.gid ?? seed.visitor_gid ?? seed.visitorGid ?? seed.host_gid ?? seed.hostGid)
    );
    if (gid <= 0) return null;

    const uin = String(
        (seed && (seed.uin || seed.open_id || seed.openId)) || ''
    ).trim();
    const name = String(
        (seed && (seed.name || seed.remark || seed.nick)) || ''
    ).trim();
    const avatarUrl = String(
        (seed && (seed.avatarUrl || seed.avatar_url || seed.avatar)) || ''
    ).trim();

    return {
        gid,
        uin,
        name,
        avatarUrl,
    };
}

function isGenericFriendName(name, gid) {
    const text = String(name || '').trim();
    return !text || text === `GID:${gid}`;
}

function mergeFriendSeeds(currentList = [], incomingList = []) {
    const merged = new Map();

    for (const item of currentList) {
        const normalized = normalizeFriendSeed(item);
        if (!normalized) continue;
        merged.set(normalized.gid, {
            gid: normalized.gid,
            uin: normalized.uin,
            name: normalized.name || `GID:${normalized.gid}`,
            avatarUrl: normalized.avatarUrl,
        });
    }

    for (const item of incomingList) {
        const normalized = normalizeFriendSeed(item);
        if (!normalized) continue;
        const previous = merged.get(normalized.gid) || {
            gid: normalized.gid,
            uin: '',
            name: `GID:${normalized.gid}`,
            avatarUrl: '',
        };

        const nextName = !isGenericFriendName(normalized.name, normalized.gid)
            ? normalized.name
            : (!isGenericFriendName(previous.name, normalized.gid) ? previous.name : `GID:${normalized.gid}`);

        merged.set(normalized.gid, {
            gid: normalized.gid,
            uin: normalized.uin || previous.uin,
            name: nextName,
            avatarUrl: normalized.avatarUrl || previous.avatarUrl,
        });
    }

    return Array.from(merged.values())
        .sort((a, b) => Number(a.gid || 0) - Number(b.gid || 0));
}

function buildFriendSeedsFromLands(lands = [], selfGid = 0) {
    const seeds = [];
    const seen = new Set();
    const numericSelfGid = toNum(selfGid);

    for (const land of (Array.isArray(lands) ? lands : [])) {
        const plant = land && land.plant;
        const visitorGids = []
            .concat((plant && plant.weed_owners) || [])
            .concat((plant && plant.insect_owners) || [])
            .concat((plant && plant.stealers) || []);

        for (const rawGid of visitorGids) {
            const gid = toNum(rawGid);
            if (gid <= 0 || gid === numericSelfGid || seen.has(gid)) continue;
            seen.add(gid);
            seeds.push({ gid });
        }
    }

    return seeds;
}

function clearBucketTimer(bucket) {
    if (!bucket || !bucket.timer) return;
    clearTimeout(bucket.timer);
    bucket.timer = null;
}

async function flushQueuedFriendSeeds(accountId = '') {
    const resolvedAccountId = resolveFriendSeedAccountId(accountId);
    if (!resolvedAccountId) return false;

    const bucket = pendingSeedBuckets.get(resolvedAccountId);
    if (!bucket || !bucket.seeds.length) return false;

    pendingSeedBuckets.delete(resolvedAccountId);
    clearBucketTimer(bucket);

    try {
        await persistFriendSeeds(resolvedAccountId, bucket.seeds, bucket.options || {});
        return true;
    } catch (error) {
        logger.warn(`flush queued friend seeds failed(account=${resolvedAccountId}): ${error.message}`);
        return false;
    }
}

function ensurePendingBucket(accountId) {
    const resolvedAccountId = resolveFriendSeedAccountId(accountId);
    if (!resolvedAccountId) return null;

    if (!pendingSeedBuckets.has(resolvedAccountId)) {
        pendingSeedBuckets.set(resolvedAccountId, {
            seeds: [],
            timer: null,
            options: {},
        });
    }
    return pendingSeedBuckets.get(resolvedAccountId);
}

async function cacheFriendSeeds(seeds = [], options = {}) {
    const resolvedAccountId = resolveFriendSeedAccountId(options.accountId, options.userState);
    if (!resolvedAccountId) return false;

    const normalizedSeeds = mergeFriendSeeds([], Array.isArray(seeds) ? seeds : [seeds]);
    if (!normalizedSeeds.length) return false;

    const delayMs = Math.max(0, Number(options.delayMs ?? DEFAULT_FLUSH_DELAY_MS));
    if (options.immediate || delayMs === 0) {
        try {
            await persistFriendSeeds(resolvedAccountId, normalizedSeeds, options);
            return true;
        } catch (error) {
            logger.warn(`merge friend seeds failed(account=${resolvedAccountId}): ${error.message}`);
            return false;
        }
    }

    const bucket = ensurePendingBucket(resolvedAccountId);
    if (!bucket) return false;

    bucket.seeds = mergeFriendSeeds(bucket.seeds, normalizedSeeds);
    bucket.options = {
        ...(bucket.options || {}),
        platform: options.platform ?? (bucket.options && bucket.options.platform),
        uin: options.uin ?? (bucket.options && bucket.options.uin),
        qq: options.qq ?? (bucket.options && bucket.options.qq),
        openId: options.openId ?? options.open_id ?? (bucket.options && bucket.options.openId),
        userState: options.userState ?? (bucket.options && bucket.options.userState),
        account: options.account ?? (bucket.options && bucket.options.account),
    };
    clearBucketTimer(bucket);
    bucket.timer = setTimeout(() => {
        void flushQueuedFriendSeeds(resolvedAccountId);
    }, delayMs);
    if (bucket.timer && typeof bucket.timer.unref === 'function') {
        bucket.timer.unref();
    }
    return true;
}

function __resetFriendSeedQueueForTest() {
    for (const bucket of pendingSeedBuckets.values()) {
        clearBucketTimer(bucket);
    }
    pendingSeedBuckets.clear();
}

module.exports = {
    resolveFriendSeedAccountId,
    normalizeFriendSeed,
    mergeFriendSeeds,
    buildFriendSeedsFromLands,
    cacheFriendSeeds,
    flushQueuedFriendSeeds,
    __resetFriendSeedQueueForTest,
};

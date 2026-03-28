const { CONFIG } = require('../config/config');
const { getFruitName, getPlantByFruitId, getPlantById, getPlantName } = require('../config/gameConfig');
const { cacheFriendSeeds, resolveFriendSeedAccountId } = require('./friend-cache-seeds');
const { sendMsgAsync, getUserState } = require('../utils/network');
const { types } = require('../utils/proto');
const { logWarn, toNum, toTimeSec } = require('../utils/utils');

const RPC_CANDIDATES = [
    ['gamepb.interactpb.InteractService', 'InteractRecords'],
    ['gamepb.interactpb.InteractService', 'GetInteractRecords'],
    ['gamepb.interactpb.VisitorService', 'InteractRecords'],
    ['gamepb.interactpb.VisitorService', 'GetInteractRecords'],
];

const ACTION_LABELS = {
    1: '偷取作物',
    2: '帮忙',
    3: '捣乱',
};

function getActionLabel(actionType) {
    return ACTION_LABELS[actionType] || '互动';
}

function buildActionDetail(record) {
    const count = Number(record.cropCount) || 0;
    const times = Number(record.times) || 0;
    const landId = Number(record.landId) || 0;
    const parts = [];

    if (record.actionType === 1) {
        if (record.cropName && count > 0) parts.push(`偷取 ${record.cropName} × ${count}`);
        else if (record.cropName) parts.push(`偷取 ${record.cropName}`);
        else if (count > 0) parts.push(`偷取作物 × ${count}`);
        else parts.push('偷取作物');
    } else if (record.actionType === 2) {
        parts.push(times > 1 ? `帮忙 ${times} 次` : '帮忙');
    } else if (record.actionType === 3) {
        parts.push(times > 1 ? `捣乱 ${times} 次` : '捣乱');
    } else {
        parts.push(times > 1 ? `互动 ${times} 次` : '互动');
    }

    if (landId > 0) parts.push(`地块 ${landId}`);
    return parts.join(' · ');
}

async function fetchInteractReply() {
    if (!types.InteractRecordsRequest || !types.InteractRecordsReply) {
        const err = new Error('访客记录协议未加载');
        err.code = 'INTERACT_PROTO_MISSING';
        throw err;
    }

    const body = types.InteractRecordsRequest.encode(types.InteractRecordsRequest.create({})).finish();
    const errors = [];

    for (const [serviceName, methodName] of RPC_CANDIDATES) {
        try {
            const { body: replyBody } = await sendMsgAsync(serviceName, methodName, body, 2500);
            return types.InteractRecordsReply.decode(replyBody);
        } catch (error) {
            const message = error && error.message ? error.message : String(error || 'unknown');
            errors.push(`${serviceName}.${methodName}: ${message}`);
        }
    }

    const mergedError = errors.join(' | ');
    logWarn('好友', `访客记录接口调用失败: ${mergedError}`, {
        module: 'friend',
        event: 'interact_records',
        result: 'error',
    });

    const lower = mergedError.toLowerCase();
    if (lower.includes('timeout')) {
        const err = new Error('访客记录接口超时');
        err.code = 'INTERACT_TIMEOUT';
        throw err;
    }
    if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('missing x-account-id')) {
        const err = new Error('访客记录接口权限校验失败');
        err.code = 'INTERACT_AUTH';
        throw err;
    }
    const err = new Error('访客记录接口不可用（可能是协议版本不支持）');
    err.code = 'INTERACT_RPC_UNAVAILABLE';
    throw err;
}

function resolveCropName(cropId) {
    const id = Number(cropId) || 0;
    if (id <= 0) return '';
    if (getPlantById(id)) return getPlantName(id);
    if (getPlantByFruitId(id)) return getFruitName(id);
    return '';
}

function normalizeInteractRecord(record, index) {
    const actionType = toNum(record && record.action_type);
    const visitorGid = toNum(record && record.visitor_gid);
    const cropId = toNum(record && record.crop_id);
    const cropCount = toNum(record && record.crop_count);
    const times = toNum(record && record.times);
    const level = toNum(record && record.level);
    const fromType = toNum(record && record.from_type);
    const serverTimeSec = toTimeSec(record && record.server_time);
    const extra = (record && record.extra) || {};
    const landId = toNum(extra.land_id);
    const flag1 = toNum(extra.flag1);
    const flag2 = toNum(extra.flag2);
    const cropName = resolveCropName(cropId);
    const nick = String((record && record.nick) || '').trim() || `GID:${visitorGid}`;
    const avatarUrl = String((record && record.avatar_url) || '').trim();

    const normalized = {
        key: `${serverTimeSec || 0}-${visitorGid || 0}-${actionType || 0}-${index}`,
        serverTimeSec,
        serverTimeMs: serverTimeSec > 0 ? serverTimeSec * 1000 : 0,
        actionType,
        actionLabel: getActionLabel(actionType),
        visitorGid,
        nick,
        avatarUrl,
        cropId,
        cropName,
        cropCount,
        times,
        fromType,
        level,
        landId,
        flag1,
        flag2,
    };

    normalized.actionDetail = buildActionDetail(normalized);
    return normalized;
}

function buildFriendSeedsFromInteractRecords(records) {
    const deduped = new Map();
    for (const record of (Array.isArray(records) ? records : [])) {
        const gid = toNum(record && record.visitorGid);
        if (gid <= 0) continue;
        if (deduped.has(gid)) continue;
        const nick = String(record && record.nick || '').trim();
        const avatarUrl = String(record && record.avatarUrl || '').trim();
        deduped.set(gid, {
            gid,
            name: nick === `GID:${gid}` ? '' : nick,
            avatarUrl,
        });
    }
    return Array.from(deduped.values());
}

function buildInteractFriendCacheOptions() {
    const userState = typeof getUserState === 'function' ? getUserState() : null;
    const accountId = resolveFriendSeedAccountId(CONFIG.accountId, userState);
    if (!accountId) return null;
    return {
        accountId,
        platform: String(CONFIG.platform || (userState && userState.platform) || '').trim(),
        uin: String(CONFIG.uin || (userState && userState.uin) || '').trim(),
        openId: String((userState && (userState.openId || userState.open_id)) || CONFIG.openId || '').trim(),
        userState,
        immediate: true,
    };
}

async function getInteractRecords(limit = 50) {
    const reply = await fetchInteractReply();
    const records = Array.isArray(reply && reply.records) ? reply.records : [];
    const normalized = records
        .map((record, index) => normalizeInteractRecord(record, index))
        .sort((a, b) => (b.serverTimeSec - a.serverTimeSec) || (b.visitorGid - a.visitorGid) || (b.actionType - a.actionType));
    const cacheOptions = buildInteractFriendCacheOptions();
    if (cacheOptions) {
        await cacheFriendSeeds(buildFriendSeedsFromInteractRecords(normalized), cacheOptions);
    }
    const max = Math.max(1, Math.min(200, Number(limit) || 50));
    return normalized.slice(0, max);
}

module.exports = {
    getInteractRecords,
};

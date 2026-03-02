/**
 * 好友农场操作 - 进入/离开/帮忙/偷菜/巡查
 */

const { CONFIG, PlantPhase, PHASE_NAMES } = require('../config/config');
const { getPlantName, getPlantById, getSeedImageBySeedId } = require('../config/gameConfig');
const { isAutomationOn, getFriendQuietHours, getFriendBlacklist, getStealFilterConfig, getStealFriendFilterConfig, getStakeoutStealConfig } = require('../models/store');
const { sendMsgAsync, getUserState, networkEvents } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, toNum, toTimeSec, getServerTimeSec, log, logWarn, sleep } = require('../utils/utils');
const { getCurrentPhase, setOperationLimitsCallback } = require('./farm');
const { createScheduler } = require('./scheduler');
const { recordOperation } = require('./stats');
const { sellAllFruits } = require('./warehouse');

// ============ 内部状态 ============
let isCheckingFriends = false;
let friendLoopRunning = false;
let externalSchedulerMode = false;
let lastResetDate = '';  // 上次重置日期 (YYYY-MM-DD)
const friendScheduler = createScheduler('friend');

// 蹲守偷菜活跃任务 Map<string, { timer, friendGid, matureTime }>
// key 格式: 'stake_<friendGid>_<groupIndex>'
const activeStakeouts = new Map();
// 蹲守最大提前预约时间（4小时 = 14400秒），超过的不安排
const MAX_STAKEOUT_AHEAD_SEC = 4 * 3600;

// 操作限制状态 (从服务器响应中更新)
// 操作类型ID (根据游戏代码):
// 10001 = 收获, 10002 = 铲除, 10003 = 放草, 10004 = 放虫
// 10005 = 除草(帮好友), 10006 = 除虫(帮好友), 10007 = 浇水(帮好友), 10008 = 偷菜
const operationLimits = new Map();

// 操作类型名称映射
const OP_NAMES = {
    10001: '收获',
    10002: '铲除',
    10003: '放草',
    10004: '放虫',
    10005: '除草',
    10006: '除虫',
    10007: '浇水',
    10008: '偷菜',
};

let canGetHelpExp = true;
let helpAutoDisabledByLimit = false;

function parseTimeToMinutes(timeStr) {
    const m = String(timeStr || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const h = Number.parseInt(m[1], 10);
    const min = Number.parseInt(m[2], 10);
    if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

function inFriendQuietHours(now = new Date()) {
    const cfg = getFriendQuietHours();
    if (!cfg || !cfg.enabled) return false;

    const start = parseTimeToMinutes(cfg.start);
    const end = parseTimeToMinutes(cfg.end);
    if (start === null || end === null) return false;

    const cur = now.getHours() * 60 + now.getMinutes();
    if (start === end) return true; // 起止相同视为全天静默
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end; // 跨天时段
}

// ============ 偷菜过滤逻辑 ============

/**
 * 检查是否应该偷取某植物
 * @param {number|string} plantId - 植物 ID
 * @returns {boolean} true 表示可以偷，false 表示应该跳过
 */
function shouldStealPlant(plantId) {
    const config = getStealFilterConfig();
    if (!config || !config.enabled) return true;

    const plantIds = config.plantIds || [];
    const pid = String(plantId);

    if (config.mode === 'blacklist') {
        // 黑名单模式：不偷列表中的植物
        return !plantIds.includes(pid);
    } else {
        // 白名单模式：只偷列表中的植物
        return plantIds.includes(pid);
    }
}

/**
 * 检查是否应该偷取某好友
 * @param {number|string} friendGid - 好友 GID
 * @returns {boolean} true 表示可以偷，false 表示应该跳过
 */
function shouldStealFriend(friendGid) {
    const config = getStealFriendFilterConfig();
    if (!config || !config.enabled) return true;

    const friendIds = config.friendIds || [];
    const gid = String(friendGid);

    if (config.mode === 'blacklist') {
        // 黑名单模式：不偷列表中的好友
        return !friendIds.includes(gid);
    } else {
        // 白名单模式：只偷列表中的好友
        return friendIds.includes(gid);
    }
}

// ============ 好友 API ============

async function getAllFriends() {
    const body = types.GetAllFriendsRequest.encode(types.GetAllFriendsRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body);
    const reply = types.GetAllFriendsReply.decode(replyBody);

    if (reply && reply.game_friends && networkEvents) {
        networkEvents.emit('friends_updated', reply.game_friends);
    }

    return reply;
}

// ============ 好友申请 API (微信同玩) ============

async function getApplications() {
    const body = types.GetApplicationsRequest.encode(types.GetApplicationsRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetApplications', body);
    return types.GetApplicationsReply.decode(replyBody);
}

async function acceptFriends(gids) {
    const body = types.AcceptFriendsRequest.encode(types.AcceptFriendsRequest.create({
        friend_gids: gids.map(g => toLong(g)),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'AcceptFriends', body);
    return types.AcceptFriendsReply.decode(replyBody);
}

async function enterFriendFarm(friendGid, isUrgent = false) {
    const body = types.VisitEnterRequest.encode(types.VisitEnterRequest.create({
        host_gid: toLong(friendGid),
        reason: 2,  // ENTER_REASON_FRIEND
    })).finish();
    const sendFn = isUrgent ? sendMsgAsyncUrgent : sendMsgAsync;
    const { body: replyBody } = await sendFn('gamepb.visitpb.VisitService', 'Enter', body);
    return types.VisitEnterReply.decode(replyBody);
}

async function leaveFriendFarm(friendGid, isUrgent = false) {
    const body = types.VisitLeaveRequest.encode(types.VisitLeaveRequest.create({
        host_gid: toLong(friendGid),
    })).finish();
    try {
        const sendFn = isUrgent ? sendMsgAsyncUrgent : sendMsgAsync;
        await sendFn('gamepb.visitpb.VisitService', 'Leave', body);
    } catch { /* 离开失败不影响主流程 */ }
}

/**
 * 检查是否需要重置每日限制 (0点刷新)
 */
function checkDailyReset() {
    // 使用服务器时间（北京时间 UTC+8）计算当前日期，避免时区偏差
    const nowSec = getServerTimeSec();
    const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now();
    const bjOffset = 8 * 3600 * 1000;
    const bjDate = new Date(nowMs + bjOffset);
    const y = bjDate.getUTCFullYear();
    const m = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(bjDate.getUTCDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;  // 北京时间日期 YYYY-MM-DD
    if (lastResetDate !== today) {
        if (lastResetDate !== '') {
            log('系统', '跨日重置，清空操作限制缓存');
        }
        operationLimits.clear();
        canGetHelpExp = true;
        if (helpAutoDisabledByLimit) {
            helpAutoDisabledByLimit = false;
            log('好友', '新的一天已开始，自动恢复帮忙操作功能', {
                module: 'friend',
                event: 'friend_cycle',
                result: 'ok',
            });
        }
        lastResetDate = today;
    }
}

function autoDisableHelpByExpLimit() {
    if (!canGetHelpExp) return;
    canGetHelpExp = false;
    helpAutoDisabledByLimit = true;
    log('好友', '今日帮助经验已达上限，自动停止帮忙', {
        module: 'friend',
        event: 'friend_cycle',
        result: 'ok',
    });
}

/**
 * 更新操作限制状态
 */
function updateOperationLimits(limits) {
    if (!limits || limits.length === 0) return;
    checkDailyReset();
    for (const limit of limits) {
        const id = toNum(limit.id);
        if (id > 0) {
            const data = {
                dayTimes: toNum(limit.day_times),
                dayTimesLimit: toNum(limit.day_times_lt),
                dayExpTimes: toNum(limit.day_exp_times),
                dayExpTimesLimit: toNum(limit.day_ex_times_lt), // 协议字段名为 day_ex_times_lt
            };
            operationLimits.set(id, data);
        }
    }
}

/**
 * 检查某操作是否还能获得经验
 * 无限制数据时：如果 friend_help_exp_limit 关闭则放行，否则保守拒绝
 */
function canGetExp(opId) {
    const limit = operationLimits.get(opId);
    if (!limit) {
        // 无限制数据：经验限制功能关闭时放行，开启时保守等待数据
        return !isAutomationOn('friend_help_exp_limit');
    }
    if (limit.dayExpTimesLimit <= 0) return true;  // 没有经验上限
    return limit.dayExpTimes < limit.dayExpTimesLimit;
}

/**
 * 检查候选操作 ID 列表中是否有任一还能获取经验
 * 同一帮助操作可能对应多个经验 ID（如除草对应 10005 和 10003）
 */
function canGetExpByCandidates(opIds = []) {
    const ids = Array.isArray(opIds) ? opIds : [opIds];
    for (const id of ids) {
        if (canGetExp(toNum(id))) return true;
    }
    return false;
}

/**
 * 检查某操作是否还有次数
 */
function canOperate(opId) {
    const limit = operationLimits.get(opId);
    if (!limit) return true;
    if (limit.dayTimesLimit <= 0) return true;
    return limit.dayTimes < limit.dayTimesLimit;
}

/**
 * 获取某操作剩余次数
 */
function getRemainingTimes(opId) {
    const limit = operationLimits.get(opId);
    if (!limit || limit.dayTimesLimit <= 0) return 999;
    return Math.max(0, limit.dayTimesLimit - limit.dayTimes);
}

/**
 * 获取操作限制详情 (供管理面板使用)
 */
function getOperationLimits() {
    const result = {};
    for (const id of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]) {
        const limit = operationLimits.get(id);
        if (limit) {
            result[id] = {
                name: OP_NAMES[id] || `#${id}`,
                ...limit,
                remaining: getRemainingTimes(id),
            };
        }
    }
    return result;
}

async function helpWater(friendGid, landIds, stopWhenExpLimit = false) {
    const beforeExp = toNum((getUserState() || {}).exp);
    const body = types.WaterLandRequest.encode(types.WaterLandRequest.create({
        land_ids: landIds,
        host_gid: toLong(friendGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'WaterLand', body);
    const reply = types.WaterLandReply.decode(replyBody);
    updateOperationLimits(reply.operation_limits);
    if (stopWhenExpLimit) {
        await sleep(200);
        const afterExp = toNum((getUserState() || {}).exp);
        if (afterExp <= beforeExp) autoDisableHelpByExpLimit();
    }
    return reply;
}

async function helpWeed(friendGid, landIds, stopWhenExpLimit = false) {
    const beforeExp = toNum((getUserState() || {}).exp);
    const body = types.WeedOutRequest.encode(types.WeedOutRequest.create({
        land_ids: landIds,
        host_gid: toLong(friendGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'WeedOut', body);
    const reply = types.WeedOutReply.decode(replyBody);
    updateOperationLimits(reply.operation_limits);
    if (stopWhenExpLimit) {
        await sleep(200);
        const afterExp = toNum((getUserState() || {}).exp);
        if (afterExp <= beforeExp) autoDisableHelpByExpLimit();
    }
    return reply;
}

async function helpInsecticide(friendGid, landIds, stopWhenExpLimit = false) {
    const beforeExp = toNum((getUserState() || {}).exp);
    const body = types.InsecticideRequest.encode(types.InsecticideRequest.create({
        land_ids: landIds,
        host_gid: toLong(friendGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'Insecticide', body);
    const reply = types.InsecticideReply.decode(replyBody);
    updateOperationLimits(reply.operation_limits);
    if (stopWhenExpLimit) {
        await sleep(200);
        const afterExp = toNum((getUserState() || {}).exp);
        if (afterExp <= beforeExp) autoDisableHelpByExpLimit();
    }
    return reply;
}

async function stealHarvest(friendGid, landIds, isUrgent = false) {
    const body = types.HarvestRequest.encode(types.HarvestRequest.create({
        land_ids: landIds,
        host_gid: toLong(friendGid),
        is_all: true,
    })).finish();
    const sendFn = isUrgent ? sendMsgAsyncUrgent : sendMsgAsync;
    const { body: replyBody } = await sendFn('gamepb.plantpb.PlantService', 'Harvest', body);
    const reply = types.HarvestReply.decode(replyBody);
    updateOperationLimits(reply.operation_limits);
    return reply;
}

async function putPlantItems(friendGid, landIds, RequestType, ReplyType, method) {
    let ok = 0;
    const ids = Array.isArray(landIds) ? landIds : [];
    for (const landId of ids) {
        try {
            const body = RequestType.encode(RequestType.create({
                land_ids: [toLong(landId)],
                host_gid: toLong(friendGid),
            })).finish();
            const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', method, body);
            const reply = ReplyType.decode(replyBody);
            updateOperationLimits(reply.operation_limits);
            ok++;
        } catch { /* ignore single failure */ }
        // 令牌桶已在底层做了 334ms 间隔限流，无需额外 sleep
    }
    return ok;
}

async function putPlantItemsDetailed(friendGid, landIds, RequestType, ReplyType, method) {
    let ok = 0;
    const failed = [];
    const ids = Array.isArray(landIds) ? landIds : [];
    for (const landId of ids) {
        try {
            const body = RequestType.encode(RequestType.create({
                land_ids: [toLong(landId)],
                host_gid: toLong(friendGid),
            })).finish();
            const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', method, body);
            const reply = ReplyType.decode(replyBody);
            updateOperationLimits(reply.operation_limits);
            ok++;
        } catch (e) {
            failed.push({ landId, reason: e && e.message ? e.message : '未知错误' });
        }
        // 令牌桶已在底层做了 334ms 间隔限流，无需额外 sleep
    }
    return { ok, failed };
}

async function putInsects(friendGid, landIds) {
    return putPlantItems(friendGid, landIds, types.PutInsectsRequest, types.PutInsectsReply, 'PutInsects');
}

async function putWeeds(friendGid, landIds) {
    return putPlantItems(friendGid, landIds, types.PutWeedsRequest, types.PutWeedsReply, 'PutWeeds');
}

async function putInsectsDetailed(friendGid, landIds) {
    return putPlantItemsDetailed(friendGid, landIds, types.PutInsectsRequest, types.PutInsectsReply, 'PutInsects');
}

async function putWeedsDetailed(friendGid, landIds) {
    return putPlantItemsDetailed(friendGid, landIds, types.PutWeedsRequest, types.PutWeedsReply, 'PutWeeds');
}

async function checkCanOperateRemote(friendGid, operationId) {
    if (!types.CheckCanOperateRequest || !types.CheckCanOperateReply) {
        return { canOperate: true, canStealNum: 0 };
    }
    try {
        const body = types.CheckCanOperateRequest.encode(types.CheckCanOperateRequest.create({
            host_gid: toLong(friendGid),
            operation_id: toLong(operationId),
        })).finish();
        const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'CheckCanOperate', body);
        const reply = types.CheckCanOperateReply.decode(replyBody);
        return {
            canOperate: !!reply.can_operate,
            canStealNum: toNum(reply.can_steal_num),
        };
    } catch {
        // 预检查失败时降级为不拦截，避免因协议抖动导致完全不操作
        return { canOperate: true, canStealNum: 0 };
    }
}

// ============ 好友土地分析 ============

function analyzeFriendLands(lands, myGid, friendName = '') {
    const result = {
        stealable: [],   // 可偷
        stealableInfo: [],  // 可偷植物信息 { landId, plantId, name }
        needWater: [],   // 需要浇水
        needWeed: [],    // 需要除草
        needBug: [],     // 需要除虫
        canPutWeed: [],  // 可以放草
        canPutBug: [],   // 可以放虫
        upcomingMature: [], // 即将成熟（用于蹲守偷菜）
    };

    const nowSec = getServerTimeSec();

    for (const land of lands) {
        const id = toNum(land.id);
        const plant = land.plant;

        if (!plant || !plant.phases || plant.phases.length === 0) {
            continue;
        }

        const currentPhase = getCurrentPhase(plant.phases, false, `[${friendName}]土地#${id}`);
        if (!currentPhase) {
            continue;
        }
        const phaseVal = currentPhase.phase;

        if (phaseVal === PlantPhase.MATURE) {
            if (plant.stealable) {
                // 检查植物过滤
                const plantId = toNum(plant.id);
                if (shouldStealPlant(plantId)) {
                    result.stealable.push(id);
                    const plantName = getPlantName(plantId) || plant.name || '未知';
                    result.stealableInfo.push({ landId: id, plantId, name: plantName });
                }
            }
            continue;
        }

        if (phaseVal === PlantPhase.DEAD) continue;

        // 蹲守偷菜：记录尚未成熟但有成熟时间的地块
        const plantId = toNum(plant.id);
        const maturePhase = Array.isArray(plant.phases)
            ? plant.phases.find((p) => p && toNum(p.phase) === PlantPhase.MATURE)
            : null;
        const matureBegin = maturePhase ? toTimeSec(maturePhase.begin_time) : 0;
        const matureInSec = matureBegin > nowSec ? (matureBegin - nowSec) : 0;

        if (matureInSec > 0 && shouldStealPlant(plantId)) {
            const plantName = getPlantName(plantId) || plant.name || '未知';
            result.upcomingMature.push({
                landId: id,
                matureInSec,
                matureTimestamp: matureBegin,
                plantId,
                name: plantName,
            });
        }

        // 帮助操作
        if (toNum(plant.dry_num) > 0) result.needWater.push(id);
        if (plant.weed_owners && plant.weed_owners.length > 0) result.needWeed.push(id);
        if (plant.insect_owners && plant.insect_owners.length > 0) result.needBug.push(id);

        // 捣乱操作: 检查是否可以放草/放虫
        const weedOwners = plant.weed_owners || [];
        const insectOwners = plant.insect_owners || [];
        const iAlreadyPutWeed = weedOwners.some(gid => toNum(gid) === myGid);
        const iAlreadyPutBug = insectOwners.some(gid => toNum(gid) === myGid);

        if (weedOwners.length < 2 && !iAlreadyPutWeed) {
            result.canPutWeed.push(id);
        }
        if (insectOwners.length < 2 && !iAlreadyPutBug) {
            result.canPutBug.push(id);
        }
    }

    // 按成熟时间升序排列
    result.upcomingMature.sort((a, b) => a.matureInSec - b.matureInSec);

    return result;
}

/**
 * 获取好友列表 (供面板)
 */
async function getFriendsList() {
    try {
        const reply = await getAllFriends();
        const friends = reply.game_friends || [];
        const state = getUserState();
        return friends
            .filter(f => toNum(f.gid) !== state.gid && f.name !== '小小农夫' && f.remark !== '小小农夫')
            .map(f => ({
                gid: toNum(f.gid),
                name: f.remark || f.name || `GID:${toNum(f.gid)}`,
                avatarUrl: String(f.avatar_url || '').trim(),
                plant: f.plant ? {
                    stealNum: toNum(f.plant.steal_plant_num),
                    dryNum: toNum(f.plant.dry_num),
                    weedNum: toNum(f.plant.weed_num),
                    insectNum: toNum(f.plant.insect_num),
                } : null,
            }))
            .sort((a, b) => {
                // 固定顺序：先按名称，再按 GID，避免刷新时顺序抖动
                const an = String(a.name || '');
                const bn = String(b.name || '');
                const byName = an.localeCompare(bn, 'zh-CN');
                if (byName !== 0) return byName;
                return Number(a.gid || 0) - Number(b.gid || 0);
            });
    } catch {
        return [];
    }
}

/**
 * 获取指定好友的农田详情 (进入-获取-离开)
 */
async function getFriendLandsDetail(friendGid) {
    try {
        const enterReply = await enterFriendFarm(friendGid);
        const lands = enterReply.lands || [];
        const state = getUserState();
        const analyzed = analyzeFriendLands(lands, state.gid, '');
        await leaveFriendFarm(friendGid);

        const landsList = [];
        const nowSec = getServerTimeSec();
        for (const land of lands) {
            const id = toNum(land.id);
            const level = toNum(land.level);
            const unlocked = !!land.unlocked;
            if (!unlocked) {
                landsList.push({
                    id,
                    unlocked: false,
                    status: 'locked',
                    plantName: '',
                    phaseName: '未解锁',
                    level,
                    needWater: false,
                    needWeed: false,
                    needBug: false,
                });
                continue;
            }
            const plant = land.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) {
                landsList.push({ id, unlocked: true, status: 'empty', plantName: '', phaseName: '空地', level });
                continue;
            }
            const currentPhase = getCurrentPhase(plant.phases, false, '');
            if (!currentPhase) {
                landsList.push({ id, unlocked: true, status: 'empty', plantName: '', phaseName: '', level });
                continue;
            }
            const phaseVal = currentPhase.phase;
            const plantId = toNum(plant.id);
            const plantName = getPlantName(plantId) || plant.name || '未知';
            const plantCfg = getPlantById(plantId);
            const seedId = toNum(plantCfg && plantCfg.seed_id);
            const seedImage = seedId > 0 ? getSeedImageBySeedId(seedId) : '';
            const phaseName = PHASE_NAMES[phaseVal] || '';
            const maturePhase = Array.isArray(plant.phases)
                ? plant.phases.find((p) => p && toNum(p.phase) === PlantPhase.MATURE)
                : null;
            const matureBegin = maturePhase ? toTimeSec(maturePhase.begin_time) : 0;
            const matureInSec = matureBegin > nowSec ? (matureBegin - nowSec) : 0;
            let landStatus = 'growing';
            if (phaseVal === PlantPhase.MATURE) landStatus = plant.stealable ? 'stealable' : 'harvested';
            else if (phaseVal === PlantPhase.DEAD) landStatus = 'dead';

            landsList.push({
                id,
                unlocked: true,
                status: landStatus,
                plantName,
                seedId,
                seedImage,
                phaseName,
                level,
                matureInSec,
                needWater: toNum(plant.dry_num) > 0,
                needWeed: (plant.weed_owners && plant.weed_owners.length > 0),
                needBug: (plant.insect_owners && plant.insect_owners.length > 0),
            });
        }

        return {
            lands: landsList,
            summary: analyzed,
        };
    } catch {
        return { lands: [], summary: {} };
    }
}

async function runBatchWithFallback(ids, batchFn, singleFn) {
    const target = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (target.length === 0) return 0;
    try {
        await batchFn(target);
        return target.length;
    } catch {
        let ok = 0;
        for (const landId of target) {
            try {
                await singleFn([landId]);
                ok++;
            } catch { /* ignore */ }
            // 令牌桶已在底层做了 334ms 间隔限流，无需额外 sleep
        }
        return ok;
    }
}

/**
 * 面板手动好友操作（单个好友）
 * opType: 'steal' | 'water' | 'weed' | 'bug' | 'bad'
 */
async function doFriendOperation(friendGid, opType) {
    const gid = toNum(friendGid);
    if (!gid) return { ok: false, message: '无效好友ID', opType };

    let enterReply;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e) {
        return { ok: false, message: `进入好友农场失败: ${e.message}`, opType };
    }

    try {
        const lands = enterReply.lands || [];
        const state = getUserState();
        const status = analyzeFriendLands(lands, state.gid, '');
        let count = 0;

        if (opType === 'steal') {
            if (!status.stealable.length) return { ok: true, opType, count: 0, message: '没有可偷取土地' };
            const precheck = await checkCanOperateRemote(gid, 10008);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日偷菜次数已用完' };
            const maxNum = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const target = status.stealable.slice(0, maxNum);
            count = await runBatchWithFallback(target, (ids) => stealHarvest(gid, ids), (ids) => stealHarvest(gid, ids));
            if (count > 0) {
                recordOperation('steal', count);
                // 手动偷取成功后立即尝试出售一次果实
                try {
                    await sellAllFruits();
                } catch (e) {
                    logWarn('仓库', `手动偷取后自动出售失败: ${e.message}`, {
                        module: 'warehouse',
                        event: 'sell_after_steal',
                        result: 'error',
                        mode: 'manual',
                    });
                }
            }
            return { ok: true, opType, count, message: `偷取完成 ${count} 块` };
        }

        if (opType === 'water') {
            if (!status.needWater.length) return { ok: true, opType, count: 0, message: '没有可浇水土地' };
            const precheck = await checkCanOperateRemote(gid, 10007);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日浇水次数已用完' };
            count = await runBatchWithFallback(status.needWater, (ids) => helpWater(gid, ids), (ids) => helpWater(gid, ids));
            if (count > 0) recordOperation('helpWater', count);
            return { ok: true, opType, count, message: `浇水完成 ${count} 块` };
        }

        if (opType === 'weed') {
            if (!status.needWeed.length) return { ok: true, opType, count: 0, message: '没有可除草土地' };
            const precheck = await checkCanOperateRemote(gid, 10005);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日除草次数已用完' };
            count = await runBatchWithFallback(status.needWeed, (ids) => helpWeed(gid, ids), (ids) => helpWeed(gid, ids));
            if (count > 0) recordOperation('helpWeed', count);
            return { ok: true, opType, count, message: `除草完成 ${count} 块` };
        }

        if (opType === 'bug') {
            if (!status.needBug.length) return { ok: true, opType, count: 0, message: '没有可除虫土地' };
            const precheck = await checkCanOperateRemote(gid, 10006);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日除虫次数已用完' };
            count = await runBatchWithFallback(status.needBug, (ids) => helpInsecticide(gid, ids), (ids) => helpInsecticide(gid, ids));
            if (count > 0) recordOperation('helpBug', count);
            return { ok: true, opType, count, message: `除虫完成 ${count} 块` };
        }

        if (opType === 'bad') {
            let bugCount = 0;
            let weedCount = 0;
            if (!status.canPutBug.length && !status.canPutWeed.length) {
                return { ok: true, opType, count: 0, bugCount: 0, weedCount: 0, message: '没有可捣乱土地' };
            }

            // 手动捣乱不依赖预检查，逐块执行（与 terminal-farm-main 保持一致）
            let failDetails = [];
            if (status.canPutBug.length) {
                const bugRet = await putInsectsDetailed(gid, status.canPutBug);
                bugCount = bugRet.ok;
                failDetails = failDetails.concat((bugRet.failed || []).map(f => `放虫#${f.landId}:${f.reason}`));
                if (bugCount > 0) recordOperation('bug', bugCount);
            }
            if (status.canPutWeed.length) {
                const weedRet = await putWeedsDetailed(gid, status.canPutWeed);
                weedCount = weedRet.ok;
                failDetails = failDetails.concat((weedRet.failed || []).map(f => `放草#${f.landId}:${f.reason}`));
                if (weedCount > 0) recordOperation('weed', weedCount);
            }
            count = bugCount + weedCount;
            if (count <= 0) {
                const reasonPreview = failDetails.slice(0, 2).join(' | ');
                return {
                    ok: true,
                    opType,
                    count: 0,
                    bugCount,
                    weedCount,
                    message: reasonPreview ? `捣乱失败: ${reasonPreview}` : '捣乱失败或今日次数已用完'
                };
            }
            return { ok: true, opType, count, bugCount, weedCount, message: `捣乱完成 虫${bugCount}/草${weedCount}` };
        }

        return { ok: false, opType, count: 0, message: '未知操作类型' };
    } catch (e) {
        return { ok: false, opType, count: 0, message: e.message || '操作失败' };
    } finally {
        try { await leaveFriendFarm(gid); } catch { /* ignore */ }
    }
}

// ============ 拜访好友 ============

async function visitFriend(friend, totalActions, myGid) {
    const { gid, name } = friend;

    let enterReply;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e) {
        logWarn('好友', `进入 ${name} 农场失败: ${e.message}`, {
            module: 'friend', event: 'enter_farm', result: 'error', friendName: name, friendGid: gid
        });
        return;
    }

    const lands = enterReply.lands || [];
    if (lands.length === 0) {
        await leaveFriendFarm(gid);
        return;
    }

    const status = analyzeFriendLands(lands, myGid, name);

    // 执行操作
    const actions = [];

    // 1. 帮助操作 (除草/除虫/浇水)
    const helpEnabled = !!isAutomationOn('friend_help');
    const stopWhenExpLimit = !!isAutomationOn('friend_help_exp_limit');
    if (!stopWhenExpLimit) canGetHelpExp = true;
    if (!helpEnabled) {
        // 自动帮忙关闭，直接跳过帮助操作
    } else if (stopWhenExpLimit && !canGetHelpExp) {
        // 今日已达到经验上限后停止帮忙
    } else {
        const helpOps = [
            { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: helpWeed, key: 'weed', name: '草', record: 'helpWeed' },
            { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: helpInsecticide, key: 'bug', name: '虫', record: 'helpBug' },
            { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: helpWater, key: 'water', name: '水', record: 'helpWater' }
        ];

        for (const op of helpOps) {
            const allowByExp = (!stopWhenExpLimit) || (canGetExpByCandidates(op.expIds) && canGetHelpExp);
            if (op.list.length > 0 && allowByExp) {
                const precheck = await checkCanOperateRemote(gid, op.id);
                if (precheck.canOperate) {
                    const count = await runBatchWithFallback(
                        op.list,
                        (ids) => op.fn(gid, ids, stopWhenExpLimit),
                        (ids) => op.fn(gid, ids, stopWhenExpLimit)
                    );
                    if (count > 0) {
                        actions.push(`${op.name}${count}`);
                        totalActions[op.key] += count;
                        recordOperation(op.record, count);
                    }
                }
            }
        }
    }

    // 2. 偷菜操作
    if (isAutomationOn('friend_steal') && status.stealable.length > 0) {
        const precheck = await checkCanOperateRemote(gid, 10008);
        if (precheck.canOperate) {
            const canStealNum = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const targetLands = status.stealable.slice(0, canStealNum);

            let ok = 0;
            const stolenPlants = [];

            // 尝试批量偷取
            try {
                await stealHarvest(gid, targetLands);
                ok = targetLands.length;
                targetLands.forEach(id => {
                    const info = status.stealableInfo.find(x => x.landId === id);
                    if (info) stolenPlants.push(info.name);
                });
            } catch {
                // 批量失败，降级为单个
                for (const landId of targetLands) {
                    try {
                        await stealHarvest(gid, [landId]);
                        ok++;
                        const info = status.stealableInfo.find(x => x.landId === landId);
                        if (info) stolenPlants.push(info.name);
                    } catch { /* ignore */ }
                    // 令牌桶已在底层做了 334ms 间隔限流，无需额外 sleep
                }
            }

            if (ok > 0) {
                const plantNames = [...new Set(stolenPlants)].join('/');
                actions.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`);
                totalActions.steal += ok;
                recordOperation('steal', ok);
            }
        }
    }

    // 3. 捣乱操作 (放虫/放草)
    const autoBad = isAutomationOn('friend_bad');
    if (autoBad) {
        if (status.canPutBug.length > 0 && canOperate(10004)) {
            const remaining = getRemainingTimes(10004);
            const toProcess = status.canPutBug.slice(0, remaining);
            const ok = await putInsects(gid, toProcess);
            if (ok > 0) { actions.push(`放虫${ok}`); totalActions.putBug += ok; }
        }

        if (status.canPutWeed.length > 0 && canOperate(10003)) {
            const remaining = getRemainingTimes(10003);
            const toProcess = status.canPutWeed.slice(0, remaining);
            const ok = await putWeeds(gid, toProcess);
            if (ok > 0) { actions.push(`放草${ok}`); totalActions.putWeed += ok; }
        }
    }

    // 4. 蹲守偷菜调度（在离开前评估即将成熟的地块）
    const stakeoutCfg = getStakeoutStealConfig();
    if (stakeoutCfg.enabled && shouldStealFriend(gid) && status.upcomingMature.length > 0) {
        scheduleStakeout(gid, name, status.upcomingMature, stakeoutCfg.delaySec);
    }

    if (actions.length > 0) {
        log('好友', `${name}: ${actions.join('/')}`, {
            module: 'friend', event: 'visit_friend', result: 'ok', friendName: name, friendGid: gid, actions
        });
    }

    await leaveFriendFarm(gid);
}

// ============ 好友巡查主循环 ============

async function checkFriends() {
    const state = getUserState();
    // 首先检查主开关，如果未开启则直接返回
    if (!isAutomationOn('friend')) return false;

    const helpEnabled = !!isAutomationOn('friend_help');
    const stealEnabled = !!isAutomationOn('friend_steal');
    const badEnabled = !!isAutomationOn('friend_bad');
    const hasAnyFriendOp = helpEnabled || stealEnabled || badEnabled;
    if (isCheckingFriends || !state.gid || !hasAnyFriendOp) return false;
    if (inFriendQuietHours()) return false;

    isCheckingFriends = true;
    checkDailyReset();

    try {
        const friendsReply = await getAllFriends();
        const friends = friendsReply.game_friends || [];
        if (friends.length === 0) {
            log('好友', '没有好友', { module: 'friend', event: 'friend_scan', result: 'empty' });
            return false;
        }

        const canPutBugOrWeed = canOperate(10004) || canOperate(10003);
        const autoBadEnabled = isAutomationOn('friend_bad');
        const blacklist = new Set(getFriendBlacklist());

        const priorityFriends = [];
        const otherFriends = [];
        const visitedGids = new Set();

        for (const f of friends) {
            const gid = toNum(f.gid);
            if (gid === state.gid) continue;
            if (visitedGids.has(gid)) continue;
            if (blacklist.has(gid)) continue;

            const name = f.remark || f.name || `GID:${gid}`;
            const p = f.plant;
            const stealNum = p ? toNum(p.steal_plant_num) : 0;
            const dryNum = p ? toNum(p.dry_num) : 0;
            const weedNum = p ? toNum(p.weed_num) : 0;
            const insectNum = p ? toNum(p.insect_num) : 0;

            const hasAction = stealNum > 0 || dryNum > 0 || weedNum > 0 || insectNum > 0;

            if (hasAction) {
                priorityFriends.push({
                    gid, name, isPriority: true,
                    stealNum, dryNum, weedNum, insectNum // 保存状态用于排序
                });
                visitedGids.add(gid);
            } else if ((autoBadEnabled && canPutBugOrWeed) || helpEnabled || stealEnabled) {
                otherFriends.push({ gid, name, isPriority: false });
                visitedGids.add(gid);
            }
        }

        // 排序优化: 优先偷菜多的，其次是需要帮助多的
        priorityFriends.sort((a, b) => {
            if (b.stealNum !== a.stealNum) return b.stealNum - a.stealNum; // 偷菜优先
            // 其次按帮助需求总数
            const helpA = a.dryNum + a.weedNum + a.insectNum;
            const helpB = b.dryNum + b.weedNum + b.insectNum;
            return helpB - helpA;
        });

        const friendsToVisit = [...priorityFriends, ...otherFriends];

        if (friendsToVisit.length === 0) {
            return false;
        }

        const totalActions = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 };

        for (let i = 0; i < friendsToVisit.length; i++) {
            const friend = friendsToVisit[i];

            // 如果是仅捣乱的好友（帮忙/偷菜均未开启），且次数已用完，则停止
            if (!friend.isPriority && !helpEnabled && !stealEnabled && !canOperate(10004) && !canOperate(10003)) {
                break;
            }

            try {
                await visitFriend(friend, totalActions, state.gid);
            } catch {
                // 单个好友访问失败不影响整体
            }

            // 令牌桶已在底层做了 334ms 间隔限流，无需额外 sleep
        }

        // 偷菜后自动出售
        if (totalActions.steal > 0) {
            try {
                await sellAllFruits();
            } catch {
                // ignore
            }
        }

        // 生成总结日志
        const summary = [];
        if (totalActions.steal > 0) summary.push(`偷${totalActions.steal}`);
        if (totalActions.weed > 0) summary.push(`除草${totalActions.weed}`);
        if (totalActions.bug > 0) summary.push(`除虫${totalActions.bug}`);
        if (totalActions.water > 0) summary.push(`浇水${totalActions.water}`);
        if (totalActions.putBug > 0) summary.push(`放虫${totalActions.putBug}`);
        if (totalActions.putWeed > 0) summary.push(`放草${totalActions.putWeed}`);

        if (summary.length > 0) {
            log('好友', `巡查 ${friendsToVisit.length} 人 → ${summary.join('/')}`, {
                module: 'friend', event: 'friend_cycle', result: 'ok', visited: friendsToVisit.length, summary
            });
        }
        return summary.length > 0;

    } catch (err) {
        logWarn('好友', `巡查异常: ${err.message}`);
        return false;
    } finally {
        isCheckingFriends = false;
    }
}

/**
 * 好友巡查循环 - 本次完成后等待指定秒数再开始下次
 */
async function friendCheckLoop() {
    if (externalSchedulerMode) return;
    if (!friendLoopRunning) return;

    // 定期检查好友申请是否开启
    if (isAutomationOn('friend_auto_accept')) {
        await checkAndAcceptApplications();
    }

    await checkFriends();
    if (!friendLoopRunning) return;
    friendScheduler.setTimeoutTask('friend_check_loop', Math.max(0, CONFIG.friendCheckInterval), () => friendCheckLoop());
}

function startFriendCheckLoop(options = {}) {
    if (friendLoopRunning) return;
    externalSchedulerMode = !!options.externalScheduler;
    friendLoopRunning = true;

    // 注册操作限制更新回调，从农场检查中获取限制信息
    setOperationLimitsCallback(updateOperationLimits);

    // 监听好友申请推送 (微信同玩)
    networkEvents.on('friendApplicationReceived', onFriendApplicationReceived);

    if (!externalSchedulerMode) {
        // 延迟 5 秒后启动循环，等待登录和首次农场检查完成
        friendScheduler.setTimeoutTask('friend_check_loop', 5000, () => friendCheckLoop());
    }

    // 启动时检查一次待处理的好友申请
    friendScheduler.setTimeoutTask('friend_check_bootstrap_applications', 3000, () => checkAndAcceptApplications());
}

function stopFriendCheckLoop() {
    friendLoopRunning = false;
    externalSchedulerMode = false;
    networkEvents.off('friendApplicationReceived', onFriendApplicationReceived);
    friendScheduler.clearAll();
}

function refreshFriendCheckLoop(delayMs = 200) {
    if (!friendLoopRunning || externalSchedulerMode) return;
    friendScheduler.setTimeoutTask('friend_check_loop', Math.max(0, delayMs), () => friendCheckLoop());
}

// ============ 自动同意好友申请 (微信同玩) ============

/**
 * 处理服务器推送的好友申请
 */
function onFriendApplicationReceived(applications) {
    const names = applications.map(a => a.name || `GID:${toNum(a.gid)}`).join(', ');
    log('申请', `收到 ${applications.length} 个好友申请: ${names}`);

    // If auto accept is on, do so
    if (isAutomationOn('friend_auto_accept')) {
        const gids = applications.map(a => toNum(a.gid));
        acceptFriendsWithRetry(gids);
    }
}

/**
 * 检查并同意所有待处理的好友申请
 */
async function checkAndAcceptApplications() {
    if (!isAutomationOn('friend_auto_accept')) return;
    try {
        const reply = await getApplications();
        const applications = reply.applications || [];
        if (applications.length === 0) return;

        const names = applications.map(a => a.name || `GID:${toNum(a.gid)}`).join(', ');
        log('申请', `发现 ${applications.length} 个待处理申请: ${names}`);

        const gids = applications.map(a => toNum(a.gid));
        await acceptFriendsWithRetry(gids);
    } catch {
        // 静默失败，可能是 QQ 平台不支持
    }
}

/**
 * 同意好友申请 (带重试)
 */
async function acceptFriendsWithRetry(gids) {
    if (gids.length === 0) return;
    try {
        const reply = await acceptFriends(gids);
        const friends = reply.friends || [];
        if (friends.length > 0) {
            const names = friends.map(f => f.name || f.remark || `GID:${toNum(f.gid)}`).join(', ');
            log('申请', `已同意 ${friends.length} 人: ${names}`);
        }
    } catch (e) {
        logWarn('申请', `同意失败: ${e.message}`);
    }
}

// ============ 蹲守偷菜调度 ============

/**
 * 为好友安排蹲守偷菜定时任务
 * 将即将成熟的地块按时间分组（相差 ≤10 秒归为一组），
 * 对每组建立 setTimeout 定时任务，到时触发 runStakeoutSteal。
 *
 * @param {number} friendGid - 好友 GID
 * @param {string} friendName - 好友名称
 * @param {Array} upcomingMature - analyzeFriendLands 返回的即将成熟列表
 * @param {number} delaySec - 成熟后额外等待秒数（防秒偷举报）
 */
function scheduleStakeout(friendGid, friendName, upcomingMature, delaySec) {
    if (!upcomingMature || upcomingMature.length === 0) return;

    // 筛选: 只安排 4 小时内成熟的
    const candidates = upcomingMature.filter(m => m.matureInSec > 5 && m.matureInSec <= MAX_STAKEOUT_AHEAD_SEC);
    if (candidates.length === 0) return;

    // 按成熟时间分组：相差 ≤10 秒的地块归为同一组（可一次偷取）
    const groups = [];
    let currentGroup = [candidates[0]];
    for (let i = 1; i < candidates.length; i++) {
        const diff = candidates[i].matureInSec - currentGroup[0].matureInSec;
        if (diff <= 10) {
            currentGroup.push(candidates[i]);
        } else {
            groups.push(currentGroup);
            currentGroup = [candidates[i]];
        }
    }
    groups.push(currentGroup);

    // 清理该好友之前的蹲守任务（防止重复安排）
    for (const [key] of activeStakeouts) {
        if (key.startsWith(`stake_${friendGid}_`)) {
            friendScheduler.clear(key);
            activeStakeouts.delete(key);
        }
    }

    // 为每组建立定时任务
    for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const landIds = group.map(m => m.landId);
        const plantNames = [...new Set(group.map(m => m.name))].join('/');
        // 取该组最早成熟时间，提前 3 秒进入（给进入农场留余量）
        const earliestMatureSec = group[0].matureInSec;
        // 等待时间 = 成熟倒计时 - 3秒（提前进入） + 延迟秒数，下限 5 秒
        const waitMs = Math.max(5000, (earliestMatureSec - 3 + delaySec) * 1000);
        const taskKey = `stake_${friendGid}_${gi}`;

        activeStakeouts.set(taskKey, {
            friendGid,
            friendName,
            landIds,
            plantNames,
            waitMs,
        });

        const minutesUntil = Math.round(waitMs / 60000);
        log('蹲守', `预约 ${friendName}: ${plantNames} ×${landIds.length}块, 约 ${minutesUntil} 分钟后偷取`, {
            module: 'friend', event: 'stakeout_schedule', result: 'ok',
            friendName, friendGid, landIds, minutesUntil, delaySec,
        });

        friendScheduler.setTimeoutTask(taskKey, waitMs, () => {
            activeStakeouts.delete(taskKey);
            runStakeoutSteal(friendGid, friendName, landIds, delaySec).catch(() => { });
        });
    }
}

/**
 * 执行蹲守偷菜
 * 进入好友农场 → 等待到精准时间 → 偷取 → 记录 → 离开
 *
 * @param {number} friendGid - 好友 GID
 * @param {string} friendName - 好友名称
 * @param {number[]} targetLandIds - 目标土地 ID 列表
 * @param {number} delaySec - 额外等待秒数
 */
async function runStakeoutSteal(friendGid, friendName, targetLandIds, delaySec) {
    log('蹲守', `触发 ${friendName}: 准备进入农场偷取 ${targetLandIds.length} 块`, {
        module: 'friend', event: 'stakeout_trigger', result: 'ok',
        friendName, friendGid, targetLandIds,
    });

    let enterReply;
    try {
        enterReply = await enterFriendFarm(friendGid, true);
    } catch (e) {
        logWarn('蹲守', `进入 ${friendName} 农场失败: ${e.message}`, {
            module: 'friend', event: 'stakeout_enter', result: 'error',
            friendName, friendGid,
        });
        return;
    }

    try {
        // 进入后重新分析，确认哪些地块确实已成熟可偷
        const state = getUserState();
        const lands = enterReply.lands || [];
        const freshStatus = analyzeFriendLands(lands, state.gid, friendName);

        // 优先偷目标地块中已成熟的，同时也偷其他已成熟的
        const targetSet = new Set(targetLandIds);
        const stealNow = freshStatus.stealable.filter(id => targetSet.has(id));
        // 额外发现的可偷地块也一并带走
        const bonusSteal = freshStatus.stealable.filter(id => !targetSet.has(id));
        const allSteal = [...stealNow, ...bonusSteal];

        if (allSteal.length === 0) {
            // 可能尚未成熟，等待延迟后再检查一次
            if (delaySec > 0) {
                log('蹲守', `${friendName}: 尚未成熟，等待 ${delaySec} 秒后重试`, {
                    module: 'friend', event: 'stakeout_wait', result: 'ok',
                    friendName, friendGid, delaySec,
                });
                await sleep(delaySec * 1000);

                // 离开后重新进入获取最新数据
                try { await leaveFriendFarm(friendGid, true); } catch { /* ignore */ }
                try {
                    enterReply = await enterFriendFarm(friendGid, true);
                    const recheckLands = enterReply.lands || [];
                    const recheckStatus = analyzeFriendLands(recheckLands, state.gid, friendName);
                    if (recheckStatus.stealable.length > 0) {
                        allSteal.push(...recheckStatus.stealable);
                    }
                } catch {
                    logWarn('蹲守', `重新进入 ${friendName} 农场失败`, {
                        module: 'friend', event: 'stakeout_reenter', result: 'error',
                        friendName, friendGid,
                    });
                    return;
                }
            }
        }

        if (allSteal.length === 0) {
            log('蹲守', `${friendName}: 无可偷地块，可能已被其他人偷走`, {
                module: 'friend', event: 'stakeout_miss', result: 'ok',
                friendName, friendGid,
            });
            return;
        }

        // 预检查偷菜次数
        const precheck = await checkCanOperateRemote(friendGid, 10008, true);
        if (!precheck.canOperate) {
            log('蹲守', `${friendName}: 今日偷菜次数已用完`, {
                module: 'friend', event: 'stakeout_limit', result: 'ok',
                friendName, friendGid,
            });
            return;
        }

        const maxNum = precheck.canStealNum > 0 ? precheck.canStealNum : allSteal.length;
        const finalTargets = allSteal.slice(0, maxNum);

        // 执行偷取 (采用最高优通道)
        let ok = 0;
        const stolenPlants = [];
        try {
            await stealHarvest(friendGid, finalTargets, true);
            ok = finalTargets.length;
            finalTargets.forEach(id => {
                const info = freshStatus.stealableInfo.find(x => x.landId === id);
                if (info) stolenPlants.push(info.name);
            });
        } catch {
            // 批量失败，逐个重试
            for (const landId of finalTargets) {
                try {
                    await stealHarvest(friendGid, [landId], true);
                    ok++;
                    const info = freshStatus.stealableInfo.find(x => x.landId === landId);
                    if (info) stolenPlants.push(info.name);
                } catch { /* ignore */ }
            }
        }

        if (ok > 0) {
            const plantNames = [...new Set(stolenPlants)].join('/');
            recordOperation('steal', ok);
            log('蹲守', `✅ ${friendName}: 成功偷取 ${ok} 块 ${plantNames ? `(${plantNames})` : ''}`, {
                module: 'friend', event: 'stakeout_steal', result: 'ok',
                friendName, friendGid, count: ok, plantNames,
            });

            // 偷取后自动出售
            try {
                await sellAllFruits();
            } catch { /* ignore */ }
        } else {
            log('蹲守', `${friendName}: 偷取失败`, {
                module: 'friend', event: 'stakeout_steal', result: 'fail',
                friendName, friendGid,
            });
        }
    } catch (e) {
        logWarn('蹲守', `${friendName} 蹲守异常: ${e.message}`, {
            module: 'friend', event: 'stakeout_error', result: 'error',
            friendName, friendGid,
        });
    } finally {
        try { await leaveFriendFarm(friendGid, true); } catch { /* ignore */ }
    }
}

/**
 * 获取当前活跃的蹲守任务列表（供面板查看）
 */
function getActiveStakeouts() {
    const result = [];
    for (const [key, info] of activeStakeouts) {
        result.push({
            key,
            friendGid: info.friendGid,
            friendName: info.friendName,
            landIds: info.landIds,
            plantNames: info.plantNames,
            waitMs: info.waitMs,
        });
    }
    return result;
}

module.exports = {
    checkFriends, startFriendCheckLoop, stopFriendCheckLoop,
    refreshFriendCheckLoop,
    checkAndAcceptApplications,
    getOperationLimits,
    getFriendsList,
    getFriendLandsDetail,
    doFriendOperation,
    getActiveStakeouts,
};


const { CONFIG, PlantPhase, PHASE_NAMES } = require('../../config/config');
const { getPlantName, getPlantById, getSeedImageBySeedId } = require('../../config/gameConfig');
const { isAutomationOn, getFriendQuietHours, getFriendBlacklist, setFriendBlacklist, getStealFilterConfig, getStealFriendFilterConfig, getStakeoutStealConfig, getSkipStealRadishConfig, getConfigSnapshot } = require('../../models/store');
const { sendMsgAsync, sendMsgAsyncUrgent, getUserState, networkEvents } = require('../../utils/network');
const { types } = require('../../utils/proto');
const { toLong, toNum, toTimeSec, getServerTimeSec, log, logWarn, sleep } = require('../../utils/utils');
const { getCurrentPhase, setOperationLimitsCallback } = require('../farm');
const { recordOperation } = require('../stats');
const { sellAllFruits } = require('../warehouse');
const { getPool } = require('../mysql-db');
const PlatformFactory = require('../../platform/PlatformFactory');
const state = require('./friend-state');


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


function resetFilterStats() {
    state.filterStats.friendBlacklist = 0;
    state.filterStats.friendWhitelist = 0;
    state.filterStats.plantBlacklist = 0;
    state.filterStats.plantWhitelist = 0;
    state.filterStats.banned = 0;
}


function getFilterSummary() {
    const parts = [];
    if (state.filterStats.friendBlacklist > 0) parts.push(`好友黑名单跳过 ${state.filterStats.friendBlacklist} 人`);
    if (state.filterStats.friendWhitelist > 0) parts.push(`好友白名单外跳过 ${state.filterStats.friendWhitelist} 人`);
    if (state.filterStats.plantBlacklist > 0) parts.push(`植物黑名单跳过 ${state.filterStats.plantBlacklist} 株`);
    if (state.filterStats.plantWhitelist > 0) parts.push(`植物白名单外跳过 ${state.filterStats.plantWhitelist} 株`);
    if (state.filterStats.banned > 0) parts.push(`封禁好友自动加黑 ${state.filterStats.banned} 人`);
    return parts.length > 0 ? parts.join('，') : '';
}

function shouldStealPlant(plantId) {
    const skipRadish = getSkipStealRadishConfig();
    if (skipRadish && skipRadish.enabled) {
        const plant = getPlantById(plantId);
        if (plant && plant.seed_id === 20002) return false;
    }

    const config = getStealFilterConfig();
    if (!config || !config.enabled) return true;

    const plantIds = config.plantIds || [];
    const pid = String(plantId);

    if (config.mode === 'blacklist') {
        const blocked = plantIds.includes(pid);
        if (blocked) state.filterStats.plantBlacklist++;
        return !blocked;
    } else {
        const allowed = plantIds.includes(pid);
        if (!allowed) state.filterStats.plantWhitelist++;
        return allowed;
    }
}

function shouldStealFriend(friendGid) {
    const config = getStealFriendFilterConfig();
    if (!config || !config.enabled) return true;

    const friendIds = config.friendIds || [];
    const gid = String(friendGid);

    if (config.mode === 'blacklist') {
        const blocked = friendIds.includes(gid);
        if (blocked) state.filterStats.friendBlacklist++;
        return !blocked;
    } else {
        const allowed = friendIds.includes(gid);
        if (!allowed) state.filterStats.friendWhitelist++;
        return allowed;
    }
}

function autoBlacklistBannedFriend(friendGid, friendName) {
    try {
        const currentBlacklist = getFriendBlacklist();
        const gid = toNum(friendGid);
        if (gid && !currentBlacklist.includes(gid)) {
            const nextBlacklist = [...currentBlacklist, gid];
            setFriendBlacklist(undefined, nextBlacklist);
            state.filterStats.banned++;
            log('好友', `${friendName}(${gid}) 已被封禁，自动加入黑名单`, {
                module: 'friend', event: 'auto_blacklist_banned', result: 'ok',
                friendName, friendGid: gid,
            });
        }
    } catch (e) {
        logWarn('好友', `自动加黑失败: ${e.message}`);
    }
}


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

async function generateSafeModeBlacklist(accountId) {
    try {
        const pool = getPool();
        const [rows] = await pool.query(`
            SELECT JSON_EXTRACT(details, '$.friendGid') as friendGid
            FROM operation_logs
            WHERE account_id = ?
              AND action IN ('好友', '巡查')
              AND JSON_EXTRACT(details, '$.event') = 'auto_blacklist_banned'
        `, [accountId]);

        const bannedGids = rows
            .map(r => Number(r.friendGid))
            .filter(gid => gid > 0);

        if (bannedGids.length === 0) return [];

        // 去重
        const uniqueBannedGids = [...new Set(bannedGids)];

        // 加入现有黑名单
        const currentBlacklist = getFriendBlacklist();
        const nextBlacklist = [...currentBlacklist];
        let addedCount = 0;
        const newAddedList = [];

        for (const gid of uniqueBannedGids) {
            if (!nextBlacklist.includes(gid)) {
                nextBlacklist.push(gid);
                newAddedList.push(gid);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            setFriendBlacklist(accountId, nextBlacklist);
            log('安全', `[风险规避模式] 已基于历史封禁日志批量补充 ${addedCount} 名好友至黑名单`, {
                module: 'friend', event: 'safe_mode_blacklist_generated', count: addedCount
            });
        }

        return newAddedList;
    } catch (e) {
        logWarn('安全', `生成风险规避黑名单失败: ${e.message}`);
        return [];
    }
}

Object.assign(module.exports, { parseTimeToMinutes, inFriendQuietHours, resetFilterStats, getFilterSummary, shouldStealPlant, shouldStealFriend, autoBlacklistBannedFriend, analyzeFriendLands, generateSafeModeBlacklist });

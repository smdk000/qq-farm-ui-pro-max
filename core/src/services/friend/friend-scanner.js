
const { CONFIG, PlantPhase, PHASE_NAMES } = require('../../config/config');
const { getPlantName, getPlantById, getSeedImageBySeedId } = require('../../config/gameConfig');
const { isAutomationOn, getFriendBlacklist, getStakeoutStealConfig, getFriendQuietHours } = require('../../models/store');
const { getUserState, networkEvents } = require('../../utils/network');
const { toNum, toTimeSec, getServerTimeSec, log, logWarn, sleep } = require('../../utils/utils');
const { getCurrentPhase, setOperationLimitsCallback } = require('../farm');
const { recordOperation } = require('../stats');
const { sellAllFruits } = require('../warehouse');
const { getRuntimeAccountModePolicy } = require('../account-mode-policy');
const friendStealStatsService = require('../friend-steal-stats-service');
const PlatformFactory = require('../../platform/PlatformFactory');
const state = require('./friend-state');
const decision = require('./friend-decision');
const actions = require('./friend-actions');
const { circuitBreaker } = require('../circuit-breaker');
const BANNED_ERROR_CODE = 1002003;
const FRIENDS_LIST_DEBUG_LOG_TTL_MS = 5 * 60 * 1000;
const _friendsListDebugLogCache = new Map();
const PERIODIC_STATUS_LOG_TTL_MS = 5 * 60 * 1000;
const _periodicStatusLogCache = new Map();
const HIGH_RISK_QQ_GUARD_TTL_MS = 5 * 60 * 1000;
const _highRiskQqGuardLogCache = new Map();
let consecutiveErrors = 0;

function _logFriendsListDebug(cacheKey, message, level = 'info') {
    const now = Date.now();
    const prev = _friendsListDebugLogCache.get(cacheKey);
    if (prev && prev.message === message && (now - prev.at) < FRIENDS_LIST_DEBUG_LOG_TTL_MS) {
        return;
    }
    _friendsListDebugLogCache.set(cacheKey, { message, at: now });
    if (level === 'warn') {
        logWarn('好友', message);
        return;
    }
    log('好友', message);
}

function _logPeriodicStatus(cacheKey, message, options = {}) {
    const {
        level = 'info',
        ttlMs = PERIODIC_STATUS_LOG_TTL_MS,
        stateValue = message,
        tag = '好友',
        meta,
    } = options;
    const now = Date.now();
    const prev = _periodicStatusLogCache.get(cacheKey);
    if (prev && prev.stateValue === stateValue && (now - prev.at) < ttlMs) {
        return;
    }
    _periodicStatusLogCache.set(cacheKey, { stateValue, at: now });
    if (level === 'warn') {
        logWarn(tag, message, meta);
        return;
    }
    log(tag, message, meta);
}

function _clearPeriodicStatus(...keys) {
    keys.forEach(key => _periodicStatusLogCache.delete(key));
}

function _attachFriendsListMeta(list, meta = null) {
    const target = Array.isArray(list) ? list : [];
    if (!meta || typeof meta !== 'object') {
        return target;
    }
    target._meta = meta;
    return target;
}

function _buildFriendsListMeta(reply, options = {}) {
    const reason = String(
        options.reason
        || reply?._wxRealtimeUnavailableReason
        || ''
    ).trim();
    const platform = String(CONFIG.platform || '').trim();
    const isWechatFallback = !!(reply?._wxConservativeGetAllOnly && reply?._wxRealtimeUnavailable);
    const isQqCacheFallback = !!(reply?._qqConservativeSyncOnly && reply?._fromCache);
    const source = String(
        options.source
        || (reply?._fromCache
            ? 'cache'
            : (isWechatFallback ? 'empty' : 'live'))
    ).trim() || 'live';
    const cooldownUntil = Math.max(0, Number(reply?._wxAutoRetryAt || 0));
    const syncAllUnsupportedUntil = Math.max(0, Number(reply?._wxSyncAllUnsupportedUntil || 0));
    const cacheSource = String(reply?._cacheSource || options.cacheSource || '').trim();
    const syncSource = String(reply?._syncSource || options.syncSource || '').trim();
    const importOpenIdCount = Math.max(0, Number(reply?._importOpenIdCount || options.importOpenIdCount || 0));
    const seededCount = Math.max(0, Number(reply?._cacheSeededCount || options.seededCount || 0));
    const needsMeta = isWechatFallback || isQqCacheFallback || source === 'cache' || source === 'empty' || cooldownUntil > 0 || syncAllUnsupportedUntil > 0 || !!cacheSource || !!syncSource || importOpenIdCount > 0 || seededCount > 0 || options.force;
    if (!needsMeta) {
        return null;
    }
    const meta = {
        source,
        reason: reason || undefined,
        platform,
        realtimeAvailable: source === 'live' && !isWechatFallback,
        conservative: !!(reply?._wxConservativeGetAllOnly || reply?._qqConservativeSyncOnly),
    };
    if (cacheSource) {
        meta.cacheSource = cacheSource;
    }
    if (syncSource) {
        meta.syncSource = syncSource;
    }
    if (importOpenIdCount > 0) {
        meta.importOpenIdCount = importOpenIdCount;
    }
    if (seededCount > 0) {
        meta.seededCount = seededCount;
    }
    if (cooldownUntil > 0) {
        meta.cooldownUntil = cooldownUntil;
    }
    if (syncAllUnsupportedUntil > 0) {
        meta.syncAllUnsupportedUntil = syncAllUnsupportedUntil;
    }
    return meta;
}

function _describeManualRefreshReason(reason) {
    switch (String(reason || '').trim()) {
        case 'self_only':
            return '接口仅返回自己';
        case 'empty':
            return '接口未返回可用好友';
        case 'cooldown':
            return '当前先休息一会';
        case 'error':
            return '接口请求异常';
        case 'worker_error':
            return '运行时拉取失败';
        case 'cache_fallback':
            return '已回退缓存好友';
        case 'request_failed':
            return '请求失败';
        default:
            return '';
    }
}

function _logManualRefreshSummary(meta, stats = {}) {
    const normalizedMeta = meta && typeof meta === 'object' ? meta : {};
    const source = String(normalizedMeta.source || 'empty').trim() || 'empty';
    const reason = String(normalizedMeta.reason || '').trim();
    const visibleCount = Math.max(0, Number(stats.visibleCount || 0));
    const rawCount = Math.max(0, Number(stats.rawCount || 0));
    const filteredOutCount = Math.max(0, Number(stats.filteredOutCount || 0));
    const cooldownMs = Math.max(0, Number(normalizedMeta.cooldownUntil || 0) - Date.now());
    const cooldownSec = cooldownMs > 0 ? Math.ceil(cooldownMs / 1000) : 0;
    const reasonText = _describeManualRefreshReason(reason);

    if (source === 'live' && visibleCount > 0) {
        log('好友', `手动刷新好友成功：实时好友 ${visibleCount} 人`, {
            module: 'friend',
            event: 'friend_manual_refresh',
            result: 'live',
            source,
            visibleCount,
            rawCount,
            filteredOutCount,
        });
        return;
    }

    const normalizedSource = source === 'live' ? 'empty' : source;
    const baseMessage = normalizedSource === 'cache'
        ? `手动刷新好友已回退缓存：缓存好友 ${visibleCount} 人`
        : '手动刷新好友未拿到可用结果';
    const reasonMessage = reasonText ? `，原因：${reasonText}` : '';
    const retryMessage = cooldownSec > 0 ? `，自动重试约 ${cooldownSec} 秒后恢复` : '';
    logWarn('好友', `${baseMessage}${reasonMessage}${retryMessage}`, {
        module: 'friend',
        event: 'friend_manual_refresh',
        result: normalizedSource,
        source: normalizedSource,
        reason: reason || undefined,
        visibleCount,
        rawCount,
        filteredOutCount,
        cooldownSec: cooldownSec || undefined,
    });
}

function isQQPlatform() {
    return String(CONFIG.platform || '').trim().toLowerCase() === 'qq';
}

function isQQHighRiskAutomationAllowed() {
    if (!isQQPlatform()) return true;
    const text = String(process.env.FARM_ALLOW_HIGH_RISK_QQ_AUTOMATION || '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function logQQHighRiskGuard(cacheKey, message, meta = {}) {
    if (!isQQPlatform()) return;
    const now = Date.now();
    const prev = _highRiskQqGuardLogCache.get(cacheKey) || 0;
    if (now - prev < HIGH_RISK_QQ_GUARD_TTL_MS) {
        return;
    }
    _highRiskQqGuardLogCache.set(cacheKey, now);
    logWarn('安全', message, {
        module: 'friend',
        event: 'qq_high_risk_guard',
        result: 'blocked',
        ...meta,
    });
}

function clearStakeoutTasks() {
    for (const [taskKey] of state.activeStakeouts) {
        if (state.friendScheduler) {
            state.friendScheduler.clear(taskKey);
        }
        state.activeStakeouts.delete(taskKey);
    }
    if (!state.friendScheduler || typeof state.friendScheduler.getTaskNames !== 'function') {
        return;
    }
    for (const taskName of state.friendScheduler.getTaskNames()) {
        const normalized = String(taskName || '');
        if (normalized.startsWith('stake_') || normalized.startsWith('stake_quiet_')) {
            state.friendScheduler.clear(taskName);
        }
    }
}

function getDelayUntilFriendQuietHoursEndMs(now = new Date()) {
    if (!decision.inFriendQuietHours(now)) return 0;
    const cfg = getFriendQuietHours();
    if (!cfg || !cfg.enabled) return 0;

    const start = decision.parseTimeToMinutes(cfg.start);
    const end = decision.parseTimeToMinutes(cfg.end);
    if (start === null || end === null || start === end) return 0;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const seconds = Math.max(0, now.getSeconds());
    const milliseconds = Math.max(0, now.getMilliseconds());
    const carryMs = (60 - seconds) * 1000 - milliseconds;
    const minutesUntilEnd = start < end
        ? Math.max(0, end - currentMinutes)
        : (currentMinutes >= start
            ? ((24 * 60) - currentMinutes + end)
            : Math.max(0, end - currentMinutes));

    return Math.max(5000, minutesUntilEnd * 60 * 1000 + carryMs + 5000);
}

function scheduleDeferredFriendApplicationCheck(reason = 'quiet_hours') {
    const waitMs = getDelayUntilFriendQuietHoursEndMs();
    if (waitMs <= 0) return;
    state.friendScheduler.setTimeoutTask('friend_auto_accept_after_quiet', waitMs, () => checkAndAcceptApplications());
    log('申请', `当前处于静默时段，自动同意好友顺延至静默结束后再执行`, {
        module: 'friend',
        event: 'friend_auto_accept_deferred',
        result: 'ok',
        reason,
        waitMs,
    });
}

function scheduleDeferredStakeout(friendGid, friendName, targetLandIds, delaySec) {
    const waitMs = getDelayUntilFriendQuietHoursEndMs();
    if (waitMs <= 0) return false;
    const retryKey = `stake_quiet_${friendGid}_${[...targetLandIds].sort((a, b) => a - b).join('_')}`;
    state.friendScheduler.setTimeoutTask(retryKey, waitMs, () => {
        runStakeoutSteal(friendGid, friendName, targetLandIds, delaySec).catch(() => { });
    });
    log('蹲守', `${friendName}: 当前处于静默时段，顺延到静默结束后再尝试`, {
        module: 'friend',
        event: 'stakeout_deferred_by_quiet',
        result: 'ok',
        friendName,
        friendGid,
        targetLandIds,
        waitMs,
    });
    return true;
}

function _resolveFriendQQUin(friend) {
    const gid = toNum(friend && friend.gid);
    const gidText = gid > 0 ? String(gid) : '';
    const rawUin = String(friend && friend.uin || '').trim();
    if (/^\d+$/.test(rawUin) && rawUin !== gidText) return rawUin;
    return '';
}

function _resolveFriendOpenId(friend) {
    const gid = toNum(friend && friend.gid);
    const gidText = gid > 0 ? String(gid) : '';
    const openId = String(friend && friend.open_id || '').trim();
    if (openId && openId !== gidText) return openId;
    const rawUin = String(friend && friend.uin || '').trim();
    if (rawUin && rawUin !== gidText && !/^\d+$/.test(rawUin)) return rawUin;
    return '';
}

function _logModeScopePolicy(policy) {
    if (!policy || policy.collaborationEnabled || !policy.degradeReason) {
        _clearPeriodicStatus('friend_mode_scope');
        return;
    }

    const reasonLabel = policy.degradeReasonLabel || policy.degradeReason;
    const isStrictBlock = policy.fallbackBehavior === 'strict_block';
    const message = isStrictBlock
        ? `账号模式作用范围未命中: ${reasonLabel}，好友模块已按 ${policy.effectiveMode || 'safe'} 模式保守执行`
        : `账号模式作用范围未命中: ${reasonLabel}，好友模块按独立账号继续执行`;

    _logPeriodicStatus('friend_mode_scope', message, {
        level: isStrictBlock ? 'warn' : 'info',
        stateValue: `${policy.fallbackBehavior}:${policy.effectiveMode}:${policy.degradeReason}`,
        meta: {
            module: 'friend',
            event: 'mode_scope',
            result: policy.collaborationEnabled ? 'in_scope' : 'standalone',
            effectiveMode: policy.effectiveMode || policy.accountMode || 'main',
            degradeReason: policy.degradeReason,
        },
    });
}

async function scanAndClassifyFriends(friends, state) {
    const blacklist = new Set(getFriendBlacklist());
    const stealFriends = [];
    const helpFriends = [];
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

        const friendInfo = { gid, name, stealNum, dryNum, weedNum, insectNum };

        if (stealNum > 0 && decision.shouldStealFriend(gid)) {
            stealFriends.push(friendInfo);
        }

        const helpTotal = dryNum + weedNum + insectNum;
        if (helpTotal > 0) {
            helpFriends.push(friendInfo);
        }

        if (stealNum === 0 && helpTotal === 0) {
            otherFriends.push(friendInfo);
        }

        visitedGids.add(gid);
    }

    stealFriends.sort((a, b) => b.stealNum - a.stealNum);
    helpFriends.sort((a, b) => {
        const helpA = a.dryNum + a.weedNum + a.insectNum;
        const helpB = b.dryNum + b.weedNum + b.insectNum;
        return helpB - helpA;
    });

    return { stealFriends, helpFriends, otherFriends };
}

async function batchStealFromFriends(stealFriends, myGid) {
    let totalStolen = 0;
    const stakeoutCfg = getStakeoutStealConfig();

    for (let i = 0; i < stealFriends.length; i++) {
        const friend = stealFriends[i];

        let enterReply;
        try {
            enterReply = await actions.enterFriendFarm(friend.gid);
        } catch (e) {
            if (e && e.code === BANNED_ERROR_CODE) {
                decision.autoBlacklistBannedFriend(friend.gid, friend.name);
            } else {
                logWarn('好友', `进入 ${friend.name} 农场失败: ${e.message}`, {
                    module: 'friend', event: 'enter_farm', result: 'error',
                    friendName: friend.name, friendGid: friend.gid,
                });
            }
            continue;
        }

        const lands = enterReply.lands || [];
        if (lands.length === 0) {
            await actions.leaveFriendFarm(friend.gid);
            continue;
        }

        const status = decision.analyzeFriendLands(lands, myGid, friend.name);

        if (status.stealable.length > 0) {
            const precheck = await actions.checkCanOperateRemote(friend.gid, 10008);
            if (precheck.canOperate) {
                const canStealNum = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
                const targetLands = status.stealable.slice(0, canStealNum);

                let ok = 0;
                const stolenPlants = [];

                try {
                    await actions.stealHarvest(friend.gid, targetLands);
                    ok = targetLands.length;
                    targetLands.forEach(id => {
                        const info = status.stealableInfo.find(x => x.landId === id);
                        if (info) stolenPlants.push(info.name);
                    });
                } catch {
                    for (const landId of targetLands) {
                        try {
                            await actions.stealHarvest(friend.gid, [landId]);
                            ok++;
                            const info = status.stealableInfo.find(x => x.landId === landId);
                            if (info) stolenPlants.push(info.name);
                        } catch { /* ignore */ }
                        await sleep(500 + Math.floor(Math.random() * 700));
                    }
                }

                if (ok > 0) {
                    const plantNames = [...new Set(stolenPlants)].join('/');
                    totalStolen += ok;
                    recordOperation('steal', ok);
                    await friendStealStatsService.recordStealSuccess({
                        accountId: CONFIG.accountId || process.env.FARM_ACCOUNT_ID || '',
                        friendGid: friend.gid,
                        friendUin: friend.uin || '',
                        friendOpenId: friend.openId || friend.open_id || '',
                        friendName: friend.name,
                        stealCount: ok,
                        landCount: ok,
                        plantNames: stolenPlants,
                        mode: 'batch_auto',
                    }).catch(() => { });
                    log('好友', `[偷菜] ${friend.name}: 偷${ok}${plantNames ? `(${plantNames})` : ''}`, {
                        module: 'friend', event: 'batch_steal', result: 'ok',
                        friendName: friend.name, friendGid: friend.gid, count: ok,
                    });
                }
            }
        }

        if (stakeoutCfg.enabled && decision.shouldStealFriend(friend.gid) && status.upcomingMature.length > 0) {
            scheduleStakeout(friend.gid, friend.name, status.upcomingMature, stakeoutCfg.delaySec);
        }

        await actions.leaveFriendFarm(friend.gid);

        if (i < stealFriends.length - 1) {
            await sleep(1500 + Math.floor(Math.random() * 3500)); // 🔧 优化：1.5~5秒，更保守模拟人类
        }
    }

    return totalStolen;
}

async function batchHelpFriends(helpFriends, myGid) {
    const totalHelp = { water: 0, weed: 0, bug: 0 };
    const helpEnabled = !!isAutomationOn('friend_help');
    const stopWhenExpLimit = !!isAutomationOn('friend_help_exp_limit');

    if (!helpEnabled) return totalHelp;
    if (!stopWhenExpLimit) state.canGetHelpExp = true;

    for (let i = 0; i < helpFriends.length; i++) {
        const friend = helpFriends[i];

        if (stopWhenExpLimit && !state.canGetHelpExp) break;

        let enterReply;
        try {
            enterReply = await actions.enterFriendFarm(friend.gid);
        } catch (e) {
            if (e && e.code === BANNED_ERROR_CODE) {
                decision.autoBlacklistBannedFriend(friend.gid, friend.name);
            } else {
                logWarn('好友', `[帮助] 进入 ${friend.name} 农场失败: ${e.message}`, {
                    module: 'friend', event: 'enter_farm', result: 'error',
                    friendName: friend.name, friendGid: friend.gid,
                });
            }
            continue;
        }

        const lands = enterReply.lands || [];
        if (lands.length === 0) {
            await actions.leaveFriendFarm(friend.gid);
            continue;
        }

        const status = decision.analyzeFriendLands(lands, myGid, friend.name);
        const actionLog = [];

        const helpOps = [
            { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: actions.helpWeed, key: 'weed', name: '草', record: 'actions.helpWeed' },
            { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: actions.helpInsecticide, key: 'bug', name: '虫', record: 'helpBug' },
            { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: actions.helpWater, key: 'water', name: '水', record: 'actions.helpWater' },
        ];

        for (const op of helpOps) {
            const allowByExp = (!stopWhenExpLimit) || (actions.canGetExpByCandidates(op.expIds) && state.canGetHelpExp);
            if (op.list.length > 0 && allowByExp) {
                const precheck = await actions.checkCanOperateRemote(friend.gid, op.id);
                if (precheck.canOperate) {
                    const count = await runBatchWithFallback(
                        op.list,
                        (ids) => op.fn(friend.gid, ids, stopWhenExpLimit),
                        (ids) => op.fn(friend.gid, ids, stopWhenExpLimit),
                    );
                    if (count > 0) {
                        actionLog.push(`${op.name}${count}`);
                        totalHelp[op.key] += count;
                        recordOperation(op.record, count);
                    }
                }
            }
        }

        if (actionLog.length > 0) {
            log('好友', `[帮助] ${friend.name}: ${actionLog.join('/')}`, {
                module: 'friend', event: 'batch_help', result: 'ok',
                friendName: friend.name, friendGid: friend.gid, actions: actionLog,
            });
        }

        await actions.leaveFriendFarm(friend.gid);

        if (i < helpFriends.length - 1) {
            await sleep(1000 + Math.floor(Math.random() * 4000));
        }
    }

    return totalHelp;
}

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
    if (state.lastResetDate !== today) {
        if (state.lastResetDate !== '') {
            log('系统', '跨日重置，清空操作限制缓存');
        }
        state.operationLimits.clear();
        state.canGetHelpExp = true;
        if (state.helpAutoDisabledByLimit) {
            state.helpAutoDisabledByLimit = false;
            log('好友', '新的一天已开始，自动恢复帮忙操作功能', {
                module: 'friend',
                event: 'friend_cycle',
                result: 'ok',
            });
        }
        state.lastResetDate = today;
    }
}


function autoDisableHelpByExpLimit() {
    if (!state.canGetHelpExp) return;
    state.canGetHelpExp = false;
    state.helpAutoDisabledByLimit = true;
    log('好友', '今日帮助经验已达上限，自动停止帮忙', {
        module: 'friend',
        event: 'friend_cycle',
        result: 'ok',
    });
}

async function getFriendsList(options = {}) {
    try {
        const reply = await actions.getAllFriends(options);
        const friends = reply.game_friends || [];
        const userState = getUserState();
        const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
        const isWechatEnv = !platformInst.allowSyncAll();
        const filteredOut = [];
        const preserveImportedSyncAll = String(reply?._syncSource || '').trim() === 'imported_syncall';

        const filtered = friends
            .filter(f => {
                const fGid = toNum(f.gid);
                const isSelf = fGid === userState.gid;
                const isXiaoNongFu = !preserveImportedSyncAll && (f.name === '小小农夫' || f.remark === '小小农夫');
                if (isSelf || isXiaoNongFu) {
                    filteredOut.push({
                        gid: fGid,
                        name: f.name || '',
                        remark: f.remark || '',
                        reason: isSelf ? '自己' : '小小农夫',
                    });
                }
                return !isSelf && !isXiaoNongFu;
            });

        _logFriendsListDebug(
            'friends_list_summary',
            `[getFriendsList 调试] 原始=${friends.length}, 过滤后=${filtered.length}, 当前 gid=${userState.gid}`
        );
        if (filteredOut.length > 0) {
            const excludedSummary = filteredOut
                .map(item => `gid=${item.gid}, name=${item.name}, remark=${item.remark}, 原因=${item.reason}`)
                .join(' | ');
            _logFriendsListDebug(
                'friends_list_filtered',
                `[getFriendsList 调试] 过滤掉 ${filteredOut.length} 项: ${excludedSummary}`
            );
        }

        const normalized = filtered
            .map(f => ({
                gid: toNum(f.gid),
                uin: _resolveFriendQQUin(f),
                openId: _resolveFriendOpenId(f),
                name: f.remark || f.name || `GID:${toNum(f.gid)}`,
                avatarUrl: String(f.avatar_url || '').trim(),
                farmLevel: Math.max(0, toNum(f.level) || 0),
                isWechat: !!isWechatEnv,
                plant: f.plant ? {
                    stealNum: toNum(f.plant.steal_plant_num),
                    dryNum: toNum(f.plant.dry_num),
                    weedNum: toNum(f.plant.weed_num),
                    insectNum: toNum(f.plant.insect_num),
                } : null,
            }))
            .sort((a, b) => {
                const an = String(a.name || '');
                const bn = String(b.name || '');
                const byName = an.localeCompare(bn, 'zh-CN');
                if (byName !== 0) return byName;
                return Number(a.gid || 0) - Number(b.gid || 0);
            });
        const meta = _buildFriendsListMeta(reply, {
            reason: options.manualRefresh ? String(reply?._wxRealtimeUnavailableReason || '').trim() : '',
            force: !!options.manualRefresh,
        });
        if (options.manualRefresh) {
            _logManualRefreshSummary(meta || { source: 'live' }, {
                visibleCount: normalized.length,
                rawCount: friends.length,
                filteredOutCount: filteredOut.length,
            });
        }
        return _attachFriendsListMeta(normalized, meta);
    } catch (err) {
        _logFriendsListDebug('friends_list_error', `[getFriendsList 调试] 获取好友列表异常: ${err.message}`, 'warn');
        if (options.manualRefresh) {
            _logManualRefreshSummary({
                source: 'empty',
                reason: 'error',
            }, {
                visibleCount: 0,
                rawCount: 0,
                filteredOutCount: 0,
            });
        }
        return _attachFriendsListMeta([], {
            source: 'empty',
            reason: 'error',
            platform: String(CONFIG.platform || '').trim(),
            realtimeAvailable: false,
            conservative: false,
            cacheSource: '',
            seededCount: 0,
        });
    }
}

async function getFriendLandsDetail(friendGid) {
    try {
        const enterReply = await actions.enterFriendFarm(friendGid);
        const lands = enterReply.lands || [];
        const state = getUserState();
        const analyzed = decision.analyzeFriendLands(lands, state.gid, '');
        await actions.leaveFriendFarm(friendGid);

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
            // Phase 3: Jitter 抖动防查 (0.5s - 1.2s) - 模拟人类点击单块土地的延迟
            await sleep(500 + Math.floor(Math.random() * 700));
        }
        return ok;
    }
}


async function visitFriend(friend, totalActions, myGid, modePolicy = null) {
    const { gid, name } = friend;
    const effectiveMode = String((modePolicy && modePolicy.effectiveMode) || 'main').trim().toLowerCase() || 'main';
    const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
    const allowAutoSteal = !!platformInst.allowAutoSteal();

    let enterReply;
    try {
        enterReply = await actions.enterFriendFarm(gid);
    } catch (e) {
        if (e && e.code === BANNED_ERROR_CODE) {
            decision.autoBlacklistBannedFriend(gid, name);
        } else {
            logWarn('好友', `进入 ${name} 农场失败: ${e.message}`, {
                module: 'friend', event: 'enter_farm', result: 'error', friendName: name, friendGid: gid
            });
        }
        return;
    }

    const lands = enterReply.lands || [];
    if (lands.length === 0) {
        await actions.leaveFriendFarm(gid);
        return;
    }

    const status = decision.analyzeFriendLands(lands, myGid, name);

    const actionLog = [];

    // 1. 帮助操作 (除草/除虫/浇水)
    const helpEnabled = !!isAutomationOn('friend_help');
    const stopWhenExpLimit = !!isAutomationOn('friend_help_exp_limit');
    if (!stopWhenExpLimit) state.canGetHelpExp = true;
    if (!helpEnabled) {
        // 自动帮忙关闭，直接跳过帮助操作
    } else if (stopWhenExpLimit && !state.canGetHelpExp) {
        // 今日已达到经验上限后停止帮忙
    } else {
        const helpOps = [
            { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: actions.helpWeed, key: 'weed', name: '草', record: 'actions.helpWeed' },
            { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: actions.helpInsecticide, key: 'bug', name: '虫', record: 'helpBug' },
            { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: actions.helpWater, key: 'water', name: '水', record: 'actions.helpWater' }
        ];

        for (const op of helpOps) {
            const allowByExp = (!stopWhenExpLimit) || (actions.canGetExpByCandidates(op.expIds) && state.canGetHelpExp);
            if (op.list.length > 0 && allowByExp) {
                const precheck = await actions.checkCanOperateRemote(gid, op.id);
                if (precheck.canOperate) {
                    const count = await runBatchWithFallback(
                        op.list,
                        (ids) => op.fn(gid, ids, stopWhenExpLimit),
                        (ids) => op.fn(gid, ids, stopWhenExpLimit)
                    );
                    if (count > 0) {
                        actionLog.push(`${op.name}${count}`);
                        totalActions[op.key] += count;
                        recordOperation(op.record, count);
                    }
                }
            }
        }
    }

    // 2. 偷菜操作
    if (effectiveMode !== 'safe' && allowAutoSteal && isAutomationOn('friend_steal') && status.stealable.length > 0) {
        const precheck = await actions.checkCanOperateRemote(gid, 10008);
        if (precheck.canOperate) {
            const canStealNum = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const targetLands = status.stealable.slice(0, canStealNum);

            let ok = 0;
            const stolenPlants = [];

            try {
                await actions.stealHarvest(gid, targetLands);
                ok = targetLands.length;
                targetLands.forEach(id => {
                    const info = status.stealableInfo.find(x => x.landId === id);
                    if (info) stolenPlants.push(info.name);
                });
            } catch {
                for (const landId of targetLands) {
                    try {
                        await actions.stealHarvest(gid, [landId]);
                        ok++;
                        const info = status.stealableInfo.find(x => x.landId === landId);
                        if (info) stolenPlants.push(info.name);
                    } catch { /* ignore */ }
                    await sleep(500 + Math.floor(Math.random() * 700));
                }
            }

            if (ok > 0) {
                const plantNames = [...new Set(stolenPlants)].join('/');
                actionLog.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`);
                totalActions.steal += ok;
                recordOperation('steal', ok);
                await friendStealStatsService.recordStealSuccess({
                    accountId: CONFIG.accountId || process.env.FARM_ACCOUNT_ID || '',
                    friendGid: gid,
                    friendName: name,
                    stealCount: ok,
                    landCount: ok,
                    plantNames: stolenPlants,
                    mode: 'auto',
                }).catch(() => { });
            }
        }
    }

    // 3. 捣乱操作 (放虫/放草)
    const autoBad = effectiveMode !== 'safe' && isAutomationOn('friend_bad');
    if (autoBad) {
        if (status.canPutBug.length > 0 && actions.canOperate(10004)) {
            const remaining = actions.getRemainingTimes(10004);
            const toProcess = status.canPutBug.slice(0, remaining);
            const ok = await actions.putInsects(gid, toProcess);
            if (ok > 0) { actionLog.push(`放虫${ok}`); totalActions.putBug += ok; }
        }

        if (status.canPutWeed.length > 0 && actions.canOperate(10003)) {
            const remaining = actions.getRemainingTimes(10003);
            const toProcess = status.canPutWeed.slice(0, remaining);
            const ok = await actions.putWeeds(gid, toProcess);
            if (ok > 0) { actionLog.push(`放草${ok}`); totalActions.putWeed += ok; }
        }
    }

    // 4. 蹲守偷菜调度（在离开前评估即将成熟的地块）
    const stakeoutCfg = getStakeoutStealConfig();
    const stakeoutAllowed = stakeoutCfg.enabled
        && decision.shouldStealFriend(gid)
        && status.upcomingMature.length > 0
        && isQQHighRiskAutomationAllowed();
    if (stakeoutCfg.enabled && !isQQHighRiskAutomationAllowed()) {
        logQQHighRiskGuard('stakeout_schedule', 'QQ 平台默认已关闭“精准蹲守偷菜”，不再预约精确成熟偷取任务。', {
            friendName: name,
            friendGid: gid,
        });
    }
    if (stakeoutAllowed) {
        scheduleStakeout(gid, name, status.upcomingMature, stakeoutCfg.delaySec);
    }

    if (actionLog.length > 0) {
        log('好友', `${name}: ${actionLog.join('/')}`, {
            module: 'friend', event: 'visit_friend', result: 'ok', friendName: name, friendGid: gid, actions: actionLog
        });
    }

    await actions.leaveFriendFarm(gid);
}


async function checkFriends(mode = 'full') {
    const state = getUserState();

    if (state.suspendUntil && Date.now() < state.suspendUntil) {
        const resetMinutes = Math.ceil((state.suspendUntil - Date.now()) / 60000);
        _logPeriodicStatus(
            'friend_suspend',
            `账号正在休息中，跳过本次巡回 (剩余约 ${resetMinutes} 分钟)...`,
            { level: 'warn', stateValue: `bucket:${Math.ceil(resetMinutes / 5)}` }
        );
        return false;
    }
    _clearPeriodicStatus('friend_suspend');

    if (!circuitBreaker.allowRequest()) {
        _logPeriodicStatus('friend_circuit_breaker', '全局断路器已开启，好友巡查被物理阻断', {
            level: 'warn',
            tag: '系统',
        });
        return false;
    }
    _clearPeriodicStatus('friend_circuit_breaker');

    if (!isAutomationOn('friend')) return false;

    const normalizedMode = new Set(['full', 'help', 'steal']).has(String(mode || '')) ? String(mode) : 'full';
    const modePolicy = getRuntimeAccountModePolicy();
    const effectiveMode = String(modePolicy.effectiveMode || modePolicy.accountMode || 'main').trim().toLowerCase() || 'main';
    const stakeoutCfg = getStakeoutStealConfig();
    const qqHighRiskAutomationAllowed = isQQHighRiskAutomationAllowed();
    _logModeScopePolicy(modePolicy);
    if (!qqHighRiskAutomationAllowed && stakeoutCfg.enabled) {
        clearStakeoutTasks();
        logQQHighRiskGuard('stakeout_cleanup', 'QQ 平台默认已关闭“精准蹲守偷菜”，已清理待执行的蹲守任务。');
    }
    const baseHelpEnabled = !!isAutomationOn('friend_help');
    const baseStealEnabled = !!isAutomationOn('friend_steal');
    const baseBadEnabled = !!isAutomationOn('friend_bad');
    const helpEnabled = normalizedMode === 'steal' ? false : baseHelpEnabled;
    let stealEnabled = normalizedMode === 'help' ? false : baseStealEnabled;
    let badEnabled = normalizedMode === 'help' ? baseBadEnabled : false;
    if (effectiveMode === 'safe') {
        stealEnabled = false;
        badEnabled = false;
    }

    const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
    const platformAllowsAutoSteal = !!platformInst.allowAutoSteal();
    if (!platformAllowsAutoSteal) {
        stealEnabled = false;
        if (baseStealEnabled) {
            _logPeriodicStatus(
                'friend_platform_auto_steal_block',
                `当前平台 ${CONFIG.platform} 已强制关闭自动偷菜，避免打扰微信好友链路`,
                {
                    level: 'warn',
                    tag: '安全',
                    stateValue: `steal_block:${CONFIG.platform}`,
                    meta: {
                        module: 'friend',
                        event: 'platform_guard',
                        result: 'auto_steal_disabled',
                        platform: CONFIG.platform,
                    },
                },
            );
        }
    } else {
        _clearPeriodicStatus('friend_platform_auto_steal_block');
    }

    const hasAnyFriendOp = helpEnabled || stealEnabled || badEnabled;
    if (state.isCheckingFriends || !state.gid || !hasAnyFriendOp) return false;
    if (decision.inFriendQuietHours()) return false;

    state.isCheckingFriends = true;
    checkDailyReset();
    decision.resetFilterStats();

    try {
        const friendsReply = await actions.getAllFriends();
        const friends = friendsReply.game_friends || [];
        if (friendsReply && friendsReply._fromCache && friendsReply._qqConservativeSyncOnly) {
            _logPeriodicStatus(
                'friend_qq_conservative_cache_skip',
                'QQ 保守好友链路：本轮未拿到实时好友列表，已跳过自动好友互动，避免按缓存名单盲目访问。',
                {
                    level: 'warn',
                    tag: '安全',
                    stateValue: `cached_skip:${friends.length}`,
                    meta: {
                        module: 'friend',
                        event: 'qq_friend_fetch_guard',
                        result: 'skip_cycle_by_cache',
                        cachedCount: friends.length,
                    },
                },
            );
            return false;
        }
        _clearPeriodicStatus('friend_qq_conservative_cache_skip');
        if (friendsReply && friendsReply._wxConservativeGetAllOnly && friendsReply._wxRealtimeUnavailable) {
            const usingCache = !!friendsReply._fromCache;
            _logPeriodicStatus(
                'friend_wx_conservative_skip',
                usingCache
                    ? '微信保守好友链路：实时好友列表当前不可用，本轮仅保留缓存展示并跳过自动好友互动。'
                    : '微信保守好友链路：实时好友列表当前不可用，且没有可用缓存，本轮已停止重复探测并跳过自动好友互动。',
                {
                    level: 'warn',
                    tag: '安全',
                    stateValue: `wx_skip:${usingCache ? 'cache' : 'empty'}:${String(friendsReply._wxRealtimeUnavailableReason || 'unknown')}`,
                    meta: {
                        module: 'friend',
                        event: 'wx_friend_fetch_guard',
                        result: usingCache ? 'skip_cycle_by_cache' : 'skip_cycle_empty',
                        cachedCount: friends.length,
                        reason: String(friendsReply._wxRealtimeUnavailableReason || '').trim() || undefined,
                    },
                },
            );
            return false;
        }
        _clearPeriodicStatus('friend_wx_conservative_skip');
        if (friends.length === 0) {
            if (!platformAllowsAutoSteal && baseStealEnabled) {
                _logPeriodicStatus(
                    'friend_wx_safety',
                    '微信环境安全降级：受限模式已生效，确认无好友可访问[不执行任何偷取与批处理]',
                    { level: 'warn', tag: '安全', meta: { module: 'friend', event: 'wx_safety' } }
                );
            }
            _logPeriodicStatus('friend_no_friends', '没有好友', {
                meta: { module: 'friend', event: 'friend_scan', result: 'empty' },
            });
            return false;
        }
        _clearPeriodicStatus('friend_wx_safety', 'friend_no_friends');

        // 三阶段模式：扫描→偷菜→帮助（通过 friend_three_phase 开关控制）
        const useThreePhase = normalizedMode === 'full' && !!isAutomationOn('friend_three_phase');
        if (useThreePhase && stealEnabled) {
            return await checkFriendsThreePhase(friends, state, helpEnabled, badEnabled, modePolicy);
        }

        // 原有逐个遍历模式
        const canPutBugOrWeed = actions.canOperate(10004) || actions.canOperate(10003);
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
            consecutiveErrors = 0; // 无任务视为正常
            return false;
        }

        const totalActions = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 };

        for (let i = 0; i < friendsToVisit.length; i++) {
            const friend = friendsToVisit[i];

            // 如果是仅捣乱的好友（帮忙/偷菜均未开启），且次数已用完，则停止
            if (!friend.isPriority && !helpEnabled && !stealEnabled && !actions.canOperate(10004) && !actions.canOperate(10003)) {
                break;
            }

            try {
                await visitFriend(friend, totalActions, state.gid, modePolicy);
            } catch {
                // 单个好友访问失败不影响整体
            }

            // 仿生延迟：模拟人类切换好友时的浏览思考行为 (1~5 秒随机)
            // 令牌桶底层已有统一限流，此处叠加额外缓冲，避免好友切换过于密集
            if (i < friendsToVisit.length - 1) {
                await sleep(1000 + Math.floor(Math.random() * 4000));
            }
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
                module: 'friend', event: 'friend_cycle', result: 'ok', visited: friendsToVisit.length, summary, mode: normalizedMode, effectiveMode
            });
        }
        consecutiveErrors = 0; // 完成所有判定，视为正常操作
        return summary.length > 0;

    } catch (err) {
        logWarn('好友', `巡查异常: ${err.message}`);
        consecutiveErrors++;
        return false;
    } finally {
        const filterSummary = decision.getFilterSummary();
        if (filterSummary) {
            log('好友', `本轮过滤: ${filterSummary}`, {
                module: 'friend', event: 'filter_summary', result: 'ok', filterStats: { ...state.filterStats },
            });
        }
        state.isCheckingFriends = false;
    }
}

async function checkFriendsThreePhase(friends, state, helpEnabled, badEnabled, modePolicy = null) {
    const effectiveMode = String((modePolicy && modePolicy.effectiveMode) || 'main').trim().toLowerCase() || 'main';
    const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
    const allowAutoSteal = !!platformInst.allowAutoSteal();
    const actualBadEnabled = effectiveMode === 'safe' ? false : badEnabled;
    const actualHelpEnabled = helpEnabled;
    const actualStealEnabled = effectiveMode === 'safe' ? false : allowAutoSteal;
    log('好友', '开始三阶段巡查: 扫描→偷菜→帮助', {
        module: 'friend', event: 'three_phase_start', result: 'ok', effectiveMode,
    });

    const { stealFriends, helpFriends, otherFriends } = await scanAndClassifyFriends(friends, state);

    log('好友', `预扫描完成: 可偷 ${stealFriends.length} 人, 需帮助 ${helpFriends.length} 人`, {
        module: 'friend', event: 'scan_complete', result: 'ok',
        stealCount: stealFriends.length, helpCount: helpFriends.length,
    });

    const totalActions = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 };

    if (actualStealEnabled && stealFriends.length > 0) {
        totalActions.steal = await batchStealFromFriends(stealFriends, state.gid);
    }

    if (totalActions.steal > 0) {
        try {
            await sellAllFruits();
            log('好友', `偷菜完成，统一出售果实`, {
                module: 'friend', event: 'batch_sell', result: 'ok', stolen: totalActions.steal,
            });
        } catch { /* ignore */ }
    }

    if (actualHelpEnabled && helpFriends.length > 0) {
        const helpResult = await batchHelpFriends(helpFriends, state.gid);
        totalActions.water = helpResult.water;
        totalActions.weed = helpResult.weed;
        totalActions.bug = helpResult.bug;
    }

    if (actualBadEnabled && otherFriends.length > 0) {
        const canPutBugOrWeed = actions.canOperate(10004) || actions.canOperate(10003);
        if (canPutBugOrWeed) {
            for (const friend of otherFriends.slice(0, 5)) {
                try { await visitFriend(friend, totalActions, state.gid, modePolicy); } catch { /* ignore */ }
                await sleep(1000 + Math.floor(Math.random() * 3000));
            }
        }
    }

    const summary = [];
    if (totalActions.steal > 0) summary.push(`偷${totalActions.steal}`);
    if (totalActions.weed > 0) summary.push(`除草${totalActions.weed}`);
    if (totalActions.bug > 0) summary.push(`除虫${totalActions.bug}`);
    if (totalActions.water > 0) summary.push(`浇水${totalActions.water}`);

    const visitedTotal = stealFriends.length + helpFriends.length;
    if (summary.length > 0) {
        log('好友', `三阶段巡查 ${visitedTotal} 人 → ${summary.join('/')}`, {
            module: 'friend', event: 'friend_cycle', result: 'ok', visited: visitedTotal, summary, mode: 'three_phase', effectiveMode,
        });
    }
    consecutiveErrors = 0;
    return summary.length > 0;
}

async function friendCheckLoop() {
    if (state.externalSchedulerMode) return;
    if (!state.friendLoopRunning) return;

    // 定期检查并处理好友申请（开关由 checkAndAcceptApplications 内部守卫）
    await checkAndAcceptApplications();

    await checkFriends();
    if (!state.friendLoopRunning) return;

    let finalDelay = CONFIG.friendCheckInterval;

    // Phase 3: 根据连续报错情况计算退避。前3次不退避，第4次开始成倍激增
    if (consecutiveErrors > 3) {
        const backoff = Math.min(300000, 5000 * (2 ** (consecutiveErrors - 3)));
        finalDelay = Math.max(finalDelay, backoff);
        logWarn('系统', `连续 ${consecutiveErrors} 次异常，启动风控退避，下次好友巡回延迟 ${Math.round(finalDelay / 1000)} 秒`);
    }

    // Phase 3/4: 平台策略调度 (比如微信端专设长巡周期等特化规则)
    const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
    finalDelay = platformInst.getFriendScanInterval(finalDelay);

    state.friendScheduler.setTimeoutTask('friend_check_loop', Math.max(0, finalDelay), () => friendCheckLoop());
}


function startFriendCheckLoop(options = {}) {
    if (state.friendLoopRunning) return;
    state.externalSchedulerMode = !!options.externalScheduler;
    state.friendLoopRunning = true;

    // 注册操作限制更新回调，从农场检查中获取限制信息
    setOperationLimitsCallback(actions.updateOperationLimits);

    // 监听好友申请推送 (微信同玩)
    networkEvents.on('friendApplicationReceived', onFriendApplicationReceived);

    if (!state.externalSchedulerMode) {
        // 初始延迟 8~20 秒随机，等待登录完成并模拟人类不会立即操作的行为
        const initialDelay = 8000 + Math.floor(Math.random() * 12000);
        state.friendScheduler.setTimeoutTask('friend_check_loop', initialDelay, () => friendCheckLoop());
    }

    // 启动时检查一次待处理的好友申请
    state.friendScheduler.setTimeoutTask('friend_check_bootstrap_applications', 3000, () => checkAndAcceptApplications());
}


function stopFriendCheckLoop() {
    state.friendLoopRunning = false;
    state.externalSchedulerMode = false;
    networkEvents.off('friendApplicationReceived', onFriendApplicationReceived);
    setOperationLimitsCallback(null);
    state.friendScheduler.clearAll();
}

function resetFriendScannerRuntimeState() {
    stopFriendCheckLoop();
    _friendsListDebugLogCache.clear();
    _periodicStatusLogCache.clear();
    consecutiveErrors = 0;
    if (typeof state.resetFriendState === 'function') {
        state.resetFriendState();
    }
}


function refreshFriendCheckLoop(delayMs = 200) {
    if (!state.friendLoopRunning || state.externalSchedulerMode) return;
    state.friendScheduler.setTimeoutTask('friend_check_loop', Math.max(0, delayMs), () => friendCheckLoop());
}

function onFriendApplicationReceived(applications) {
    const names = applications.map(a => a.name || `GID:${toNum(a.gid)}`).join(', ');
    log('申请', `收到 ${applications.length} 个好友申请: ${names}`);

    // If auto accept is on, do so
    if (isAutomationOn('friend_auto_accept')) {
        if (decision.inFriendQuietHours()) {
            scheduleDeferredFriendApplicationCheck('push_event');
            return;
        }
        const gids = applications.map(a => toNum(a.gid));
        acceptFriendsWithRetry(gids);
    }
}

async function checkAndAcceptApplications() {
    if (!isAutomationOn('friend_auto_accept')) return;
    if (decision.inFriendQuietHours()) {
        scheduleDeferredFriendApplicationCheck('periodic_check');
        return;
    }
    try {
        const reply = await actions.getApplications();
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

async function acceptFriendsWithRetry(gids) {
    if (gids.length === 0) return;
    try {
        const reply = await actions.acceptFriends(gids);
        const friends = reply.friends || [];
        if (friends.length > 0) {
            const names = friends.map(f => f.name || f.remark || `GID:${toNum(f.gid)}`).join(', ');
            log('申请', `已同意 ${friends.length} 人: ${names}`);
        }
    } catch (e) {
        logWarn('申请', `同意失败: ${e.message}`);
    }
}

function scheduleStakeout(friendGid, friendName, upcomingMature, delaySec) {
    if (!isQQHighRiskAutomationAllowed()) {
        logQQHighRiskGuard('stakeout_schedule_direct', 'QQ 平台默认已关闭“精准蹲守偷菜”，不会继续创建蹲守任务。', {
            friendName,
            friendGid,
        });
        return;
    }
    if (!upcomingMature || upcomingMature.length === 0) return;

    // 筛选: 只安排 4 小时内成熟的
    const candidates = upcomingMature.filter(m => m.matureInSec > 5 && m.matureInSec <= state.MAX_STAKEOUT_AHEAD_SEC);
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
    for (const [key] of state.activeStakeouts) {
        if (key.startsWith(`stake_${friendGid}_`)) {
            state.friendScheduler.clear(key);
            state.activeStakeouts.delete(key);
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

        state.activeStakeouts.set(taskKey, {
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

        state.friendScheduler.setTimeoutTask(taskKey, waitMs, () => {
            state.activeStakeouts.delete(taskKey);
            runStakeoutSteal(friendGid, friendName, landIds, delaySec).catch(() => { });
        });
    }
}

async function runStakeoutSteal(friendGid, friendName, targetLandIds, delaySec) {
    if (!isQQHighRiskAutomationAllowed()) {
        logQQHighRiskGuard('stakeout_execute', 'QQ 平台默认已关闭“精准蹲守偷菜”，已跳过本次精确偷取。', {
            friendName,
            friendGid,
            targetLandIds,
        });
        return;
    }
    if (decision.inFriendQuietHours()) {
        if (scheduleDeferredStakeout(friendGid, friendName, targetLandIds, delaySec)) {
            return;
        }
        log('蹲守', `${friendName}: 当前处于静默时段，已跳过本次蹲守`, {
            module: 'friend',
            event: 'stakeout_skipped_by_quiet',
            result: 'ok',
            friendName,
            friendGid,
            targetLandIds,
        });
        return;
    }

    log('蹲守', `触发 ${friendName}: 准备进入农场偷取 ${targetLandIds.length} 块`, {
        module: 'friend', event: 'stakeout_trigger', result: 'ok',
        friendName, friendGid, targetLandIds,
    });

    let enterReply;
    try {
        enterReply = await actions.enterFriendFarm(friendGid, true);
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
        const freshStatus = decision.analyzeFriendLands(lands, state.gid, friendName);

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
                try { await actions.leaveFriendFarm(friendGid, true); } catch { /* ignore */ }
                try {
                    enterReply = await actions.enterFriendFarm(friendGid, true);
                    const recheckLands = enterReply.lands || [];
                    const recheckStatus = decision.analyzeFriendLands(recheckLands, state.gid, friendName);
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
        const precheck = await actions.checkCanOperateRemote(friendGid, 10008, true);
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
            await actions.stealHarvest(friendGid, finalTargets, true);
            ok = finalTargets.length;
            finalTargets.forEach(id => {
                const info = freshStatus.stealableInfo.find(x => x.landId === id);
                if (info) stolenPlants.push(info.name);
            });
        } catch {
            // 批量失败，逐个重试
            for (const landId of finalTargets) {
                try {
                    await actions.stealHarvest(friendGid, [landId], true);
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
        try { await actions.leaveFriendFarm(friendGid, true); } catch { /* ignore */ }
    }
}

function getActiveStakeouts() {
    const result = [];
    for (const [key, info] of state.activeStakeouts) {
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

function clearAllStakeouts() {
    for (const [, { timer }] of state.activeStakeouts) {
        if (timer) clearTimeout(timer);
    }
    state.activeStakeouts.clear();
}

Object.assign(module.exports, { scanAndClassifyFriends, batchStealFromFriends, batchHelpFriends, checkDailyReset, autoDisableHelpByExpLimit, getFriendsList, getFriendLandsDetail, runBatchWithFallback, visitFriend, checkFriends, checkFriendsThreePhase, friendCheckLoop, startFriendCheckLoop, stopFriendCheckLoop, resetFriendScannerRuntimeState, refreshFriendCheckLoop, onFriendApplicationReceived, checkAndAcceptApplications, acceptFriendsWithRetry, scheduleStakeout, runStakeoutSteal, getActiveStakeouts, clearAllStakeouts });

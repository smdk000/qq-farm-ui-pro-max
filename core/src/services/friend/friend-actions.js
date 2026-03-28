
const { CONFIG } = require('../../config/config');
const { isAutomationOn, getFriendBlacklist, getAutomation, getForceGetAllConfig, getImportedSyncAllSource, setImportedSyncAllSource } = require('../../models/store');
const { sendMsgAsync, sendMsgAsyncUrgent, getUserState, networkEvents } = require('../../utils/network');
const { types } = require('../../utils/proto');
const { toLong, toNum, log, logWarn, sleep } = require('../../utils/utils');
const { recordOperation } = require('../stats');
const { sellAllFruits } = require('../warehouse');
const { getCachedFriends } = require('../database');
const friendStealStatsService = require('../friend-steal-stats-service');
const { isParamError } = require('../common');
const { cacheFriendSeeds } = require('../friend-cache-seeds');
const { getInteractRecords } = require('../interact');
const PlatformFactory = require('../../platform/PlatformFactory');
const state = require('./friend-state');
const scanner = require('./friend-scanner');
const decision = require('./friend-decision');
const BANNED_ERROR_CODE = 1002003;
const FRIEND_FETCH_MODE = {
    UNKNOWN: 'unknown',
    SYNC_ALL: 'sync_all',
    GAME_FRIENDS: 'game_friends',
    GET_ALL: 'get_all',
};
const FRIEND_FETCH_RESULT_LOG_TTL_MS = 5 * 60 * 1000;
const GET_ALL_PARAM_ERROR_COOLDOWN_MS = 30 * 60 * 1000;
const GET_GAME_FRIENDS_BATCH_SIZE = 35;
const VISITOR_FRIEND_SEED_COOLDOWN_MS = 60 * 1000;
const QQ_CONSERVATIVE_FETCH_LOG_TTL_MS = 5 * 60 * 1000;
const WECHAT_SYNC_ALL_UNSUPPORTED_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WECHAT_GET_ALL_UNAVAILABLE_COOLDOWN_MS = 30 * 60 * 1000;
const WECHAT_GET_ALL_EMPTY_COOLDOWN_MS = 2 * 60 * 1000;
const WECHAT_CONSERVATIVE_FETCH_LOG_TTL_MS = 5 * 60 * 1000;
const WECHAT_GET_ALL_FAILURE_STREAK_THRESHOLD = 3;
const WECHAT_GET_ALL_FAILURE_STREAK_RESET_MS = 2 * 60 * 60 * 1000;
const _friendFetchStateByAccount = new Map();
const _qqConservativeFetchLogCache = new Map();
const _wechatConservativeFetchLogCache = new Map();

function _getImportedSyncAllSourceSafe(accountId = null) {
    if (!accountId || typeof getImportedSyncAllSource !== 'function') return null;
    try {
        return getImportedSyncAllSource(accountId);
    } catch {
        return null;
    }
}

function _setImportedSyncAllSourceSafe(accountId = null, payload = null) {
    if (!accountId || !payload || typeof setImportedSyncAllSource !== 'function') return null;
    try {
        return setImportedSyncAllSource(accountId, payload);
    } catch {
        return null;
    }
}


function _resolveRuntimeAccountId(userState = null) {
    const resolved = String(
        (userState && userState.accountId)
        || CONFIG.accountId
        || process.env.FARM_ACCOUNT_ID
        || '',
    ).trim();
    return resolved || null;
}

function _buildFriendCacheScopeOptions(userState = null, accountId = null) {
    const normalizedUserState = userState && typeof userState === 'object' ? userState : null;
    return {
        accountId: accountId || _resolveRuntimeAccountId(normalizedUserState),
        platform: CONFIG.platform,
        uin: String(CONFIG.uin || normalizedUserState?.uin || '').trim(),
        openId: String(normalizedUserState?.openId || normalizedUserState?.open_id || '').trim(),
        userState: normalizedUserState,
    };
}

function _isQQPlatform() {
    return String(CONFIG.platform || '').trim().toLowerCase() === 'qq';
}

function _isQQConservativeFriendFetchEnabled(accountId = null) {
    if (!_isQQPlatform()) return false;
    const automation = typeof getAutomation === 'function' ? getAutomation(accountId) : {};
    const multiChainEnabled = !!(automation && automation.qqFriendFetchMultiChain);
    const raw = process.env.FARM_QQ_FRIEND_FETCH_MULTI_CHAIN ?? '';
    if (typeof raw === 'boolean') return !(multiChainEnabled || raw);
    const text = String(raw || '').trim().toLowerCase();
    return !(multiChainEnabled || text === '1' || text === 'true' || text === 'yes' || text === 'on');
}

function _logQQConservativeFetch(cacheKey, message, level = 'info', meta = {}) {
    const now = Date.now();
    const prev = _qqConservativeFetchLogCache.get(cacheKey) || 0;
    if (now - prev < QQ_CONSERVATIVE_FETCH_LOG_TTL_MS) {
        return;
    }
    _qqConservativeFetchLogCache.set(cacheKey, now);
    if (level === 'warn') {
        logWarn('好友', message, meta);
        return;
    }
    log('好友', message, meta);
}

function _logWeChatConservativeFetch(cacheKey, message, level = 'info', meta = {}) {
    const now = Date.now();
    const prev = _wechatConservativeFetchLogCache.get(cacheKey) || 0;
    if (now - prev < WECHAT_CONSERVATIVE_FETCH_LOG_TTL_MS) {
        return;
    }
    _wechatConservativeFetchLogCache.set(cacheKey, now);
    if (level === 'warn') {
        logWarn('好友', message, meta);
        return;
    }
    log('好友', message, meta);
}


async function getAllFriends(options = {}) {
    let reply;
    const platformInst = PlatformFactory.createPlatform(CONFIG.platform);
    const userState = getUserState();
    const accountId = _resolveRuntimeAccountId(userState);
    let fetchState = _getFriendFetchState(_getFriendFetchKey(accountId));
    const forceGetAll = getForceGetAllConfig(accountId).enabled;
    const isWeChat = !platformInst.allowSyncAll();
    const label = isWeChat ? '微信' : 'QQ';
    const manualRefresh = !!options.manualRefresh;

    if (_isQQConservativeFriendFetchEnabled(accountId)) {
        reply = await _getAllViaConservativeQQSyncAll({
            fetchState,
            accountId,
            label,
            userState,
            forceGetAll,
            disableVisitorSeed: !!options.disableVisitorSeed,
        });
        if (reply && reply.game_friends && networkEvents) {
            networkEvents.emit('friends_updated', reply.game_friends);
        }
        return reply;
    }

    if (isWeChat) {
        reply = await _getAllViaConservativeWeChatGetAll({
            fetchState,
            accountId,
            label,
            userState,
            forceGetAll,
            manualRefresh,
        });
        if (reply && reply.game_friends && networkEvents) {
            networkEvents.emit('friends_updated', reply.game_friends);
        }
        return reply;
    }

    if (!forceGetAll && fetchState.modeSource === 'forced') {
        resetGetAllMode(accountId);
        fetchState = _getFriendFetchState(_getFriendFetchKey(accountId));
    }

    if (forceGetAll) {
        _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GET_ALL, `已启用强制兼容模式，固定使用 GetAll (${label})`, 'forced');
        reply = await _getAllViaGetAllOrCache('强制强效兼容模式', {
            fetchState,
            retryOnEmpty: false,
            accountId,
            label,
            userState,
        });
    } else if (fetchState.mode === FRIEND_FETCH_MODE.GET_ALL) {
        reply = await _getAllViaGetAllOrCache(`${label}已锁定`, {
            fetchState,
            retryOnEmpty: false,
            accountId,
            label,
            userState,
        });
        if (!_hasUsableFriendEntries(reply, userState)) {
            resetGetAllMode(accountId);
            logWarn('好友', `已锁定 GetAll 模式，但本次返回${_describeFriendReply(reply, userState)}(${label})；已清空模式缓存，下次重新探测`);
        }
    } else if (fetchState.mode === FRIEND_FETCH_MODE.GAME_FRIENDS) {
        reply = await _getAllViaGameFriendsOrCache(`${label}已锁定`, {
            fetchState,
            accountId,
            label,
            userState,
        });
        if (!_hasUsableFriendEntries(reply, userState) || reply?._fromCache) {
            resetGetAllMode(accountId);
            logWarn('好友', `已锁定 GetGameFriends 模式，但本次返回${_describeFriendReply(reply, userState)}(${label})；已清空模式缓存，下次重新探测`);
        }
    } else if (fetchState.mode === FRIEND_FETCH_MODE.SYNC_ALL) {
        reply = await _getAllViaSyncAll(isWeChat, { fetchState });
        if (!_hasUsableFriendEntries(reply, userState)) {
            if (!isWeChat) {
                log('好友', `已锁定 SyncAll 模式，但本次返回${_describeFriendReply(reply, userState)}(${label})，改用 GetGameFriends 复核`);
                reply = await _getAllViaGameFriendsOrCache(`${label}缓存GID复核`, {
                    fetchState,
                    accountId,
                    label,
                    userState,
                });
                if (_hasUsableFriendEntries(reply, userState) && !reply?._fromCache) {
                    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GAME_FRIENDS, `${label} 环境已确认需使用 GetGameFriends`);
                }
            }

            if (!_hasUsableFriendEntries(reply, userState) || reply?._fromCache) {
                log('好友', `已锁定 SyncAll 模式，但本次返回${_describeFriendReply(reply, userState)}(${label})，改用 GetAll 复核`);
                reply = await _getAllViaGetAllOrCache(`${label}兼容复核`, {
                    fetchState,
                    retryOnEmpty: true,
                    accountId,
                    label,
                    userState,
                });
                if (_hasUsableFriendEntries(reply, userState) && !reply?._fromCache) {
                    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GET_ALL, `${label} 环境已确认使用 GetAll 更稳定`);
                } else {
                    resetGetAllMode(accountId);
                }
            }
        }
    } else {
        reply = await _getAllViaSyncAll(isWeChat, { fetchState });
        if (_hasUsableFriendEntries(reply, userState)) {
            _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.SYNC_ALL, `${label} 环境首轮探测通过，后续固定使用 SyncAll`);
        } else {
            if (!isWeChat) {
                log('好友', `首次探测：SyncAll 返回${_describeFriendReply(reply, userState)}(${label})，改用 GetGameFriends 复核`);
                reply = await _getAllViaGameFriendsOrCache(`${label}缓存GID探测`, {
                    fetchState,
                    accountId,
                    label,
                    userState,
                });
                if (_hasUsableFriendEntries(reply, userState) && !reply?._fromCache) {
                    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GAME_FRIENDS, `${label} 环境首轮探测确认需使用 GetGameFriends`);
                }
            }

            if (!_hasUsableFriendEntries(reply, userState) || reply?._fromCache) {
                log('好友', `首次探测：SyncAll 返回${_describeFriendReply(reply, userState)}(${label})，改用 GetAll 复核`);
                reply = await _getAllViaGetAllOrCache(`${label}兼容探测`, {
                    fetchState,
                    retryOnEmpty: true,
                    accountId,
                    label,
                    userState,
                });
                if (_hasUsableFriendEntries(reply, userState) && !reply?._fromCache) {
                    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GET_ALL, `${label} 环境首轮探测确认需使用 GetAll`);
                }
            }
        }
    }

    if (reply && reply.game_friends && networkEvents) {
        networkEvents.emit('friends_updated', reply.game_friends);
    }

    return reply;
}

async function _getAllViaConservativeQQSyncAll(options = {}) {
    const fetchState = options.fetchState || null;
    const accountId = options.accountId || null;
    const userState = options.userState || null;
    const label = options.label || 'QQ';
    const forceGetAll = !!options.forceGetAll;
    const disableVisitorSeed = !!options.disableVisitorSeed;

    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.SYNC_ALL, `${label} 保守模式固定使用 SyncAll，关闭额外探测链路`, 'qq_conservative');
    if (forceGetAll) {
        _logQQConservativeFetch('force_get_all_ignored', 'QQ 保守好友链路已启用，已忽略“强效兼容尝试”，避免额外触发 GetAll/GetGameFriends 探测。', 'warn', {
            module: 'friend',
            event: 'qq_friend_fetch_guard',
            result: 'force_get_all_ignored',
        });
    }

    const syncReply = await _getAllViaSyncAll(false, { fetchState });
    if (_hasUsableFriendEntries(syncReply, userState)) {
        return {
            ...syncReply,
            _qqConservativeSyncOnly: true,
        };
    }

    const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
        userState,
        allowVisitorSeed: !disableVisitorSeed,
    });
    if (cachedReply) {
        _logQQConservativeFetch('cache_fallback', 'QQ 保守好友链路：SyncAll 未拿到可用实时好友列表，本轮仅回退本地缓存，不再追加其他腾讯接口探测。', 'warn', {
            module: 'friend',
            event: 'qq_friend_fetch_guard',
            result: 'cache_fallback',
            cachedCount: Array.isArray(cachedReply.game_friends) ? cachedReply.game_friends.length : 0,
        });
        return {
            ...cachedReply,
            _qqConservativeSyncOnly: true,
        };
    }

    _logQQConservativeFetch('empty_result', 'QQ 保守好友链路：SyncAll 未拿到可用实时好友列表，本轮直接停止追加探测。', 'warn', {
        module: 'friend',
        event: 'qq_friend_fetch_guard',
        result: 'empty',
    });
    return {
        game_friends: Array.isArray(syncReply && syncReply.game_friends) ? syncReply.game_friends : [],
        invitations: Array.isArray(syncReply && syncReply.invitations) ? syncReply.invitations : [],
        application_count: toNum(syncReply && syncReply.application_count),
        _qqConservativeSyncOnly: true,
    };
}

function _buildEmptyFriendReply(extra = {}) {
    return {
        game_friends: [],
        invitations: [],
        application_count: 0,
        ...extra,
    };
}

function _isWeChatSyncAllUnsupported(fetchState) {
    return !!(fetchState && Number(fetchState.syncAllUnsupportedUntil) > Date.now());
}

function _markWeChatSyncAllUnsupported(fetchState, label) {
    if (!fetchState) return;
    const nextUntil = Date.now() + WECHAT_SYNC_ALL_UNSUPPORTED_COOLDOWN_MS;
    const changed = nextUntil > Number(fetchState.syncAllUnsupportedUntil || 0);
    fetchState.syncAllUnsupportedUntil = nextUntil;
    if (!changed) return;
    _logWeChatConservativeFetch('syncall_unsupported', `SyncAll 返回 code=1000020(${label})，已记录为微信账号不支持该接口，24 小时内不再重复探测。`, 'warn', {
        module: 'friend',
        event: 'wx_friend_fetch_guard',
        result: 'sync_all_unsupported',
        cooldownMs: WECHAT_SYNC_ALL_UNSUPPORTED_COOLDOWN_MS,
    });
}

function _isWeChatRealtimeUnavailable(fetchState) {
    return !!(fetchState && Number(fetchState.wechatRealtimeUnavailableUntil) > Date.now());
}

function _describeWeChatRealtimeReason(resultLabel) {
    const reason = String(resultLabel || '').trim() || 'empty';
    if (reason === 'self_only') return '仅返回自己';
    if (reason === 'error') return '请求异常';
    return '返回空';
}

function _registerWeChatRealtimeFailure(fetchState, resultLabel) {
    if (!fetchState) return 1;
    const now = Date.now();
    const reason = String(resultLabel || '').trim() || 'empty';
    const prevReason = String(fetchState.wechatRealtimeFailureReason || '').trim();
    const prevAt = Number(fetchState.wechatRealtimeFailureAt || 0);
    const prevCount = Math.max(0, Number(fetchState.wechatRealtimeFailureCount || 0));
    const sameReason = prevReason === reason;
    const withinWindow = prevAt > 0 && (now - prevAt) <= WECHAT_GET_ALL_FAILURE_STREAK_RESET_MS;
    const nextCount = sameReason && withinWindow ? (prevCount + 1) : 1;

    fetchState.wechatRealtimeFailureCount = nextCount;
    fetchState.wechatRealtimeFailureReason = reason;
    fetchState.wechatRealtimeFailureAt = now;
    return nextCount;
}

function _clearWeChatRealtimeFailure(fetchState) {
    if (!fetchState) return;
    fetchState.wechatRealtimeFailureCount = 0;
    fetchState.wechatRealtimeFailureReason = '';
    fetchState.wechatRealtimeFailureAt = 0;
}

function _markWeChatRealtimeUnavailable(fetchState, resultLabel, options = {}) {
    if (!fetchState) return;
    const failureCount = _registerWeChatRealtimeFailure(fetchState, resultLabel);
    const hasCacheFallback = !!options.hasCacheFallback;
    const reason = String(resultLabel || '').trim() || 'empty';
    const reasonText = _describeWeChatRealtimeReason(reason);

    fetchState.wechatRealtimeUnavailableReason = reason;
    if (failureCount < WECHAT_GET_ALL_FAILURE_STREAK_THRESHOLD) {
        fetchState.wechatRealtimeUnavailableUntil = 0;
        _logWeChatConservativeFetch(`realtime_retry:${reason}:${failureCount}`, `微信好友链路：GetAll ${reasonText}，当前连续第 ${failureCount}/${WECHAT_GET_ALL_FAILURE_STREAK_THRESHOLD} 次异常；暂不进入长时间休息，下轮继续尝试实时探测。`, 'warn', {
            module: 'friend',
            event: 'wx_friend_fetch_guard',
            result: 'realtime_retry',
            reason,
            failureCount,
            threshold: WECHAT_GET_ALL_FAILURE_STREAK_THRESHOLD,
        });
        return;
    }

    const cooldownMs = hasCacheFallback
        ? WECHAT_GET_ALL_UNAVAILABLE_COOLDOWN_MS
        : WECHAT_GET_ALL_EMPTY_COOLDOWN_MS;
    const nextUntil = Date.now() + cooldownMs;
    const changed = nextUntil > Number(fetchState.wechatRealtimeUnavailableUntil || 0);
    fetchState.wechatRealtimeUnavailableUntil = nextUntil;
    fetchState.wechatRealtimeUnavailableReason = reason;
    if (!changed) return;
    _logWeChatConservativeFetch(`realtime_unavailable:${reason}:${hasCacheFallback ? 'cache' : 'empty'}`, `微信好友链路：GetAll ${reasonText}，已连续 ${failureCount} 次异常；${cooldownMs / 1000} 秒内停止重复实时探测，改走缓存/休息一会模式。`, 'warn', {
        module: 'friend',
        event: 'wx_friend_fetch_guard',
        result: 'realtime_unavailable',
        reason,
        cooldownMs,
        failureCount,
    });
}

function _clearWeChatRealtimeUnavailable(fetchState) {
    if (!fetchState) return;
    fetchState.wechatRealtimeUnavailableUntil = 0;
    fetchState.wechatRealtimeUnavailableReason = '';
    _clearWeChatRealtimeFailure(fetchState);
}

function _getWeChatAutoRetryAt(fetchState) {
    if (!fetchState) return 0;
    return Math.max(
        Number(fetchState.wechatRealtimeUnavailableUntil || 0),
        Number(fetchState.getAllParamErrorUntil || 0),
    );
}

function _getWeChatGuardMeta(fetchState) {
    const meta = {};
    const autoRetryAt = _getWeChatAutoRetryAt(fetchState);
    const syncAllUnsupportedUntil = Number(fetchState && fetchState.syncAllUnsupportedUntil || 0);
    if (autoRetryAt > Date.now()) {
        meta._wxAutoRetryAt = autoRetryAt;
    }
    if (syncAllUnsupportedUntil > Date.now()) {
        meta._wxSyncAllUnsupportedUntil = syncAllUnsupportedUntil;
    }
    return meta;
}

function _withWeChatConservativeMeta(reply, extra = {}) {
    const { _fetchState, ...safeExtra } = extra || {};
    return {
        ...(reply || _buildEmptyFriendReply()),
        _wxConservativeGetAllOnly: true,
        ..._getWeChatGuardMeta(_fetchState),
        ...safeExtra,
    };
}

async function _getAllViaConservativeWeChatGetAll(options = {}) {
    const fetchState = options.fetchState || null;
    const accountId = options.accountId || null;
    const userState = options.userState || null;
    const label = options.label || '微信';
    const forceGetAll = !!options.forceGetAll;
    const manualRefresh = !!options.manualRefresh;

    _setFriendFetchMode(fetchState, FRIEND_FETCH_MODE.GET_ALL, `${label} 保守模式固定使用 GetAll，关闭 SyncAll 探测`, forceGetAll ? 'forced' : 'wx_conservative');

    if (_isWeChatSyncAllUnsupported(fetchState)) {
        _logWeChatConservativeFetch('syncall_disabled_notice', '微信好友链路：已记住当前账号不支持 SyncAll，后续固定跳过该接口。', 'info', {
            module: 'friend',
            event: 'wx_friend_fetch_guard',
            result: 'sync_all_skipped',
        });
    }

    if (!manualRefresh && (_isGetAllParamErrorCoolingDown(fetchState) || _isWeChatRealtimeUnavailable(fetchState))) {
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        if (cachedReply) {
            _logWeChatConservativeFetch('cooldown_cache', '微信好友链路：当前处于休息一会/兼容冷却期，本轮仅展示缓存好友，不再重复请求实时接口。', 'warn', {
                module: 'friend',
                event: 'wx_friend_fetch_guard',
                result: 'cache_fallback',
                cachedCount: Array.isArray(cachedReply.game_friends) ? cachedReply.game_friends.length : 0,
            });
            return _withWeChatConservativeMeta(cachedReply, {
                _fetchState: fetchState,
                _wxRealtimeUnavailable: true,
                _wxRealtimeUnavailableReason: String(fetchState && fetchState.wechatRealtimeUnavailableReason || '').trim() || 'cooldown',
            });
        }

        _logWeChatConservativeFetch('cooldown_empty', '微信好友链路：当前处于休息一会/兼容冷却期，且没有可用缓存，本轮直接跳过实时探测。', 'warn', {
            module: 'friend',
            event: 'wx_friend_fetch_guard',
            result: 'empty',
        });
        return _withWeChatConservativeMeta(_buildEmptyFriendReply(), {
            _fetchState: fetchState,
            _wxRealtimeUnavailable: true,
            _wxRealtimeUnavailableReason: String(fetchState && fetchState.wechatRealtimeUnavailableReason || '').trim() || 'cooldown',
        });
    }

    if (manualRefresh && (_isGetAllParamErrorCoolingDown(fetchState) || _isWeChatRealtimeUnavailable(fetchState))) {
        _logWeChatConservativeFetch('manual_refresh_probe', '微信好友链路：本次由手动刷新触发，已临时再试一次 GetAll，不会恢复自动重试。', 'warn', {
            module: 'friend',
            event: 'wx_friend_fetch_guard',
            result: 'manual_refresh_probe',
        });
    }

    try {
        const reply = await _getAllViaGetAll('微信固定链路', {
            fetchState,
            retryOnEmpty: false,
        });
        if (_hasUsableFriendEntries(reply, userState)) {
            _clearGetAllParamError(fetchState);
            _clearWeChatRealtimeUnavailable(fetchState);
            return _withWeChatConservativeMeta(reply, {
                _fetchState: fetchState,
            });
        }

        const reason = _describeFriendReply(reply, userState) === '仅自己' ? 'self_only' : 'empty';
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        _markWeChatRealtimeUnavailable(fetchState, reason, {
            hasCacheFallback: !!cachedReply,
        });
        if (cachedReply) {
            return _withWeChatConservativeMeta(cachedReply, {
                _fetchState: fetchState,
                _wxRealtimeUnavailable: true,
                _wxRealtimeUnavailableReason: reason,
            });
        }

        return _withWeChatConservativeMeta(_buildEmptyFriendReply(), {
            _fetchState: fetchState,
            _wxRealtimeUnavailable: true,
            _wxRealtimeUnavailableReason: reason,
        });
    } catch (err) {
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        _markWeChatRealtimeUnavailable(fetchState, 'error', {
            hasCacheFallback: !!cachedReply,
        });
        if (isParamError(err)) {
            _markGetAllParamError(fetchState, label);
        }
        if (cachedReply) {
            _logWeChatConservativeFetch('error_cache', `微信好友链路：GetAll 异常(${err.message || err})，本轮回退缓存，不再追加其他接口探测。`, 'warn', {
                module: 'friend',
                event: 'wx_friend_fetch_guard',
                result: 'error_cache',
                cachedCount: Array.isArray(cachedReply.game_friends) ? cachedReply.game_friends.length : 0,
            });
            return _withWeChatConservativeMeta(cachedReply, {
                _fetchState: fetchState,
                _wxRealtimeUnavailable: true,
                _wxRealtimeUnavailableReason: 'error',
            });
        }

        _logWeChatConservativeFetch('error_empty', `微信好友链路：GetAll 异常(${err.message || err})，且没有可用缓存，本轮直接停止。`, 'warn', {
            module: 'friend',
            event: 'wx_friend_fetch_guard',
            result: 'error_empty',
        });
        return _withWeChatConservativeMeta(_buildEmptyFriendReply(), {
            _fetchState: fetchState,
            _wxRealtimeUnavailable: true,
            _wxRealtimeUnavailableReason: 'error',
        });
    }
}

function resetGetAllMode(accountId = null) {
    if (accountId !== null && accountId !== undefined) {
        _friendFetchStateByAccount.delete(_getFriendFetchKey(accountId));
        return;
    }
    _friendFetchStateByAccount.clear();
}

function isGetAllMode() {
    const userState = getUserState();
    const accountId = _resolveRuntimeAccountId(userState);
    const fetchState = _friendFetchStateByAccount.get(_getFriendFetchKey(accountId));
    return fetchState?.mode === FRIEND_FETCH_MODE.GET_ALL;
}

function getFriendFetchDiagnostics(accountId = null) {
    const userState = getUserState();
    const resolvedAccountId = String(
        accountId
        || _resolveRuntimeAccountId(userState)
        || '',
    ).trim();
    const fetchState = _getFriendFetchState(_getFriendFetchKey(resolvedAccountId));
    const now = Date.now();
    const autoRetryAt = _getWeChatAutoRetryAt(fetchState);
    const syncAllUnsupportedUntil = Number(fetchState && fetchState.syncAllUnsupportedUntil || 0);
    const getAllParamErrorUntil = Number(fetchState && fetchState.getAllParamErrorUntil || 0);
    const realtimeUnavailableReason = String(fetchState && fetchState.wechatRealtimeUnavailableReason || '').trim();
    const failureReason = String(fetchState && fetchState.wechatRealtimeFailureReason || '').trim();
    const failureAt = Number(fetchState && fetchState.wechatRealtimeFailureAt || 0);

    return {
        accountId: resolvedAccountId,
        mode: String(fetchState && fetchState.mode || FRIEND_FETCH_MODE.UNKNOWN),
        modeReason: String(fetchState && fetchState.modeReason || '').trim(),
        modeSource: String(fetchState && fetchState.modeSource || '').trim() || 'probe',
        lastResultKey: String(fetchState && fetchState.lastResultKey || '').trim(),
        lastResultAt: Math.max(0, Number(fetchState && fetchState.lastResultAt || 0)),
        wechat: {
            conservative: true,
            realtimeUnavailable: !!(autoRetryAt > now),
            realtimeUnavailableReason,
            autoRetryAt: autoRetryAt > now ? autoRetryAt : 0,
            getAllParamErrorUntil: getAllParamErrorUntil > now ? getAllParamErrorUntil : 0,
            syncAllUnsupportedUntil: syncAllUnsupportedUntil > now ? syncAllUnsupportedUntil : 0,
            failureCount: Math.max(0, Number(fetchState && fetchState.wechatRealtimeFailureCount || 0)),
            failureReason,
            failureAt: failureAt > 0 ? failureAt : 0,
        },
    };
}

function resetFriendActionRuntimeState() {
    resetGetAllMode();
}

function _isSelfOnly(friends, userState) {
    if (!friends || friends.length !== 1 || !userState) return false;
    const selfGid = toNum(userState.gid);
    return selfGid > 0 && toNum(friends[0].gid) === selfGid;
}

function _getFriendFetchState(accountId) {
    if (!_friendFetchStateByAccount.has(accountId)) {
        _friendFetchStateByAccount.set(accountId, {
            mode: FRIEND_FETCH_MODE.UNKNOWN,
            lastResultKey: '',
            lastResultAt: 0,
            modeReason: '',
            modeSource: 'probe',
            getAllParamErrorUntil: 0,
            syncAllUnsupportedUntil: 0,
            wechatRealtimeUnavailableUntil: 0,
            wechatRealtimeUnavailableReason: '',
            wechatRealtimeFailureCount: 0,
            wechatRealtimeFailureReason: '',
            wechatRealtimeFailureAt: 0,
            sharedCacheReuseAt: 0,
            visitorSeedAt: 0,
        });
    }
    return _friendFetchStateByAccount.get(accountId);
}

function _getFriendFetchKey(accountId) {
    return accountId || '__default__';
}

function _isFetchProbeCooling(fetchState, field, cooldownMs) {
    if (!fetchState) return false;
    const lastAt = Number(fetchState[field] || 0);
    return lastAt > 0 && (Date.now() - lastAt) < cooldownMs;
}

function _markFetchProbe(fetchState, field) {
    if (!fetchState) return;
    fetchState[field] = Date.now();
}

function _attachCacheSeedMeta(list, source = '', seededCount = 0) {
    const target = Array.isArray(list) ? list : [];
    const normalizedSource = String(source || '').trim();
    const normalizedSeededCount = Math.max(0, Number(seededCount || 0));
    if (!normalizedSource && normalizedSeededCount <= 0) {
        return target;
    }
    if (normalizedSource) {
        target._cacheSource = normalizedSource;
    }
    if (normalizedSeededCount > 0) {
        target._cacheSeededCount = normalizedSeededCount;
    }
    return target;
}

function _buildFriendSeedsFromInteractRecords(records = [], options = {}) {
    const selfGid = toNum(options.userState && options.userState.gid);
    const deduped = new Map();

    for (const record of (Array.isArray(records) ? records : [])) {
        const gid = toNum(record && record.visitorGid);
        if (gid <= 0 || (selfGid > 0 && gid === selfGid) || deduped.has(gid)) {
            continue;
        }

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

async function _trySeedFriendsCacheFromVisitors(accountId, options = {}) {
    if (!accountId || typeof getInteractRecords !== 'function') {
        return [];
    }

    const fetchState = options.fetchState || null;
    if (_isFetchProbeCooling(fetchState, 'visitorSeedAt', VISITOR_FRIEND_SEED_COOLDOWN_MS)) {
        return [];
    }
    _markFetchProbe(fetchState, 'visitorSeedAt');

    try {
        const records = await getInteractRecords(100);
        const visitorSeeds = _buildFriendSeedsFromInteractRecords(records, {
            userState: options.userState || null,
        });
        if (visitorSeeds.length <= 0) {
            return [];
        }

        await cacheFriendSeeds(visitorSeeds, {
            ..._buildFriendCacheScopeOptions(options.userState || null, accountId),
            immediate: true,
        });

        const cached = await getCachedFriends(accountId, _buildFriendCacheScopeOptions(options.userState || null, accountId));
        if (Array.isArray(cached) && cached.length > 0) {
            log('好友', `当前账号无好友缓存，已从最近访客补建 ${cached.length} 个临时好友缓存`, {
                module: 'friend',
                event: 'friend_cache_seed',
                result: 'ok',
                visitorCount: visitorSeeds.length,
                cachedCount: cached.length,
                cacheSource: 'interact_records',
            });
            return _attachCacheSeedMeta(cached, 'interact_records', visitorSeeds.length);
        }
    } catch (error) {
        logWarn('好友', `最近访客回填好友缓存失败: ${error.message}`, {
            module: 'friend',
            event: 'friend_cache_seed',
            result: 'error',
        });
    }

    return [];
}

async function _getCachedFriendsWithBootstrap(accountId, options = {}) {
    if (!accountId) return [];

    const cached = await getCachedFriends(accountId, _buildFriendCacheScopeOptions(options.userState || null, accountId));
    if (Array.isArray(cached) && cached.length > 0) {
        return cached;
    }

    if (options.allowVisitorSeed) {
        const visitorSeededFriends = await _trySeedFriendsCacheFromVisitors(accountId, options);
        if (visitorSeededFriends.length > 0) {
            return visitorSeededFriends;
        }
    }

    return [];
}

function _setFriendFetchMode(fetchState, mode, reason, source = 'probe') {
    const changed = fetchState.mode !== mode || fetchState.modeReason !== reason || fetchState.modeSource !== source;
    fetchState.mode = mode;
    fetchState.modeReason = reason;
    fetchState.modeSource = source;
    if (!changed) return;
    const modeLabel = mode === FRIEND_FETCH_MODE.GET_ALL
        ? 'GetAll'
        : (mode === FRIEND_FETCH_MODE.GAME_FRIENDS ? 'GetGameFriends' : 'SyncAll');
    log('好友', `好友拉取模式已锁定为 ${modeLabel}：${reason}`);
}

function _hasUsableFriendEntries(reply, userState) {
    const friends = Array.isArray(reply?.game_friends) ? reply.game_friends : [];
    if (friends.length === 0) return false;
    return !(friends.length === 1 && _isSelfOnly(friends, userState));
}

function _describeFriendReply(reply, userState) {
    const friends = Array.isArray(reply?.game_friends) ? reply.game_friends : [];
    if (friends.length === 0) return '空';
    if (friends.length === 1 && _isSelfOnly(friends, userState)) return '仅自己';
    return `${friends.length} 个好友`;
}

function _logFriendFetchResult(methodName, modeName, reply, fetchState) {
    const friendCount = reply?.game_friends ? reply.game_friends.length : 0;
    const invCount = reply?.invitations ? reply.invitations.length : 0;
    const appCount = toNum(reply?.application_count);
    const summaryKey = `${methodName}:${modeName}:${friendCount}:${invCount}:${appCount}`;
    const now = Date.now();

    if (fetchState && fetchState.lastResultKey === summaryKey && (now - fetchState.lastResultAt) < FRIEND_FETCH_RESULT_LOG_TTL_MS) {
        return;
    }

    if (fetchState) {
        fetchState.lastResultKey = summaryKey;
        fetchState.lastResultAt = now;
    }

    log('好友', `${methodName} 结果(${modeName}): game_friends=${friendCount}, invitations=${invCount}, application_count=${appCount}`);
}

async function _getAllViaSyncAll(isWeChat, options = {}) {
    const label = isWeChat ? '微信' : 'QQ';
    const fetchState = options.fetchState || null;
    try {
        const accountId = _resolveRuntimeAccountId(getUserState());
        const importedSource = !isWeChat ? _getImportedSyncAllSourceSafe(accountId) : null;
        const importedOpenIds = importedSource && importedSource.active
            ? importedSource.openIds
            : [];
        const requestObj = types.SyncAllFriendsRequest.create({ open_ids: importedOpenIds });
        const body = types.SyncAllFriendsRequest.encode(requestObj).finish();
        const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'SyncAll', body);
        const reply = types.SyncAllFriendsReply.decode(replyBody);
        if (!isWeChat && importedSource && importedSource.active && accountId) {
            _setImportedSyncAllSourceSafe(accountId, {
                ...importedSource,
                lastUsedAt: Date.now(),
                lastSyncAt: Date.now(),
                lastSyncFriendCount: Array.isArray(reply?.game_friends) ? reply.game_friends.length : 0,
                lastSyncSource: 'imported_syncall',
                lastErrorCode: '',
            });
            reply._syncSource = 'imported_syncall';
            reply._importOpenIdCount = importedOpenIds.length;
        }
        _logFriendFetchResult('SyncAll', label, reply, fetchState);
        return reply;
    } catch (syncErr) {
        const errMsg = syncErr.message || '';
        const accountId = _resolveRuntimeAccountId(getUserState());
        const importedSource = !isWeChat ? _getImportedSyncAllSourceSafe(accountId) : null;
        if (!isWeChat && importedSource && importedSource.active && accountId) {
            _setImportedSyncAllSourceSafe(accountId, {
                ...importedSource,
                lastUsedAt: Date.now(),
                lastErrorCode: String(syncErr.code || '').trim() || 'SYNC_ALL_FAILED',
            });
        }
        if (errMsg.includes('code=1000020')) {
            if (isWeChat) {
                _markWeChatSyncAllUnsupported(fetchState, label);
            }
            log('好友', `SyncAll 返回 code=1000020(${label})，该接口不支持当前账号`);
        } else {
            logWarn('好友', `SyncAll 失败(${label}): ${errMsg}`);
        }
        return { game_friends: [], invitations: [], application_count: 0 };
    }
}

async function _getAllViaGetAll(modeName, options = {}) {
    let reply;
    const fetchState = options.fetchState || null;
    const retryOnEmpty = options.retryOnEmpty !== false;
    const maxRetries = retryOnEmpty ? 2 : 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const body = types.GetAllFriendsRequest.encode(types.GetAllFriendsRequest.create({})).finish();
        const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body);

        try {
            reply = types.GetAllFriendsReply.decode(replyBody);
            if (attempt === 0 && reply) {
                _logFriendFetchResult('GetAll', modeName, reply, fetchState);
            }
            if (reply && reply.game_friends && reply.game_friends.length > 0) {
                break;
            }
        } catch (decErr) {
            logWarn('好友', `GetAll 反序列化失败: ${decErr.message}`);
        }

        if (attempt < maxRetries) {
            const delay = 3000 + Math.floor(Math.random() * 2000);
            log('好友', `GetAll 返回空，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`);
            await sleep(delay);
        }
    }
    return reply;
}

function _decodeGetGameFriendsReply(replyBody) {
    if (types.GetGameFriendsReply) {
        return types.GetGameFriendsReply.decode(replyBody);
    }
    return types.GetAllFriendsReply.decode(replyBody);
}

async function _getAllViaGameFriendsDirect(modeName, options = {}) {
    const fetchState = options.fetchState || null;
    if (!types.GetGameFriendsRequest) {
        logWarn('好友', 'GetGameFriends 协议未加载，跳过 QQ 直连拉取');
        return { game_friends: [], invitations: [], application_count: 0 };
    }

    try {
        const body = types.GetGameFriendsRequest.encode(types.GetGameFriendsRequest.create({
            gids: [],
        })).finish();
        const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetGameFriends', body);
        const reply = _decodeGetGameFriendsReply(replyBody);
        _logFriendFetchResult('GetGameFriends', `${modeName}直连`, reply, fetchState);
        return reply;
    } catch (err) {
        logWarn('好友', `GetGameFriends 直连失败(${modeName}): ${err.message || err}`);
        return { game_friends: [], invitations: [], application_count: 0 };
    }
}

function _dedupeFriendsByGid(friends) {
    const seen = new Set();
    return (Array.isArray(friends) ? friends : []).filter((friend) => {
        const gid = toNum(friend && friend.gid);
        if (gid <= 0 || seen.has(gid)) return false;
        seen.add(gid);
        return true;
    });
}

async function fetchFriendProfilesByGids(gids = []) {
    if (!types.GetGameFriendsRequest) {
        return [];
    }

    const normalized = [...new Set(
        (Array.isArray(gids) ? gids : [])
            .map(gid => toNum(gid))
            .filter(gid => gid > 0)
    )];
    if (normalized.length <= 0) {
        return [];
    }

    const profiles = [];
    for (let i = 0; i < normalized.length; i += GET_GAME_FRIENDS_BATCH_SIZE) {
        const batch = normalized.slice(i, i + GET_GAME_FRIENDS_BATCH_SIZE);
        try {
            const body = types.GetGameFriendsRequest.encode(types.GetGameFriendsRequest.create({
                gids: batch.map(gid => toLong(gid)),
            })).finish();
            const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetGameFriends', body);
            const reply = _decodeGetGameFriendsReply(replyBody);
            if (Array.isArray(reply?.game_friends) && reply.game_friends.length > 0) {
                profiles.push(...reply.game_friends);
            }
        } catch (err) {
            logWarn('好友', `批量补全好友资料失败(${i + 1}-${i + batch.length}): ${err.message || err}`);
        }
        if (i + GET_GAME_FRIENDS_BATCH_SIZE < normalized.length) {
            await sleep(100);
        }
    }

    return _dedupeFriendsByGid(profiles);
}

async function _getKnownFriendGids(accountId, options = {}) {
    if (!accountId) return [];
    const cached = await _getCachedFriendsWithBootstrap(accountId, {
        fetchState: options.fetchState || null,
        userState: options.userState || null,
        allowVisitorSeed: true,
    });
    if (!Array.isArray(cached) || cached.length <= 0) return [];
    return [...new Set(
        cached
            .map(friend => toNum(friend && friend.gid))
            .filter(gid => gid > 0)
    )];
}

async function _getAllViaGameFriends(modeName, options = {}) {
    const fetchState = options.fetchState || null;
    const accountId = options.accountId || null;
    const userState = options.userState || null;
    const gids = await _getKnownFriendGids(accountId, { fetchState, userState });
    if (!gids.length) {
        log('好友', `GetGameFriends 跳过(${modeName}): 没有可用的历史好友 GID 缓存`);
        return { game_friends: [], invitations: [], application_count: 0 };
    }

    if (!types.GetGameFriendsRequest) {
        logWarn('好友', 'GetGameFriends 协议未加载，跳过 QQ 缓存 GID 拉取');
        return { game_friends: [], invitations: [], application_count: 0 };
    }

    const allFriends = [];
    let invitations = [];
    let applicationCount = 0;

    for (let i = 0; i < gids.length; i += GET_GAME_FRIENDS_BATCH_SIZE) {
        const batch = gids.slice(i, i + GET_GAME_FRIENDS_BATCH_SIZE);
        try {
            const body = types.GetGameFriendsRequest.encode(types.GetGameFriendsRequest.create({
                gids: batch.map(gid => toLong(gid)),
            })).finish();
            const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetGameFriends', body);
            const reply = _decodeGetGameFriendsReply(replyBody);
            if (Array.isArray(reply?.game_friends) && reply.game_friends.length > 0) {
                allFriends.push(...reply.game_friends);
            }
            if (!invitations.length && Array.isArray(reply?.invitations)) {
                invitations = reply.invitations;
            }
            applicationCount = Math.max(applicationCount, toNum(reply?.application_count));
        } catch (err) {
            logWarn('好友', `GetGameFriends 批次失败(${modeName}, ${i + 1}-${i + batch.length}): ${err.message || err}`);
        }
        if (i + GET_GAME_FRIENDS_BATCH_SIZE < gids.length) {
            await sleep(100);
        }
    }

    const reply = {
        game_friends: _dedupeFriendsByGid(allFriends),
        invitations,
        application_count: applicationCount,
    };
    _logFriendFetchResult('GetGameFriends', modeName, reply, fetchState);
    return reply;
}

async function _getAllViaGameFriendsOrCache(modeName, options = {}) {
    const fetchState = options.fetchState || null;
    const accountId = options.accountId || null;
    const userState = options.userState || null;
    const directReply = await _getAllViaGameFriendsDirect(modeName, { fetchState });
    if (_hasUsableFriendEntries(directReply, userState)) {
        return directReply;
    }

    const reply = await _getAllViaGameFriends(modeName, { fetchState, accountId, userState });
    if (_hasUsableFriendEntries(reply, userState)) {
        return reply;
    }

    const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
        userState,
        allowVisitorSeed: false,
    });
    return cachedReply || reply || directReply;
}

function _isGetAllParamErrorCoolingDown(fetchState) {
    return !!(fetchState && Number(fetchState.getAllParamErrorUntil) > Date.now());
}

function _markGetAllParamError(fetchState, label) {
    if (!fetchState) return;
    const nextUntil = Date.now() + GET_ALL_PARAM_ERROR_COOLDOWN_MS;
    const changed = nextUntil > Number(fetchState.getAllParamErrorUntil || 0);
    fetchState.getAllParamErrorUntil = nextUntil;
    if (!changed) return;
    log('好友', `GetAll 返回 code=1000020(${label})，30 分钟内改用好友缓存兼容模式`);
}

function _clearGetAllParamError(fetchState) {
    if (!fetchState || !fetchState.getAllParamErrorUntil) return;
    fetchState.getAllParamErrorUntil = 0;
}

async function _getCachedFriendsReply(accountId, fetchState, options = {}) {
    if (!accountId) return null;
    const cached = await _getCachedFriendsWithBootstrap(accountId, {
        fetchState,
        userState: options.userState || null,
        allowVisitorSeed: !!options.allowVisitorSeed,
    });
    if (!Array.isArray(cached) || cached.length <= 0) return null;

    const reply = {
        game_friends: cached
            .map((friend) => {
                const gid = toNum(friend && friend.gid);
                if (gid <= 0) return null;
                const name = String((friend && friend.name) || `GID:${gid}`);
                return {
                    gid,
                    uin: String((friend && friend.uin) || ''),
                    open_id: String((friend && (friend.openId || friend.open_id || '')) || ''),
                    name,
                    remark: '',
                    avatar_url: String((friend && friend.avatarUrl) || ''),
                    level: 0,
                    gold: 0,
                    plant: null,
                    authorized_status: 0,
                };
            })
            .filter(Boolean),
        invitations: [],
        application_count: 0,
        _fromCache: true,
        _cacheSource: String(cached && cached._cacheSource || '').trim() || undefined,
        _cacheSeededCount: Math.max(0, Number(cached && cached._cacheSeededCount || 0)),
    };

    if (reply.game_friends.length <= 0) return null;
    _logFriendFetchResult('CacheFallback', '缓存', reply, fetchState);
    return reply;
}

async function _getAllViaGetAllOrCache(modeName, options = {}) {
    const fetchState = options.fetchState || null;
    const accountId = options.accountId || null;
    const label = options.label || '兼容模式';
    const userState = options.userState || null;
    const retryOnEmpty = options.retryOnEmpty !== false;

    if (_isGetAllParamErrorCoolingDown(fetchState)) {
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        if (cachedReply) return cachedReply;
    }

    try {
        const reply = await _getAllViaGetAll(modeName, { fetchState, retryOnEmpty });
        if (_hasUsableFriendEntries(reply, userState)) {
            _clearGetAllParamError(fetchState);
            return reply;
        }
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        return cachedReply || reply;
    } catch (err) {
        if (!isParamError(err)) {
            throw err;
        }
        _markGetAllParamError(fetchState, label);
        const cachedReply = await _getCachedFriendsReply(accountId, fetchState, {
            userState,
            allowVisitorSeed: true,
        });
        if (cachedReply) return cachedReply;
        throw err;
    }
}


async function getApplications() {
    const body = types.GetApplicationsRequest.encode(types.GetApplicationsRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetApplications', body);
    const reply = types.GetApplicationsReply.decode(replyBody);
    const appCount = reply.applications ? reply.applications.length : 0;
    log('好友', `GetApplications 结果: applications=${appCount}, block=${!!reply.block_applications}`);
    if (appCount > 0) {
        reply.applications.forEach((a, i) => {
            log('好友', `  申请[${i}]: gid=${toNum(a.gid)}, name=${a.name || ''}, open_id=${a.open_id || ''}, level=${toNum(a.level)}`);
        });
    }
    if (appCount > 0) {
        await cacheFriendSeeds(reply.applications || [], {
            ..._buildFriendCacheScopeOptions(getUserState()),
        });
    }
    return reply;
}


async function acceptFriends(gids) {
    const body = types.AcceptFriendsRequest.encode(types.AcceptFriendsRequest.create({
        friend_gids: gids.map(g => toLong(g)),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.friendpb.FriendService', 'AcceptFriends', body);
    const reply = types.AcceptFriendsReply.decode(replyBody);
    const acceptedSeeds = []
        .concat(reply && Array.isArray(reply.friends) ? reply.friends : [])
        .concat((Array.isArray(gids) ? gids : []).map(gid => ({ gid })));
    if (acceptedSeeds.length > 0) {
        await cacheFriendSeeds(acceptedSeeds, {
            ..._buildFriendCacheScopeOptions(getUserState()),
        });
    }
    return reply;
}


async function enterFriendFarm(friendGid, isUrgent = false) {
    const body = types.VisitEnterRequest.encode(types.VisitEnterRequest.create({
        host_gid: toLong(friendGid),
        reason: 2,  // ENTER_REASON_FRIEND
    })).finish();
    const sendFn = isUrgent ? sendMsgAsyncUrgent : sendMsgAsync;
    const { body: replyBody } = await sendFn('gamepb.visitpb.VisitService', 'Enter', body);
    const reply = types.VisitEnterReply.decode(replyBody);
    const seeds = [{ gid: toNum(friendGid) }];
    if (reply && reply.basic) {
        seeds.unshift({
            ...reply.basic,
            gid: toNum(reply.basic.gid) || toNum(friendGid),
        });
    }
    await cacheFriendSeeds(seeds, {
        ..._buildFriendCacheScopeOptions(getUserState()),
    });
    return reply;
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

function updateOperationLimits(limits) {
    if (!limits || limits.length === 0) return;
    scanner.checkDailyReset();
    for (const limit of limits) {
        const id = toNum(limit.id);
        if (id > 0) {
            const data = {
                dayTimes: toNum(limit.day_times),
                dayTimesLimit: toNum(limit.day_times_lt),
                dayExpTimes: toNum(limit.day_exp_times),
                dayExpTimesLimit: toNum(limit.day_ex_times_lt), // 协议字段名为 day_ex_times_lt
            };
            state.operationLimits.set(id, data);
        }
    }
}

function canGetExp(opId) {
    const limit = state.operationLimits.get(opId);
    if (!limit) {
        // 无限制数据：经验限制功能关闭时放行，开启时保守等待数据
        return !isAutomationOn('friend_help_exp_limit');
    }
    if (limit.dayExpTimesLimit <= 0) return true;  // 没有经验上限
    return limit.dayExpTimes < limit.dayExpTimesLimit;
}

function canGetExpByCandidates(opIds = []) {
    const ids = Array.isArray(opIds) ? opIds : [opIds];
    for (const id of ids) {
        if (canGetExp(toNum(id))) return true;
    }
    return false;
}

function canOperate(opId) {
    const limit = state.operationLimits.get(opId);
    if (!limit) return true;
    if (limit.dayTimesLimit <= 0) return true;
    return limit.dayTimes < limit.dayTimesLimit;
}

function getRemainingTimes(opId) {
    const limit = state.operationLimits.get(opId);
    if (!limit || limit.dayTimesLimit <= 0) return 999;
    return Math.max(0, limit.dayTimesLimit - limit.dayTimes);
}

function getOperationLimits() {
    const result = {};
    for (const id of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]) {
        const limit = state.operationLimits.get(id);
        if (limit) {
            result[id] = {
                name: state.OP_NAMES[id] || `#${id}`,
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
        if (afterExp <= beforeExp) scanner.autoDisableHelpByExpLimit();
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
        if (afterExp <= beforeExp) scanner.autoDisableHelpByExpLimit();
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
        if (afterExp <= beforeExp) scanner.autoDisableHelpByExpLimit();
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
        // 令牌桶已在底层做了统一间隔限流，无需额外 sleep
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
        // 令牌桶已在底层做了统一间隔限流，无需额外 sleep
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

async function doFriendOperation(friendGid, opType) {
    const gid = toNum(friendGid);
    if (!gid) return { ok: false, message: '无效好友ID', opType };

    let enterReply;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e) {
        if (e && e.code === BANNED_ERROR_CODE) {
            decision.autoBlacklistBannedFriend(gid, opType === 'steal' ? `GID:${gid}` : `GID:${gid}`);
        }
        return { ok: false, message: `进入好友农场失败: ${e.message}`, opType };
    }

    try {
        const lands = enterReply.lands || [];
        const state = getUserState();
        const status = decision.analyzeFriendLands(lands, state.gid, '');
        let count = 0;

        if (opType === 'steal') {
            if (!status.stealable.length) return { ok: true, opType, count: 0, message: '没有可偷取土地' };
            const precheck = await checkCanOperateRemote(gid, 10008);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日偷菜次数已用完' };
            const maxNum = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const target = status.stealable.slice(0, maxNum);
            count = await scanner.runBatchWithFallback(target, (ids) => stealHarvest(gid, ids), (ids) => stealHarvest(gid, ids));
            if (count > 0) {
                recordOperation('steal', count);
                await friendStealStatsService.recordStealSuccess({
                    accountId: CONFIG.accountId || process.env.FARM_ACCOUNT_ID || '',
                    friendGid: gid,
                    friendName: `GID:${gid}`,
                    stealCount: count,
                    landCount: count,
                    mode: 'manual',
                }).catch(() => { });
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
            count = await scanner.runBatchWithFallback(status.needWater, (ids) => helpWater(gid, ids), (ids) => helpWater(gid, ids));
            if (count > 0) recordOperation('helpWater', count);
            return { ok: true, opType, count, message: `浇水完成 ${count} 块` };
        }

        if (opType === 'weed') {
            if (!status.needWeed.length) return { ok: true, opType, count: 0, message: '没有可除草土地' };
            const precheck = await checkCanOperateRemote(gid, 10005);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日除草次数已用完' };
            count = await scanner.runBatchWithFallback(status.needWeed, (ids) => helpWeed(gid, ids), (ids) => helpWeed(gid, ids));
            if (count > 0) recordOperation('helpWeed', count);
            return { ok: true, opType, count, message: `除草完成 ${count} 块` };
        }

        if (opType === 'bug') {
            if (!status.needBug.length) return { ok: true, opType, count: 0, message: '没有可除虫土地' };
            const precheck = await checkCanOperateRemote(gid, 10006);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '今日除虫次数已用完' };
            count = await scanner.runBatchWithFallback(status.needBug, (ids) => helpInsecticide(gid, ids), (ids) => helpInsecticide(gid, ids));
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

async function doFriendBatchOperation(friendGids = [], opType, options = {}) {
    const list = Array.from(new Set((Array.isArray(friendGids) ? friendGids : []).map(Number).filter(gid => Number.isFinite(gid) && gid > 0)));
    const continueOnError = options.continueOnError !== false;
    const skipBlacklisted = options.skipBlacklisted !== false;
    const stopOnBan = options.stopOnBan !== false;
    const cooldownMs = Math.max(0, Number(options.cooldownMs || 1200));
    const blacklist = new Set(getFriendBlacklist());
    const results = [];
    let successCount = 0;
    let failCount = 0;
    let totalAffectedCount = 0;

    for (let i = 0; i < list.length; i++) {
        const gid = list[i];
        if (skipBlacklisted && blacklist.has(gid)) {
            results.push({
                gid,
                ok: false,
                skipped: true,
                opType,
                count: 0,
                message: '好友在黑名单中，已跳过',
            });
            continue;
        }

        const result = await doFriendOperation(gid, opType);
        results.push({ gid, ...result });
        if (result && result.ok) {
            successCount += 1;
            totalAffectedCount += Math.max(0, Number(result.count || 0));
        } else {
            failCount += 1;
        }

        const message = String((result && result.message) || '');
        if ((!result || !result.ok) && !continueOnError) break;
        if (stopOnBan && (message.includes('1002003') || message.includes('封禁'))) break;

        if (cooldownMs > 0 && i < list.length - 1) {
            await sleep(cooldownMs + Math.floor(Math.random() * Math.min(600, cooldownMs || 1)));
        }
    }

    return {
        ok: true,
        opType,
        total: list.length,
        successCount,
        failCount,
        totalAffectedCount,
        results,
    };
}

Object.assign(module.exports, { getAllFriends, getApplications, acceptFriends, enterFriendFarm, leaveFriendFarm, updateOperationLimits, canGetExp, canGetExpByCandidates, canOperate, getRemainingTimes, getOperationLimits, helpWater, helpWeed, helpInsecticide, stealHarvest, putPlantItems, putPlantItemsDetailed, putInsects, putWeeds, putInsectsDetailed, putWeedsDetailed, checkCanOperateRemote, doFriendOperation, doFriendBatchOperation, resetGetAllMode, resetFriendActionRuntimeState, isGetAllMode, getFriendFetchDiagnostics, fetchFriendProfilesByGids });

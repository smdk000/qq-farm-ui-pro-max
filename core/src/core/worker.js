const process = require('node:process');
/**
 * 子进程 Worker - 负责运行单个账号的挂机逻辑
 */
const { parentPort, workerData } = require('node:worker_threads');
const { CONFIG } = require('../config/config');
const { getLevelExpProgress } = require('../config/gameConfig');
const { getAutomation, getPreferredSeed, getConfigSnapshot, applyConfigSnapshot } = require('../models/store');
const { checkAndClaimEmails } = require('../services/email');
const { getEmailDailyState } = require('../services/email');
const { processInviteCodes } = require('../services/invite');
const { autoBuyFertilizer, getFertilizerBuyDailyState, getFreeGiftDailyState, getMallGoodsCatalog, getMallCatalog, purchaseMallGoods, claimMonthCardRewardByGoodsId } = require('../services/mall');
const { getMonthCardDailyState } = require('../services/monthcard');
const { getOpenServerDailyState } = require('../services/openserver');
const { getVipDailyState } = require('../services/qqvip');
const { createScheduler, getSchedulerRegistrySnapshot } = require('../services/scheduler');
const { getShareDailyState } = require('../services/share');
const { setInitialValues, resetSessionGains } = require('../services/stats');
const { initStatusBar, setStatusPlatform, statusData } = require('../services/status');
const { setRecordGoldExpHook } = require('../services/status');
const { getInteractRecords } = require('../services/interact');
const { getShopCatalog, buyShopGoods } = require('../services/shop');
const { networkCircuitBreaker } = require('../services/circuit-breaker');
const { connect, cleanup, getWs, getUserState, networkEvents } = require('../utils/network');
const { loadProto } = require('../utils/proto');
const { setLogHook, log, toNum } = require('../utils/utils');
const { getCachedFriends, closeDatabase } = require('../services/database');
const { createRuntimeEventBus } = require('../runtime/runtime-event-bus');
const {
    createRuntimeModuleDefinitions,
    buildRuntimeModuleReloadView,
    DEFAULT_RUNTIME_RELOAD_COOLDOWN_MS,
    getRuntimeModuleReloadPlan,
    listReloadableRuntimeModules,
    listRuntimeModuleReloadPlans,
} = require('../runtime/runtime-module-catalog');
const { createRuntimeModuleManager } = require('../runtime/runtime-module-manager');
const { createRuntimeNetworkEventBridge } = require('../runtime/runtime-network-event-bridge');
const {
    computeNextRunAt,
    resolveRuntimeIntervals,
} = require('./unified-intervals');
const EMAIL_CALL_TIMEOUT_MS = 8000;

if (parentPort && workerData && workerData.accountId && !process.env.FARM_ACCOUNT_ID) {
    process.env.FARM_ACCOUNT_ID = String(workerData.accountId);
}

function getFarmService() {
    return require('../services/farm');
}

function getFriendService() {
    return require('../services/friend');
}

function getTaskService() {
    return require('../services/task');
}

function getWarehouseService() {
    return require('../services/warehouse');
}

function getAccountModePolicyService() {
    return require('../services/account-mode-policy');
}

function sendToMaster(payload) {
    if (process.send) {
        process.send(payload);
        return;
    }
    if (parentPort) {
        parentPort.postMessage(payload);
    }
}

function onMasterMessage(handler) {
    if (process.send) {
        process.on('message', handler);
    }
    if (parentPort) {
        parentPort.on('message', handler);
    }
}

function exitWorker(code = 0) {
    if (parentPort) {
        try {
            parentPort.close();
        } catch { }
        return;
    }
    process.exit(code);
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatLocalDateTime24(date = new Date()) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timer = null;
    return Promise.race([
        Promise.resolve(promise).finally(() => {
            if (timer) clearTimeout(timer);
        }),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(timeoutMessage || 'operation timeout'));
            }, Math.max(1000, Number(timeoutMs) || 1000));
        }),
    ]);
}

async function runEmailClaimSafely(force = false, scene = 'farm_tick') {
    try {
        return await withTimeout(
            checkAndClaimEmails(force),
            EMAIL_CALL_TIMEOUT_MS,
            `邮箱领取超时(${EMAIL_CALL_TIMEOUT_MS}ms)`,
        );
    } catch (e) {
        log('邮箱', `${scene} 邮箱领取已跳过: ${e.message}`, {
            module: 'task',
            event: 'email_rewards',
            result: 'timeout',
            scene,
        });
        return { claimed: 0, rewardItems: 0, skipped: true };
    }
}

// 捕获日志发送给主进程
setLogHook((tag, msg, isWarn, meta) => {
    sendToMaster({
        type: 'log',
        data: {
            time: formatLocalDateTime24(new Date()),
            tag,
            msg,
            isWarn,
            meta: meta || {},
        }
    });
});

// 捕获金币经验变化
setRecordGoldExpHook((gold, exp) => {
    // 更新内部统计
    const { recordGoldExp } = require('../services/stats');
    recordGoldExp(gold, exp);

    // 发送给主进程
    sendToMaster({ type: 'stat_update', data: { gold, exp } });
});

let isRunning = false;
let loginReady = false;
let appliedConfigRevision = 0;
let unifiedSchedulerRunning = false;
let farmTaskRunning = false;
let friendTaskRunning = false;
let helpTaskRunning = false;
let stealTaskRunning = false;
let nextFarmRunAt = 0;
let nextFriendRunAt = 0;
let nextHelpRunAt = 0;
let nextStealRunAt = 0;
let lastStatusHash = '';
let lastStatusSentAt = 0;
let workerScheduler = null;
const runtimeReloadActivity = new Map();
const runtimeReloadHistory = [];
const MAX_RUNTIME_RELOAD_HISTORY = 8;

function getWorkerScheduler() {
    if (!workerScheduler) {
        workerScheduler = createScheduler('worker');
    }
    return workerScheduler;
}

function getWorkerSchedulerSnapshotForReloadPreview() {
    if (!workerScheduler || typeof workerScheduler.getSnapshot !== 'function') {
        return { taskCount: 0, tasks: [] };
    }
    return workerScheduler.getSnapshot() || { taskCount: 0, tasks: [] };
}

function buildRuntimeReloadPreviewState() {
    const activityByTarget = {};
    for (const [target, activity] of runtimeReloadActivity.entries()) {
        activityByTarget[target] = { ...activity };
    }
    return {
        now: Date.now(),
        loginReady,
        unifiedSchedulerRunning,
        workerSchedulerSnapshot: getWorkerSchedulerSnapshotForReloadPreview(),
        activityByTarget,
    };
}

function getReloadableRuntimeModuleTargets() {
    return listReloadableRuntimeModules(buildRuntimeReloadPreviewState());
}

function getRuntimeReloadTargetPreview(targetName = '') {
    return buildRuntimeModuleReloadView(targetName, buildRuntimeReloadPreviewState());
}

function summarizeRuntimeReloadQueueSnapshot(snapshot) {
    const normalizedSnapshot = snapshot && typeof snapshot === 'object'
        ? snapshot
        : {};
    const tasks = Array.isArray(normalizedSnapshot.tasks) ? normalizedSnapshot.tasks : [];
    return {
        taskCount: Math.max(0, Number(normalizedSnapshot.taskCount) || tasks.length),
        runningTaskCount: tasks.filter(task => task && task.running).length,
    };
}

function normalizeRuntimeReloadTaskDiffSnapshot(snapshot) {
    const normalizedSnapshot = snapshot && typeof snapshot === 'object'
        ? snapshot
        : {};
    const tasks = Array.isArray(normalizedSnapshot.tasks) ? normalizedSnapshot.tasks : [];
    return tasks
        .map((task) => ({
            name: String(task && task.name || '').trim(),
            kind: String(task && task.kind || 'timeout').trim() || 'timeout',
            running: !!(task && task.running),
        }))
        .filter(task => !!task.name)
        .sort((left, right) => left.name.localeCompare(right.name));
}

function createRuntimeReloadSummary(targetName, plan, options = {}, beforeSnapshot = {}, afterSnapshot = {}, meta = {}) {
    const startedAt = Math.max(0, Number(meta.startedAt) || Date.now());
    const finishedAt = Math.max(startedAt, Number(meta.finishedAt) || Date.now());
    const beforeState = summarizeRuntimeReloadQueueSnapshot(beforeSnapshot);
    const afterState = summarizeRuntimeReloadQueueSnapshot(afterSnapshot);
    return {
        target: String(targetName || '').trim(),
        modules: Array.isArray(plan && plan.modules) ? [...plan.modules] : [],
        forced: options.force === true,
        result: String(meta.result || 'ok').trim() || 'ok',
        source: String(meta.source || options.source || 'runtime_reload').trim(),
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
        beforeTaskCount: beforeState.taskCount,
        beforeRunningTaskCount: beforeState.runningTaskCount,
        afterTaskCount: afterState.taskCount,
        afterRunningTaskCount: afterState.runningTaskCount,
        beforeTasks: normalizeRuntimeReloadTaskDiffSnapshot(beforeSnapshot),
        afterTasks: normalizeRuntimeReloadTaskDiffSnapshot(afterSnapshot),
        unifiedSchedulerResumed: meta.unifiedSchedulerResumed === true,
        error: String(meta.error || '').trim(),
    };
}

function formatRuntimeReloadCooldownMessage(preflight) {
    const seconds = Math.max(1, Math.ceil(Number(preflight && preflight.cooldownRemainingMs) / 1000));
    return `热重载冷却中，请等待 ${seconds} 秒后再试，或明确强制执行`;
}

function recordRuntimeReloadActivity(targetName, plan, meta = {}) {
    const now = Math.max(0, Number(meta.reloadedAt) || Date.now());
    const lastReloadSummary = meta.lastReloadSummary && typeof meta.lastReloadSummary === 'object'
        ? { ...meta.lastReloadSummary }
        : null;
    const affectedPlans = listRuntimeModuleReloadPlans().filter(candidate =>
        Array.isArray(candidate.modules)
        && candidate.modules.some(moduleName => plan.modules.includes(moduleName))
    );
    for (const candidate of affectedPlans) {
        runtimeReloadActivity.set(candidate.target, {
            lastReloadAt: now,
            lastReloadResult: String(meta.result || 'ok').trim() || 'ok',
            lastReloadSource: String(meta.source || '').trim(),
            lastReloadTarget: String(targetName || '').trim(),
            cooldownMs: Math.max(0, Number(candidate.cooldownMs) || DEFAULT_RUNTIME_RELOAD_COOLDOWN_MS),
            lastReloadSummary,
        });
    }
}

function appendRuntimeReloadHistory(plan, summary = {}) {
    const finishedAt = Math.max(0, Number(summary.finishedAt) || Date.now());
    const entry = {
        id: `${finishedAt}:${String(summary.target || plan.target || '').trim()}:${String(summary.source || '').trim() || 'runtime_reload'}:${String(summary.result || 'ok').trim() || 'ok'}`,
        target: String(summary.target || plan.target || '').trim(),
        modules: Array.isArray(summary.modules) ? [...summary.modules] : [...(plan.modules || [])],
        forced: summary.forced === true,
        result: String(summary.result || 'ok').trim() || 'ok',
        source: String(summary.source || 'runtime_reload').trim() || 'runtime_reload',
        startedAt: Math.max(0, Number(summary.startedAt) || 0),
        finishedAt,
        durationMs: Math.max(0, Number(summary.durationMs) || 0),
        beforeTaskCount: Math.max(0, Number(summary.beforeTaskCount) || 0),
        beforeRunningTaskCount: Math.max(0, Number(summary.beforeRunningTaskCount) || 0),
        afterTaskCount: Math.max(0, Number(summary.afterTaskCount) || 0),
        afterRunningTaskCount: Math.max(0, Number(summary.afterRunningTaskCount) || 0),
        beforeTasks: Array.isArray(summary.beforeTasks) ? summary.beforeTasks.map(task => ({
            name: String(task && task.name || '').trim(),
            kind: String(task && task.kind || 'timeout').trim() || 'timeout',
            running: !!(task && task.running),
        })).filter(task => !!task.name) : [],
        afterTasks: Array.isArray(summary.afterTasks) ? summary.afterTasks.map(task => ({
            name: String(task && task.name || '').trim(),
            kind: String(task && task.kind || 'timeout').trim() || 'timeout',
            running: !!(task && task.running),
        })).filter(task => !!task.name) : [],
        unifiedSchedulerResumed: summary.unifiedSchedulerResumed === true,
        error: String(summary.error || '').trim(),
        riskLevel: String(plan.riskLevel || 'low').trim() || 'low',
        affectedTaskGroups: Array.isArray(plan.affectedTaskGroups) ? [...plan.affectedTaskGroups] : [],
        affectsUnifiedScheduler: plan.affectsUnifiedScheduler !== false,
        description: String(plan.description || '').trim(),
    };
    runtimeReloadHistory.unshift(entry);
    if (runtimeReloadHistory.length > MAX_RUNTIME_RELOAD_HISTORY) {
        runtimeReloadHistory.length = MAX_RUNTIME_RELOAD_HISTORY;
    }
    return { ...entry, modules: [...entry.modules], affectedTaskGroups: [...entry.affectedTaskGroups] };
}

function getRuntimeReloadHistoryEntries() {
    return runtimeReloadHistory.map(entry => ({
        ...entry,
        modules: Array.isArray(entry.modules) ? [...entry.modules] : [],
        beforeTasks: Array.isArray(entry.beforeTasks) ? entry.beforeTasks.map(task => ({ ...task })) : [],
        afterTasks: Array.isArray(entry.afterTasks) ? entry.afterTasks.map(task => ({ ...task })) : [],
        affectedTaskGroups: Array.isArray(entry.affectedTaskGroups) ? [...entry.affectedTaskGroups] : [],
    }));
}
const BUSINESS_RUNTIME_MODULES = Object.freeze([
    'farm',
    'friend',
    'task',
    'redpacket',
    'behavior-report',
    'warehouse',
]);
const runtimeEventBus = createRuntimeEventBus();
const runtimeModuleManager = createRuntimeModuleManager({
    runtimeBus: runtimeEventBus,
});
const runtimeContext = {
    runtimeBus: runtimeEventBus,
    sendToMaster,
    log,
    getAutomation,
    getConfigSnapshot: () => getConfigSnapshot(),
    getUserState,
    getWorkerScheduler,
    isLoginReady: () => loginReady,
    isRunning: () => isRunning,
    requestStop: (payload = {}) => stopBot(payload),
    softDisconnectCurrentSession,
};
for (const moduleDefinition of createRuntimeModuleDefinitions(runtimeContext)) {
    runtimeModuleManager.register(moduleDefinition);
}
const runtimeNetworkEventBridge = createRuntimeNetworkEventBridge({
    networkEvents,
    runtimeBus: runtimeEventBus,
});

function applyIntervalsToRuntime(intervals) {
    const runtimeIntervals = resolveRuntimeIntervals(intervals);
    const farmRange = runtimeIntervals.farm;
    CONFIG.farmCheckIntervalMin = farmRange.min * 1000;
    CONFIG.farmCheckIntervalMax = farmRange.max * 1000;
    CONFIG.farmCheckInterval = CONFIG.farmCheckIntervalMin;

    const friendRange = runtimeIntervals.friend;
    CONFIG.friendCheckIntervalMin = friendRange.min * 1000;
    CONFIG.friendCheckIntervalMax = friendRange.max * 1000;
    CONFIG.friendCheckInterval = CONFIG.friendCheckIntervalMin;

    const helpRange = runtimeIntervals.help;
    CONFIG.helpCheckIntervalMin = helpRange.min * 1000;
    CONFIG.helpCheckIntervalMax = helpRange.max * 1000;
    CONFIG.helpCheckInterval = CONFIG.helpCheckIntervalMin;

    const stealRange = runtimeIntervals.steal;
    CONFIG.stealCheckIntervalMin = stealRange.min * 1000;
    CONFIG.stealCheckIntervalMax = stealRange.max * 1000;
    CONFIG.stealCheckInterval = CONFIG.stealCheckIntervalMin;
}

function randomIntervalMs(minMs, maxMs) {
    const minSec = Math.max(1, Math.floor(Math.max(1000, Number(minMs) || 1000) / 1000));
    const maxSec = Math.max(minSec, Math.floor(Math.max(1000, Number(maxMs) || minSec * 1000) / 1000));
    if (maxSec === minSec) return minSec * 1000;
    const sec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1));
    return sec * 1000;
}

function resetUnifiedSchedule() {
    const farmMs = randomIntervalMs(
        CONFIG.farmCheckIntervalMin || CONFIG.farmCheckInterval || 2000,
        CONFIG.farmCheckIntervalMax || CONFIG.farmCheckInterval || 2000
    );
    const friendMs = randomIntervalMs(
        CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    const helpMs = randomIntervalMs(
        CONFIG.helpCheckIntervalMin || CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.helpCheckIntervalMax || CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    const stealMs = randomIntervalMs(
        CONFIG.stealCheckIntervalMin || CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.stealCheckIntervalMax || CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    const now = Date.now();
    nextFarmRunAt = now + farmMs;
    nextFriendRunAt = now + friendMs;
    nextHelpRunAt = now + helpMs;
    nextStealRunAt = now + stealMs;
}

async function runFarmTick(auto) {
    if (farmTaskRunning) return;
    farmTaskRunning = true;
    const startedAt = Date.now();
    const farmMs = randomIntervalMs(
        CONFIG.farmCheckIntervalMin || CONFIG.farmCheckInterval || 2000,
        CONFIG.farmCheckIntervalMax || CONFIG.farmCheckInterval || 2000
    );
    try {
        const farmService = getFarmService();
        const taskService = getTaskService();
        const warehouseService = getWarehouseService();
        if (auto.farm) await farmService.checkFarm();
        if (auto.task) await taskService.checkAndClaimTasks();
        if (auto.email) await runEmailClaimSafely(false, 'farm_tick');
        if (auto.fertilizer_gift) await warehouseService.openFertilizerGiftPacksSilently();
        if (auto.fertilizer_buy) await autoBuyFertilizer();
    } catch (e) {
        log('系统', `农场调度执行失败: ${e.message}`, { module: 'system', event: 'farm_tick', result: 'error' });
    } finally {
        nextFarmRunAt = computeNextRunAt(startedAt, farmMs);
        farmTaskRunning = false;
    }
}

async function runFriendTick(auto) {
    if (friendTaskRunning) return;
    friendTaskRunning = true;
    const startedAt = Date.now();
    const friendMs = randomIntervalMs(
        CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    try {
        if (auto.friend_auto_accept) await getFriendService().checkAndAcceptApplications();
    } catch (e) {
        log('系统', `好友申请调度执行失败: ${e.message}`, { module: 'system', event: 'friend_applications_tick', result: 'error' });
    } finally {
        nextFriendRunAt = computeNextRunAt(startedAt, friendMs);
        friendTaskRunning = false;
    }
}

async function runHelpTick(auto) {
    if (helpTaskRunning) return;
    helpTaskRunning = true;
    const startedAt = Date.now();
    const helpMs = randomIntervalMs(
        CONFIG.helpCheckIntervalMin || CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.helpCheckIntervalMax || CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    try {
        if (auto.friend_help || auto.friend_bad) await getFriendService().checkFriends('help');
    } catch (e) {
        log('系统', `帮忙调度执行失败: ${e.message}`, { module: 'system', event: 'help_tick', result: 'error' });
    } finally {
        nextHelpRunAt = computeNextRunAt(startedAt, helpMs);
        helpTaskRunning = false;
    }
}

async function runStealTick(auto) {
    if (stealTaskRunning) return;
    stealTaskRunning = true;
    const startedAt = Date.now();
    const stealMs = randomIntervalMs(
        CONFIG.stealCheckIntervalMin || CONFIG.friendCheckIntervalMin || CONFIG.friendCheckInterval || 10000,
        CONFIG.stealCheckIntervalMax || CONFIG.friendCheckIntervalMax || CONFIG.friendCheckInterval || 10000
    );
    try {
        if (auto.friend_steal) await getFriendService().checkFriends('steal');
    } catch (e) {
        log('系统', `偷菜调度执行失败: ${e.message}`, { module: 'system', event: 'steal_tick', result: 'error' });
    } finally {
        nextStealRunAt = computeNextRunAt(startedAt, stealMs);
        stealTaskRunning = false;
    }
}

async function runUnifiedTick() {
    if (!unifiedSchedulerRunning || !loginReady) return;
    const now = Date.now();
    const dueFarm = now >= nextFarmRunAt;
    const dueFriend = now >= nextFriendRunAt;
    const dueHelp = now >= nextHelpRunAt;
    const dueSteal = now >= nextStealRunAt;
    if (!dueFarm && !dueFriend && !dueHelp && !dueSteal) return;

    const auto = getAutomation();
    if (dueFarm) await runFarmTick(auto);
    if (dueFriend) await runFriendTick(auto);
    if (dueHelp) await runHelpTick(auto);
    if (dueSteal) await runStealTick(auto);
}

function scheduleUnifiedNextTick() {
    if (!unifiedSchedulerRunning) return;
    getWorkerScheduler().clear('unified_next_tick');
    if (!loginReady) return;

    const now = Date.now();
    const nextAt = Math.min(
        Number(nextFarmRunAt) || (now + 1000),
        Number(nextFriendRunAt) || (now + 1000),
        Number(nextHelpRunAt) || (now + 1000),
        Number(nextStealRunAt) || (now + 1000)
    );
    const delayMs = Math.max(1000, nextAt - now); // 最低 1 秒

    getWorkerScheduler().setTimeoutTask('unified_next_tick', delayMs, async () => {
        try {
            await runUnifiedTick();
        } finally {
            scheduleUnifiedNextTick();
        }
    });
}

function startUnifiedScheduler() {
    if (unifiedSchedulerRunning) return;
    unifiedSchedulerRunning = true;
    resetUnifiedSchedule();
    scheduleUnifiedNextTick();
}

function stopUnifiedScheduler() {
    unifiedSchedulerRunning = false;
    farmTaskRunning = false;
    friendTaskRunning = false;
    helpTaskRunning = false;
    stealTaskRunning = false;
    getWorkerScheduler().clear('unified_next_tick');
}

function applyRuntimeConfig(snapshot, syncNow = false) {
    const prevAuto = getAutomation();
    applyConfigSnapshot(snapshot || {}, { persist: false });
    const rev = Number((snapshot || {}).__revision || 0);
    if (rev > 0) appliedConfigRevision = rev;

    // 优先使用本次下发的间隔，避免 worker 内部 store 漂移导致回退默认值
    const incomingIntervals = (snapshot && snapshot.intervals && typeof snapshot.intervals === 'object')
        ? snapshot.intervals
        : null;
    if (incomingIntervals) {
        applyIntervalsToRuntime(incomingIntervals);
    }

    if (loginReady) {
        resetUnifiedSchedule();
        scheduleUnifiedNextTick();
    }

    runtimeModuleManager.applyConfig({
        snapshot: snapshot || {},
        prevAutomation: prevAuto,
        loginReady,
        appliedConfigRevision,
    });

    if (syncNow) syncStatus();
}

// 接收主进程指令
onMasterMessage(async (msg) => {
    try {
        if (msg.type === 'start') {
            await startBot(msg.config);
        } else if (msg.type === 'stop') {
            await stopBot();
        } else if (msg.type === 'api_call') {
            handleApiCall(msg);
        } else if (msg.type === 'config_sync') {
            applyRuntimeConfig(msg.config || {}, true);
        }
    } catch (e) {
        sendToMaster({ type: 'error', error: e.message });
    }
});

async function startBot(config) {
    if (isRunning) return;
    isRunning = true;

    let resolvedPlatform = config.platform || 'qq';
    // 自动降级与修正: 如果保存为 qq 且 uin 包含字母 (如 wxid_xxx 或 oXXXX)，自动修正为微信
    const uStr = String(config.uin || '');
    if (resolvedPlatform === 'qq' && /[a-z]/i.test(uStr)) {
        resolvedPlatform = 'wx_car';
    }
    if (resolvedPlatform === 'qq' && !uStr.trim()) {
        log('系统', 'QQ账号未提供UIN，按仅 Code 兼容模式继续尝试登录');
    }
    CONFIG.platform = resolvedPlatform;
    if (config.farmInterval) {
        CONFIG.farmCheckInterval = config.farmInterval;
        CONFIG.farmCheckIntervalMin = config.farmInterval;
        CONFIG.farmCheckIntervalMax = config.farmInterval;
    }
    if (config.friendInterval) {
        CONFIG.friendCheckInterval = config.friendInterval;
        CONFIG.friendCheckIntervalMin = config.friendInterval;
        CONFIG.friendCheckIntervalMax = config.friendInterval;
        CONFIG.helpCheckInterval = config.friendInterval;
        CONFIG.helpCheckIntervalMin = config.friendInterval;
        CONFIG.helpCheckIntervalMax = config.friendInterval;
        CONFIG.stealCheckInterval = config.friendInterval;
        CONFIG.stealCheckIntervalMin = config.friendInterval;
        CONFIG.stealCheckIntervalMax = config.friendInterval;
    }

    await loadProto();

    log('系统', `正在连接服务器... (platform=${CONFIG.platform}, version=${CONFIG.clientVersion})`);

    // 加载保存的配置
    applyRuntimeConfig(getConfigSnapshot(), false);

    initStatusBar();
    setStatusPlatform(CONFIG.platform);
    runtimeNetworkEventBridge.attach();
    runtimeModuleManager.start('session-control', {
        source: 'start_bot',
    });

    const onLoginSuccess = async () => {
        loginReady = true;
        const warehouseService = getWarehouseService();
        const accountModePolicyService = getAccountModePolicyService();

        // 登录后主动拉一次背包，初始化点券(ID:1002)数量
        try {
            const bagReply = await warehouseService.getBag();
            const items = warehouseService.getBagItems(bagReply);
            let coupon = 0;
            for (const it of (items || [])) {
                if (toNum(it && it.id) === 1002) {
                    coupon = toNum(it.count);
                    break;
                }
            }
            const state = getUserState();
            state.coupon = Math.max(0, coupon);
        } catch {
            // ignore
        }
        // 登录成功后，以当前金币/经验/点券作为统计基线，并清空会话增量
        const latest = getUserState();
        setInitialValues(Number(latest.gold || 0), Number(latest.exp || 0), Number(latest.coupon || 0));
        resetSessionGains();

        // 冷启动预热：优先使用最近一次缓存的好友快照，缩短 requiresGameFriend 的未知窗口
        try {
            if (CONFIG.accountId && !accountModePolicyService.getRuntimeFriendsSnapshot(CONFIG.accountId)) {
                const cachedFriends = await getCachedFriends(CONFIG.accountId, {
                    platform: CONFIG.platform,
                    uin: String(CONFIG.uin || '').trim(),
                    openId: String(latest.openId || '').trim(),
                });
                if (Array.isArray(cachedFriends) && cachedFriends.length > 0) {
                    accountModePolicyService.updateRuntimeFriendsSnapshot(cachedFriends, CONFIG.accountId);
                    log('好友', `已预热好友缓存快照 ${cachedFriends.length} 人`, {
                        module: 'friend',
                        event: 'friend_cache_preheat',
                        result: 'ok',
                        count: cachedFriends.length,
                    });
                }
            }
        } catch (e) {
            log('好友', `好友缓存预热失败，继续使用实时探测: ${e.message}`, {
                module: 'friend',
                event: 'friend_cache_preheat',
                result: 'error',
            });
        }

        // 登录成功后启动各模块
        await processInviteCodes();
        runtimeModuleManager.startMany(BUSINESS_RUNTIME_MODULES, {
            source: 'login_success',
        });
        startUnifiedScheduler();
        runtimeEventBus.emit('lifecycle:login_ready', {
            accountId: CONFIG.accountId || process.env.FARM_ACCOUNT_ID || '',
        });

        // 立即发送一次状态
        syncStatus();
    };

    connect(config.code, config.openId || config.uin, onLoginSuccess);

    // 启动定时状态同步
    getWorkerScheduler().setIntervalTask('status_sync', 3000, syncStatus, { preventOverlap: true });
}

async function stopBot() {
    if (!isRunning) return exitWorker(0);
    isRunning = false;
    loginReady = false;
    stopUnifiedScheduler();
    runtimeModuleManager.stopAll({
        source: 'stop_bot',
    });
    runtimeNetworkEventBridge.detach();
    if (workerScheduler) {
        workerScheduler.clearAll();
    }
    cleanup();
    const ws = getWs();
    if (ws) ws.close();
    try {
        await closeDatabase();
    } catch {
        // ignore database shutdown failures during worker teardown
    }
    exitWorker(0);
}

function softDisconnectCurrentSession() {
    loginReady = false;
    stopUnifiedScheduler();
    runtimeModuleManager.stopMany(BUSINESS_RUNTIME_MODULES, {
        source: 'soft_disconnect',
    });
    cleanup();
}

function reloadRuntimeModuleTarget(targetName, options = {}) {
    const normalizedTarget = String(targetName || '').trim();
    const plan = getRuntimeModuleReloadPlan(normalizedTarget);
    if (!plan) {
        throw new Error(`不支持的 runtime 模块热重载目标: ${normalizedTarget || '<empty>'}`);
    }
    const preflight = getRuntimeReloadTargetPreview(normalizedTarget);
    if (preflight && preflight.inCooldown && options.force !== true) {
        const cooldownError = new Error(formatRuntimeReloadCooldownMessage(preflight));
        cooldownError.code = 'RUNTIME_RELOAD_COOLDOWN';
        cooldownError.details = {
            target: normalizedTarget,
            cooldownRemainingMs: preflight.cooldownRemainingMs,
            cooldownMs: preflight.cooldownMs,
        };
        throw cooldownError;
    }

    const affectsBusinessModules = plan.modules.some(name => BUSINESS_RUNTIME_MODULES.includes(name));
    const shouldResumeUnifiedScheduler = affectsBusinessModules && unifiedSchedulerRunning;
    const startedAt = Date.now();
    const beforeSnapshot = getWorkerSchedulerSnapshotForReloadPreview();
    if (shouldResumeUnifiedScheduler) {
        stopUnifiedScheduler();
    }

    let reloadDetails;
    let reloadError = null;
    try {
        reloadDetails = runtimeModuleManager.reloadMany(plan.modules, {
            ...options,
            cacheKeys: plan.cacheKeys,
            source: options.source || 'runtime_reload',
            reason: options.reason || `runtime_reload:${normalizedTarget}`,
            target: normalizedTarget,
        });
    } catch (error) {
        reloadError = error;
    } finally {
        if (shouldResumeUnifiedScheduler && isRunning && loginReady) {
            startUnifiedScheduler();
        }
    }
    if (reloadError) {
        const finishedAt = Date.now();
        const failureSummary = createRuntimeReloadSummary(
            normalizedTarget,
            plan,
            options,
            beforeSnapshot,
            getWorkerSchedulerSnapshotForReloadPreview(),
            {
                source: options.source || 'runtime_reload',
                result: 'error',
                startedAt,
                finishedAt,
                unifiedSchedulerResumed: shouldResumeUnifiedScheduler && unifiedSchedulerRunning === true,
                error: reloadError && reloadError.message ? reloadError.message : String(reloadError || '未知错误'),
            },
        );
        appendRuntimeReloadHistory(plan, failureSummary);
        log('系统', `运行时模块热重载失败: ${normalizedTarget}`, {
            module: 'system',
            event: 'runtime_reload',
            result: 'error',
            target: normalizedTarget,
            modules: [...plan.modules],
            durationMs: failureSummary.durationMs,
            forced: options.force === true,
            error: failureSummary.error,
        });
        throw reloadError;
    }

    const finishedAt = Date.now();
    const afterSnapshot = getWorkerSchedulerSnapshotForReloadPreview();
    const reloadSummary = createRuntimeReloadSummary(
        normalizedTarget,
        plan,
        options,
        beforeSnapshot,
        afterSnapshot,
        {
            source: options.source || 'runtime_reload',
            result: 'ok',
            startedAt,
            finishedAt,
            unifiedSchedulerResumed: shouldResumeUnifiedScheduler && unifiedSchedulerRunning === true,
        },
    );
    const historyEntry = appendRuntimeReloadHistory(plan, reloadSummary);
    recordRuntimeReloadActivity(normalizedTarget, plan, {
        source: options.source || 'runtime_reload',
        result: 'ok',
        reloadedAt: finishedAt,
        lastReloadSummary: reloadSummary,
    });

    const payload = {
        target: normalizedTarget,
        modules: [...plan.modules],
        restartedModules: reloadDetails.restartedNames || [],
        cacheKeys: reloadDetails.cacheKeys || [],
        description: plan.description || '',
        loginReady,
        unifiedSchedulerResumed: shouldResumeUnifiedScheduler && isRunning && loginReady,
        forced: options.force === true,
        reloadedAt: finishedAt,
        cooldownMs: Math.max(0, Number(plan.cooldownMs) || DEFAULT_RUNTIME_RELOAD_COOLDOWN_MS),
        durationMs: reloadSummary.durationMs,
        summary: reloadSummary,
        history: historyEntry,
    };

    log('系统', `运行时模块已热重载: ${normalizedTarget} -> ${payload.modules.join(', ')}`, {
        module: 'system',
        event: 'runtime_reload',
        result: 'ok',
        target: normalizedTarget,
        modules: payload.modules,
        restartedModules: payload.restartedModules,
        cacheCount: payload.cacheKeys.length,
        durationMs: payload.durationMs,
        forced: payload.forced,
    });
    runtimeEventBus.emit('lifecycle:runtime_module_reloaded', payload);
    syncStatus();
    return payload;
}

// 处理来自 Admin 面板的直接调用请求 (如: 购买种子、开关设置等)
async function handleApiCall(msg) {
    const { id, method, args } = msg;
    let result = null;
    let error = null;

    try {
        const farmService = getFarmService();
        const friendService = getFriendService();
        const warehouseService = getWarehouseService();
        switch (method) {
            case 'getLands':
                result = await farmService.getLandsDetail();
                break;
            case 'getFriends':
                result = await friendService.getFriendsList(args[0] || {});
                break;
            case 'getFriendLands':
                result = await friendService.getFriendLandsDetail(args[0]);
                break;
            case 'getInteractRecords':
                result = await getInteractRecords(args[0]);
                break;
            case 'doFriendOp':
                result = await friendService.doFriendOperation(args[0], args[1]);
                break;
            case 'doFriendBatchOp':
                result = await friendService.doFriendBatchOperation(args[0], args[1], args[2] || {});
                break;
            case 'getSeeds':
                result = await farmService.getAvailableSeeds();
                break;
            case 'getBag':
                result = await warehouseService.getBagDetail();
                break;
            case 'getPlantableBagSeeds':
                result = await warehouseService.getPlantableBagSeeds(args[0] || {});
                break;
            case 'useBagItem':
                result = await warehouseService.useItem(args[0], args[1] || 1, args[2] || []);
                break;
            case 'getMallGoods':
                result = await getMallGoodsCatalog(args[0]);
                break;
            case 'getMallCatalog':
                result = await getMallCatalog();
                break;
            case 'buyMallGoods':
                result = await purchaseMallGoods(args[0], args[1]);
                break;
            case 'claimMonthCardReward':
                result = await claimMonthCardRewardByGoodsId(args[0]);
                break;
            case 'getShopCatalog':
                result = await getShopCatalog();
                break;
            case 'buyShopGoods':
                result = await buyShopGoods(args[0], args[1], args[2]);
                break;
            case 'getSellPreview':
                result = await warehouseService.getSellPreview(args[0]);
                break;
            case 'sellByPolicy':
                result = await warehouseService.sellByPolicy(args[0], args[1] || { manual: true });
                break;
            case 'sellSelected':
                result = await warehouseService.sellSelectedItems(args[0], args[1] || {});
                break;
            case 'setAutomation': {
                const payload = args && args[0] ? args[0] : {};
                applyRuntimeConfig({ automation: { [payload.key]: payload.value } }, true);
                result = getAutomation();
                break;
            }
            case 'doFarmOp':
                result = await farmService.runFarmOperation(args[0]); // opType
                break;
            case 'getAnalytics': {
                const { getPlantRankings } = require('../services/analytics');
                result = getPlantRankings(args[0]); // sortBy
                break;
            }
            case 'getDailyGiftOverview':
                result = await getDailyGiftOverview();
                break;
            case 'getSchedulers':
                result = getSchedulerRegistrySnapshot();
                break;
            case 'reloadRuntimeModule':
                result = reloadRuntimeModuleTarget(args[0], args[1] || {});
                break;
            case 'getReloadableRuntimeModules':
                result = getReloadableRuntimeModuleTargets();
                break;
            case 'getRuntimeReloadHistory':
                result = getRuntimeReloadHistoryEntries();
                break;
            default:
                error = '未知调用方法';
        }
    } catch (e) {
        error = {
            message: e && e.message ? e.message : String(e || '未知错误'),
            code: e && e.code ? String(e.code) : '',
        };
    }

    sendToMaster({ type: 'api_response', id, result, error });
}

async function getDailyGiftOverview() {
    const auto = getAutomation() || {};
    const taskService = getTaskService();
    const task = typeof taskService.getTaskDailyStateLikeApp === 'function'
        ? await taskService.getTaskDailyStateLikeApp()
        : (typeof taskService.getTaskClaimDailyState === 'function'
            ? taskService.getTaskClaimDailyState()
            : { doneToday: false, lastClaimAt: 0 });
    const growthTask = typeof taskService.getGrowthTaskStateLikeApp === 'function'
        ? await taskService.getGrowthTaskStateLikeApp()
        : { doneToday: false, completedCount: 0, totalCount: 0, tasks: [] };
    const email = getEmailDailyState ? getEmailDailyState() : { doneToday: false, lastCheckAt: 0 };
    const fertilizerBuy = getFertilizerBuyDailyState ? getFertilizerBuyDailyState() : { doneToday: false, lastSuccessAt: 0, lastDecisionAt: 0, result: '', reason: '', message: '', count: 0, typeCounts: { normal: 0, organic: 0 }, containerHours: { normal: 0, organic: 0 }, targetHours: { normal: 0, organic: 0 }, limit: 0, missingTypes: [] };
    const free = getFreeGiftDailyState ? getFreeGiftDailyState() : { doneToday: false, lastClaimAt: 0 };
    const share = getShareDailyState ? getShareDailyState() : { doneToday: false, lastClaimAt: 0 };
    const vip = getVipDailyState ? getVipDailyState() : { doneToday: false, lastClaimAt: 0 };
    const month = getMonthCardDailyState ? getMonthCardDailyState() : { doneToday: false, lastClaimAt: 0 };
    const openServer = getOpenServerDailyState ? getOpenServerDailyState() : { doneToday: false, lastClaimAt: 0, lastCheckAt: 0 };

    return {
        date: new Date().toISOString().slice(0, 10),
        growth: {
            key: 'growth_task',
            label: '成长任务',
            doneToday: !!growthTask.doneToday,
            completedCount: Number(growthTask.completedCount || 0),
            totalCount: Number(growthTask.totalCount || 0),
            tasks: Array.isArray(growthTask.tasks) ? growthTask.tasks : [],
        },
        gifts: [
            {
                key: 'task_claim',
                label: '任务领奖',
                enabled: !!auto.task,
                doneToday: !!task.doneToday,
                lastAt: Number(task.lastClaimAt || 0),
                completedCount: Number(task.completedCount || 0),
                totalCount: Number(task.totalCount || 3),
            },
            { key: 'email_rewards', label: '邮箱奖励', enabled: !!auto.email, doneToday: !!email.doneToday, lastAt: Number(email.lastCheckAt || 0) },
            {
                key: 'fertilizer_buy',
                label: '自动购肥',
                enabled: !!auto.fertilizer_buy,
                doneToday: !!fertilizerBuy.doneToday,
                lastAt: Number(fertilizerBuy.lastDecisionAt || fertilizerBuy.lastSuccessAt || 0),
                lastSuccessAt: Number(fertilizerBuy.lastSuccessAt || 0),
                result: fertilizerBuy.result || '',
                reason: fertilizerBuy.reason || '',
                message: fertilizerBuy.message || '',
                completedCount: Number(fertilizerBuy.count || 0),
                totalCount: Number(fertilizerBuy.limit || 0),
                containerHours: fertilizerBuy.containerHours || { normal: 0, organic: 0 },
                targetHours: fertilizerBuy.targetHours || { normal: 0, organic: 0 },
                typeCounts: fertilizerBuy.typeCounts || { normal: 0, organic: 0 },
                missingTypes: Array.isArray(fertilizerBuy.missingTypes) ? fertilizerBuy.missingTypes : [],
                pausedNoGoldToday: !!fertilizerBuy.pausedNoGoldToday,
            },
            { key: 'mall_free_gifts', label: '商城免费礼包', enabled: !!auto.free_gifts, doneToday: !!free.doneToday, lastAt: Number(free.lastClaimAt || 0) },
            { key: 'daily_share', label: '分享礼包', enabled: !!auto.share_reward, doneToday: !!share.doneToday, lastAt: Number(share.lastClaimAt || 0) },
            {
                key: 'vip_daily_gift',
                label: '会员礼包',
                enabled: !!auto.vip_gift,
                doneToday: !!vip.doneToday,
                lastAt: Number(vip.lastClaimAt || vip.lastCheckAt || 0),
                hasGift: Object.prototype.hasOwnProperty.call(vip, 'hasGift') ? !!vip.hasGift : undefined,
                canClaim: Object.prototype.hasOwnProperty.call(vip, 'canClaim') ? !!vip.canClaim : undefined,
                result: vip.result || '',
            },
            {
                key: 'month_card_gift',
                label: '月卡礼包',
                enabled: !!auto.month_card,
                doneToday: !!month.doneToday,
                lastAt: Number(month.lastClaimAt || month.lastCheckAt || 0),
                hasCard: Object.prototype.hasOwnProperty.call(month, 'hasCard') ? !!month.hasCard : undefined,
                hasClaimable: Object.prototype.hasOwnProperty.call(month, 'hasClaimable') ? !!month.hasClaimable : undefined,
                result: month.result || '',
            },
            {
                key: 'open_server_gift',
                label: '开服红包',
                enabled: !!auto.open_server_gift,
                doneToday: !!openServer.doneToday,
                lastAt: Number(openServer.lastClaimAt || openServer.lastCheckAt || 0),
                hasClaimable: Object.prototype.hasOwnProperty.call(openServer, 'hasClaimable') ? !!openServer.hasClaimable : undefined,
                result: openServer.result || '',
            },
        ],
    };
}

function syncStatus() {
    if (!process.send && !parentPort) return;

    const userState = getUserState();
    const ws = getWs();
    const connected = !!(loginReady && ws && ws.readyState === 1);

    let expProgress = null;
    const level = (userState.level ?? statusData.level ?? 0);
    const exp = (userState.exp ?? statusData.exp ?? 0);

    if (level > 0 && exp >= 0) {
        expProgress = getLevelExpProgress(level, exp);
    }

    const limits = require('../services/friend').getOperationLimits();
    const fullStats = require('../services/stats').getStats(statusData, userState, connected, limits);
    const breakerSnapshot = (networkCircuitBreaker && typeof networkCircuitBreaker.getSnapshot === 'function')
        ? networkCircuitBreaker.getSnapshot()
        : null;
    const suspendUntil = Number(userState && userState.suspendUntil) || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const breakerRemainSec = breakerSnapshot
        ? Math.max(0, Math.ceil((Number(breakerSnapshot.cooldownRemainingMs) || 0) / 1000))
        : 0;
    const suspendRemainSec = suspendUntil > 0 ? Math.max(0, Math.ceil((suspendUntil - Date.now()) / 1000)) : 0;
    const nowMs = Date.now();
    const friendAutoAcceptRemainSec = Math.max(0, Math.ceil((Number(nextFriendRunAt || 0) - nowMs) / 1000));
    const helpRemainSec = Math.max(0, Math.ceil((Number(nextHelpRunAt || 0) - nowMs) / 1000));
    const stealRemainSec = Math.max(0, Math.ceil((Number(nextStealRunAt || 0) - nowMs) / 1000));
    const friendService = getFriendService();
    const friendDiagnostics = typeof friendService.getFriendFetchDiagnostics === 'function'
        ? friendService.getFriendFetchDiagnostics()
        : null;
    const wechatDiagnostics = friendDiagnostics && typeof friendDiagnostics.wechat === 'object'
        ? friendDiagnostics.wechat
        : {};
    const platform = String(userState && userState.platform || statusData && statusData.platform || CONFIG.platform || '').trim().toLowerCase();
    const isWeChatRiskSensitivePlatform = platform === 'wx_car' || platform === 'wx_ipad';
    const friendCooldownUntil = Math.max(
        0,
        Number(wechatDiagnostics.autoRetryAt || 0),
        Number(wechatDiagnostics.getAllParamErrorUntil || 0),
    );
    const friendCooldownRemainSec = friendCooldownUntil > nowMs
        ? Math.max(0, Math.ceil((friendCooldownUntil - nowMs) / 1000))
        : 0;
    const syncAllUnsupportedUntil = Math.max(0, Number(wechatDiagnostics.syncAllUnsupportedUntil || 0));
    fullStats.nextChecks = {
        farmRemainSec: Math.max(0, Math.ceil((Number(nextFarmRunAt || 0) - nowMs) / 1000)),
        friendRemainSec: Math.min(friendAutoAcceptRemainSec, helpRemainSec, stealRemainSec),
        friendAutoAcceptRemainSec,
        helpRemainSec,
        stealRemainSec,
    };

    fullStats.automation = getAutomation();
    fullStats.preferredSeed = getPreferredSeed();
    fullStats.levelProgress = expProgress;
    fullStats.configRevision = appliedConfigRevision;
    fullStats.protection = {
        nowSec,
        suspended: suspendUntil > Date.now(),
        suspendUntil: suspendUntil > 0 ? suspendUntil : 0,
        suspendRemainSec,
        networkBreaker: {
            state: breakerSnapshot ? String(breakerSnapshot.state || '') : '',
            coolDownMs: breakerSnapshot ? Number(breakerSnapshot.coolDownMs || 0) : 0,
            cooldownRemainingSec: breakerRemainSec,
            failures: breakerSnapshot ? Number(breakerSnapshot.failures || 0) : 0,
            threshold: breakerSnapshot ? Number(breakerSnapshot.threshold || 0) : 0,
        },
        wechat: {
            enabled: platform.startsWith('wx'),
            friendGuardActive: !!(friendCooldownUntil > nowMs),
            friendGuardReason: String(wechatDiagnostics.realtimeUnavailableReason || '').trim(),
            friendCooldownUntil,
            friendCooldownRemainSec,
            syncAllUnsupportedUntil: syncAllUnsupportedUntil > nowMs ? syncAllUnsupportedUntil : 0,
            failureCount: Math.max(0, Number(wechatDiagnostics.failureCount || 0)),
            failureReason: String(wechatDiagnostics.failureReason || '').trim(),
            failureAt: Math.max(0, Number(wechatDiagnostics.failureAt || 0)),
            farmAutomationPaused: !!(isWeChatRiskSensitivePlatform && suspendUntil > nowMs),
        },
    };
    const modePolicy = getAccountModePolicyService().getRuntimeAccountModePolicy();
    fullStats.accountMode = modePolicy.accountMode || 'main';
    fullStats.effectiveMode = modePolicy.effectiveMode || fullStats.accountMode;
    fullStats.modeScope = modePolicy.modeScope || {};
    fullStats.accountZone = modePolicy.accountZone || 'unknown_zone';
    fullStats.collaborationEnabled = !!modePolicy.collaborationEnabled;
    fullStats.degradeReason = modePolicy.degradeReason || '';
    fullStats.degradeReasonLabel = modePolicy.degradeReasonLabel || '';
    const hash = JSON.stringify(fullStats);
    const now = Date.now();
    if (hash !== lastStatusHash || now - lastStatusSentAt > 8000) {
        lastStatusHash = hash;
        lastStatusSentAt = now;
        sendToMaster({ type: 'status_sync', data: fullStats });
    }
}

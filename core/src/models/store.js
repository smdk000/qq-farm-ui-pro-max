const process = require('node:process');
/**
 * 运行时存储 - 自动化开关、种子偏好、账号管理
 */

const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { readTextFile, readJsonFile, writeJsonFileAtomic } = require('../services/json-db');

const STORE_FILE = getDataFile('store.json');
const ACCOUNTS_FILE = getDataFile('accounts.json');
const ALLOWED_PLANTING_STRATEGIES = ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit'];
const PUSHOO_CHANNELS = new Set([
    'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
    'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
    'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
    'discord', 'wxpusher',
]);
const DEFAULT_OFFLINE_REMINDER = {
    channel: 'webhook',
    reloginUrlMode: 'none',
    endpoint: '',
    token: '',
    title: '账号下线提醒',
    msg: '账号下线',
    offlineDeleteSec: 120,
};

// 体验卡配置默认值
const DEFAULT_TRIAL_CARD_CONFIG = {
    enabled: true,            // 体验卡生成总开关
    days: 1,                  // 时长(天): 1/7/30/null(永久)
    dailyLimit: 50,           // 每日全局上限
    cooldownMs: 14400000,     // IP冷却(ms): 默认4小时
    adminRenewEnabled: true,  // 管理员可一键续费
    userRenewEnabled: false,  // 用户可自助续费
    maxAccounts: 1,           // 绑定账号数上限
};
// ============ 全局配置 ============
const DEFAULT_ACCOUNT_CONFIG = {
    automation: {
        farm: true,
        farm_push: true,   // 收到 LandsNotify 推送时是否立即触发巡田
        land_upgrade: true, // 是否自动升级土地
        friend: true,       // 好友互动总开关
        friend_help_exp_limit: true, // 帮忙经验达上限后自动停止帮忙
        friend_steal: true, // 偷菜
        friend_help: true,  // 帮忙
        friend_bad: false,  // 捣乱(放虫草)
        task: true,
        email: true,
        fertilizer_gift: false,
        fertilizer_buy: false,
        free_gifts: true,
        share_reward: true,
        vip_gift: true,
        month_card: true,
        open_server_gift: true,
        sell: true,
        friend_auto_accept: false, // 自动同意好友开关
        fertilizer_60s_anti_steal: false, // 60秒防偷开关
        fertilizer: 'none',
    },
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    intervals: {
        farm: 2,
        friend: 10,
        farmMin: 2,
        farmMax: 2,
        friendMin: 10,
        friendMax: 10,
    },
    friendQuietHours: {
        enabled: false,
        start: '23:00',
        end: '07:00',
    },
    friendBlacklist: [],
    // 偷菜过滤配置
    stealFilter: {
        enabled: false,
        mode: 'blacklist',  // 'blacklist' 或 'whitelist'
        plantIds: [],
    },
    // 偷好友过滤配置
    stealFriendFilter: {
        enabled: false,
        mode: 'blacklist',  // 'blacklist' 或 'whitelist'
        friendIds: [],
    },
};
const ALLOWED_AUTOMATION_KEYS = new Set(Object.keys(DEFAULT_ACCOUNT_CONFIG.automation));

let accountFallbackConfig = {
    ...DEFAULT_ACCOUNT_CONFIG,
    automation: { ...DEFAULT_ACCOUNT_CONFIG.automation },
    intervals: { ...DEFAULT_ACCOUNT_CONFIG.intervals },
    friendQuietHours: { ...DEFAULT_ACCOUNT_CONFIG.friendQuietHours },
};

const globalConfig = {
    accountConfigs: {},
    defaultAccountConfig: cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG),
    ui: {
        theme: 'dark',
        loginBackground: '',
        colorTheme: 'default',
        performanceMode: true,
    },
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER },
    adminPasswordHash: '',
    trialCardConfig: { ...DEFAULT_TRIAL_CARD_CONFIG },
};

function normalizeOfflineReminder(input) {
    const src = (input && typeof input === 'object') ? input : {};
    let offlineDeleteSec = Number.parseInt(src.offlineDeleteSec, 10);
    if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 1) {
        offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec;
    }
    const rawChannel = (src.channel !== undefined && src.channel !== null)
        ? String(src.channel).trim().toLowerCase()
        : '';
    const endpoint = (src.endpoint !== undefined && src.endpoint !== null)
        ? String(src.endpoint).trim()
        : DEFAULT_OFFLINE_REMINDER.endpoint;
    const migratedChannel = rawChannel
        || (PUSHOO_CHANNELS.has(String(endpoint || '').trim().toLowerCase())
            ? String(endpoint || '').trim().toLowerCase()
            : DEFAULT_OFFLINE_REMINDER.channel);
    const channel = PUSHOO_CHANNELS.has(migratedChannel)
        ? migratedChannel
        : DEFAULT_OFFLINE_REMINDER.channel;
    const rawReloginUrlMode = (src.reloginUrlMode !== undefined && src.reloginUrlMode !== null)
        ? String(src.reloginUrlMode).trim().toLowerCase()
        : DEFAULT_OFFLINE_REMINDER.reloginUrlMode;
    const reloginUrlMode = new Set(['none', 'qq_link', 'qr_link']).has(rawReloginUrlMode)
        ? rawReloginUrlMode
        : DEFAULT_OFFLINE_REMINDER.reloginUrlMode;
    const token = (src.token !== undefined && src.token !== null)
        ? String(src.token).trim()
        : DEFAULT_OFFLINE_REMINDER.token;
    const title = (src.title !== undefined && src.title !== null)
        ? String(src.title).trim()
        : DEFAULT_OFFLINE_REMINDER.title;
    const msg = (src.msg !== undefined && src.msg !== null)
        ? String(src.msg).trim()
        : DEFAULT_OFFLINE_REMINDER.msg;
    return {
        channel,
        reloginUrlMode,
        endpoint,
        token,
        title,
        msg,
        offlineDeleteSec,
    };
}

function cloneAccountConfig(base = DEFAULT_ACCOUNT_CONFIG) {
    const srcAutomation = (base && base.automation && typeof base.automation === 'object')
        ? base.automation
        : {};
    const automation = { ...DEFAULT_ACCOUNT_CONFIG.automation };
    for (const key of Object.keys(automation)) {
        if (srcAutomation[key] !== undefined) automation[key] = srcAutomation[key];
    }

    const rawBlacklist = Array.isArray(base.friendBlacklist) ? base.friendBlacklist : [];
    const srcStealFilter = (base.stealFilter && typeof base.stealFilter === 'object')
        ? base.stealFilter
        : DEFAULT_ACCOUNT_CONFIG.stealFilter;
    const srcStealFriendFilter = (base.stealFriendFilter && typeof base.stealFriendFilter === 'object')
        ? base.stealFriendFilter
        : DEFAULT_ACCOUNT_CONFIG.stealFriendFilter;

    return {
        ...base,
        automation,
        intervals: { ...(base.intervals || DEFAULT_ACCOUNT_CONFIG.intervals) },
        friendQuietHours: { ...(base.friendQuietHours || DEFAULT_ACCOUNT_CONFIG.friendQuietHours) },
        friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
        stealFilter: {
            enabled: !!srcStealFilter.enabled,
            mode: srcStealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(srcStealFilter.plantIds)
                ? srcStealFilter.plantIds.map(String)
                : [],
        },
        stealFriendFilter: {
            enabled: !!srcStealFriendFilter.enabled,
            mode: srcStealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(srcStealFriendFilter.friendIds)
                ? srcStealFriendFilter.friendIds.map(String)
                : [],
        },
        plantingStrategy: ALLOWED_PLANTING_STRATEGIES.includes(String(base.plantingStrategy || ''))
            ? String(base.plantingStrategy)
            : DEFAULT_ACCOUNT_CONFIG.plantingStrategy,
        preferredSeedId: Math.max(0, Number.parseInt(base.preferredSeedId, 10) || 0),
    };
}

function resolveAccountId(accountId) {
    const direct = (accountId !== undefined && accountId !== null) ? String(accountId).trim() : '';
    if (direct) return direct;
    const envId = String(process.env.FARM_ACCOUNT_ID || '').trim();
    return envId;
}

function normalizeAccountConfig(input, fallback = accountFallbackConfig) {
    const src = (input && typeof input === 'object') ? input : {};
    const cfg = cloneAccountConfig(fallback || DEFAULT_ACCOUNT_CONFIG);

    if (src.automation && typeof src.automation === 'object') {
        for (const [k, v] of Object.entries(src.automation)) {
            if (!ALLOWED_AUTOMATION_KEYS.has(k)) continue;
            if (k === 'fertilizer') {
                const allowed = ['both', 'normal', 'organic', 'none'];
                cfg.automation[k] = allowed.includes(v) ? v : cfg.automation[k];
            } else {
                cfg.automation[k] = !!v;
            }
        }
    }

    if (src.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(src.plantingStrategy)) {
        cfg.plantingStrategy = src.plantingStrategy;
    }

    if (src.preferredSeedId !== undefined && src.preferredSeedId !== null) {
        cfg.preferredSeedId = Math.max(0, Number.parseInt(src.preferredSeedId, 10) || 0);
    }

    if (src.intervals && typeof src.intervals === 'object') {
        for (const [type, sec] of Object.entries(src.intervals)) {
            if (cfg.intervals[type] === undefined) continue;
            cfg.intervals[type] = Math.max(1, Number.parseInt(sec, 10) || cfg.intervals[type] || 1);
        }
        cfg.intervals = normalizeIntervals(cfg.intervals);
    } else {
        cfg.intervals = normalizeIntervals(cfg.intervals);
    }

    if (src.friendQuietHours && typeof src.friendQuietHours === 'object') {
        const old = cfg.friendQuietHours || {};
        cfg.friendQuietHours = {
            enabled: src.friendQuietHours.enabled !== undefined ? !!src.friendQuietHours.enabled : !!old.enabled,
            start: normalizeTimeString(src.friendQuietHours.start, old.start || '23:00'),
            end: normalizeTimeString(src.friendQuietHours.end, old.end || '07:00'),
        };
    }

    if (Array.isArray(src.friendBlacklist)) {
        cfg.friendBlacklist = src.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    if (src.stealFilter && typeof src.stealFilter === 'object') {
        cfg.stealFilter = {
            enabled: src.stealFilter.enabled !== undefined ? !!src.stealFilter.enabled : !!cfg.stealFilter.enabled,
            mode: src.stealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(src.stealFilter.plantIds)
                ? src.stealFilter.plantIds.map(String)
                : cfg.stealFilter.plantIds,
        };
    }

    if (src.stealFriendFilter && typeof src.stealFriendFilter === 'object') {
        cfg.stealFriendFilter = {
            enabled: src.stealFriendFilter.enabled !== undefined ? !!src.stealFriendFilter.enabled : !!cfg.stealFriendFilter.enabled,
            mode: src.stealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(src.stealFriendFilter.friendIds)
                ? src.stealFriendFilter.friendIds.map(String)
                : cfg.stealFriendFilter.friendIds,
        };
    }

    return cfg;
}

function getAccountConfigSnapshot(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return cloneAccountConfig(accountFallbackConfig);
    return normalizeAccountConfig(globalConfig.accountConfigs[id], accountFallbackConfig);
}

function setAccountConfigSnapshot(accountId, nextConfig, persist = true) {
    const id = resolveAccountId(accountId);
    if (!id) {
        accountFallbackConfig = normalizeAccountConfig(nextConfig, accountFallbackConfig);
        globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
        if (persist) saveGlobalConfig();
        return cloneAccountConfig(accountFallbackConfig);
    }
    globalConfig.accountConfigs[id] = normalizeAccountConfig(nextConfig, accountFallbackConfig);
    if (persist) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

function removeAccountConfig(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return;
    if (globalConfig.accountConfigs[id]) {
        delete globalConfig.accountConfigs[id];
        saveGlobalConfig();
    }
}

/**
 * 确保指定账号已有配置，若无则自动创建默认配置并持久化
 * 新账号默认不施肥（fertilizer = 'none'），不受历史 defaultAccountConfig 旧值影响
 */
function ensureAccountConfig(accountId, options = {}) {
    const id = resolveAccountId(accountId);
    if (!id) return null;
    if (globalConfig.accountConfigs[id]) {
        return cloneAccountConfig(globalConfig.accountConfigs[id]);
    }
    globalConfig.accountConfigs[id] = normalizeAccountConfig(globalConfig.defaultAccountConfig, accountFallbackConfig);
    // 新账号默认不施肥（不受历史 defaultAccountConfig 旧值影响）
    if (globalConfig.accountConfigs[id] && globalConfig.accountConfigs[id].automation) {
        globalConfig.accountConfigs[id].automation.fertilizer = 'none';
    }
    if (options.persist !== false) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

// 加载全局配置
function loadGlobalConfig() {
    ensureDataDir();
    try {
        const data = readJsonFile(STORE_FILE, () => ({}));
        if (data && typeof data === 'object') {
            if (data.defaultAccountConfig && typeof data.defaultAccountConfig === 'object') {
                accountFallbackConfig = normalizeAccountConfig(data.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
            } else {
                accountFallbackConfig = cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG);
            }
            globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);

            const cfgMap = (data.accountConfigs && typeof data.accountConfigs === 'object')
                ? data.accountConfigs
                : {};
            globalConfig.accountConfigs = {};
            for (const [id, cfg] of Object.entries(cfgMap)) {
                const sid = String(id || '').trim();
                if (!sid) continue;
                globalConfig.accountConfigs[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
            }
            // 统一规范化，确保内存中不残留旧字段（如 automation.friend）
            globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
            for (const [id, cfg] of Object.entries(globalConfig.accountConfigs)) {
                globalConfig.accountConfigs[id] = normalizeAccountConfig(cfg, accountFallbackConfig);
            }
            globalConfig.ui = { ...globalConfig.ui, ...(data.ui || {}) };
            const theme = String(globalConfig.ui.theme || '').toLowerCase();
            globalConfig.ui.theme = new Set(['light', 'dark', 'auto']).has(theme) ? theme : 'dark';
            if (globalConfig.ui.colorTheme === undefined) {
                globalConfig.ui.colorTheme = 'default';
            }
            if (globalConfig.ui.performanceMode === undefined) {
                globalConfig.ui.performanceMode = true;
            }
            globalConfig.offlineReminder = normalizeOfflineReminder(data.offlineReminder);
            if (typeof data.adminPasswordHash === 'string') {
                globalConfig.adminPasswordHash = data.adminPasswordHash;
            }
            // 加载体验卡配置
            globalConfig.trialCardConfig = normalizeTrialCardConfig(data.trialCardConfig);
        }
    } catch (e) {
        console.error('加载配置失败:', e.message);
    }
}

function sanitizeGlobalConfigBeforeSave() {
    // default 配置统一白名单净化
    accountFallbackConfig = normalizeAccountConfig(globalConfig.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
    globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);

    // 每个账号配置也统一净化
    const map = (globalConfig.accountConfigs && typeof globalConfig.accountConfigs === 'object')
        ? globalConfig.accountConfigs
        : {};
    const nextMap = {};
    for (const [id, cfg] of Object.entries(map)) {
        const sid = String(id || '').trim();
        if (!sid) continue;
        nextMap[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
    }
    globalConfig.accountConfigs = nextMap;

    // 净化体验卡配置
    globalConfig.trialCardConfig = normalizeTrialCardConfig(globalConfig.trialCardConfig);
}

let saveTimeout = null;

function flushPendingSave() {
    if (saveTimeout !== null) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        saveGlobalConfigImmediate();
    }
}

// 绑定进程退出时的清理，防止丢失最后两秒的配置
process.on('exit', flushPendingSave);

// 防抖包装的保存，避免并发引发频繁阻塞写盘
function saveGlobalConfig() {
    if (saveTimeout !== null) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
        saveGlobalConfigImmediate();
        saveTimeout = null;
    }, 2000);
}

// 立即保存全局配置 (原逻辑)
function saveGlobalConfigImmediate() {
    ensureDataDir();
    try {
        const oldJson = readTextFile(STORE_FILE, '');

        sanitizeGlobalConfigBeforeSave();
        const newJson = JSON.stringify(globalConfig, null, 2);

        if (oldJson !== newJson) {
            console.warn('[系统] 正在保存配置到:', STORE_FILE);
            writeJsonFileAtomic(STORE_FILE, globalConfig);
        }
    } catch (e) {
        console.error('保存配置失败:', e.message);
    }
}

function getAdminPasswordHash() {
    return String(globalConfig.adminPasswordHash || '');
}

function setAdminPasswordHash(hash) {
    globalConfig.adminPasswordHash = String(hash || '');
    saveGlobalConfig();
    return globalConfig.adminPasswordHash;
}

// 初始化加载
loadGlobalConfig();

function getAutomation(accountId) {
    return { ...getAccountConfigSnapshot(accountId).automation };
}

function getConfigSnapshot(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        automation: { ...cfg.automation },
        plantingStrategy: cfg.plantingStrategy,
        preferredSeedId: cfg.preferredSeedId,
        intervals: { ...cfg.intervals },
        friendQuietHours: { ...cfg.friendQuietHours },
        friendBlacklist: [...(cfg.friendBlacklist || [])],
        stealFilter: { ...cfg.stealFilter, plantIds: [...(cfg.stealFilter?.plantIds || [])] },
        stealFriendFilter: { ...cfg.stealFriendFilter, friendIds: [...(cfg.stealFriendFilter?.friendIds || [])] },
        ui: { ...globalConfig.ui },
    };
}

function applyConfigSnapshot(snapshot, options = {}) {
    const cfg = snapshot || {};
    const persist = options.persist !== false;
    const accountId = options.accountId;

    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);

    if (cfg.automation && typeof cfg.automation === 'object') {
        for (const [k, v] of Object.entries(cfg.automation)) {
            if (next.automation[k] === undefined) continue;
            if (k === 'fertilizer') {
                const allowed = ['both', 'normal', 'organic', 'none'];
                next.automation[k] = allowed.includes(v) ? v : next.automation[k];
            } else {
                next.automation[k] = !!v;
            }
        }
    }

    if (cfg.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(cfg.plantingStrategy)) {
        next.plantingStrategy = cfg.plantingStrategy;
    }

    if (cfg.preferredSeedId !== undefined && cfg.preferredSeedId !== null) {
        next.preferredSeedId = Math.max(0, Number.parseInt(cfg.preferredSeedId, 10) || 0);
    }

    if (cfg.intervals && typeof cfg.intervals === 'object') {
        for (const [type, sec] of Object.entries(cfg.intervals)) {
            if (next.intervals[type] === undefined) continue;
            next.intervals[type] = Math.max(1, Number.parseInt(sec, 10) || next.intervals[type] || 1);
        }
        next.intervals = normalizeIntervals(next.intervals);
    }

    if (cfg.friendQuietHours && typeof cfg.friendQuietHours === 'object') {
        const old = next.friendQuietHours || {};
        next.friendQuietHours = {
            enabled: cfg.friendQuietHours.enabled !== undefined ? !!cfg.friendQuietHours.enabled : !!old.enabled,
            start: normalizeTimeString(cfg.friendQuietHours.start, old.start || '23:00'),
            end: normalizeTimeString(cfg.friendQuietHours.end, old.end || '07:00'),
        };
    }

    if (Array.isArray(cfg.friendBlacklist)) {
        next.friendBlacklist = cfg.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    if (cfg.stealFilter && typeof cfg.stealFilter === 'object') {
        next.stealFilter = {
            enabled: cfg.stealFilter.enabled !== undefined ? !!cfg.stealFilter.enabled : next.stealFilter.enabled,
            mode: cfg.stealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(cfg.stealFilter.plantIds)
                ? cfg.stealFilter.plantIds.map(String)
                : next.stealFilter.plantIds,
        };
    }

    if (cfg.stealFriendFilter && typeof cfg.stealFriendFilter === 'object') {
        next.stealFriendFilter = {
            enabled: cfg.stealFriendFilter.enabled !== undefined ? !!cfg.stealFriendFilter.enabled : next.stealFriendFilter.enabled,
            mode: cfg.stealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(cfg.stealFriendFilter.friendIds)
                ? cfg.stealFriendFilter.friendIds.map(String)
                : next.stealFriendFilter.friendIds,
        };
    }

    if (cfg.ui && typeof cfg.ui === 'object') {
        const theme = String(cfg.ui.theme || '').toLowerCase();
        if (new Set(['dark', 'light', 'auto']).has(theme)) {
            globalConfig.ui.theme = theme;
        }
        if (cfg.ui.loginBackground !== undefined) {
            globalConfig.ui.loginBackground = String(cfg.ui.loginBackground || '').trim();
        }
        if (cfg.ui.colorTheme !== undefined) {
            globalConfig.ui.colorTheme = String(cfg.ui.colorTheme || '').trim();
        }
        if (cfg.ui.performanceMode !== undefined) {
            globalConfig.ui.performanceMode = !!cfg.ui.performanceMode;
        }
    }

    setAccountConfigSnapshot(accountId, next, false);
    if (persist) saveGlobalConfig();
    return getConfigSnapshot(accountId);
}

function setAutomation(key, value, accountId) {
    return applyConfigSnapshot({ automation: { [key]: value } }, { accountId });
}

function isAutomationOn(key, accountId) {
    return !!getAccountConfigSnapshot(accountId).automation[key];
}

function getPreferredSeed(accountId) {
    return getAccountConfigSnapshot(accountId).preferredSeedId;
}

function getPlantingStrategy(accountId) {
    return getAccountConfigSnapshot(accountId).plantingStrategy;
}

function getIntervals(accountId) {
    return { ...getAccountConfigSnapshot(accountId).intervals };
}

function normalizeIntervals(intervals) {
    const src = (intervals && typeof intervals === 'object') ? intervals : {};
    const toSec = (v, d) => Math.max(1, Number.parseInt(v, 10) || d);
    const farm = toSec(src.farm, 2);
    const friend = toSec(src.friend, 10);

    let farmMin = toSec(src.farmMin, farm);
    let farmMax = toSec(src.farmMax, farm);
    if (farmMin > farmMax) [farmMin, farmMax] = [farmMax, farmMin];

    let friendMin = toSec(src.friendMin, friend);
    let friendMax = toSec(src.friendMax, friend);
    if (friendMin > friendMax) [friendMin, friendMax] = [friendMax, friendMin];

    return {
        ...src,
        farm,
        friend,
        farmMin,
        farmMax,
        friendMin,
        friendMax,
    };
}

function normalizeTimeString(v, fallback) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return fallback;
    const hh = Math.max(0, Math.min(23, Number.parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, Number.parseInt(m[2], 10)));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function getFriendQuietHours(accountId) {
    return { ...getAccountConfigSnapshot(accountId).friendQuietHours };
}

function getFriendBlacklist(accountId) {
    return [...(getAccountConfigSnapshot(accountId).friendBlacklist || [])];
}

function setFriendBlacklist(accountId, list) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.friendBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
    setAccountConfigSnapshot(accountId, next);
    return [...next.friendBlacklist];
}

// ============ 偷菜过滤配置 ============

function getStealFilterConfig(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        enabled: !!cfg.stealFilter?.enabled,
        mode: cfg.stealFilter?.mode || 'blacklist',
        plantIds: [...(cfg.stealFilter?.plantIds || [])],
    };
}

function setStealFilterConfig(accountId, config) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);

    if (config && typeof config === 'object') {
        next.stealFilter = {
            enabled: config.enabled !== undefined ? !!config.enabled : next.stealFilter.enabled,
            mode: config.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(config.plantIds)
                ? config.plantIds.map(String)
                : next.stealFilter.plantIds,
        };
    }

    setAccountConfigSnapshot(accountId, next);
    return getStealFilterConfig(accountId);
}

function getStealFriendFilterConfig(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        enabled: !!cfg.stealFriendFilter?.enabled,
        mode: cfg.stealFriendFilter?.mode || 'blacklist',
        friendIds: [...(cfg.stealFriendFilter?.friendIds || [])],
    };
}

function setStealFriendFilterConfig(accountId, config) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);

    if (config && typeof config === 'object') {
        next.stealFriendFilter = {
            enabled: config.enabled !== undefined ? !!config.enabled : next.stealFriendFilter.enabled,
            mode: config.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(config.friendIds)
                ? config.friendIds.map(String)
                : next.stealFriendFilter.friendIds,
        };
    }

    setAccountConfigSnapshot(accountId, next);
    return getStealFriendFilterConfig(accountId);
}

function getUI() {
    return { ...globalConfig.ui };
}

function setUITheme(theme) {
    const t = String(theme || '').toLowerCase();
    const allowed = new Set(['light', 'dark', 'auto']);
    const next = allowed.has(t) ? t : 'dark';
    return applyConfigSnapshot({ ui: { theme: next } });
}

function getOfflineReminder() {
    return normalizeOfflineReminder(globalConfig.offlineReminder);
}

function setOfflineReminder(cfg) {
    const current = normalizeOfflineReminder(globalConfig.offlineReminder);
    globalConfig.offlineReminder = normalizeOfflineReminder({ ...current, ...(cfg || {}) });
    saveGlobalConfig();
    return getOfflineReminder();
}

// ============ 体验卡配置 ============

/**
 * 规范化体验卡配置对象
 * @param {object} input - 输入配置
 * @returns {object} 规范化后的配置
 */
function normalizeTrialCardConfig(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const allowedDays = [1, 7, 30, null];
    let days = src.days;
    if (days !== null && !allowedDays.includes(days)) {
        days = DEFAULT_TRIAL_CARD_CONFIG.days;
    }
    let dailyLimit = parseInt(src.dailyLimit, 10);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 1) dailyLimit = DEFAULT_TRIAL_CARD_CONFIG.dailyLimit;
    let cooldownMs = parseInt(src.cooldownMs, 10);
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) cooldownMs = DEFAULT_TRIAL_CARD_CONFIG.cooldownMs;
    let maxAccounts = parseInt(src.maxAccounts, 10);
    if (!Number.isFinite(maxAccounts) || maxAccounts < 1) maxAccounts = DEFAULT_TRIAL_CARD_CONFIG.maxAccounts;

    return {
        enabled: src.enabled !== undefined ? !!src.enabled : DEFAULT_TRIAL_CARD_CONFIG.enabled,
        days,
        dailyLimit: Math.min(dailyLimit, 999),
        cooldownMs,
        adminRenewEnabled: src.adminRenewEnabled !== undefined ? !!src.adminRenewEnabled : DEFAULT_TRIAL_CARD_CONFIG.adminRenewEnabled,
        userRenewEnabled: src.userRenewEnabled !== undefined ? !!src.userRenewEnabled : DEFAULT_TRIAL_CARD_CONFIG.userRenewEnabled,
        maxAccounts: Math.min(maxAccounts, 10),
    };
}

function getTrialCardConfig() {
    return normalizeTrialCardConfig(globalConfig.trialCardConfig);
}

function setTrialCardConfig(cfg) {
    const current = normalizeTrialCardConfig(globalConfig.trialCardConfig);
    globalConfig.trialCardConfig = normalizeTrialCardConfig({ ...current, ...(cfg || {}) });
    saveGlobalConfig();
    return getTrialCardConfig();
}

// ============ 账号管理 ============
function loadAccounts() {
    ensureDataDir();
    const data = readJsonFile(ACCOUNTS_FILE, () => ({ accounts: [], nextId: 1 }));
    return normalizeAccountsData(data);
}

function saveAccounts(data) {
    ensureDataDir();
    writeJsonFileAtomic(ACCOUNTS_FILE, normalizeAccountsData(data));
}

function getAccounts() {
    return loadAccounts();
}

function normalizeAccountsData(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const maxId = accounts.reduce((m, a) => Math.max(m, Number.parseInt(a && a.id, 10) || 0), 0);
    let nextId = Number.parseInt(data.nextId, 10);
    if (!Number.isFinite(nextId) || nextId <= 0) nextId = maxId + 1;
    if (accounts.length === 0) nextId = 1;
    if (nextId <= maxId) nextId = maxId + 1;
    return { accounts, nextId };
}

function addOrUpdateAccount(acc) {
    const data = normalizeAccountsData(loadAccounts());
    let touchedAccountId = '';
    if (acc.id) {
        const idx = data.accounts.findIndex(a => a.id === acc.id);
        if (idx >= 0) {
            touchedAccountId = String(data.accounts[idx].id || '');
            data.accounts[idx] = { ...data.accounts[idx], ...acc, name: acc.name !== undefined ? acc.name : data.accounts[idx].name, updatedAt: Date.now() };
        }
    } else {
        const id = data.nextId++;
        touchedAccountId = String(id);
        data.accounts.push({
            id: String(id),
            name: acc.name || `账号${id}`,
            code: acc.code || '',
            platform: acc.platform || 'qq',
            uin: acc.uin ? String(acc.uin) : '',
            qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
            avatar: acc.avatar || acc.avatarUrl || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId, { persist: false });
    }
    saveAccounts(data);
    // 配置变更（ensureAccountConfig 可能创建新配置）也需要持久化
    saveGlobalConfig();
    return data;
}

function deleteAccount(id, options = {}) {
    const data = normalizeAccountsData(loadAccounts());
    data.accounts = data.accounts.filter(a => a.id !== String(id));
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);

    // 如果没有指定保留配置，则连同在 globalConfig 里的设置一起删掉
    if (!options.retainConfig) {
        removeAccountConfig(id);
    }

    return data;
}

module.exports = {
    getConfigSnapshot,
    applyConfigSnapshot,
    getAutomation,
    setAutomation,
    isAutomationOn,
    getPreferredSeed,
    getPlantingStrategy,
    getIntervals,
    getFriendQuietHours,
    getFriendBlacklist,
    setFriendBlacklist,
    getStealFilterConfig,
    setStealFilterConfig,
    getStealFriendFilterConfig,
    setStealFriendFilterConfig,
    getUI,
    setUITheme,
    getOfflineReminder,
    setOfflineReminder,
    getAccounts,
    addOrUpdateAccount,
    deleteAccount,
    getAdminPasswordHash,
    setAdminPasswordHash,
    ensureAccountConfig,
    getTrialCardConfig,
    setTrialCardConfig,
};

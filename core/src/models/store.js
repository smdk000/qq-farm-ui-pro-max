const process = require('node:process');
/**
 * 运行时存储 - 自动化开关、种子偏好、账号管理
 */

const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { getPool, transaction } = require('../services/mysql-db');
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
const INTERVAL_MAX_SEC = 86400;
const DEFAULT_OFFLINE_REMINDER = {
    channel: 'webhook',
    reloginUrlMode: 'none',
    endpoint: '',
    token: '',
    title: '账号下线提醒',
    msg: '账号下线',
    offlineDeleteSec: 0,
};
// ============ 全局配置 ============
const DEFAULT_ACCOUNT_CONFIG = {
    automation: {
        farm: true,
        farm_manage: true, // 农场打理总开关（浇水/除草/除虫）
        farm_water: true, // 自动浇水
        farm_weed: true, // 自动除草
        farm_bug: true, // 自动除虫
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
        fertilizer: 'none',
    },
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    intervals: {
        farm: 30,
        friend: 60,
        farmMin: 30,
        farmMax: 120,
        friendMin: 60,
        friendMax: 180,
    },
    friendQuietHours: {
        enabled: false,
        start: '23:00',
        end: '07:00',
    },
    friendBlacklist: [],
    stealFilter: { enabled: false, mode: 'blacklist', plantIds: [] },
    stealFriendFilter: { enabled: false, mode: 'blacklist', friendIds: [] },
    stakeoutSteal: { enabled: false, delaySec: 3 },
    skipStealRadish: { enabled: false },
    forceGetAll: { enabled: false },
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
    },
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER },
    adminPasswordHash: '',
    thirdPartyApi: {},
    timingConfig: {},
    clusterConfig: {
        dispatcherStrategy: 'round_robin', // 'round_robin' or 'least_load'
    },
    suspendUntilMap: {},
};

function normalizeOfflineReminder(input) {
    const src = (input && typeof input === 'object') ? input : {};
    let offlineDeleteSec = Number.parseInt(src.offlineDeleteSec, 10);
    if (!Number.isFinite(offlineDeleteSec)) {
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
    const reloginUrlMode = new Set(['none', 'qq_link', 'qr_code', 'all']).has(rawReloginUrlMode)
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
    const stealFilter = (base.stealFilter && typeof base.stealFilter === 'object')
        ? { enabled: !!base.stealFilter.enabled, mode: base.stealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist', plantIds: Array.isArray(base.stealFilter.plantIds) ? base.stealFilter.plantIds.map(String) : [] }
        : DEFAULT_ACCOUNT_CONFIG.stealFilter;
    const stealFriendFilter = (base.stealFriendFilter && typeof base.stealFriendFilter === 'object')
        ? { enabled: !!base.stealFriendFilter.enabled, mode: base.stealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist', friendIds: Array.isArray(base.stealFriendFilter.friendIds) ? base.stealFriendFilter.friendIds.map(String) : [] }
        : DEFAULT_ACCOUNT_CONFIG.stealFriendFilter;
    const stakeoutSteal = (base.stakeoutSteal && typeof base.stakeoutSteal === 'object')
        ? { enabled: !!base.stakeoutSteal.enabled, delaySec: Math.max(1, Number.parseInt(base.stakeoutSteal.delaySec, 10) || 3) }
        : DEFAULT_ACCOUNT_CONFIG.stakeoutSteal;
    const skipStealRadish = (base.skipStealRadish && typeof base.skipStealRadish === 'object')
        ? { enabled: !!base.skipStealRadish.enabled }
        : DEFAULT_ACCOUNT_CONFIG.skipStealRadish;
    const forceGetAll = (base.forceGetAll && typeof base.forceGetAll === 'object')
        ? { enabled: !!base.forceGetAll.enabled }
        : DEFAULT_ACCOUNT_CONFIG.forceGetAll;
    return {
        ...base,
        automation,
        intervals: { ...(base.intervals || DEFAULT_ACCOUNT_CONFIG.intervals) },
        friendQuietHours: { ...(base.friendQuietHours || DEFAULT_ACCOUNT_CONFIG.friendQuietHours) },
        friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
        plantingStrategy: ALLOWED_PLANTING_STRATEGIES.includes(String(base.plantingStrategy || ''))
            ? String(base.plantingStrategy)
            : DEFAULT_ACCOUNT_CONFIG.plantingStrategy,
        preferredSeedId: Math.max(0, Number.parseInt(base.preferredSeedId, 10) || 0),
        stealFilter,
        stealFriendFilter,
        stakeoutSteal,
        skipStealRadish,
        forceGetAll,
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
            enabled: !!src.stealFilter.enabled,
            mode: src.stealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(src.stealFilter.plantIds) ? src.stealFilter.plantIds.map(String) : (cfg.stealFilter?.plantIds || []),
        };
    }
    if (src.stealFriendFilter && typeof src.stealFriendFilter === 'object') {
        cfg.stealFriendFilter = {
            enabled: !!src.stealFriendFilter.enabled,
            mode: src.stealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(src.stealFriendFilter.friendIds) ? src.stealFriendFilter.friendIds.map(String) : (cfg.stealFriendFilter?.friendIds || []),
        };
    }
    if (src.stakeoutSteal && typeof src.stakeoutSteal === 'object') {
        cfg.stakeoutSteal = {
            enabled: !!src.stakeoutSteal.enabled,
            delaySec: Math.max(1, Number.parseInt(src.stakeoutSteal.delaySec, 10) || 3),
        };
    }
    if (src.skipStealRadish && typeof src.skipStealRadish === 'object') {
        cfg.skipStealRadish = { enabled: !!src.skipStealRadish.enabled };
    }
    if (src.forceGetAll && typeof src.forceGetAll === 'object') {
        cfg.forceGetAll = { enabled: !!src.forceGetAll.enabled };
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
async function loadGlobalConfigFromDB() {
    try {
        const pool = getPool();
        if (!pool) return;
        const [rows] = await pool.query('SELECT * FROM account_configs');
        accountFallbackConfig = cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG);
        globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
        globalConfig.accountConfigs = {};

        for (const r of rows) {
            let automation = {};
            if (r.automation_farm === 1) automation.farm = true;
            if (r.automation_farm_push === 1) automation.farm_push = true;
            if (r.automation_land_upgrade === 1) automation.land_upgrade = true;
            if (r.automation_friend === 1) automation.friend = true;
            if (r.automation_friend_steal === 1) automation.friend_steal = true;
            if (r.automation_friend_help === 1) automation.friend_help = true;
            if (r.automation_task === 1) automation.task = true;
            if (r.automation_email === 1) automation.email = true;

            let adv = {};
            if (r.advanced_settings) {
                try { adv = JSON.parse(r.advanced_settings); } catch (err) { }
            }

            globalConfig.accountConfigs[r.account_id] = normalizeAccountConfig({
                automation,
                plantingStrategy: r.planting_strategy,
                preferredSeedId: r.preferred_seed_id,
                intervals: adv.intervals || {},
                friendQuietHours: adv.friendQuietHours || {},
                friendBlacklist: adv.friendBlacklist || [],
                stealFilter: adv.stealFilter,
                stealFriendFilter: adv.stealFriendFilter,
                stakeoutSteal: adv.stakeoutSteal,
                skipStealRadish: adv.skipStealRadish,
                forceGetAll: adv.forceGetAll,
            }, accountFallbackConfig);

            if (adv.ui) {
                globalConfig.ui = { ...globalConfig.ui, ...adv.ui };
            }

            // Cluster Config (Optional backwards compat from adv)
            if (adv.clusterConfig) {
                globalConfig.clusterConfig = { ...globalConfig.clusterConfig, ...adv.clusterConfig };
            }
        }

    } catch (e) {
        console.error('加载全局配置失败:', e.message);
    }
}
function loadGlobalConfig() { }

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
}

// 保存全局配置 (加入 3000ms 防抖，避免狂刷数据库事务阻塞连接池)
let _globalConfigSaveTimer = null;
function saveGlobalConfigImmediate() {
    sanitizeGlobalConfigBeforeSave();
    const pool = getPool();
    if (!pool) return;
    try {
        transaction(async (conn) => {
            for (const [id, cfg] of Object.entries(globalConfig.accountConfigs)) {
                const advSetting = JSON.stringify({
                    intervals: cfg.intervals || {},
                    friendQuietHours: cfg.friendQuietHours || {},
                    friendBlacklist: cfg.friendBlacklist || [],
                    stealFilter: cfg.stealFilter || { enabled: false, mode: 'blacklist', plantIds: [] },
                    stealFriendFilter: cfg.stealFriendFilter || { enabled: false, mode: 'blacklist', friendIds: [] },
                    stakeoutSteal: cfg.stakeoutSteal || { enabled: false, delaySec: 3 },
                    skipStealRadish: cfg.skipStealRadish || { enabled: false },
                    forceGetAll: cfg.forceGetAll || { enabled: false },
                    ui: globalConfig.ui || {},
                    clusterConfig: globalConfig.clusterConfig || { dispatcherStrategy: 'round_robin' }
                });
                const automationKeys = cfg.automation || {};
                await conn.query(`
                    INSERT INTO account_configs (account_id, planting_strategy, preferred_seed_id, 
                    automation_farm, automation_farm_push, automation_land_upgrade,
                    automation_friend, automation_friend_steal, automation_friend_help,
                    automation_friend_bad, automation_task, automation_email,
                    automation_free_gifts, automation_share_reward, automation_vip_gift,
                    automation_month_card, automation_sell, automation_fertilizer,
                    advanced_settings) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    planting_strategy=VALUES(planting_strategy), preferred_seed_id=VALUES(preferred_seed_id),
                    automation_farm=VALUES(automation_farm), automation_farm_push=VALUES(automation_farm_push), automation_land_upgrade=VALUES(automation_land_upgrade),
                    automation_friend=VALUES(automation_friend), automation_friend_steal=VALUES(automation_friend_steal), automation_friend_help=VALUES(automation_friend_help),
                    automation_friend_bad=VALUES(automation_friend_bad), automation_task=VALUES(automation_task), automation_email=VALUES(automation_email),
                    automation_free_gifts=VALUES(automation_free_gifts), automation_share_reward=VALUES(automation_share_reward), automation_vip_gift=VALUES(automation_vip_gift),
                    automation_month_card=VALUES(automation_month_card), automation_sell=VALUES(automation_sell), automation_fertilizer=VALUES(automation_fertilizer),
                    advanced_settings=VALUES(advanced_settings)
                `, [
                    id, cfg.plantingStrategy || 'preferred', cfg.preferredSeedId || 0,
                    automationKeys.farm === false ? 0 : 1, automationKeys.farm_push === false ? 0 : 1, automationKeys.land_upgrade === false ? 0 : 1,
                    automationKeys.friend === false ? 0 : 1, automationKeys.friend_steal === false ? 0 : 1, automationKeys.friend_help === false ? 0 : 1,
                    automationKeys.friend_bad === true ? 1 : 0, automationKeys.task === false ? 0 : 1, automationKeys.email === false ? 0 : 1,
                    automationKeys.free_gifts === false ? 0 : 1, automationKeys.share_reward === false ? 0 : 1, automationKeys.vip_gift === false ? 0 : 1,
                    automationKeys.month_card === false ? 0 : 1, automationKeys.sell === false ? 0 : 1, automationKeys.fertilizer || 'none',
                    advSetting
                ]);
            }
        }).catch(err => console.error("Update Global Config DB Error: ", err.message));
    } catch (e) { console.error('保存全局配置失败:', e.message); }
}

function saveGlobalConfig() {
    if (_globalConfigSaveTimer) clearTimeout(_globalConfigSaveTimer);
    _globalConfigSaveTimer = setTimeout(() => {
        _globalConfigSaveTimer = null;
        saveGlobalConfigImmediate();
    }, 3000);
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

    if (cfg.ui && typeof cfg.ui === 'object') {
        const theme = String(cfg.ui.theme || '').toLowerCase();
        if (theme === 'dark' || theme === 'light') {
            globalConfig.ui.theme = theme;
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
    const toSec = (v, d) => {
        const n = Number.parseInt(v, 10);
        const base = Number.isFinite(n) ? n : d;
        return Math.max(1, Math.min(INTERVAL_MAX_SEC, base));
    };
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

function getStealFilterConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).stealFilter || { enabled: false, mode: 'blacklist', plantIds: [] }) };
}

function setStealFilterConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.stealFilter = {
        enabled: !!cfg.enabled,
        mode: cfg.mode === 'whitelist' ? 'whitelist' : 'blacklist',
        plantIds: Array.isArray(cfg.plantIds) ? cfg.plantIds.map(String) : [],
    };
    setAccountConfigSnapshot(accountId, next);
    return getStealFilterConfig(accountId);
}

function getStealFriendFilterConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).stealFriendFilter || { enabled: false, mode: 'blacklist', friendIds: [] }) };
}

function setStealFriendFilterConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.stealFriendFilter = {
        enabled: !!cfg.enabled,
        mode: cfg.mode === 'whitelist' ? 'whitelist' : 'blacklist',
        friendIds: Array.isArray(cfg.friendIds) ? cfg.friendIds.map(String) : [],
    };
    setAccountConfigSnapshot(accountId, next);
    return getStealFriendFilterConfig(accountId);
}

function getStakeoutStealConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).stakeoutSteal || { enabled: false, delaySec: 3 }) };
}

function setStakeoutStealConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.stakeoutSteal = {
        enabled: !!cfg.enabled,
        delaySec: Math.max(1, Math.min(300, Number.parseInt(cfg.delaySec, 10) || 3)),
    };
    setAccountConfigSnapshot(accountId, next);
    return getStakeoutStealConfig(accountId);
}

function getSkipStealRadishConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).skipStealRadish || { enabled: false }) };
}

function setSkipStealRadishConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.skipStealRadish = { enabled: !!(cfg && cfg.enabled) };
    setAccountConfigSnapshot(accountId, next);
    return getSkipStealRadishConfig(accountId);
}

function getForceGetAllConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).forceGetAll || { enabled: false }) };
}

function setForceGetAllConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.forceGetAll = { enabled: !!(cfg && cfg.enabled) };
    setAccountConfigSnapshot(accountId, next);
    return getForceGetAllConfig(accountId);
}

function getUI() {
    return { ...globalConfig.ui };
}

function setUITheme(theme) {
    const t = String(theme || '').toLowerCase();
    const next = (t === 'light') ? 'light' : 'dark';
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

// ============ 账号管理 ============
async function loadAccountsFromDB() {
    try {
        const pool = getPool();
        if (!pool) return;
        const [rows] = await pool.query('SELECT * FROM accounts');
        let mapped = rows.map(r => ({
            id: r.id,
            uin: r.uin,
            code: r.code || '',
            nick: r.nick || '',
            name: r.name || '',
            platform: r.platform || 'qq',
            running: r.running === 1,
            avatar: r.avatar || '',
            qq: r.qq || r.uin,
            username: r.username || '',
            createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
        }));
        cachedAccountsData = normalizeAccountsData({ accounts: mapped, nextId: 1000 + mapped.length });
    } catch (e) { console.error('加载账号数据失败:', e.message); }
}

let cachedAccountsData = { accounts: [], nextId: 1 };
function loadAccounts() {
    return cachedAccountsData;
}

let _accountsSaveTimer = null;
function saveAccounts(data) {
    cachedAccountsData = normalizeAccountsData(data); // 内存立即生效
    if (_accountsSaveTimer) clearTimeout(_accountsSaveTimer);

    _accountsSaveTimer = setTimeout(() => {
        _accountsSaveTimer = null;
        const pool = getPool();
        if (!pool) return;
        try {
            for (const acc of cachedAccountsData.accounts) {
                pool.query(
                    "INSERT INTO accounts (id, uin, nick, name, platform, running, code, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nick=?, name=?, platform=?, running=?, code=COALESCE(NULLIF(VALUES(code),''), code), username=COALESCE(NULLIF(VALUES(username),''), username)",
                    [
                        acc.id, acc.uin, acc.nick || '', acc.name || '', acc.platform || 'qq', acc.running ? 1 : 0, acc.code || '', acc.username || '',
                        acc.nick || '', acc.name || '', acc.platform || 'qq', acc.running ? 1 : 0
                    ]
                ).catch(e => console.error("DB Async Insert Account Failed", e.message));
            }
        } catch (e) {
            console.error('保存账号数据失败:', e.message);
        }
    }, 2000);
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
        const accIdStr = String(acc.id).trim();
        const idx = data.accounts.findIndex(a => String(a.id).trim() === accIdStr);
        if (idx >= 0) {
            data.accounts[idx] = { ...data.accounts[idx], ...acc, name: acc.name !== undefined ? acc.name : data.accounts[idx].name, updatedAt: Date.now() };
            touchedAccountId = String(data.accounts[idx].id || '');
        }
    } else {
        const id = data.nextId++;
        touchedAccountId = String(id);
        data.accounts.push({
            id: touchedAccountId,
            name: acc.name || `账号${id}`,
            code: acc.code || '',
            platform: acc.platform || 'qq',
            uin: acc.uin ? String(acc.uin) : '',
            qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
            avatar: acc.avatar || acc.avatarUrl || '',
            username: acc.username || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
    saveAccounts(data);
    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId);
    }
    return data;
}

function deleteAccount(id) {
    const data = normalizeAccountsData(loadAccounts());
    data.accounts = data.accounts.filter(a => String(a.id) !== String(id));
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);
    removeAccountConfig(id);

    // 修复 bug：仅 saveAccounts(data) 会触发 UPSERT（更新或插入），但不会对被 filter 剔除的数据做 DELETE，必须单独在 DB 中删除该行
    const pool = getPool();
    if (pool) {
        pool.query('DELETE FROM accounts WHERE id = ?', [String(id)]).catch(e => console.error("DB Delete Account Failed:", e.message));
        // 同时清理可能关联的 config 数据
        pool.query('DELETE FROM account_configs WHERE account_id = ?', [String(id)]).catch(e => console.error("DB Delete Account Configs Failed:", e.message));
    }

    return data;
}

// ============ 系统级时间参数配置 (Ghosting / 限流 / 邀请延迟等) ============
const DEFAULT_TIMING_CONFIG = {
    // Ghosting 打盹参数
    ghostingCooldownMin: 240,       // 冷却期（分钟），两次打盹之间最少间隔
    ghostingProbability: 0.02,      // 每次巡查触发打盹的概率
    ghostingMinMin: 5,              // 最短打盹时长（分钟）
    ghostingMaxMin: 10,             // 最长打盹时长（分钟）
    // 令牌桶限流参数
    rateLimitIntervalMs: 334,       // 两次 WS 请求之间的最小间隔（毫秒）
    // 邀请码处理延迟
    inviteRequestDelay: 2000,       // 邀请码逐条处理间隔（毫秒）
};

// ============ 体验卡相关配置 ============
const DEFAULT_TRIAL_CARD_CONFIG = {
    enabled: true,           // 是否允许生成体验卡
    dailyLimit: 100,         // 每日最大发卡数量
    cooldownMs: 4 * 60 * 60 * 1000, // IP申请冷却时间 (默认 4 小时)
    days: 1,                 // 体验卡默认天数
    maxAccounts: 1,          // 结合使用，体验卡最多只能添加 1 个账号
    adminRenewEnabled: true, // 管理员是否可以一键续费该类型
    userRenewEnabled: false, // 用户是否可以自助续费该类型
};

/**
 * 获取系统级时间参数配置（合并默认值）
 */
function getTimingConfig() {
    const saved = (globalConfig.timingConfig && typeof globalConfig.timingConfig === 'object')
        ? globalConfig.timingConfig
        : {};
    return { ...DEFAULT_TIMING_CONFIG, ...saved };
}

/**
 * 保存系统级时间参数配置（局部更新）
 */
function setTimingConfig(cfg) {
    const current = getTimingConfig();
    const input = (cfg && typeof cfg === 'object') ? cfg : {};
    const next = {};
    for (const key of Object.keys(DEFAULT_TIMING_CONFIG)) {
        if (input[key] !== undefined) {
            next[key] = Number(input[key]);
            if (!Number.isFinite(next[key])) next[key] = current[key];
        } else {
            next[key] = current[key];
        }
    }
    globalConfig.timingConfig = next;
    saveGlobalConfig();
    return getTimingConfig();
}

/**
 * 获取体验卡配置（合并默认值）
 */
function getTrialCardConfig() {
    const saved = (globalConfig.trialCardConfig && typeof globalConfig.trialCardConfig === 'object')
        ? globalConfig.trialCardConfig
        : {};
    return { ...DEFAULT_TRIAL_CARD_CONFIG, ...saved };
}

/**
 * 保存体验卡配置（局部更新）
 */
function setTrialCardConfig(cfg) {
    const current = getTrialCardConfig();
    const input = (cfg && typeof cfg === 'object') ? cfg : {};
    const next = {};
    for (const key of Object.keys(DEFAULT_TRIAL_CARD_CONFIG)) {
        if (input[key] !== undefined) {
            if (typeof DEFAULT_TRIAL_CARD_CONFIG[key] === 'boolean') {
                next[key] = !!input[key];
            } else {
                next[key] = Number(input[key]);
                if (!Number.isFinite(next[key])) next[key] = current[key];
            }
        } else {
            next[key] = current[key];
        }
    }
    globalConfig.trialCardConfig = next;
    saveGlobalConfig();
    return getTrialCardConfig();
}

// ============ 风控休眠持久化 ============
/**
 * 记录账号休眠到期时间戳（持久化到 store.json）
 */
function recordSuspendUntil(accountId, timestamp) {
    const id = resolveAccountId(accountId);
    if (!id) return;
    if (!globalConfig.suspendUntilMap) globalConfig.suspendUntilMap = {};
    globalConfig.suspendUntilMap[id] = timestamp;
    saveGlobalConfig();
}

/**
 * 读取账号的休眠到期时间戳
 */
function getSuspendUntil(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return 0;
    if (!globalConfig.suspendUntilMap) return 0;
    return Number(globalConfig.suspendUntilMap[id]) || 0;
}

async function loadAllFromDB() {
    await loadAccountsFromDB();
    await loadGlobalConfigFromDB();
}

module.exports = {
    loadAllFromDB,
    DEFAULT_ACCOUNT_CONFIG,
    DEFAULT_TIMING_CONFIG,
    getAccountConfigSnapshot,
    setAccountConfigSnapshot,
    removeAccountConfig,
    getConfigSnapshot,
    applyConfigSnapshot,
    getAutomation,
    setAutomation,
    isAutomationOn,
    getPlantingStrategy,
    getPreferredSeed,
    getIntervals,
    getFriendQuietHours,
    getFriendBlacklist,
    setFriendBlacklist,
    getStealFilterConfig,
    setStealFilterConfig,
    getStealFriendFilterConfig,
    setStealFriendFilterConfig,
    getStakeoutStealConfig,
    setStakeoutStealConfig,
    getSkipStealRadishConfig,
    setSkipStealRadishConfig,
    getForceGetAllConfig,
    setForceGetAllConfig,
    getUI,
    setUITheme,
    getOfflineReminder,
    setOfflineReminder,
    getTimingConfig,
    setTimingConfig,
    getSuspendUntil,
    recordSuspendUntil,
    ensureAccountConfig,
    addOrUpdateAccount,
    deleteAccount,
    getAdminPasswordHash,
    setAdminPasswordHash,
    getAccounts,
    getThirdPartyApiConfig,
    setThirdPartyApiConfig,
    getTrialCardConfig,
    setTrialCardConfig,

    getClusterConfig: () => {
        if (!globalConfig.clusterConfig) {
            globalConfig.clusterConfig = { dispatcherStrategy: 'round_robin' };
        }
        return { ...globalConfig.clusterConfig };
    },
    setClusterConfig: (cfg) => {
        globalConfig.clusterConfig = { ...globalConfig.clusterConfig, ...(cfg || {}) };
        saveGlobalConfig();
        return { ...globalConfig.clusterConfig };
    }
};

function getAccountsFullPaged(page = 1, pageSize = 20) {
    const data = getAccounts();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];

    // Sort by id descending (newest first)
    const sortedAccounts = [...accounts].sort((a, b) => {
        const idA = Number.parseInt(a.id, 10) || 0;
        const idB = Number.parseInt(b.id, 10) || 0;
        return idB - idA;
    });

    const total = sortedAccounts.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pagedAccounts = sortedAccounts.slice(startIndex, endIndex);

    return {
        accounts: pagedAccounts,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}

function getThirdPartyApiConfig() {
    return { ...(globalConfig.thirdPartyApi || {}) };
}

function setThirdPartyApiConfig(cfg) {
    const current = getThirdPartyApiConfig();
    globalConfig.thirdPartyApi = { ...current, ...(cfg || {}) };
    saveGlobalConfig();
    return getThirdPartyApiConfig();
}

module.exports.getAccountsFullPaged = getAccountsFullPaged;
module.exports.getThirdPartyApiConfig = getThirdPartyApiConfig;
module.exports.setThirdPartyApiConfig = setThirdPartyApiConfig;

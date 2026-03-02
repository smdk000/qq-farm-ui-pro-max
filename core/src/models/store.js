const process = require('node:process');
const fs = require('node:fs');
const path = require('node:path');
/**
 * 运行时存储 - 自动化开关、种子偏好、账号管理
 * 
 * Phase 0 优化：accountConfigs 从单一 store.json 拆分为每账号独立文件
 * 路径格式: data/account_configs/config_<accountId>.json
 * 全局配置（ui/offlineReminder/trialCardConfig 等）仍保存在 store.json
 */

const { getDataFile, getDataDir, ensureDataDir } = require('../config/runtime-paths');
const { readTextFile, readJsonFile, writeJsonFileAtomic } = require('../services/json-db');

const STORE_FILE = getDataFile('store.json');
const ACCOUNTS_FILE = getDataFile('accounts.json');

// 每账号独立配置文件目录
const ACCOUNT_CONFIGS_DIR = path.join(getDataDir(), 'account_configs');
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
    // 蹲守偷菜配置：在好友作物即将成熟时精准踩点偷取
    stakeoutSteal: {
        enabled: false,
        delaySec: 3,   // 作物成熟后等待多少秒再偷取（防秒偷举报）
    },
    // 运行时强落盘记忆态数据（防止重启清零）
    runtimeRecords: {
        fertilizerBoughtStr: '', // 格式: "2026-03-02|100" -> 当天已购入 100 包
    },
    // 可视化工作流引擎设定
    workflowConfig: {
        farm: {
            enabled: false,
            minInterval: 2,
            maxInterval: 2,
            nodes: [] // 例如: [{ id: 'uid1', type: 'weed' }, ...]
        },
        friend: {
            enabled: false,
            minInterval: 10,
            maxInterval: 10,
            nodes: []
        }
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
    const srcStakeoutSteal = (base.stakeoutSteal && typeof base.stakeoutSteal === 'object')
        ? base.stakeoutSteal
        : DEFAULT_ACCOUNT_CONFIG.stakeoutSteal;
    const srcRuntimeRecords = (base.runtimeRecords && typeof base.runtimeRecords === 'object')
        ? base.runtimeRecords
        : { fertilizerBoughtStr: '' };
    const srcWorkflowConfig = (base.workflowConfig && typeof base.workflowConfig === 'object')
        ? base.workflowConfig
        : DEFAULT_ACCOUNT_CONFIG.workflowConfig;

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
        stakeoutSteal: {
            enabled: !!srcStakeoutSteal.enabled,
            delaySec: Math.max(0, Math.min(60, Number.parseInt(srcStakeoutSteal.delaySec, 10) || 3)),
        },
        runtimeRecords: {
            fertilizerBoughtStr: String(srcRuntimeRecords.fertilizerBoughtStr || ''),
        },
        workflowConfig: {
            farm: {
                enabled: !!(srcWorkflowConfig.farm && srcWorkflowConfig.farm.enabled),
                minInterval: Math.max(1, Number.parseInt(srcWorkflowConfig.farm?.minInterval, 10) || 2),
                maxInterval: Math.max(1, Number.parseInt(srcWorkflowConfig.farm?.maxInterval, 10) || 2),
                nodes: Array.isArray(srcWorkflowConfig.farm?.nodes) ? srcWorkflowConfig.farm.nodes : [],
            },
            friend: {
                enabled: !!(srcWorkflowConfig.friend && srcWorkflowConfig.friend.enabled),
                minInterval: Math.max(1, Number.parseInt(srcWorkflowConfig.friend?.minInterval, 10) || 10),
                maxInterval: Math.max(1, Number.parseInt(srcWorkflowConfig.friend?.maxInterval, 10) || 10),
                nodes: Array.isArray(srcWorkflowConfig.friend?.nodes) ? srcWorkflowConfig.friend.nodes : [],
            }
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

    if (src.stakeoutSteal && typeof src.stakeoutSteal === 'object') {
        cfg.stakeoutSteal = {
            enabled: src.stakeoutSteal.enabled !== undefined ? !!src.stakeoutSteal.enabled : !!cfg.stakeoutSteal.enabled,
            delaySec: Math.max(0, Math.min(60, Number.parseInt(src.stakeoutSteal.delaySec, 10) || cfg.stakeoutSteal.delaySec || 3)),
        };
    }

    if (src.runtimeRecords && typeof src.runtimeRecords === 'object') {
        cfg.runtimeRecords = {
            fertilizerBoughtStr: src.runtimeRecords.fertilizerBoughtStr !== undefined ? String(src.runtimeRecords.fertilizerBoughtStr) : cfg.runtimeRecords.fertilizerBoughtStr,
        };
    }

    if (src.workflowConfig && typeof src.workflowConfig === 'object') {
        if (src.workflowConfig.farm) {
            cfg.workflowConfig.farm.enabled = src.workflowConfig.farm.enabled !== undefined ? !!src.workflowConfig.farm.enabled : cfg.workflowConfig.farm.enabled;
            if (src.workflowConfig.farm.minInterval !== undefined) cfg.workflowConfig.farm.minInterval = Math.max(1, Number.parseInt(src.workflowConfig.farm.minInterval, 10) || cfg.workflowConfig.farm.minInterval);
            if (src.workflowConfig.farm.maxInterval !== undefined) cfg.workflowConfig.farm.maxInterval = Math.max(1, Number.parseInt(src.workflowConfig.farm.maxInterval, 10) || cfg.workflowConfig.farm.maxInterval);
            if (Array.isArray(src.workflowConfig.farm.nodes)) cfg.workflowConfig.farm.nodes = src.workflowConfig.farm.nodes;
        }
        if (src.workflowConfig.friend) {
            cfg.workflowConfig.friend.enabled = src.workflowConfig.friend.enabled !== undefined ? !!src.workflowConfig.friend.enabled : cfg.workflowConfig.friend.enabled;
            if (src.workflowConfig.friend.minInterval !== undefined) cfg.workflowConfig.friend.minInterval = Math.max(1, Number.parseInt(src.workflowConfig.friend.minInterval, 10) || cfg.workflowConfig.friend.minInterval);
            if (src.workflowConfig.friend.maxInterval !== undefined) cfg.workflowConfig.friend.maxInterval = Math.max(1, Number.parseInt(src.workflowConfig.friend.maxInterval, 10) || cfg.workflowConfig.friend.maxInterval);
            if (Array.isArray(src.workflowConfig.friend.nodes)) cfg.workflowConfig.friend.nodes = src.workflowConfig.friend.nodes;
        }
        if (cfg.workflowConfig.farm.minInterval > cfg.workflowConfig.farm.maxInterval) {
            [cfg.workflowConfig.farm.minInterval, cfg.workflowConfig.farm.maxInterval] = [cfg.workflowConfig.farm.maxInterval, cfg.workflowConfig.farm.minInterval];
        }
        if (cfg.workflowConfig.friend.minInterval > cfg.workflowConfig.friend.maxInterval) {
            [cfg.workflowConfig.friend.minInterval, cfg.workflowConfig.friend.maxInterval] = [cfg.workflowConfig.friend.maxInterval, cfg.workflowConfig.friend.minInterval];
        }
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
        // 同时删除对应的独立配置文件
        deleteAccountConfigFile(id);
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

// ============ 每账号独立配置文件读写 ============

/**
 * 确保账号配置目录存在
 */
function ensureAccountConfigsDir() {
    if (!fs.existsSync(ACCOUNT_CONFIGS_DIR)) {
        fs.mkdirSync(ACCOUNT_CONFIGS_DIR, { recursive: true });
    }
}

/**
 * 生成账号配置文件路径
 * @param {string} accountId - 账号ID
 * @returns {string} 文件绝对路径
 */
function getAccountConfigFilePath(accountId) {
    return path.join(ACCOUNT_CONFIGS_DIR, `config_${accountId}.json`);
}

/**
 * 从独立文件加载单个账号配置
 * @param {string} accountId - 账号ID
 * @returns {object|null} 配置对象，文件不存在时返回 null
 */
function loadAccountConfigFile(accountId) {
    const filePath = getAccountConfigFilePath(accountId);
    if (!fs.existsSync(filePath)) return null;
    return readJsonFile(filePath, () => null);
}

/**
 * 将单个账号配置保存到独立文件
 * @param {string} accountId - 账号ID
 * @param {object} config - 配置对象
 */
function saveAccountConfigFile(accountId, config) {
    ensureAccountConfigsDir();
    const filePath = getAccountConfigFilePath(accountId);
    writeJsonFileAtomic(filePath, config);
}

/**
 * 删除单个账号的配置文件
 * @param {string} accountId - 账号ID
 */
function deleteAccountConfigFile(accountId) {
    try {
        const filePath = getAccountConfigFilePath(accountId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error(`删除账号[${accountId}]配置文件失败:`, e.message);
    }
}

/**
 * 从独立文件目录批量加载所有账号配置
 * @returns {object} { accountId: config, ... }
 */
function loadAllAccountConfigFiles() {
    const result = {};
    ensureAccountConfigsDir();
    try {
        const files = fs.readdirSync(ACCOUNT_CONFIGS_DIR)
            .filter(f => f.startsWith('config_') && f.endsWith('.json'));
        for (const file of files) {
            const match = file.match(/^config_(.+)\.json$/);
            if (!match) continue;
            const accountId = match[1].trim();
            if (!accountId) continue;
            const cfg = readJsonFile(path.join(ACCOUNT_CONFIGS_DIR, file), () => null);
            if (cfg) {
                result[accountId] = cfg;
            }
        }
    } catch (e) {
        console.error('批量加载账号配置文件失败:', e.message);
    }
    return result;
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

            // === Phase 0: 从独立文件加载账号配置，同时兼容旧 store.json 格式 ===
            let migratedFromOld = false;
            const oldCfgMap = (data.accountConfigs && typeof data.accountConfigs === 'object')
                ? data.accountConfigs
                : {};
            const oldHasConfigs = Object.keys(oldCfgMap).length > 0;

            // 1. 优先从独立文件加载
            const fileCfgMap = loadAllAccountConfigFiles();
            const fileHasConfigs = Object.keys(fileCfgMap).length > 0;

            globalConfig.accountConfigs = {};

            if (fileHasConfigs) {
                // 独立文件已有数据，直接使用
                for (const [id, cfg] of Object.entries(fileCfgMap)) {
                    globalConfig.accountConfigs[id] = normalizeAccountConfig(cfg, accountFallbackConfig);
                }
            } else if (oldHasConfigs) {
                // 旧格式有数据但独立文件没有 → 执行一次性迁移
                console.warn('[系统] 正在将 accountConfigs 从 store.json 迁移到独立文件...');
                for (const [id, cfg] of Object.entries(oldCfgMap)) {
                    const sid = String(id || '').trim();
                    if (!sid) continue;
                    const normalized = normalizeAccountConfig(cfg, accountFallbackConfig);
                    globalConfig.accountConfigs[sid] = normalized;
                    saveAccountConfigFile(sid, normalized);
                }
                migratedFromOld = true;
                console.warn(`[系统] 迁移完成: ${Object.keys(globalConfig.accountConfigs).length} 个账号配置已拆分为独立文件`);
            }

            // 统一规范化，确保内存中不残留旧字段
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

            // 如果从旧格式迁移了数据，重新写入 store.json（不含 accountConfigs 以减小体积）
            if (migratedFromOld) {
                saveGlobalConfigImmediate();
            }
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

// 立即保存全局配置 (Phase 0 改造版)
// 全局配置（ui/offlineReminder 等）写入 store.json（不含 accountConfigs）
// 每个账号配置写入独立文件 data/account_configs/config_<id>.json
function saveGlobalConfigImmediate() {
    ensureDataDir();
    try {
        sanitizeGlobalConfigBeforeSave();

        // 1. 保存全局配置到 store.json（排除 accountConfigs 以减小文件体积）
        const globalOnly = {
            defaultAccountConfig: globalConfig.defaultAccountConfig,
            ui: globalConfig.ui,
            offlineReminder: globalConfig.offlineReminder,
            adminPasswordHash: globalConfig.adminPasswordHash,
            trialCardConfig: globalConfig.trialCardConfig,
        };
        const oldJson = readTextFile(STORE_FILE, '');
        const newJson = JSON.stringify(globalOnly, null, 2);

        if (oldJson !== newJson) {
            writeJsonFileAtomic(STORE_FILE, globalOnly);
        }

        // 2. 逐个保存各账号配置到独立文件
        const map = globalConfig.accountConfigs || {};
        for (const [id, cfg] of Object.entries(map)) {
            const sid = String(id || '').trim();
            if (!sid) continue;
            saveAccountConfigFile(sid, cfg);
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
        stakeoutSteal: { ...(cfg.stakeoutSteal || { enabled: false, delaySec: 3 }) },
        workflowConfig: {
            farm: { ...cfg.workflowConfig?.farm, nodes: JSON.parse(JSON.stringify(cfg.workflowConfig?.farm?.nodes || [])) },
            friend: { ...cfg.workflowConfig?.friend, nodes: JSON.parse(JSON.stringify(cfg.workflowConfig?.friend?.nodes || [])) }
        },
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

    if (cfg.stakeoutSteal && typeof cfg.stakeoutSteal === 'object') {
        next.stakeoutSteal = {
            enabled: cfg.stakeoutSteal.enabled !== undefined ? !!cfg.stakeoutSteal.enabled : next.stakeoutSteal.enabled,
            delaySec: Math.max(0, Math.min(60, Number.parseInt(cfg.stakeoutSteal.delaySec, 10) || next.stakeoutSteal.delaySec || 3)),
        };
    }

    if (cfg.workflowConfig && typeof cfg.workflowConfig === 'object') {
        if (cfg.workflowConfig.farm) {
            next.workflowConfig.farm.enabled = cfg.workflowConfig.farm.enabled !== undefined ? !!cfg.workflowConfig.farm.enabled : next.workflowConfig.farm.enabled;
            if (cfg.workflowConfig.farm.minInterval !== undefined) next.workflowConfig.farm.minInterval = Math.max(1, Number.parseInt(cfg.workflowConfig.farm.minInterval, 10) || next.workflowConfig.farm.minInterval);
            if (cfg.workflowConfig.farm.maxInterval !== undefined) next.workflowConfig.farm.maxInterval = Math.max(1, Number.parseInt(cfg.workflowConfig.farm.maxInterval, 10) || next.workflowConfig.farm.maxInterval);
            if (Array.isArray(cfg.workflowConfig.farm.nodes)) next.workflowConfig.farm.nodes = cfg.workflowConfig.farm.nodes;
        }
        if (cfg.workflowConfig.friend) {
            next.workflowConfig.friend.enabled = cfg.workflowConfig.friend.enabled !== undefined ? !!cfg.workflowConfig.friend.enabled : next.workflowConfig.friend.enabled;
            if (cfg.workflowConfig.friend.minInterval !== undefined) next.workflowConfig.friend.minInterval = Math.max(1, Number.parseInt(cfg.workflowConfig.friend.minInterval, 10) || next.workflowConfig.friend.minInterval);
            if (cfg.workflowConfig.friend.maxInterval !== undefined) next.workflowConfig.friend.maxInterval = Math.max(1, Number.parseInt(cfg.workflowConfig.friend.maxInterval, 10) || next.workflowConfig.friend.maxInterval);
            if (Array.isArray(cfg.workflowConfig.friend.nodes)) next.workflowConfig.friend.nodes = cfg.workflowConfig.friend.nodes;
        }
        if (next.workflowConfig.farm.minInterval > next.workflowConfig.farm.maxInterval) {
            [next.workflowConfig.farm.minInterval, next.workflowConfig.farm.maxInterval] = [next.workflowConfig.farm.maxInterval, next.workflowConfig.farm.minInterval];
        }
        if (next.workflowConfig.friend.minInterval > next.workflowConfig.friend.maxInterval) {
            [next.workflowConfig.friend.minInterval, next.workflowConfig.friend.maxInterval] = [next.workflowConfig.friend.maxInterval, next.workflowConfig.friend.minInterval];
        }
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
        if (cfg.ui.timestamp !== undefined) {
            globalConfig.ui.timestamp = Number(cfg.ui.timestamp);
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

function getFertilizerBoughtData(accountId) {
    const raw = getAccountConfigSnapshot(accountId).runtimeRecords?.fertilizerBoughtStr || '';
    if (!raw) return { date: '', count: 0 };
    const parts = String(raw).split('|');
    return {
        date: parts[0] || '',
        count: parseInt(parts[1], 10) || 0
    };
}

function recordFertilizerBought(accountId, totalCount, dateVal) {
    const cfg = getAccountConfigSnapshot(accountId);
    if (!cfg.runtimeRecords) {
        cfg.runtimeRecords = { fertilizerBoughtStr: '' };
    }
    cfg.runtimeRecords.fertilizerBoughtStr = `${dateVal}|${totalCount}`;
    setAccountConfigSnapshot(accountId, cfg, true);
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

// ============ 蹲守偷菜配置 ============

function getStakeoutStealConfig(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        enabled: !!(cfg.stakeoutSteal && cfg.stakeoutSteal.enabled),
        delaySec: Math.max(0, Math.min(60, Number.parseInt((cfg.stakeoutSteal || {}).delaySec, 10) || 3)),
    };
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

// ============ 账号管理 (对接 MySQL AccountRepository) ============
const accountRepository = require('../repositories/account-repository');

async function getAccounts() {
    // Phase 2 优化：使用轻量查询，不拉取 auth_data / advanced_settings 大 JSON
    // 消除万级 JSON.parse 同步阻塞，从 ~2000ms 降至 ~50ms（1000 账号基准）
    const rawAccounts = await accountRepository.findAllLite();
    const accounts = rawAccounts.map(r => ({
        id: String(r.id),
        name: r.name || `账号${r.id}`,
        platform: r.platform || 'qq',
        uin: r.uin ? String(r.uin) : '',
        qq: r.uin ? String(r.uin) : '',
        nick: r.nick || '',
        running: !!r.running,
        status: r.status,
        api_error_count: r.api_error_count,
        username: r.username || '',
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    }));
    return { accounts, nextId: 0 };
}

/**
 * 获取单个账号的完整数据（含 auth_data）
 * 仅供 Worker 启动/重载时使用，避免在列表查询中拉取大 JSON
 */
async function getAccountFull(accountId) {
    const row = await accountRepository.findById(accountId);
    if (!row) return null;
    return {
        id: String(row.id),
        name: row.name || `账号${row.id}`,
        platform: row.platform || 'qq',
        uin: row.uin ? String(row.uin) : '',
        qq: row.uin ? String(row.uin) : '',
        nick: row.nick || '',
        running: !!row.running,
        status: row.status,
        username: row.username || '',
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        ...(row.auth_data && typeof row.auth_data === 'object' ? row.auth_data : {})
    };
}

const DB_FIELDS = ['id', 'uin', 'qq', 'nick', 'name', 'platform', 'running', 'status', 'api_error_count', 'username', 'createdAt', 'updatedAt'];
function extractAuthData(acc) {
    const auth = {};
    for (const key in acc) {
        if (!DB_FIELDS.includes(key)) {
            auth[key] = acc[key];
        }
    }
    return auth;
}

async function addOrUpdateAccount(acc) {
    let touchedAccountId = '';
    if (acc.id) {
        // 更新逻辑
        touchedAccountId = String(acc.id);
        const existing = await accountRepository.findById(acc.id);
        if (existing) {
            const authData = existing.auth_data && typeof existing.auth_data === 'object' ? existing.auth_data : {};
            const newAuthData = extractAuthData(acc);
            const mergedAuth = { ...authData, ...newAuthData };
            const pool = require('../services/mysql-db').getPool();

            await pool.execute('UPDATE accounts SET nick = ?, username = ?, auth_data = ? WHERE id = ?',
                [acc.nick || existing.nick || '', acc.username || existing.username || '', JSON.stringify(mergedAuth), acc.id]);
        }
    } else {
        // 创建逻辑
        const newAcc = await accountRepository.create({
            uin: acc.uin || '',
            nick: acc.nick || '',
            name: acc.name || '新账号',
            platform: acc.platform || 'qq',
            username: acc.username || '',
            auth_data: extractAuthData(acc)
        });
        touchedAccountId = String(newAcc.id);
    }

    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId, { persist: false });
    }

    // 虽然没有了 saveAccounts，但返回最新列表
    return await getAccounts();
}

async function deleteAccount(id, options = {}) {
    await accountRepository.delete(id);

    if (!options.retainConfig) {
        removeAccountConfig(id);
    }

    return await getAccounts();
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
    getStakeoutStealConfig,
    getUI,
    setUITheme,
    getOfflineReminder,
    setOfflineReminder,
    getAccounts,
    getAccountFull,
    addOrUpdateAccount,
    deleteAccount,
    getAdminPasswordHash,
    setAdminPasswordHash,
    ensureAccountConfig,
    getTrialCardConfig,
    setTrialCardConfig,
    getFertilizerBoughtData,
    recordFertilizerBought,
};

const process = require('node:process');
/**
 * 运行时存储 - 自动化开关、种子偏好、账号管理
 */

const { getDataFile } = require('../config/runtime-paths');
const { getPool, transaction, isMysqlInitialized } = require('../services/mysql-db');
const { createModuleLogger } = require('../services/logger');
const { decryptSecretValue, encryptSecretValue } = require('../services/secret-crypto');
const { getSystemSettings, setSystemSettings, SYSTEM_SETTING_KEYS } = require('../services/system-settings');
const { readJsonFile, writeJsonFileAtomic } = require('../services/json-db');
const { DEFAULT_UI_CONFIG, normalizeUIConfig } = require('../utils/ui-config');

const STORE_FILE = getDataFile('store.json');
const GLOBAL_CONFIG_SYSTEM_SETTING_KEY = SYSTEM_SETTING_KEYS.GLOBAL_CONFIG;
const ALLOWED_PLANTING_STRATEGIES = ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit', 'bag_priority'];
const ALLOWED_BAG_SEED_FALLBACK_STRATEGIES = ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit'];
const PUSHOO_CHANNELS = new Set([
    'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
    'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
    'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
    'discord', 'wxpusher',
]);
const REPORT_CHANNELS = new Set([...PUSHOO_CHANNELS, 'email']);
const INTERVAL_MAX_SEC = 86400;
const DEFAULT_OFFLINE_REMINDER = {
    channel: 'webhook',
    reloginUrlMode: 'none',
    endpoint: '',
    token: '',
    title: '账号下线提醒',
    msg: '账号下线',
    offlineDeleteEnabled: false,
    offlineDeleteSec: 1,
    webhookCustomJsonEnabled: false,
    webhookCustomJsonTemplate: '',
};
const DEFAULT_BUG_REPORT_CONFIG = {
    enabled: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    emailFrom: '',
    emailTo: '',
    subjectPrefix: '[BUG反馈]',
    includeFrontendErrors: true,
    includeSystemLogs: true,
    includeRuntimeLogs: true,
    includeAccountLogs: true,
    systemLogLimit: 50,
    runtimeLogLimit: 40,
    accountLogLimit: 20,
    frontendErrorLimit: 10,
    maxBodyLength: 50000,
    cooldownSeconds: 180,
    saveToDatabase: true,
    allowNonAdminSubmit: true,
};
const DEFAULT_REPORT_CONFIG = {
    enabled: false,
    channel: 'webhook',
    endpoint: '',
    token: '',
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    emailFrom: '',
    emailTo: '',
    title: '经营汇报',
    hourlyEnabled: false,
    hourlyMinute: 5,
    dailyEnabled: true,
    dailyHour: 21,
    dailyMinute: 0,
    retentionDays: 30,
};
const REPORT_OPERATION_KEYS = [
    'harvest',
    'water',
    'weed',
    'bug',
    'fertilize',
    'plant',
    'steal',
    'helpWater',
    'helpWeed',
    'helpBug',
    'taskClaim',
    'sell',
    'upgrade',
    'levelUp',
];
const DEFAULT_REPORT_STATE = {
    lastHourlySlot: '',
    lastDailySlot: '',
    hourlyBaseline: null,
    dailyBaseline: null,
};
const DEFAULT_MODE_SCOPE = {
    zoneScope: 'same_zone_only',
    requiresGameFriend: true,
    fallbackBehavior: 'standalone',
};
const QQ_HIGH_RISK_WINDOW_MIN_MINUTES = 5;
const QQ_HIGH_RISK_WINDOW_MAX_MINUTES = 180;
const DEFAULT_QQ_HIGH_RISK_WINDOW = {
    durationMinutes: 30,
    expiresAt: 0,
    lastIssuedAt: 0,
    lastAutoDisabledAt: 0,
    lastAutoDisabledNoticeAt: 0,
};
const ACCOUNT_MODE_PRESETS = Object.freeze({
    main: {
        accountMode: 'main',
        harvestDelay: { min: 0, max: 0 },
    },
    alt: {
        accountMode: 'alt',
        harvestDelay: { min: 180, max: 300 },
    },
    safe: {
        accountMode: 'safe',
        harvestDelay: { min: 240, max: 420 },
    },
});
const ALLOWED_PLANTING_FALLBACK_STRATEGIES = ['pause', 'preferred', 'level', 'cheapest'];
const ALLOWED_INVENTORY_PLANTING_MODES = ['disabled', 'prefer_inventory', 'inventory_only'];
const ALLOWED_FERTILIZER_BUY_TYPES = new Set(['organic', 'normal', 'both']);
const ALLOWED_FERTILIZER_BUY_MODES = new Set(['threshold', 'unlimited']);
const DEFAULT_INVENTORY_PLANTING = {
    mode: 'disabled',
    globalKeepCount: 0,
    reserveRules: [],
};
const DEFAULT_TRADE_CONFIG = {
    sell: {
        scope: 'fruit_only',
        keepMinEachFruit: 0,
        keepFruitIds: [],
        rareKeep: {
            enabled: false,
            judgeBy: 'either',
            minPlantLevel: 40,
            minUnitPrice: 2000,
        },
        batchSize: 15,
        previewBeforeManualSell: false,
    },
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
        friend_auto_accept: false,
        friend_three_phase: false,
        auto_blacklist_banned: true,
        qqFriendFetchMultiChain: false,
        task: true,
        email: true,
        fertilizer_gift: false,
        fertilizer_buy: false,
        fertilizer_buy_limit: 100,
        fertilizer_buy_type: 'organic',
        fertilizer_buy_mode: 'unlimited',
        fertilizer_buy_threshold_normal: 24,
        fertilizer_buy_threshold_organic: 24,
        free_gifts: true,
        share_reward: true,
        vip_gift: true,
        month_card: true,
        open_server_gift: true,
        sell: false,
        fertilizer: 'none',
        fertilizer_60s_anti_steal: false,
        fertilizer_smart_phase: false,
        fastHarvest: false,
        landUpgradeTarget: 6,
    },
    accountMode: 'main',
    harvestDelay: { min: 0, max: 0 },
    riskPromptEnabled: true,
    modeScope: { ...DEFAULT_MODE_SCOPE },
    plantingStrategy: 'preferred',
    plantingFallbackStrategy: 'level',
    preferredSeedId: 0,
    bagSeedPriority: [],
    bagSeedFallbackStrategy: 'level',
    inventoryPlanting: { ...DEFAULT_INVENTORY_PLANTING },
    intervals: {
        farm: 30,
        friend: 60,
        farmMin: 30,
        farmMax: 120,
        friendMin: 60,
        friendMax: 180,
        helpMin: 60,
        helpMax: 180,
        stealMin: 60,
        stealMax: 180,
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
    qqHighRiskWindow: { ...DEFAULT_QQ_HIGH_RISK_WINDOW },
    skipStealRadish: { enabled: false },
    forceGetAll: { enabled: false },
    workflowConfig: {
        farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
        friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
    },
    tradeConfig: { ...DEFAULT_TRADE_CONFIG },
    reportConfig: { ...DEFAULT_REPORT_CONFIG },
    reportState: { ...DEFAULT_REPORT_STATE },
};
const ALLOWED_AUTOMATION_KEYS = new Set(Object.keys(DEFAULT_ACCOUNT_CONFIG.automation));
const FERTILIZER_OPTIONS = new Set(['both', 'normal', 'organic', 'none']);

let accountFallbackConfig = {
    ...DEFAULT_ACCOUNT_CONFIG,
    automation: { ...DEFAULT_ACCOUNT_CONFIG.automation },
    harvestDelay: { ...DEFAULT_ACCOUNT_CONFIG.harvestDelay },
    modeScope: { ...DEFAULT_ACCOUNT_CONFIG.modeScope },
    bagSeedPriority: [...DEFAULT_ACCOUNT_CONFIG.bagSeedPriority],
    inventoryPlanting: { ...DEFAULT_ACCOUNT_CONFIG.inventoryPlanting, reserveRules: [] },
    intervals: { ...DEFAULT_ACCOUNT_CONFIG.intervals },
    friendQuietHours: { ...DEFAULT_ACCOUNT_CONFIG.friendQuietHours },
    qqHighRiskWindow: { ...DEFAULT_ACCOUNT_CONFIG.qqHighRiskWindow },
};

const globalConfig = {
    accountConfigs: {},
    accountConfigIdentityArchive: {},
    defaultAccountConfig: cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG),
    ui: { ...DEFAULT_UI_CONFIG },
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER },
    bugReportConfig: { ...DEFAULT_BUG_REPORT_CONFIG },
    adminPasswordHash: '',
    thirdPartyApi: {},
    timingConfig: {},
    clusterConfig: {
        dispatcherStrategy: 'round_robin', // 'round_robin' or 'least_load'
    },
    suspendUntilMap: {},
};

const DEFAULT_CLUSTER_CONFIG = {
    dispatcherStrategy: 'round_robin',
};

function normalizeOfflineReminder(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const offlineDeleteEnabled = src.offlineDeleteEnabled !== undefined
        ? !!src.offlineDeleteEnabled
        : !!DEFAULT_OFFLINE_REMINDER.offlineDeleteEnabled;
    let offlineDeleteSec = Number.parseInt(src.offlineDeleteSec, 10);
    if (!Number.isFinite(offlineDeleteSec)) {
        offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec;
    }
    offlineDeleteSec = Math.max(1, offlineDeleteSec);
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
    const webhookCustomJsonEnabled = src.webhookCustomJsonEnabled !== undefined
        ? !!src.webhookCustomJsonEnabled
        : !!DEFAULT_OFFLINE_REMINDER.webhookCustomJsonEnabled;
    const webhookCustomJsonTemplate = (src.webhookCustomJsonTemplate !== undefined && src.webhookCustomJsonTemplate !== null)
        ? String(src.webhookCustomJsonTemplate)
        : DEFAULT_OFFLINE_REMINDER.webhookCustomJsonTemplate;
    return {
        channel,
        reloginUrlMode,
        endpoint,
        token,
        title,
        msg,
        offlineDeleteEnabled,
        offlineDeleteSec,
        webhookCustomJsonEnabled,
        webhookCustomJsonTemplate,
    };
}

function normalizeBugReportConfig(input) {
    const src = (input && typeof input === 'object') ? input : {};
    return {
        enabled: src.enabled !== undefined ? !!src.enabled : !!DEFAULT_BUG_REPORT_CONFIG.enabled,
        smtpHost: String(src.smtpHost !== undefined ? src.smtpHost : DEFAULT_BUG_REPORT_CONFIG.smtpHost).trim(),
        smtpPort: clampInteger(src.smtpPort, DEFAULT_BUG_REPORT_CONFIG.smtpPort, 1, 65535),
        smtpSecure: src.smtpSecure !== undefined ? !!src.smtpSecure : !!DEFAULT_BUG_REPORT_CONFIG.smtpSecure,
        smtpUser: String(src.smtpUser !== undefined ? src.smtpUser : DEFAULT_BUG_REPORT_CONFIG.smtpUser).trim(),
        smtpPass: decryptSecretValue(src.smtpPass !== undefined ? src.smtpPass : DEFAULT_BUG_REPORT_CONFIG.smtpPass),
        emailFrom: String(src.emailFrom !== undefined ? src.emailFrom : DEFAULT_BUG_REPORT_CONFIG.emailFrom).trim(),
        emailTo: String(src.emailTo !== undefined ? src.emailTo : DEFAULT_BUG_REPORT_CONFIG.emailTo).trim(),
        subjectPrefix: String(src.subjectPrefix !== undefined ? src.subjectPrefix : DEFAULT_BUG_REPORT_CONFIG.subjectPrefix).trim().slice(0, 40) || DEFAULT_BUG_REPORT_CONFIG.subjectPrefix,
        includeFrontendErrors: src.includeFrontendErrors !== undefined ? !!src.includeFrontendErrors : !!DEFAULT_BUG_REPORT_CONFIG.includeFrontendErrors,
        includeSystemLogs: src.includeSystemLogs !== undefined ? !!src.includeSystemLogs : !!DEFAULT_BUG_REPORT_CONFIG.includeSystemLogs,
        includeRuntimeLogs: src.includeRuntimeLogs !== undefined ? !!src.includeRuntimeLogs : !!DEFAULT_BUG_REPORT_CONFIG.includeRuntimeLogs,
        includeAccountLogs: src.includeAccountLogs !== undefined ? !!src.includeAccountLogs : !!DEFAULT_BUG_REPORT_CONFIG.includeAccountLogs,
        systemLogLimit: clampInteger(src.systemLogLimit, DEFAULT_BUG_REPORT_CONFIG.systemLogLimit, 1, 100),
        runtimeLogLimit: clampInteger(src.runtimeLogLimit, DEFAULT_BUG_REPORT_CONFIG.runtimeLogLimit, 1, 100),
        accountLogLimit: clampInteger(src.accountLogLimit, DEFAULT_BUG_REPORT_CONFIG.accountLogLimit, 1, 100),
        frontendErrorLimit: clampInteger(src.frontendErrorLimit, DEFAULT_BUG_REPORT_CONFIG.frontendErrorLimit, 1, 50),
        maxBodyLength: clampInteger(src.maxBodyLength, DEFAULT_BUG_REPORT_CONFIG.maxBodyLength, 5000, 100000),
        cooldownSeconds: clampInteger(src.cooldownSeconds, DEFAULT_BUG_REPORT_CONFIG.cooldownSeconds, 10, 3600),
        saveToDatabase: src.saveToDatabase !== undefined ? !!src.saveToDatabase : !!DEFAULT_BUG_REPORT_CONFIG.saveToDatabase,
        allowNonAdminSubmit: src.allowNonAdminSubmit !== undefined ? !!src.allowNonAdminSubmit : !!DEFAULT_BUG_REPORT_CONFIG.allowNonAdminSubmit,
    };
}

function serializeBugReportConfigForPersistence(input) {
    const normalized = normalizeBugReportConfig(input);
    return {
        ...normalized,
        smtpPass: encryptSecretValue(normalized.smtpPass),
    };
}

function clampInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    const base = Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
    const next = Number.isFinite(base) ? base : min;
    return Math.max(min, Math.min(max, next));
}

function normalizeTradeKeepFruitIds(list, fallbackList = []) {
    const source = Array.isArray(list)
        ? list
        : (Array.isArray(fallbackList) ? fallbackList : []);
    return Array.from(new Set(
        source
            .map(Number)
            .filter(id => Number.isFinite(id) && id > 0),
    ));
}

function normalizeReportConfig(rawConfig, fallbackConfig = DEFAULT_REPORT_CONFIG) {
    const raw = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
    const fallback = (fallbackConfig && typeof fallbackConfig === 'object') ? fallbackConfig : DEFAULT_REPORT_CONFIG;
    const rawChannel = String(raw.channel !== undefined ? raw.channel : fallback.channel || DEFAULT_REPORT_CONFIG.channel).trim().toLowerCase();
    return {
        enabled: raw.enabled !== undefined ? !!raw.enabled : !!fallback.enabled,
        channel: REPORT_CHANNELS.has(rawChannel) ? rawChannel : DEFAULT_REPORT_CONFIG.channel,
        endpoint: String(raw.endpoint !== undefined ? raw.endpoint : fallback.endpoint || '').trim(),
        token: String(raw.token !== undefined ? raw.token : fallback.token || '').trim(),
        smtpHost: String(raw.smtpHost !== undefined ? raw.smtpHost : fallback.smtpHost || '').trim(),
        smtpPort: clampInteger(raw.smtpPort, fallback.smtpPort || DEFAULT_REPORT_CONFIG.smtpPort, 1, 65535),
        smtpSecure: raw.smtpSecure !== undefined ? !!raw.smtpSecure : !!fallback.smtpSecure,
        smtpUser: String(raw.smtpUser !== undefined ? raw.smtpUser : fallback.smtpUser || '').trim(),
        smtpPass: String(raw.smtpPass !== undefined ? raw.smtpPass : fallback.smtpPass || '').trim(),
        emailFrom: String(raw.emailFrom !== undefined ? raw.emailFrom : fallback.emailFrom || '').trim(),
        emailTo: String(raw.emailTo !== undefined ? raw.emailTo : fallback.emailTo || '').trim(),
        title: String(raw.title !== undefined ? raw.title : fallback.title || DEFAULT_REPORT_CONFIG.title).trim() || DEFAULT_REPORT_CONFIG.title,
        hourlyEnabled: raw.hourlyEnabled !== undefined ? !!raw.hourlyEnabled : !!fallback.hourlyEnabled,
        hourlyMinute: clampInteger(raw.hourlyMinute, fallback.hourlyMinute, 0, 59),
        dailyEnabled: raw.dailyEnabled !== undefined ? !!raw.dailyEnabled : !!fallback.dailyEnabled,
        dailyHour: clampInteger(raw.dailyHour, fallback.dailyHour, 0, 23),
        dailyMinute: clampInteger(raw.dailyMinute, fallback.dailyMinute, 0, 59),
        retentionDays: clampInteger(raw.retentionDays, fallback.retentionDays, 0, 365),
    };
}

function normalizeReportBaseline(rawBaseline) {
    if (!rawBaseline || typeof rawBaseline !== 'object') return null;
    const operations = {};
    for (const key of REPORT_OPERATION_KEYS) {
        operations[key] = Math.max(0, Number.parseInt(rawBaseline.operations && rawBaseline.operations[key], 10) || 0);
    }
    return {
        sessionExpGained: Math.max(0, Number(rawBaseline.sessionExpGained) || 0),
        sessionGoldGained: Math.max(0, Number(rawBaseline.sessionGoldGained) || 0),
        sessionCouponGained: Math.max(0, Number(rawBaseline.sessionCouponGained) || 0),
        operations,
        recordedAt: Math.max(0, Number(rawBaseline.recordedAt) || 0),
    };
}

function normalizeReportState(rawState, fallbackState = DEFAULT_REPORT_STATE) {
    const raw = (rawState && typeof rawState === 'object') ? rawState : {};
    const fallback = (fallbackState && typeof fallbackState === 'object') ? fallbackState : DEFAULT_REPORT_STATE;
    return {
        lastHourlySlot: String(raw.lastHourlySlot !== undefined ? raw.lastHourlySlot : fallback.lastHourlySlot || '').trim(),
        lastDailySlot: String(raw.lastDailySlot !== undefined ? raw.lastDailySlot : fallback.lastDailySlot || '').trim(),
        hourlyBaseline: normalizeReportBaseline(raw.hourlyBaseline !== undefined ? raw.hourlyBaseline : fallback.hourlyBaseline),
        dailyBaseline: normalizeReportBaseline(raw.dailyBaseline !== undefined ? raw.dailyBaseline : fallback.dailyBaseline),
    };
}

function normalizeWorkflowLane(rawLane, fallbackLane) {
    const raw = (rawLane && typeof rawLane === 'object') ? rawLane : {};
    const fallback = (fallbackLane && typeof fallbackLane === 'object') ? fallbackLane : { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] };
    const minInterval = Math.max(1, Number.parseInt(raw.minInterval, 10) || Number.parseInt(fallback.minInterval, 10) || 1);
    const maxInterval = Math.max(minInterval, Number.parseInt(raw.maxInterval, 10) || Number.parseInt(fallback.maxInterval, 10) || minInterval);
    return {
        enabled: raw.enabled !== undefined ? !!raw.enabled : !!fallback.enabled,
        minInterval,
        maxInterval,
        nodes: Array.isArray(raw.nodes)
            ? raw.nodes.map(node => ({ ...(node || {}) }))
            : (Array.isArray(fallback.nodes) ? fallback.nodes.map(node => ({ ...(node || {}) })) : []),
    };
}

function normalizeWorkflowConfig(rawWorkflow, fallbackWorkflow = DEFAULT_ACCOUNT_CONFIG.workflowConfig) {
    const raw = (rawWorkflow && typeof rawWorkflow === 'object') ? rawWorkflow : {};
    const fallback = (fallbackWorkflow && typeof fallbackWorkflow === 'object') ? fallbackWorkflow : DEFAULT_ACCOUNT_CONFIG.workflowConfig;
    return {
        farm: normalizeWorkflowLane(raw.farm, fallback.farm || DEFAULT_ACCOUNT_CONFIG.workflowConfig.farm),
        friend: normalizeWorkflowLane(raw.friend, fallback.friend || DEFAULT_ACCOUNT_CONFIG.workflowConfig.friend),
    };
}

function normalizePlantingFallbackStrategy(strategy, fallback = DEFAULT_ACCOUNT_CONFIG.plantingFallbackStrategy) {
    const normalized = String(strategy || '').trim();
    return ALLOWED_PLANTING_FALLBACK_STRATEGIES.includes(normalized) ? normalized : fallback;
}

function normalizePlantingStrategy(strategy, fallback = DEFAULT_ACCOUNT_CONFIG.plantingStrategy) {
    const normalized = String(strategy || '').trim();
    return ALLOWED_PLANTING_STRATEGIES.includes(normalized) ? normalized : fallback;
}

function normalizeBagSeedFallbackStrategy(strategy, fallback = DEFAULT_ACCOUNT_CONFIG.bagSeedFallbackStrategy) {
    const normalized = String(strategy || '').trim();
    return ALLOWED_BAG_SEED_FALLBACK_STRATEGIES.includes(normalized) ? normalized : fallback;
}

function normalizeBagSeedPriority(priority, fallbackPriority = DEFAULT_ACCOUNT_CONFIG.bagSeedPriority) {
    const source = Array.isArray(priority)
        ? priority
        : (Array.isArray(fallbackPriority) ? fallbackPriority : []);
    const seen = new Set();
    return source
        .map((seedId) => Math.max(0, Number.parseInt(seedId, 10) || 0))
        .filter((seedId) => {
            if (seedId <= 0 || seen.has(seedId)) return false;
            seen.add(seedId);
            return true;
        });
}

function normalizeAccountMode(mode, fallback = DEFAULT_ACCOUNT_CONFIG.accountMode) {
    const normalized = String(mode || '').trim().toLowerCase();
    return ACCOUNT_MODE_PRESETS[normalized] ? normalized : fallback;
}

function getAccountModePreset(mode) {
    return ACCOUNT_MODE_PRESETS[normalizeAccountMode(mode)] || ACCOUNT_MODE_PRESETS.main;
}

function normalizeHarvestDelay(delay, fallbackDelay = DEFAULT_ACCOUNT_CONFIG.harvestDelay, mode = DEFAULT_ACCOUNT_CONFIG.accountMode) {
    const fallback = (fallbackDelay && typeof fallbackDelay === 'object')
        ? fallbackDelay
        : getAccountModePreset(mode).harvestDelay;
    const src = (delay && typeof delay === 'object') ? delay : {};
    let min = Math.max(0, Number.parseInt(src.min, 10));
    let max = Math.max(0, Number.parseInt(src.max, 10));
    if (!Number.isFinite(min)) min = Math.max(0, Number.parseInt(fallback.min, 10) || 0);
    if (!Number.isFinite(max)) max = Math.max(0, Number.parseInt(fallback.max, 10) || 0);
    if (min > max) [min, max] = [max, min];
    return { min, max };
}

function normalizeModeScope(scope, fallbackScope = DEFAULT_MODE_SCOPE) {
    const src = (scope && typeof scope === 'object') ? scope : {};
    const fallback = (fallbackScope && typeof fallbackScope === 'object') ? fallbackScope : DEFAULT_MODE_SCOPE;
    return {
        zoneScope: String(src.zoneScope !== undefined ? src.zoneScope : fallback.zoneScope || DEFAULT_MODE_SCOPE.zoneScope).trim().toLowerCase() === 'all_zones'
            ? 'all_zones'
            : DEFAULT_MODE_SCOPE.zoneScope,
        requiresGameFriend: src.requiresGameFriend !== undefined
            ? !!src.requiresGameFriend
            : (fallback.requiresGameFriend !== undefined ? !!fallback.requiresGameFriend : DEFAULT_MODE_SCOPE.requiresGameFriend),
        fallbackBehavior: String(src.fallbackBehavior !== undefined ? src.fallbackBehavior : fallback.fallbackBehavior || DEFAULT_MODE_SCOPE.fallbackBehavior).trim().toLowerCase() === 'strict_block'
            ? 'strict_block'
            : DEFAULT_MODE_SCOPE.fallbackBehavior,
    };
}

function normalizeInventoryPlanting(rawConfig, fallbackConfig = DEFAULT_INVENTORY_PLANTING) {
    const raw = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
    const fallback = (fallbackConfig && typeof fallbackConfig === 'object') ? fallbackConfig : DEFAULT_INVENTORY_PLANTING;
    const reserveRulesSource = Array.isArray(raw.reserveRules)
        ? raw.reserveRules
        : (Array.isArray(fallback.reserveRules) ? fallback.reserveRules : []);
    const seen = new Set();
    const reserveRules = reserveRulesSource
        .map((rule) => ({
            seedId: Math.max(0, Number.parseInt(rule && rule.seedId, 10) || 0),
            keepCount: Math.max(0, Number.parseInt(rule && rule.keepCount, 10) || 0),
        }))
        .filter((rule) => {
            if (rule.seedId <= 0 || seen.has(rule.seedId)) return false;
            seen.add(rule.seedId);
            return true;
        });

    const fallbackMode = ALLOWED_INVENTORY_PLANTING_MODES.includes(String(fallback.mode || ''))
        ? String(fallback.mode)
        : DEFAULT_INVENTORY_PLANTING.mode;
    return {
        mode: ALLOWED_INVENTORY_PLANTING_MODES.includes(String(raw.mode || ''))
            ? String(raw.mode)
            : fallbackMode,
        globalKeepCount: Math.max(0, Number.parseInt(
            raw.globalKeepCount !== undefined ? raw.globalKeepCount : fallback.globalKeepCount,
            10,
        ) || 0),
        reserveRules,
    };
}

function resolveAccountZone(platform) {
    const normalized = String(platform || '').trim().toLowerCase();
    if (normalized === 'qq' || normalized.startsWith('qq_')) return 'qq';
    if (normalized.startsWith('wx')) return 'wx';
    if (normalized) return normalized;
    return 'unknown_zone';
}

function normalizeTradeConfig(rawTrade, fallbackTrade = DEFAULT_TRADE_CONFIG) {
    const raw = (rawTrade && typeof rawTrade === 'object') ? rawTrade : {};
    const fallback = (fallbackTrade && typeof fallbackTrade === 'object') ? fallbackTrade : DEFAULT_TRADE_CONFIG;
    const rawSell = (raw.sell && typeof raw.sell === 'object') ? raw.sell : {};
    const fallbackSell = (fallback.sell && typeof fallback.sell === 'object') ? fallback.sell : DEFAULT_TRADE_CONFIG.sell;
    const rawRareKeep = (rawSell.rareKeep && typeof rawSell.rareKeep === 'object') ? rawSell.rareKeep : {};
    const fallbackRareKeep = (fallbackSell.rareKeep && typeof fallbackSell.rareKeep === 'object')
        ? fallbackSell.rareKeep
        : DEFAULT_TRADE_CONFIG.sell.rareKeep;
    const judgeBy = new Set(['plant_level', 'unit_price', 'either']).has(String(rawRareKeep.judgeBy || ''))
        ? String(rawRareKeep.judgeBy)
        : String(fallbackRareKeep.judgeBy || DEFAULT_TRADE_CONFIG.sell.rareKeep.judgeBy);

    return {
        sell: {
            scope: 'fruit_only',
            keepMinEachFruit: clampInteger(rawSell.keepMinEachFruit, fallbackSell.keepMinEachFruit, 0, 999999),
            keepFruitIds: normalizeTradeKeepFruitIds(rawSell.keepFruitIds, fallbackSell.keepFruitIds),
            rareKeep: {
                enabled: rawRareKeep.enabled !== undefined ? !!rawRareKeep.enabled : !!fallbackRareKeep.enabled,
                judgeBy,
                minPlantLevel: clampInteger(rawRareKeep.minPlantLevel, fallbackRareKeep.minPlantLevel, 0, 999),
                minUnitPrice: clampInteger(rawRareKeep.minUnitPrice, fallbackRareKeep.minUnitPrice, 0, 999999999),
            },
            batchSize: clampInteger(rawSell.batchSize, fallbackSell.batchSize, 1, 50),
            previewBeforeManualSell: rawSell.previewBeforeManualSell !== undefined
                ? !!rawSell.previewBeforeManualSell
                : !!fallbackSell.previewBeforeManualSell,
        },
    };
}

function normalizeAutomationValue(key, value, fallback) {
    if (key === 'fertilizer') {
        return FERTILIZER_OPTIONS.has(value) ? value : fallback;
    }
    if (key === 'fertilizer_buy_limit') {
        const parsed = Number.parseInt(value, 10);
        const next = Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
        return Math.max(1, Math.min(9999, Number.isFinite(next) ? next : 100));
    }
    if (key === 'fertilizer_buy_type') {
        const normalized = String(value || '').trim().toLowerCase();
        return ALLOWED_FERTILIZER_BUY_TYPES.has(normalized)
            ? normalized
            : String(fallback || DEFAULT_ACCOUNT_CONFIG.automation.fertilizer_buy_type);
    }
    if (key === 'fertilizer_buy_mode') {
        const normalized = String(value || '').trim().toLowerCase();
        return ALLOWED_FERTILIZER_BUY_MODES.has(normalized)
            ? normalized
            : String(fallback || DEFAULT_ACCOUNT_CONFIG.automation.fertilizer_buy_mode);
    }
    if (key === 'fertilizer_buy_threshold_normal' || key === 'fertilizer_buy_threshold_organic') {
        const parsed = Number.parseInt(value, 10);
        const next = Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
        return Math.max(0, Math.min(9999, Number.isFinite(next) ? next : 24));
    }
    if (key === 'landUpgradeTarget') {
        const parsed = Number.parseInt(value, 10);
        const next = Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
        return Math.max(0, Math.min(6, Number.isFinite(next) ? next : 6));
    }
    return !!value;
}

function normalizeQqHighRiskWindow(rawWindow, fallbackWindow = DEFAULT_QQ_HIGH_RISK_WINDOW) {
    const raw = (rawWindow && typeof rawWindow === 'object') ? rawWindow : {};
    const fallback = (fallbackWindow && typeof fallbackWindow === 'object')
        ? fallbackWindow
        : DEFAULT_QQ_HIGH_RISK_WINDOW;
    const durationMinutes = clampInteger(
        raw.durationMinutes,
        fallback.durationMinutes,
        QQ_HIGH_RISK_WINDOW_MIN_MINUTES,
        QQ_HIGH_RISK_WINDOW_MAX_MINUTES,
    );
    return {
        durationMinutes,
        expiresAt: Math.max(0, Number.parseInt(raw.expiresAt, 10) || Math.max(0, Number.parseInt(fallback.expiresAt, 10) || 0)),
        lastIssuedAt: Math.max(0, Number.parseInt(raw.lastIssuedAt, 10) || Math.max(0, Number.parseInt(fallback.lastIssuedAt, 10) || 0)),
        lastAutoDisabledAt: Math.max(0, Number.parseInt(raw.lastAutoDisabledAt, 10) || Math.max(0, Number.parseInt(fallback.lastAutoDisabledAt, 10) || 0)),
        lastAutoDisabledNoticeAt: Math.max(0, Number.parseInt(raw.lastAutoDisabledNoticeAt, 10) || Math.max(0, Number.parseInt(fallback.lastAutoDisabledNoticeAt, 10) || 0)),
    };
}

function resolveAccountPlatform(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return '';
    const data = getAccounts();
    const accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
    const account = accounts.find(item => String(item && item.id || '').trim() === id);
    return String(account && account.platform || '').trim().toLowerCase();
}

function isQqAccount(accountId) {
    return resolveAccountPlatform(accountId) === 'qq';
}

function getQqHighRiskState(cfg) {
    const automation = (cfg && cfg.automation && typeof cfg.automation === 'object') ? cfg.automation : {};
    const stakeoutSteal = (cfg && cfg.stakeoutSteal && typeof cfg.stakeoutSteal === 'object') ? cfg.stakeoutSteal : {};
    return {
        fertilizer_60s_anti_steal: !!automation.fertilizer_60s_anti_steal,
        fastHarvest: !!automation.fastHarvest,
        qqFriendFetchMultiChain: !!automation.qqFriendFetchMultiChain,
        stakeoutSteal: !!stakeoutSteal.enabled,
    };
}

function hasQqHighRiskEnabled(cfg) {
    return Object.values(getQqHighRiskState(cfg)).some(Boolean);
}

function disableQqHighRiskFlags(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    cfg.automation = {
        ...(cfg.automation || {}),
        fertilizer_60s_anti_steal: false,
        fastHarvest: false,
        qqFriendFetchMultiChain: false,
    };
    cfg.stakeoutSteal = {
        ...(cfg.stakeoutSteal || DEFAULT_ACCOUNT_CONFIG.stakeoutSteal),
        enabled: false,
    };
    return cfg;
}

function finalizeQqHighRiskWindow(accountId, current, next) {
    const currentWindow = normalizeQqHighRiskWindow(current && current.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);
    const requestedWindow = normalizeQqHighRiskWindow(next && next.qqHighRiskWindow, currentWindow);
    next.qqHighRiskWindow = {
        ...currentWindow,
        durationMinutes: requestedWindow.durationMinutes,
    };

    if (!accountId || !isQqAccount(accountId)) {
        next.qqHighRiskWindow.expiresAt = 0;
        return next;
    }

    const currentState = getQqHighRiskState(current);
    const nextState = getQqHighRiskState(next);
    const hasAnyEnabled = Object.values(nextState).some(Boolean);

    if (!hasAnyEnabled) {
        next.qqHighRiskWindow.expiresAt = 0;
        return next;
    }

    const hasNewEnable = Object.keys(nextState).some((key) => !currentState[key] && nextState[key]);
    if (hasNewEnable) {
        const now = Date.now();
        next.qqHighRiskWindow.lastIssuedAt = now;
        next.qqHighRiskWindow.expiresAt = now + (next.qqHighRiskWindow.durationMinutes * 60 * 1000);
        return next;
    }

    if (next.qqHighRiskWindow.expiresAt > 0 && next.qqHighRiskWindow.expiresAt <= Date.now()) {
        disableQqHighRiskFlags(next);
        next.qqHighRiskWindow.expiresAt = 0;
        next.qqHighRiskWindow.lastAutoDisabledAt = Date.now();
    }
    return next;
}

function enforceQqHighRiskWindow(accountId, snapshot, options = {}) {
    const id = resolveAccountId(accountId);
    if (!id) return snapshot;

    const cfg = cloneAccountConfig(snapshot || DEFAULT_ACCOUNT_CONFIG);
    cfg.qqHighRiskWindow = normalizeQqHighRiskWindow(cfg.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);

    if (!isQqAccount(id)) {
        cfg.qqHighRiskWindow.expiresAt = 0;
        return cfg;
    }

    const hasAnyEnabled = hasQqHighRiskEnabled(cfg);
    if (!hasAnyEnabled) {
        if (cfg.qqHighRiskWindow.expiresAt > 0) {
            cfg.qqHighRiskWindow.expiresAt = 0;
        }
        return cfg;
    }

    if (cfg.qqHighRiskWindow.expiresAt > Date.now()) {
        return cfg;
    }

    const expiredAt = cfg.qqHighRiskWindow.expiresAt || cfg.qqHighRiskWindow.lastIssuedAt || 0;
    disableQqHighRiskFlags(cfg);
    cfg.qqHighRiskWindow.expiresAt = 0;
    cfg.qqHighRiskWindow.lastAutoDisabledAt = Date.now();

    if (options.persist !== false) {
        setAccountConfigSnapshot(id, cfg, false);
        saveGlobalConfig();
        getStoreLogger().warn('QQ 高风险临时窗口已到期，已自动回退配置', {
            accountId: id,
            expiredAt,
            autoDisabledAt: cfg.qqHighRiskWindow.lastAutoDisabledAt,
        });
    }

    return cfg;
}

function consumeQqHighRiskAutoDisableNotice(accountId) {
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) return null;

    const snapshot = getAccountConfigSnapshot(id);
    const windowState = normalizeQqHighRiskWindow(snapshot.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);
    if (!windowState.lastAutoDisabledAt) {
        return null;
    }
    if (windowState.lastAutoDisabledNoticeAt >= windowState.lastAutoDisabledAt) {
        return null;
    }

    const stored = normalizeAccountConfig(globalConfig.accountConfigs[id], accountFallbackConfig);
    stored.qqHighRiskWindow = {
        ...normalizeQqHighRiskWindow(stored.qqHighRiskWindow, windowState),
        lastAutoDisabledNoticeAt: windowState.lastAutoDisabledAt,
    };
    setAccountConfigSnapshot(id, stored, false);
    saveGlobalConfig();

    return {
        accountId: id,
        autoDisabledAt: windowState.lastAutoDisabledAt,
        lastIssuedAt: windowState.lastIssuedAt,
        durationMinutes: windowState.durationMinutes,
        labels: [
            '60秒施肥(防偷)',
            '成熟秒收取',
            '精准蹲守偷菜',
            'QQ 多链路好友拉取',
        ],
    };
}

function cloneAccountConfig(base = DEFAULT_ACCOUNT_CONFIG) {
    const srcAutomation = (base && base.automation && typeof base.automation === 'object')
        ? base.automation
        : {};
    const automation = { ...DEFAULT_ACCOUNT_CONFIG.automation };
    for (const key of Object.keys(automation)) {
        if (srcAutomation[key] !== undefined) {
            automation[key] = normalizeAutomationValue(key, srcAutomation[key], automation[key]);
        }
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
    const qqHighRiskWindow = normalizeQqHighRiskWindow(base.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);
    const skipStealRadish = (base.skipStealRadish && typeof base.skipStealRadish === 'object')
        ? { enabled: !!base.skipStealRadish.enabled }
        : DEFAULT_ACCOUNT_CONFIG.skipStealRadish;
    const forceGetAll = (base.forceGetAll && typeof base.forceGetAll === 'object')
        ? { enabled: !!base.forceGetAll.enabled }
        : DEFAULT_ACCOUNT_CONFIG.forceGetAll;
    const accountMode = normalizeAccountMode(base.accountMode, DEFAULT_ACCOUNT_CONFIG.accountMode);
    const modeScope = normalizeModeScope(base.modeScope, DEFAULT_MODE_SCOPE);
    const harvestDelay = normalizeHarvestDelay(base.harvestDelay, getAccountModePreset(accountMode).harvestDelay, accountMode);
    return {
        ...base,
        automation,
        accountMode,
        harvestDelay,
        riskPromptEnabled: base.riskPromptEnabled !== false,
        modeScope,
        intervals: { ...(base.intervals || DEFAULT_ACCOUNT_CONFIG.intervals) },
        friendQuietHours: { ...(base.friendQuietHours || DEFAULT_ACCOUNT_CONFIG.friendQuietHours) },
        friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
        plantingStrategy: normalizePlantingStrategy(base.plantingStrategy),
        plantingFallbackStrategy: normalizePlantingFallbackStrategy(base.plantingFallbackStrategy),
        preferredSeedId: Math.max(0, Number.parseInt(base.preferredSeedId, 10) || 0),
        bagSeedPriority: normalizeBagSeedPriority(base.bagSeedPriority),
        bagSeedFallbackStrategy: normalizeBagSeedFallbackStrategy(base.bagSeedFallbackStrategy),
        inventoryPlanting: normalizeInventoryPlanting(base.inventoryPlanting, DEFAULT_INVENTORY_PLANTING),
        stealFilter,
        stealFriendFilter,
        stakeoutSteal,
        qqHighRiskWindow,
        skipStealRadish,
        forceGetAll,
        workflowConfig: normalizeWorkflowConfig(base.workflowConfig, DEFAULT_ACCOUNT_CONFIG.workflowConfig),
        tradeConfig: normalizeTradeConfig(base.tradeConfig, DEFAULT_ACCOUNT_CONFIG.tradeConfig),
        reportConfig: normalizeReportConfig(base.reportConfig, DEFAULT_ACCOUNT_CONFIG.reportConfig),
        reportState: normalizeReportState(base.reportState, DEFAULT_ACCOUNT_CONFIG.reportState),
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
    const hasAccountModeUpdate = src.accountMode !== undefined;

    if (hasAccountModeUpdate) {
        cfg.accountMode = normalizeAccountMode(src.accountMode, cfg.accountMode || DEFAULT_ACCOUNT_CONFIG.accountMode);
    }
    cfg.harvestDelay = normalizeHarvestDelay(
        src.harvestDelay !== undefined
            ? src.harvestDelay
            : (hasAccountModeUpdate ? getAccountModePreset(cfg.accountMode).harvestDelay : cfg.harvestDelay),
        cfg.harvestDelay || getAccountModePreset(cfg.accountMode).harvestDelay,
        cfg.accountMode,
    );
    if (src.riskPromptEnabled !== undefined) {
        cfg.riskPromptEnabled = !!src.riskPromptEnabled;
    }
    if (src.modeScope && typeof src.modeScope === 'object') {
        cfg.modeScope = normalizeModeScope(src.modeScope, cfg.modeScope || DEFAULT_MODE_SCOPE);
    } else {
        cfg.modeScope = normalizeModeScope(cfg.modeScope, DEFAULT_MODE_SCOPE);
    }

    if (src.automation && typeof src.automation === 'object') {
        for (const [k, v] of Object.entries(src.automation)) {
            if (!ALLOWED_AUTOMATION_KEYS.has(k)) continue;
            cfg.automation[k] = normalizeAutomationValue(k, v, cfg.automation[k]);
        }
    }

    if (src.plantingStrategy !== undefined) {
        cfg.plantingStrategy = normalizePlantingStrategy(src.plantingStrategy, cfg.plantingStrategy);
    }
    if (src.plantingFallbackStrategy !== undefined) {
        cfg.plantingFallbackStrategy = normalizePlantingFallbackStrategy(src.plantingFallbackStrategy, cfg.plantingFallbackStrategy);
    }

    if (src.preferredSeedId !== undefined && src.preferredSeedId !== null) {
        cfg.preferredSeedId = Math.max(0, Number.parseInt(src.preferredSeedId, 10) || 0);
    }
    if (src.bagSeedPriority !== undefined) {
        cfg.bagSeedPriority = normalizeBagSeedPriority(src.bagSeedPriority, cfg.bagSeedPriority);
    } else {
        cfg.bagSeedPriority = normalizeBagSeedPriority(cfg.bagSeedPriority, DEFAULT_ACCOUNT_CONFIG.bagSeedPriority);
    }
    if (src.bagSeedFallbackStrategy !== undefined) {
        cfg.bagSeedFallbackStrategy = normalizeBagSeedFallbackStrategy(src.bagSeedFallbackStrategy, cfg.bagSeedFallbackStrategy);
    }
    if (src.inventoryPlanting && typeof src.inventoryPlanting === 'object') {
        cfg.inventoryPlanting = normalizeInventoryPlanting(src.inventoryPlanting, cfg.inventoryPlanting || DEFAULT_INVENTORY_PLANTING);
    } else {
        cfg.inventoryPlanting = normalizeInventoryPlanting(cfg.inventoryPlanting, DEFAULT_INVENTORY_PLANTING);
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
    if (src.qqHighRiskWindow && typeof src.qqHighRiskWindow === 'object') {
        cfg.qqHighRiskWindow = normalizeQqHighRiskWindow(src.qqHighRiskWindow, cfg.qqHighRiskWindow || DEFAULT_QQ_HIGH_RISK_WINDOW);
    } else {
        cfg.qqHighRiskWindow = normalizeQqHighRiskWindow(cfg.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);
    }
    if (src.skipStealRadish && typeof src.skipStealRadish === 'object') {
        cfg.skipStealRadish = { enabled: !!src.skipStealRadish.enabled };
    }
    if (src.forceGetAll && typeof src.forceGetAll === 'object') {
        cfg.forceGetAll = { enabled: !!src.forceGetAll.enabled };
    }
    if (src.workflowConfig && typeof src.workflowConfig === 'object') {
        cfg.workflowConfig = normalizeWorkflowConfig(src.workflowConfig, cfg.workflowConfig || DEFAULT_ACCOUNT_CONFIG.workflowConfig);
    } else {
        cfg.workflowConfig = normalizeWorkflowConfig(cfg.workflowConfig, DEFAULT_ACCOUNT_CONFIG.workflowConfig);
    }

    if (src.tradeConfig && typeof src.tradeConfig === 'object') {
        cfg.tradeConfig = normalizeTradeConfig(src.tradeConfig, cfg.tradeConfig || DEFAULT_ACCOUNT_CONFIG.tradeConfig);
    } else {
        cfg.tradeConfig = normalizeTradeConfig(cfg.tradeConfig, DEFAULT_ACCOUNT_CONFIG.tradeConfig);
    }

    if (src.reportConfig && typeof src.reportConfig === 'object') {
        cfg.reportConfig = normalizeReportConfig(src.reportConfig, cfg.reportConfig || DEFAULT_ACCOUNT_CONFIG.reportConfig);
    } else {
        cfg.reportConfig = normalizeReportConfig(cfg.reportConfig, DEFAULT_ACCOUNT_CONFIG.reportConfig);
    }

    if (src.reportState && typeof src.reportState === 'object') {
        cfg.reportState = normalizeReportState(src.reportState, cfg.reportState || DEFAULT_ACCOUNT_CONFIG.reportState);
    } else {
        cfg.reportState = normalizeReportState(cfg.reportState, DEFAULT_ACCOUNT_CONFIG.reportState);
    }

    return cfg;
}

function getAccountConfigSnapshot(accountId) {
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) return cloneAccountConfig(accountFallbackConfig);
    const normalized = normalizeAccountConfig(globalConfig.accountConfigs[id], accountFallbackConfig);
    return enforceQqHighRiskWindow(id, normalized);
}

function setAccountConfigSnapshot(accountId, nextConfig, persist = true) {
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) {
        accountFallbackConfig = normalizeAccountConfig(nextConfig, accountFallbackConfig);
        globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
        if (persist) saveGlobalConfig();
        return cloneAccountConfig(accountFallbackConfig);
    }
    globalConfig.accountConfigs[id] = normalizeAccountConfig(nextConfig, accountFallbackConfig);
    captureAccountConfigIdentitySnapshot(id, globalConfig.accountConfigs[id]);
    if (persist) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

function removeAccountConfig(accountId) {
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) return;
    if (globalConfig.accountConfigs[id]) {
        captureAccountConfigIdentitySnapshot(id, globalConfig.accountConfigs[id]);
        delete globalConfig.accountConfigs[id];
        saveGlobalConfig();
    }
}

function ensureAccountConfig(accountId, options = {}) {
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) return null;
    if (globalConfig.accountConfigs[id]) {
        return cloneAccountConfig(globalConfig.accountConfigs[id]);
    }
    const archivedConfig = getArchivedAccountConfig(id);
    if (archivedConfig) {
        globalConfig.accountConfigs[id] = normalizeAccountConfig(archivedConfig, accountFallbackConfig);
    } else {
        globalConfig.accountConfigs[id] = normalizeAccountConfig(globalConfig.defaultAccountConfig, accountFallbackConfig);
        // 新账号默认不施肥（不受历史 defaultAccountConfig 旧值影响）
        if (globalConfig.accountConfigs[id] && globalConfig.accountConfigs[id].automation) {
            globalConfig.accountConfigs[id].automation.fertilizer = 'none';
        }
    }
    captureAccountConfigIdentitySnapshot(id, globalConfig.accountConfigs[id]);
    if (options.persist !== false) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

// 加载全局配置
async function loadGlobalConfigFromDB() {
    if (typeof isMysqlInitialized === 'function' && !isMysqlInitialized()) {
        return false;
    }

    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM account_configs');
        const systemSettings = await getSystemSettings([GLOBAL_CONFIG_SYSTEM_SETTING_KEY]);
        const persistedGlobalConfig = systemSettings[GLOBAL_CONFIG_SYSTEM_SETTING_KEY];
        const hasPersistedGlobalConfig = !!persistedGlobalConfig && typeof persistedGlobalConfig === 'object';

        if (hasPersistedGlobalConfig) {
            applyLoadedGlobalConfig(persistedGlobalConfig);
        } else {
            applyLoadedGlobalConfig(buildSystemGlobalConfigSnapshot());
        }

        const existingAccountConfigs = (globalConfig.accountConfigs && typeof globalConfig.accountConfigs === 'object')
            ? { ...globalConfig.accountConfigs }
            : {};
        accountFallbackConfig = normalizeAccountConfig(globalConfig.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
        globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
        globalConfig.accountConfigs = Object.fromEntries(
            Object.entries(existingAccountConfigs)
                .map(([id, cfg]) => [String(id || '').trim(), normalizeAccountConfig(cfg, accountFallbackConfig)])
                .filter(([id]) => id),
        );
        globalConfig.ui = normalizeUIConfig(globalConfig.ui, DEFAULT_UI_CONFIG);
        globalConfig.offlineReminder = normalizeOfflineReminder(globalConfig.offlineReminder);
        globalConfig.bugReportConfig = normalizeBugReportConfig(globalConfig.bugReportConfig);
        globalConfig.timingConfig = normalizeTimingConfig(globalConfig.timingConfig, DEFAULT_TIMING_CONFIG);
        globalConfig.trialCardConfig = normalizeTrialCardConfig(globalConfig.trialCardConfig, DEFAULT_TRIAL_CARD_CONFIG);
        globalConfig.clusterConfig = normalizeClusterConfig(globalConfig.clusterConfig, DEFAULT_CLUSTER_CONFIG);
        globalConfig.thirdPartyApi = (globalConfig.thirdPartyApi && typeof globalConfig.thirdPartyApi === 'object')
            ? { ...globalConfig.thirdPartyApi }
            : {};

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
                try { adv = JSON.parse(r.advanced_settings); } catch { }
            }
            if (adv.automation && typeof adv.automation === 'object') {
                automation = { ...automation, ...adv.automation };
            }

            globalConfig.accountConfigs[r.account_id] = normalizeAccountConfig({
                accountMode: r.account_mode,
                harvestDelay: {
                    min: r.harvest_delay_min,
                    max: r.harvest_delay_max,
                },
                automation,
                riskPromptEnabled: adv.riskPromptEnabled,
                modeScope: adv.modeScope,
                plantingStrategy: r.planting_strategy,
                plantingFallbackStrategy: adv.plantingFallbackStrategy,
                bagSeedPriority: adv.bagSeedPriority,
                bagSeedFallbackStrategy: adv.bagSeedFallbackStrategy,
                preferredSeedId: r.preferred_seed_id,
                inventoryPlanting: adv.inventoryPlanting,
                intervals: adv.intervals || {},
                friendQuietHours: adv.friendQuietHours || {},
                friendBlacklist: adv.friendBlacklist || [],
                stealFilter: adv.stealFilter,
                stealFriendFilter: adv.stealFriendFilter,
                stakeoutSteal: adv.stakeoutSteal,
                qqHighRiskWindow: adv.qqHighRiskWindow,
                skipStealRadish: adv.skipStealRadish,
                forceGetAll: adv.forceGetAll,
                workflowConfig: adv.workflowConfig,
                tradeConfig: adv.tradeConfig,
                reportConfig: adv.reportConfig,
                reportState: adv.reportState,
            }, accountFallbackConfig);

            if (!hasPersistedGlobalConfig && adv.ui) {
                globalConfig.ui = normalizeUIConfig({ ...globalConfig.ui, ...adv.ui }, globalConfig.ui);
            }

            // 兼容历史上写进 advanced_settings 的全局字段。
            if (!hasPersistedGlobalConfig && adv.offlineReminder) {
                globalConfig.offlineReminder = normalizeOfflineReminder({ ...globalConfig.offlineReminder, ...adv.offlineReminder });
            }
            if (!hasPersistedGlobalConfig && adv.bugReportConfig) {
                globalConfig.bugReportConfig = normalizeBugReportConfig({ ...globalConfig.bugReportConfig, ...adv.bugReportConfig });
            }
            if (!hasPersistedGlobalConfig && adv.timingConfig) {
                globalConfig.timingConfig = normalizeTimingConfig(adv.timingConfig, getTimingConfig());
            }
            if (!hasPersistedGlobalConfig && adv.trialCardConfig) {
                globalConfig.trialCardConfig = normalizeTrialCardConfig(adv.trialCardConfig, getTrialCardConfig());
            }
            if (!hasPersistedGlobalConfig && adv.thirdPartyApi && typeof adv.thirdPartyApi === 'object') {
                globalConfig.thirdPartyApi = { ...globalConfig.thirdPartyApi, ...adv.thirdPartyApi };
            }

            // Cluster Config (optional backwards compat from adv)
            if (!hasPersistedGlobalConfig && adv.clusterConfig) {
                globalConfig.clusterConfig = normalizeClusterConfig({ ...globalConfig.clusterConfig, ...adv.clusterConfig }, globalConfig.clusterConfig);
            }
        }

        repairAccountConfigsFromIdentityArchive();

        if (!hasPersistedGlobalConfig) {
            await setSystemSettings({
                [GLOBAL_CONFIG_SYSTEM_SETTING_KEY]: buildSystemGlobalConfigSnapshot(),
            });
        }

    } catch (e) {
        if (isMysqlPoolUninitializedError(e)) {
            return false;
        }
        logStoreError('加载全局配置失败', e);
        return false;
    }

    return true;
}
let _globalConfigRefreshPromise = null;
let _globalConfigFileLoaded = false;

function loadGlobalConfigFromFile() {
    const stored = readJsonFile(STORE_FILE, () => ({}));
    applyLoadedGlobalConfig(stored, { includeAccountConfigs: true });
}

function applyLoadedGlobalConfig(stored = {}, options = {}) {
    const source = (stored && typeof stored === 'object') ? stored : {};
    const includeAccountConfigs = options.includeAccountConfigs === true;
    const defaultFallback = (globalConfig.defaultAccountConfig && typeof globalConfig.defaultAccountConfig === 'object')
        ? globalConfig.defaultAccountConfig
        : DEFAULT_ACCOUNT_CONFIG;
    const persistedDefault = (source.defaultAccountConfig && typeof source.defaultAccountConfig === 'object')
        ? source.defaultAccountConfig
        : defaultFallback;

    accountFallbackConfig = normalizeAccountConfig(persistedDefault, DEFAULT_ACCOUNT_CONFIG);
    globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);

    if (includeAccountConfigs) {
        const persistedAccountConfigs = (source.accountConfigs && typeof source.accountConfigs === 'object')
            ? source.accountConfigs
            : {};
        const nextAccountConfigs = {};
        for (const [id, cfg] of Object.entries(persistedAccountConfigs)) {
            const sid = String(id || '').trim();
            if (!sid) continue;
            nextAccountConfigs[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
        }
        globalConfig.accountConfigs = nextAccountConfigs;
    }

    globalConfig.accountConfigIdentityArchive = normalizeAccountConfigIdentityArchive(
        source.accountConfigIdentityArchive !== undefined
            ? source.accountConfigIdentityArchive
            : globalConfig.accountConfigIdentityArchive,
    );

    globalConfig.ui = normalizeUIConfig(source.ui, globalConfig.ui || DEFAULT_UI_CONFIG);
    globalConfig.offlineReminder = normalizeOfflineReminder(source.offlineReminder !== undefined ? source.offlineReminder : globalConfig.offlineReminder);
    globalConfig.bugReportConfig = normalizeBugReportConfig(source.bugReportConfig !== undefined ? source.bugReportConfig : globalConfig.bugReportConfig);
    globalConfig.adminPasswordHash = source.adminPasswordHash !== undefined
        ? String(source.adminPasswordHash || '')
        : String(globalConfig.adminPasswordHash || '');
    globalConfig.thirdPartyApi = (source.thirdPartyApi && typeof source.thirdPartyApi === 'object')
        ? { ...source.thirdPartyApi }
        : ((globalConfig.thirdPartyApi && typeof globalConfig.thirdPartyApi === 'object') ? { ...globalConfig.thirdPartyApi } : {});
    globalConfig.timingConfig = normalizeTimingConfig(source.timingConfig, globalConfig.timingConfig || DEFAULT_TIMING_CONFIG);
    globalConfig.trialCardConfig = normalizeTrialCardConfig(source.trialCardConfig, globalConfig.trialCardConfig || DEFAULT_TRIAL_CARD_CONFIG);
    globalConfig.clusterConfig = normalizeClusterConfig(source.clusterConfig, globalConfig.clusterConfig || DEFAULT_CLUSTER_CONFIG);
    globalConfig.suspendUntilMap = (source.suspendUntilMap && typeof source.suspendUntilMap === 'object')
        ? { ...source.suspendUntilMap }
        : ((globalConfig.suspendUntilMap && typeof globalConfig.suspendUntilMap === 'object') ? { ...globalConfig.suspendUntilMap } : {});
}

function buildSystemGlobalConfigSnapshot() {
    refreshAccountConfigIdentityArchiveFromCurrentAccounts();
    return {
        defaultAccountConfig: cloneAccountConfig(accountFallbackConfig),
        accountConfigIdentityArchive: cloneAccountConfigIdentityArchive(),
        ui: getUI(),
        offlineReminder: getOfflineReminder(),
        bugReportConfig: serializeBugReportConfigForPersistence(globalConfig.bugReportConfig),
        adminPasswordHash: String(globalConfig.adminPasswordHash || ''),
        thirdPartyApi: { ...(globalConfig.thirdPartyApi || {}) },
        timingConfig: getTimingConfig(),
        trialCardConfig: getTrialCardConfig(),
        clusterConfig: normalizeClusterConfig(globalConfig.clusterConfig, DEFAULT_CLUSTER_CONFIG),
        suspendUntilMap: { ...(globalConfig.suspendUntilMap || {}) },
    };
}

function buildLegacyStoreFileSnapshot() {
    const systemSnapshot = buildSystemGlobalConfigSnapshot();
    return {
        ...systemSnapshot,
        accountConfigs: Object.fromEntries(
            Object.entries(globalConfig.accountConfigs || {})
                .map(([id, cfg]) => [String(id || '').trim(), cloneAccountConfig(cfg)])
                .filter(([id]) => id),
        ),
    };
}

function ensureGlobalConfigFileLoaded() {
    if (_globalConfigFileLoaded) {
        return false;
    }
    loadGlobalConfigFromFile();
    _globalConfigFileLoaded = true;
    return true;
}

function ensureStoreFallbackLoaded() {
    ensureGlobalConfigFileLoaded();
}

function isMysqlPoolUninitializedError(error) {
    const message = String(error && error.message ? error.message : '');
    return message.includes('MySQL pool is not initialized');
}

let storeLogger = null;

function getStoreLogger() {
    if (storeLogger) {
        return storeLogger;
    }

    try {
        storeLogger = createModuleLogger('store');
    } catch {
        storeLogger = {
            info() { },
            warn() { },
            error() { },
            debug() { },
        };
    }

    return storeLogger;
}

function logStoreError(message, error, meta = {}) {
    getStoreLogger().error(message, {
        ...meta,
        error: error && error.message ? error.message : String(error || ''),
    });
}

function initStoreRuntime(options = {}) {
    ensureGlobalConfigFileLoaded();

    if (options.refreshFromDb === false) {
        return Promise.resolve(false);
    }

    if (!_globalConfigRefreshPromise) {
        _globalConfigRefreshPromise = loadGlobalConfigFromDB()
            .catch(() => undefined)
            .finally(() => {
                _globalConfigRefreshPromise = null;
            });
    }

    return _globalConfigRefreshPromise;
}

function sanitizeGlobalConfigBeforeSave() {
    // default 配置统一白名单净化
    accountFallbackConfig = normalizeAccountConfig(globalConfig.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
    globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
    globalConfig.ui = normalizeUIConfig(globalConfig.ui, DEFAULT_UI_CONFIG);
    globalConfig.offlineReminder = normalizeOfflineReminder(globalConfig.offlineReminder);
    globalConfig.bugReportConfig = normalizeBugReportConfig(globalConfig.bugReportConfig);
    globalConfig.adminPasswordHash = String(globalConfig.adminPasswordHash || '');
    globalConfig.timingConfig = normalizeTimingConfig(globalConfig.timingConfig, DEFAULT_TIMING_CONFIG);
    globalConfig.trialCardConfig = normalizeTrialCardConfig(globalConfig.trialCardConfig, DEFAULT_TRIAL_CARD_CONFIG);
    globalConfig.clusterConfig = normalizeClusterConfig(globalConfig.clusterConfig, DEFAULT_CLUSTER_CONFIG);
    globalConfig.thirdPartyApi = (globalConfig.thirdPartyApi && typeof globalConfig.thirdPartyApi === 'object')
        ? { ...globalConfig.thirdPartyApi }
        : {};
    globalConfig.suspendUntilMap = (globalConfig.suspendUntilMap && typeof globalConfig.suspendUntilMap === 'object')
        ? Object.fromEntries(
            Object.entries(globalConfig.suspendUntilMap)
                .map(([id, value]) => [String(id || '').trim(), Number(value) || 0])
                .filter(([id]) => id),
        )
        : {};

    const currentAccountIds = new Set(
        normalizeAccountsData(loadAccounts()).accounts
            .map(acc => String((acc && acc.id) || '').trim())
            .filter(Boolean)
    );
    const hasLoadedAccountSnapshot = _accountsLoadedAt > 0;

    // 每个账号配置也统一净化
    const map = (globalConfig.accountConfigs && typeof globalConfig.accountConfigs === 'object')
        ? globalConfig.accountConfigs
        : {};
    const nextMap = {};
    for (const [id, cfg] of Object.entries(map)) {
        const sid = String(id || '').trim();
        if (!sid) continue;
        if (hasLoadedAccountSnapshot && !currentAccountIds.has(sid)) continue;
        nextMap[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
    }
    globalConfig.accountConfigs = nextMap;
    refreshAccountConfigIdentityArchiveFromCurrentAccounts();
}

// 保存全局配置 (加入 3000ms 防抖，避免狂刷数据库事务阻塞连接池)
let _globalConfigSaveTimer = null;
let _globalConfigSavePromise = null;
let _globalConfigDirty = false;
async function saveGlobalConfigImmediate() {
    if (_globalConfigSavePromise) {
        return await _globalConfigSavePromise;
    }

    _globalConfigSavePromise = (async () => {
        while (_globalConfigDirty) {
            _globalConfigDirty = false;
            sanitizeGlobalConfigBeforeSave();
            await transaction(async (conn) => {
                for (const [id, cfg] of Object.entries(globalConfig.accountConfigs)) {
                    const advSetting = JSON.stringify({
                        riskPromptEnabled: cfg.riskPromptEnabled !== false,
                        modeScope: normalizeModeScope(cfg.modeScope, DEFAULT_MODE_SCOPE),
                        automation: cfg.automation || {},
                        plantingFallbackStrategy: normalizePlantingFallbackStrategy(cfg.plantingFallbackStrategy),
                        bagSeedPriority: normalizeBagSeedPriority(cfg.bagSeedPriority, DEFAULT_ACCOUNT_CONFIG.bagSeedPriority),
                        bagSeedFallbackStrategy: normalizeBagSeedFallbackStrategy(cfg.bagSeedFallbackStrategy),
                        inventoryPlanting: normalizeInventoryPlanting(cfg.inventoryPlanting, DEFAULT_INVENTORY_PLANTING),
                        intervals: cfg.intervals || {},
                        friendQuietHours: cfg.friendQuietHours || {},
                        friendBlacklist: cfg.friendBlacklist || [],
                        stealFilter: cfg.stealFilter || { enabled: false, mode: 'blacklist', plantIds: [] },
                        stealFriendFilter: cfg.stealFriendFilter || { enabled: false, mode: 'blacklist', friendIds: [] },
                        stakeoutSteal: cfg.stakeoutSteal || { enabled: false, delaySec: 3 },
                        qqHighRiskWindow: normalizeQqHighRiskWindow(cfg.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW),
                        skipStealRadish: cfg.skipStealRadish || { enabled: false },
                        forceGetAll: cfg.forceGetAll || { enabled: false },
                        workflowConfig: normalizeWorkflowConfig(cfg.workflowConfig, DEFAULT_ACCOUNT_CONFIG.workflowConfig),
                        tradeConfig: normalizeTradeConfig(cfg.tradeConfig, DEFAULT_ACCOUNT_CONFIG.tradeConfig),
                        reportConfig: normalizeReportConfig(cfg.reportConfig, DEFAULT_ACCOUNT_CONFIG.reportConfig),
                        reportState: normalizeReportState(cfg.reportState, DEFAULT_ACCOUNT_CONFIG.reportState),
                    });
                    const automationKeys = cfg.automation || {};
                    await conn.query(`
                        INSERT INTO account_configs (account_id, account_mode, harvest_delay_min, harvest_delay_max, planting_strategy, preferred_seed_id,
                        automation_farm, automation_farm_push, automation_land_upgrade,
                        automation_friend, automation_friend_steal, automation_friend_help,
                        automation_friend_bad, automation_task, automation_email,
                        automation_free_gifts, automation_share_reward, automation_vip_gift,
                        automation_month_card, automation_sell, automation_fertilizer,
                        advanced_settings)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        account_mode=VALUES(account_mode), harvest_delay_min=VALUES(harvest_delay_min), harvest_delay_max=VALUES(harvest_delay_max),
                        planting_strategy=VALUES(planting_strategy), preferred_seed_id=VALUES(preferred_seed_id),
                        automation_farm=VALUES(automation_farm), automation_farm_push=VALUES(automation_farm_push), automation_land_upgrade=VALUES(automation_land_upgrade),
                        automation_friend=VALUES(automation_friend), automation_friend_steal=VALUES(automation_friend_steal), automation_friend_help=VALUES(automation_friend_help),
                        automation_friend_bad=VALUES(automation_friend_bad), automation_task=VALUES(automation_task), automation_email=VALUES(automation_email),
                        automation_free_gifts=VALUES(automation_free_gifts), automation_share_reward=VALUES(automation_share_reward), automation_vip_gift=VALUES(automation_vip_gift),
                        automation_month_card=VALUES(automation_month_card), automation_sell=VALUES(automation_sell), automation_fertilizer=VALUES(automation_fertilizer),
                        advanced_settings=VALUES(advanced_settings)
                    `, [
                        id,
                        cfg.accountMode || DEFAULT_ACCOUNT_CONFIG.accountMode,
                        cfg.harvestDelay?.min || 0,
                        cfg.harvestDelay?.max || 0,
                        cfg.plantingStrategy || 'preferred',
                        cfg.preferredSeedId || 0,
                        automationKeys.farm === false ? 0 : 1, automationKeys.farm_push === false ? 0 : 1, automationKeys.land_upgrade === false ? 0 : 1,
                        automationKeys.friend === false ? 0 : 1, automationKeys.friend_steal === false ? 0 : 1, automationKeys.friend_help === false ? 0 : 1,
                        automationKeys.friend_bad === true ? 1 : 0, automationKeys.task === false ? 0 : 1, automationKeys.email === false ? 0 : 1,
                        automationKeys.free_gifts === false ? 0 : 1, automationKeys.share_reward === false ? 0 : 1, automationKeys.vip_gift === false ? 0 : 1,
                        automationKeys.month_card === false ? 0 : 1, automationKeys.sell === false ? 0 : 1, automationKeys.fertilizer || 'none',
                        advSetting
                    ]);
                }

                await setSystemSettings({
                    [GLOBAL_CONFIG_SYSTEM_SETTING_KEY]: buildSystemGlobalConfigSnapshot(),
                }, { conn });
            });
            writeJsonFileAtomic(STORE_FILE, buildLegacyStoreFileSnapshot());
        }
    })();
    try {
        return await _globalConfigSavePromise;
    } catch (e) {
        logStoreError('保存全局配置失败', e);
        throw e;
    } finally {
        if (_globalConfigSavePromise) {
            _globalConfigSavePromise = null;
        }
    }
}

function saveGlobalConfig() {
    _globalConfigDirty = true;
    if (_globalConfigSaveTimer) clearTimeout(_globalConfigSaveTimer);
    _globalConfigSaveTimer = setTimeout(() => {
        _globalConfigSaveTimer = null;
        void saveGlobalConfigImmediate().catch((err) => {
            logStoreError('保存全局配置失败', err);
        });
    }, 3000);
}

async function flushGlobalConfigSave() {
    if (_globalConfigSaveTimer) {
        clearTimeout(_globalConfigSaveTimer);
        _globalConfigSaveTimer = null;
    }

    if (!_globalConfigDirty && !_globalConfigSavePromise) {
        return false;
    }

    await saveGlobalConfigImmediate();
    return true;
}

function getAdminPasswordHash() {
    ensureStoreFallbackLoaded();
    return String(globalConfig.adminPasswordHash || '');
}

function setAdminPasswordHash(hash) {
    ensureStoreFallbackLoaded();
    globalConfig.adminPasswordHash = String(hash || '');
    saveGlobalConfig();
    return globalConfig.adminPasswordHash;
}

function getAutomation(accountId) {
    return { ...getAccountConfigSnapshot(accountId).automation };
}

function getConfigSnapshot(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        accountMode: cfg.accountMode,
        harvestDelay: { ...(cfg.harvestDelay || DEFAULT_ACCOUNT_CONFIG.harvestDelay) },
        riskPromptEnabled: cfg.riskPromptEnabled !== false,
        modeScope: normalizeModeScope(cfg.modeScope, DEFAULT_MODE_SCOPE),
        automation: { ...cfg.automation },
        plantingStrategy: normalizePlantingStrategy(cfg.plantingStrategy),
        plantingFallbackStrategy: cfg.plantingFallbackStrategy,
        preferredSeedId: cfg.preferredSeedId,
        bagSeedPriority: normalizeBagSeedPriority(cfg.bagSeedPriority, DEFAULT_ACCOUNT_CONFIG.bagSeedPriority),
        bagSeedFallbackStrategy: normalizeBagSeedFallbackStrategy(cfg.bagSeedFallbackStrategy),
        inventoryPlanting: normalizeInventoryPlanting(cfg.inventoryPlanting, DEFAULT_INVENTORY_PLANTING),
        intervals: { ...cfg.intervals },
        friendQuietHours: { ...cfg.friendQuietHours },
        friendBlacklist: [...(cfg.friendBlacklist || [])],
        stealFilter: { ...(cfg.stealFilter || DEFAULT_ACCOUNT_CONFIG.stealFilter) },
        stealFriendFilter: { ...(cfg.stealFriendFilter || DEFAULT_ACCOUNT_CONFIG.stealFriendFilter) },
        stakeoutSteal: { ...(cfg.stakeoutSteal || DEFAULT_ACCOUNT_CONFIG.stakeoutSteal) },
        qqHighRiskWindow: normalizeQqHighRiskWindow(cfg.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW),
        skipStealRadish: { ...(cfg.skipStealRadish || DEFAULT_ACCOUNT_CONFIG.skipStealRadish) },
        forceGetAll: { ...(cfg.forceGetAll || DEFAULT_ACCOUNT_CONFIG.forceGetAll) },
        workflowConfig: normalizeWorkflowConfig(cfg.workflowConfig, DEFAULT_ACCOUNT_CONFIG.workflowConfig),
        tradeConfig: normalizeTradeConfig(cfg.tradeConfig, DEFAULT_ACCOUNT_CONFIG.tradeConfig),
        reportConfig: normalizeReportConfig(cfg.reportConfig, DEFAULT_ACCOUNT_CONFIG.reportConfig),
        ui: { ...normalizeUIConfig(globalConfig.ui, DEFAULT_UI_CONFIG) },
    };
}

function applyConfigSnapshot(snapshot, options = {}) {
    const cfg = snapshot || {};
    const persist = options.persist !== false;
    const accountId = options.accountId;

    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    const hasAccountModeUpdate = cfg.accountMode !== undefined;

    if (cfg.timingConfig && typeof cfg.timingConfig === 'object') {
        globalConfig.timingConfig = normalizeTimingConfig(
            cfg.timingConfig,
            globalConfig.timingConfig || DEFAULT_TIMING_CONFIG,
        );
    }

    if (hasAccountModeUpdate) {
        next.accountMode = normalizeAccountMode(cfg.accountMode, next.accountMode);
        if (cfg.harvestDelay === undefined) {
            next.harvestDelay = normalizeHarvestDelay(getAccountModePreset(next.accountMode).harvestDelay, getAccountModePreset(next.accountMode).harvestDelay, next.accountMode);
        }
    }

    if (cfg.harvestDelay && typeof cfg.harvestDelay === 'object') {
        next.harvestDelay = normalizeHarvestDelay(cfg.harvestDelay, next.harvestDelay || getAccountModePreset(next.accountMode).harvestDelay, next.accountMode);
    }

    if (cfg.riskPromptEnabled !== undefined) {
        next.riskPromptEnabled = !!cfg.riskPromptEnabled;
    }

    if (cfg.modeScope && typeof cfg.modeScope === 'object') {
        next.modeScope = normalizeModeScope(cfg.modeScope, next.modeScope || DEFAULT_MODE_SCOPE);
    }

    if (cfg.automation && typeof cfg.automation === 'object') {
        for (const [k, v] of Object.entries(cfg.automation)) {
            if (next.automation[k] === undefined) continue;
            next.automation[k] = normalizeAutomationValue(k, v, next.automation[k]);
        }
    }

    if (cfg.plantingStrategy !== undefined) {
        next.plantingStrategy = normalizePlantingStrategy(cfg.plantingStrategy, next.plantingStrategy);
    }
    if (cfg.plantingFallbackStrategy !== undefined) {
        next.plantingFallbackStrategy = normalizePlantingFallbackStrategy(cfg.plantingFallbackStrategy, next.plantingFallbackStrategy);
    }

    if (cfg.preferredSeedId !== undefined && cfg.preferredSeedId !== null) {
        next.preferredSeedId = Math.max(0, Number.parseInt(cfg.preferredSeedId, 10) || 0);
    }
    if (cfg.bagSeedPriority !== undefined) {
        next.bagSeedPriority = normalizeBagSeedPriority(cfg.bagSeedPriority, next.bagSeedPriority);
    }
    if (cfg.bagSeedFallbackStrategy !== undefined) {
        next.bagSeedFallbackStrategy = normalizeBagSeedFallbackStrategy(cfg.bagSeedFallbackStrategy, next.bagSeedFallbackStrategy);
    }
    if (cfg.inventoryPlanting && typeof cfg.inventoryPlanting === 'object') {
        next.inventoryPlanting = normalizeInventoryPlanting(cfg.inventoryPlanting, next.inventoryPlanting || DEFAULT_INVENTORY_PLANTING);
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
        globalConfig.ui = normalizeUIConfig({ ...globalConfig.ui, ...cfg.ui }, globalConfig.ui || DEFAULT_UI_CONFIG);
    }

    if (cfg.stealFilter && typeof cfg.stealFilter === 'object') {
        next.stealFilter = {
            enabled: !!cfg.stealFilter.enabled,
            mode: cfg.stealFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            plantIds: Array.isArray(cfg.stealFilter.plantIds) ? cfg.stealFilter.plantIds.map(String) : (next.stealFilter?.plantIds || []),
        };
    }

    if (cfg.stealFriendFilter && typeof cfg.stealFriendFilter === 'object') {
        next.stealFriendFilter = {
            enabled: !!cfg.stealFriendFilter.enabled,
            mode: cfg.stealFriendFilter.mode === 'whitelist' ? 'whitelist' : 'blacklist',
            friendIds: Array.isArray(cfg.stealFriendFilter.friendIds) ? cfg.stealFriendFilter.friendIds.map(String) : (next.stealFriendFilter?.friendIds || []),
        };
    }

    if (cfg.stakeoutSteal && typeof cfg.stakeoutSteal === 'object') {
        next.stakeoutSteal = {
            enabled: !!cfg.stakeoutSteal.enabled,
            delaySec: Math.max(0, Number.parseInt(cfg.stakeoutSteal.delaySec, 10) || 0),
        };
    }

    if (cfg.qqHighRiskWindow && typeof cfg.qqHighRiskWindow === 'object') {
        next.qqHighRiskWindow = {
            ...normalizeQqHighRiskWindow(next.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW),
            durationMinutes: normalizeQqHighRiskWindow(cfg.qqHighRiskWindow, next.qqHighRiskWindow || DEFAULT_QQ_HIGH_RISK_WINDOW).durationMinutes,
        };
    } else {
        next.qqHighRiskWindow = normalizeQqHighRiskWindow(next.qqHighRiskWindow, DEFAULT_QQ_HIGH_RISK_WINDOW);
    }

    if (cfg.skipStealRadish && typeof cfg.skipStealRadish === 'object') {
        next.skipStealRadish = { enabled: !!cfg.skipStealRadish.enabled };
    }

    if (cfg.forceGetAll && typeof cfg.forceGetAll === 'object') {
        next.forceGetAll = { enabled: !!cfg.forceGetAll.enabled };
    }

    if (cfg.workflowConfig && typeof cfg.workflowConfig === 'object') {
        next.workflowConfig = normalizeWorkflowConfig(cfg.workflowConfig, next.workflowConfig || DEFAULT_ACCOUNT_CONFIG.workflowConfig);
    }

    if (cfg.tradeConfig && typeof cfg.tradeConfig === 'object') {
        next.tradeConfig = normalizeTradeConfig(cfg.tradeConfig, next.tradeConfig || DEFAULT_ACCOUNT_CONFIG.tradeConfig);
    }

    if (cfg.reportConfig && typeof cfg.reportConfig === 'object') {
        next.reportConfig = normalizeReportConfig(cfg.reportConfig, next.reportConfig || DEFAULT_ACCOUNT_CONFIG.reportConfig);
    }

    if (cfg.reportState && typeof cfg.reportState === 'object') {
        next.reportState = normalizeReportState(cfg.reportState, next.reportState || DEFAULT_ACCOUNT_CONFIG.reportState);
    }

    finalizeQqHighRiskWindow(accountId, current, next);

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

function getInventoryPlanting(accountId) {
    return normalizeInventoryPlanting(getAccountConfigSnapshot(accountId).inventoryPlanting, DEFAULT_INVENTORY_PLANTING);
}

function applyAccountMode(accountId, mode) {
    const normalizedMode = normalizeAccountMode(mode, DEFAULT_ACCOUNT_CONFIG.accountMode);
    const preset = getAccountModePreset(normalizedMode);
    return applyConfigSnapshot({
        accountMode: normalizedMode,
        harvestDelay: preset.harvestDelay,
    }, { accountId });
}

async function ensureMainAccountUnique(accountId, ownerUsername) {
    const normalizedOwner = String(ownerUsername || '').trim();
    const resolvedId = resolveAccountId(accountId);
    if (!resolvedId || !normalizedOwner) return [];
    const accountsData = getAccounts();
    const accounts = Array.isArray(accountsData.accounts) ? accountsData.accounts : [];
    const targetAccount = accounts.find(item => String(item && item.id || '').trim() === resolvedId);
    if (!targetAccount) return [];
    const targetZone = resolveAccountZone(targetAccount.platform);
    const downgraded = [];
    for (const account of accounts) {
        if (!account || typeof account !== 'object') continue;
        const peerId = String(account.id || '').trim();
        if (!peerId || peerId === resolvedId) continue;
        if (String(account.username || '').trim() !== normalizedOwner) continue;
        if (resolveAccountZone(account.platform) !== targetZone) continue;
        const snapshot = getConfigSnapshot(peerId);
        if (normalizeAccountMode(snapshot.accountMode, DEFAULT_ACCOUNT_CONFIG.accountMode) !== 'main') continue;
        applyAccountMode(peerId, 'alt');
        downgraded.push({ ...account, id: peerId });
    }
    return downgraded;
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

    let helpMin = toSec(src.helpMin, friendMin);
    let helpMax = toSec(src.helpMax, friendMax);
    if (helpMin > helpMax) [helpMin, helpMax] = [helpMax, helpMin];

    let stealMin = toSec(src.stealMin, friendMin);
    let stealMax = toSec(src.stealMax, friendMax);
    if (stealMin > stealMax) [stealMin, stealMax] = [stealMax, stealMin];

    return {
        ...src,
        farm,
        friend,
        farmMin,
        farmMax,
        friendMin,
        friendMax,
        helpMin,
        helpMax,
        stealMin,
        stealMax,
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

function getTradeConfig(accountId) {
    return normalizeTradeConfig(getAccountConfigSnapshot(accountId).tradeConfig, DEFAULT_ACCOUNT_CONFIG.tradeConfig);
}

function setTradeConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.tradeConfig = normalizeTradeConfig(cfg, next.tradeConfig || DEFAULT_ACCOUNT_CONFIG.tradeConfig);
    setAccountConfigSnapshot(accountId, next);
    return getTradeConfig(accountId);
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

function getReportConfig(accountId) {
    return { ...(getAccountConfigSnapshot(accountId).reportConfig || DEFAULT_REPORT_CONFIG) };
}

function setReportConfig(accountId, cfg) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.reportConfig = normalizeReportConfig({ ...next.reportConfig, ...(cfg || {}) }, next.reportConfig || DEFAULT_REPORT_CONFIG);
    setAccountConfigSnapshot(accountId, next);
    return getReportConfig(accountId);
}

function getReportState(accountId) {
    return normalizeReportState(getAccountConfigSnapshot(accountId).reportState, DEFAULT_REPORT_STATE);
}

function setReportState(accountId, state) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.reportState = normalizeReportState({ ...next.reportState, ...(state || {}) }, next.reportState || DEFAULT_REPORT_STATE);
    setAccountConfigSnapshot(accountId, next);
    return getReportState(accountId);
}

function getUI() {
    ensureStoreFallbackLoaded();
    return { ...normalizeUIConfig(globalConfig.ui, DEFAULT_UI_CONFIG) };
}

function setUITheme(theme) {
    const t = String(theme || '').toLowerCase();
    const next = (t === 'light' || t === 'auto') ? t : 'dark';
    return applyConfigSnapshot({ ui: { theme: next } });
}

function getOfflineReminder() {
    ensureStoreFallbackLoaded();
    return normalizeOfflineReminder(globalConfig.offlineReminder);
}

function setOfflineReminder(cfg) {
    ensureStoreFallbackLoaded();
    const current = normalizeOfflineReminder(globalConfig.offlineReminder);
    globalConfig.offlineReminder = normalizeOfflineReminder({ ...current, ...(cfg || {}) });
    saveGlobalConfig();
    return getOfflineReminder();
}

function getBugReportConfig() {
    ensureStoreFallbackLoaded();
    return normalizeBugReportConfig(globalConfig.bugReportConfig);
}

function setBugReportConfig(cfg) {
    ensureStoreFallbackLoaded();
    const current = normalizeBugReportConfig(globalConfig.bugReportConfig);
    globalConfig.bugReportConfig = normalizeBugReportConfig({ ...current, ...(cfg || {}) });
    saveGlobalConfig();
    return getBugReportConfig();
}

function parseAccountAuthData(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }
    return {};
}

function normalizeAccountRuntimeSnapshot(raw) {
    const input = (raw && typeof raw === 'object') ? raw : {};
    return {
        level: Math.max(0, Number(input.level) || 0),
        gold: Math.max(0, Number(input.gold) || 0),
        exp: Math.max(0, Number(input.exp) || 0),
        coupon: Math.max(0, Number(input.coupon) || 0),
        uptime: Math.max(0, Number(input.uptime) || 0),
        lastStatusAt: Math.max(0, Number(input.lastStatusAt) || 0),
        lastOnlineAt: Math.max(0, Number(input.lastOnlineAt) || 0),
    };
}

function normalizeAccountWsError(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const code = Math.max(0, Number.parseInt(raw.code, 10) || 0);
    const message = String(raw.message || '').trim();
    const at = Math.max(0, Number(raw.at) || 0);

    if (!code && !message && !at) {
        return null;
    }

    return {
        code,
        message,
        at,
    };
}

function normalizeOptionalTimestamp(value) {
    const time = Math.max(0, Number(value) || 0);
    return time > 0 ? time : null;
}

function normalizeAccountIdentityFields(raw) {
    const input = (raw && typeof raw === 'object') ? raw : {};
    const platform = String(input.platform || 'qq').trim() || 'qq';
    const uin = String(input.uin || '').trim();
    const qq = platform === 'qq'
        ? String(input.qq || uin || '').trim()
        : '';
    return {
        platform,
        uin,
        qq,
        code: String(input.code || ''),
        authTicket: String(input.authTicket || '').trim(),
    };
}

function hasOwnField(source, key) {
    return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function readFieldWithExplicitEmpty(source, key, fallbackValue) {
    if (hasOwnField(source, key)) {
        return source[key];
    }
    return fallbackValue;
}

function buildAccountAuthData(acc) {
    const existing = parseAccountAuthData(acc && acc.authData);
    const identity = normalizeAccountIdentityFields({
        platform: readFieldWithExplicitEmpty(acc, 'platform', existing.platform || 'qq'),
        uin: readFieldWithExplicitEmpty(acc, 'uin', existing.uin || ''),
        qq: readFieldWithExplicitEmpty(acc, 'qq', existing.qq || ''),
        code: readFieldWithExplicitEmpty(acc, 'code', existing.code || ''),
        authTicket: readFieldWithExplicitEmpty(acc, 'authTicket', existing.authTicket || ''),
    });
    const runtimeSource = {
        ...((existing && typeof existing.runtimeSnapshot === 'object') ? existing.runtimeSnapshot : {}),
    };

    ['level', 'gold', 'exp', 'coupon', 'uptime', 'lastStatusAt', 'lastOnlineAt'].forEach((key) => {
        if (acc && acc[key] !== undefined) {
            runtimeSource[key] = acc[key];
        }
    });

    const lastLoginAt = normalizeOptionalTimestamp((acc && acc.lastLoginAt) !== undefined
        ? acc.lastLoginAt
        : existing.lastLoginAt);
    const wsError = normalizeAccountWsError(
        acc && Object.prototype.hasOwnProperty.call(acc, 'wsError')
            ? acc.wsError
            : existing.wsError,
    );

    return {
        ...existing,
        uin: identity.uin,
        qq: identity.qq,
        code: identity.code,
        authTicket: identity.authTicket,
        lastLoginAt,
        wsError,
        runtimeSnapshot: normalizeAccountRuntimeSnapshot(runtimeSource),
    };
}

// ============ 账号管理 ============
async function loadAccountsFromDB() {
    try {
        const refreshVersion = _accountsMutationVersion;
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM accounts');
        const mapped = rows.map((r) => {
            const authData = parseAccountAuthData(r.auth_data);
            const runtimeSnapshot = normalizeAccountRuntimeSnapshot(authData.runtimeSnapshot);
            const wsError = normalizeAccountWsError(authData.wsError);
            const lastLoginAt = normalizeOptionalTimestamp(
                r.last_login_at ? new Date(r.last_login_at).getTime() : authData.lastLoginAt,
            );
            const identity = normalizeAccountIdentityFields({
                platform: r.platform || 'qq',
                uin: decodePersistedAccountUin(r.uin) || authData.uin || '',
                qq: authData.qq || '',
                code: r.code || authData.code || '',
                authTicket: authData.authTicket || '',
            });
            return {
                id: r.id,
                uin: identity.uin,
                code: identity.code,
                nick: r.nick || '',
                name: r.name || '',
                platform: identity.platform,
                running: r.running === 1,
                avatar: r.avatar || '',
                qq: identity.qq,
                authTicket: identity.authTicket,
                username: r.username || '',
                level: runtimeSnapshot.level,
                gold: runtimeSnapshot.gold,
                exp: runtimeSnapshot.exp,
                coupon: runtimeSnapshot.coupon,
                uptime: runtimeSnapshot.uptime,
                wsError,
                lastStatusAt: runtimeSnapshot.lastStatusAt,
                lastOnlineAt: runtimeSnapshot.lastOnlineAt,
                lastLoginAt,
                createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
                updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
            };
        });
        if (refreshVersion !== _accountsMutationVersion) {
            return cachedAccountsData;
        }
        cachedAccountsData = normalizeAccountsData({ accounts: mapped, nextId: 1000 + mapped.length });
        _accountsLoadedAt = Date.now();
        refreshAccountConfigIdentityArchiveFromCurrentAccounts();
        return cachedAccountsData;
    } catch (e) { logStoreError('加载账号数据失败', e); }
    return cachedAccountsData;
}

let cachedAccountsData = { accounts: [], nextId: 1 };
let _accountsLoadedAt = 0;
let _accountsRefreshPromise = null;
let _accountsMutationVersion = 0;
const EMPTY_ACCOUNT_UIN_DB_PREFIX = '__ACCOUNT_ID__:';
const ACCOUNT_CONFIG_IDENTITY_ARCHIVE_LIMIT = 500;

function encodePersistedAccountUin(accountId, value) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
    const normalizedId = String(accountId || '').trim() || '0';
    return `${EMPTY_ACCOUNT_UIN_DB_PREFIX}${normalizedId}`;
}

function decodePersistedAccountUin(value) {
    const normalized = String(value || '').trim();
    if (!normalized.startsWith(EMPTY_ACCOUNT_UIN_DB_PREFIX)) {
        return normalized;
    }
    return '';
}

function loadAccounts() {
    return cachedAccountsData;
}

function cloneAccountsData(data) {
    const normalized = normalizeAccountsData(data);
    return {
        nextId: normalized.nextId,
        accounts: normalized.accounts.map(acc => ({ ...acc })),
    };
}

function getAccountRecordById(accountId) {
    const id = String(accountId || '').trim();
    if (!id) return null;
    const data = loadAccounts();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    return accounts.find(acc => String((acc && acc.id) || '').trim() === id) || null;
}

function buildAccountConfigIdentityKey(input = {}) {
    const platform = String(input.platform || '').trim().toLowerCase();
    const uin = String(input.uin || input.qq || '').trim();
    const username = String(input.username || '').trim();
    if (!platform || !uin) return '';
    return `${username || '__unowned__'}::${platform}::${uin}`;
}

function serializeAccountConfigForIdentityCompare(cfg) {
    return JSON.stringify(normalizeAccountConfig(cfg, accountFallbackConfig));
}

function isDefaultLikeAccountConfig(cfg) {
    return serializeAccountConfigForIdentityCompare(cfg) === serializeAccountConfigForIdentityCompare(accountFallbackConfig);
}

function choosePreferredIdentityConfig(currentCfg, candidateCfg) {
    if (!currentCfg) {
        return normalizeAccountConfig(candidateCfg, accountFallbackConfig);
    }
    if (!candidateCfg) {
        return normalizeAccountConfig(currentCfg, accountFallbackConfig);
    }

    const normalizedCurrent = normalizeAccountConfig(currentCfg, accountFallbackConfig);
    const normalizedCandidate = normalizeAccountConfig(candidateCfg, accountFallbackConfig);
    const currentDefaultLike = isDefaultLikeAccountConfig(normalizedCurrent);
    const candidateDefaultLike = isDefaultLikeAccountConfig(normalizedCandidate);

    if (currentDefaultLike && !candidateDefaultLike) {
        return normalizedCandidate;
    }
    if (!currentDefaultLike && candidateDefaultLike) {
        return normalizedCurrent;
    }
    return normalizedCurrent;
}

function normalizeAccountConfigIdentityArchive(input) {
    const source = (input && typeof input === 'object') ? input : {};
    const normalized = {};
    const entries = Object.entries(source);
    const slicedEntries = entries.length > ACCOUNT_CONFIG_IDENTITY_ARCHIVE_LIMIT
        ? entries.slice(entries.length - ACCOUNT_CONFIG_IDENTITY_ARCHIVE_LIMIT)
        : entries;

    for (const [rawKey, cfg] of slicedEntries) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        normalized[key] = normalizeAccountConfig(cfg, accountFallbackConfig);
    }

    return normalized;
}

function cloneAccountConfigIdentityArchive() {
    return Object.fromEntries(
        Object.entries(normalizeAccountConfigIdentityArchive(globalConfig.accountConfigIdentityArchive))
            .map(([key, cfg]) => [key, cloneAccountConfig(cfg)]),
    );
}

function captureAccountConfigIdentitySnapshot(accountId, cfg, identitySource = null) {
    const account = (identitySource && typeof identitySource === 'object')
        ? identitySource
        : getAccountRecordById(accountId);
    const key = buildAccountConfigIdentityKey(account || {});
    if (!key) return '';
    const sourceConfig = cfg && typeof cfg === 'object'
        ? cfg
        : globalConfig.accountConfigs[String(accountId || '').trim()];
    if (!sourceConfig) return '';
    const nextConfig = choosePreferredIdentityConfig(
        globalConfig.accountConfigIdentityArchive && globalConfig.accountConfigIdentityArchive[key],
        sourceConfig,
    );
    globalConfig.accountConfigIdentityArchive = normalizeAccountConfigIdentityArchive({
        ...(globalConfig.accountConfigIdentityArchive || {}),
        [key]: nextConfig,
    });
    return key;
}

function getArchivedAccountConfig(accountId) {
    const account = getAccountRecordById(accountId);
    const key = buildAccountConfigIdentityKey(account || {});
    if (!key) return null;
    const archived = (globalConfig.accountConfigIdentityArchive && globalConfig.accountConfigIdentityArchive[key]) || null;
    if (!archived) return null;
    return normalizeAccountConfig(archived, accountFallbackConfig);
}

function refreshAccountConfigIdentityArchiveFromCurrentAccounts() {
    const currentArchive = normalizeAccountConfigIdentityArchive(globalConfig.accountConfigIdentityArchive);
    const data = loadAccounts();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const nextArchive = { ...currentArchive };

    for (const account of accounts) {
        const id = String((account && account.id) || '').trim();
        if (!id || !globalConfig.accountConfigs[id]) continue;
        const key = buildAccountConfigIdentityKey(account);
        if (!key) continue;
        nextArchive[key] = choosePreferredIdentityConfig(nextArchive[key], globalConfig.accountConfigs[id]);
    }

    globalConfig.accountConfigIdentityArchive = normalizeAccountConfigIdentityArchive(nextArchive);
    return globalConfig.accountConfigIdentityArchive;
}

function repairAccountConfigsFromIdentityArchive() {
    const archive = refreshAccountConfigIdentityArchiveFromCurrentAccounts();
    const data = loadAccounts();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    let changed = false;

    for (const account of accounts) {
        const id = String((account && account.id) || '').trim();
        if (!id) continue;
        const key = buildAccountConfigIdentityKey(account);
        if (!key || !archive[key]) continue;

        const currentCfg = globalConfig.accountConfigs[id];
        const archivedCfg = archive[key];
        if (!currentCfg) {
            globalConfig.accountConfigs[id] = normalizeAccountConfig(archivedCfg, accountFallbackConfig);
            changed = true;
            continue;
        }

        if (isDefaultLikeAccountConfig(currentCfg) && !isDefaultLikeAccountConfig(archivedCfg)) {
            globalConfig.accountConfigs[id] = normalizeAccountConfig(archivedCfg, accountFallbackConfig);
            changed = true;
        }
    }

    if (changed) {
        refreshAccountConfigIdentityArchiveFromCurrentAccounts();
    }
    return changed;
}

let _accountsSaveTimer = null;
let _pendingAccountPersistIds = new Set();

function queueAccountPersistIds(data, touchedAccountIds) {
    const normalized = normalizeAccountsData(data);
    const ids = Array.isArray(touchedAccountIds)
        ? touchedAccountIds
        : (touchedAccountIds !== undefined && touchedAccountIds !== null ? [touchedAccountIds] : normalized.accounts.map(acc => acc && acc.id));
    ids
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .forEach(id => _pendingAccountPersistIds.add(id));
}

async function persistPendingAccounts(options = {}) {
    const strict = !!(options && options.strict);
    const pool = getPool();
    if (!pool) {
        if (strict) {
            throw new Error('MySQL 连接池不可用，账号未写入数据库');
        }
        return;
    }

    const snapshot = cloneAccountsData(cachedAccountsData);
    const pendingIds = Array.from(_pendingAccountPersistIds);
    if (!pendingIds.length) {
        return { failedIds: [], persistedIds: [] };
    }

    const failedIds = [];
    const failures = [];
    for (const accountId of pendingIds) {
        const acc = snapshot.accounts.find(item => String(item && item.id) === String(accountId));
        if (!acc) {
            continue;
        }

        const identity = normalizeAccountIdentityFields(acc);
        const platform = identity.platform;
        const primaryUin = platform === 'qq'
            ? String(identity.uin || identity.qq || '').trim()
            : String(identity.uin || '').trim();
        const persistedUin = encodePersistedAccountUin(acc.id, primaryUin);
        const lastLoginAt = normalizeOptionalTimestamp(acc.lastLoginAt);
        const authData = JSON.stringify(buildAccountAuthData({
            ...acc,
            ...identity,
        }));
        const normalizedUsername = String(acc.username || '').trim() || null;

        try {
            await pool.query(
                "INSERT INTO accounts (id, uin, nick, name, platform, running, code, username, avatar, last_login_at, auth_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE uin=COALESCE(NULLIF(VALUES(uin),''), uin), nick=VALUES(nick), name=VALUES(name), platform=VALUES(platform), running=VALUES(running), code=COALESCE(NULLIF(VALUES(code),''), code), username=VALUES(username), avatar=COALESCE(NULLIF(VALUES(avatar),''), avatar), last_login_at=COALESCE(VALUES(last_login_at), last_login_at), auth_data=COALESCE(NULLIF(VALUES(auth_data),''), auth_data)",
                [
                    acc.id,
                    persistedUin,
                    acc.nick || '',
                    acc.name || '',
                    platform,
                    acc.running ? 1 : 0,
                    identity.code,
                    normalizedUsername,
                    acc.avatar || '',
                    lastLoginAt ? new Date(lastLoginAt) : null,
                    authData,
                ]
            );
        } catch (e) {
            const failedId = String(accountId);
            failedIds.push(failedId);
            failures.push({ accountId: failedId, message: e.message });
            logStoreError('异步写入账号数据库失败', e, { accountId: failedId });
        }
    }

    _pendingAccountPersistIds = new Set(failedIds);
    if (strict && failures.length > 0) {
        const error = new Error(`账号写入数据库失败：${failures.map(item => `ID ${item.accountId} - ${item.message}`).join('；')}`);
        error.failedIds = failedIds;
        throw error;
    }
    return {
        failedIds,
        persistedIds: pendingIds.filter(id => !failedIds.includes(String(id))),
    };
}

function saveAccounts(data, touchedAccountIds) {
    cachedAccountsData = normalizeAccountsData(data); // 内存立即生效
    _accountsMutationVersion += 1;
    _accountsLoadedAt = Date.now();
    queueAccountPersistIds(cachedAccountsData, touchedAccountIds);
    if (_accountsSaveTimer) clearTimeout(_accountsSaveTimer);

    _accountsSaveTimer = setTimeout(() => {
        _accountsSaveTimer = null;
        void persistPendingAccounts().catch((e) => {
            logStoreError('保存账号数据失败', e);
        });
    }, 2000);
}

async function persistAccountsNow(touchedAccountIds, options = {}) {
    queueAccountPersistIds(cachedAccountsData, touchedAccountIds);
    if (_accountsSaveTimer) {
        clearTimeout(_accountsSaveTimer);
        _accountsSaveTimer = null;
    }
    return await persistPendingAccounts(options);
}

function getAccounts() {
    return loadAccounts();
}

async function getAccountsFresh(options = {}) {
    const force = !!(options && options.force);
    const maxAgeMs = Number.parseInt(options && options.maxAgeMs, 10) || 1500;
    const hasCache = Array.isArray(cachedAccountsData.accounts) && cachedAccountsData.accounts.length > 0;
    const cacheIsFresh = hasCache && !force && (Date.now() - _accountsLoadedAt) <= maxAgeMs;

    if (cacheIsFresh) {
        return cloneAccountsData(cachedAccountsData);
    }
    if (_accountsRefreshPromise && !force) {
        return _accountsRefreshPromise;
    }

    _accountsRefreshPromise = loadAccountsFromDB()
        .catch(() => cachedAccountsData)
        .then(data => cloneAccountsData(data || cachedAccountsData))
        .finally(() => {
            _accountsRefreshPromise = null;
        });

    return _accountsRefreshPromise;
}

async function getAccountFull(accountId) {
    const id = String(accountId || '').trim();
    if (!id) return null;

    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ? LIMIT 1', [id]);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return null;
        let authData = row.auth_data;
        if (typeof authData === 'string' && authData) {
            try { authData = JSON.parse(authData); } catch { authData = null; }
        }
        const runtimeSnapshot = normalizeAccountRuntimeSnapshot(authData && authData.runtimeSnapshot);
        const wsError = normalizeAccountWsError(authData && authData.wsError);
        const lastLoginAt = normalizeOptionalTimestamp(
            row.last_login_at ? new Date(row.last_login_at).getTime() : (authData && authData.lastLoginAt),
        );
        const identity = normalizeAccountIdentityFields({
            platform: row.platform || 'qq',
            uin: decodePersistedAccountUin(row.uin) || String((authData && authData.uin) || ''),
            qq: String((authData && authData.qq) || ''),
            code: row.code || (authData && authData.code) || '',
            authTicket: String((authData && authData.authTicket) || ''),
        });
        return {
            id: row.id,
            uin: identity.uin,
            qq: identity.qq,
            code: identity.code,
            authTicket: identity.authTicket,
            nick: row.nick || '',
            name: row.name || '',
            platform: identity.platform,
            running: row.running === 1 || row.running === true,
            avatar: row.avatar || '',
            username: row.username || '',
            level: runtimeSnapshot.level,
            gold: runtimeSnapshot.gold,
            exp: runtimeSnapshot.exp,
            coupon: runtimeSnapshot.coupon,
            uptime: runtimeSnapshot.uptime,
            wsError,
            lastStatusAt: runtimeSnapshot.lastStatusAt,
            lastOnlineAt: runtimeSnapshot.lastOnlineAt,
            lastLoginAt,
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        };
    } catch {
        const data = getAccounts();
        const list = Array.isArray(data.accounts) ? data.accounts : [];
        const found = list.find(a => String(a.id || '') === id);
        return found ? { ...found } : null;
    }
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

function shouldBumpAccountUpdatedAt(existing, payload) {
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(payload || {}, key);
    const normalizeText = (value) => String(value || '').trim();

    if (hasOwn('lastLoginAt')) return true;
    if (hasOwn('running') && !!payload.running !== !!(existing && existing.running)) return true;

    const trackedFields = ['name', 'nick', 'platform', 'uin', 'qq', 'code', 'authTicket', 'avatar', 'username'];
    const payloadWsError = hasOwn('wsError') ? normalizeAccountWsError(payload.wsError) : undefined;
    const existingWsError = normalizeAccountWsError(existing && existing.wsError);
    if (payloadWsError !== undefined) {
        const payloadWsErrorText = JSON.stringify(payloadWsError || null);
        const existingWsErrorText = JSON.stringify(existingWsError || null);
        if (payloadWsErrorText !== existingWsErrorText) return true;
    }
    return trackedFields.some((field) => {
        if (!hasOwn(field)) return false;
        return normalizeText(payload[field]) !== normalizeText(existing && existing[field]);
    });
}

function createAccountRecord(acc, forcedId) {
    const now = Date.now();
    const accountId = String(forcedId || acc.id || '').trim();
    const numericId = Number.parseInt(accountId, 10);
    const defaultName = acc.name || (accountId ? `账号${Number.isFinite(numericId) ? numericId : accountId}` : '新账号');
    const identity = normalizeAccountIdentityFields(acc);
    return {
        id: accountId,
        name: defaultName,
        code: identity.code,
        nick: acc.nick || '',
        platform: identity.platform,
        uin: identity.uin,
        qq: identity.qq,
        authTicket: identity.authTicket,
        avatar: acc.avatar || acc.avatarUrl || '',
        username: acc.username || '',
        running: !!acc.running,
        connected: !!acc.connected,
        wsError: normalizeAccountWsError(acc.wsError),
        level: Math.max(0, Number(acc.level) || 0),
        gold: Math.max(0, Number(acc.gold) || 0),
        exp: Math.max(0, Number(acc.exp) || 0),
        coupon: Math.max(0, Number(acc.coupon) || 0),
        uptime: Math.max(0, Number(acc.uptime) || 0),
        lastStatusAt: Math.max(0, Number(acc.lastStatusAt) || 0),
        lastOnlineAt: Math.max(0, Number(acc.lastOnlineAt) || 0),
        lastLoginAt: normalizeOptionalTimestamp(acc.lastLoginAt),
        createdAt: Math.max(0, Number(acc.createdAt) || 0) || now,
        updatedAt: Math.max(0, Number(acc.updatedAt) || 0) || now,
    };
}

function addOrUpdateAccount(acc) {
    const payload = (acc && typeof acc === 'object') ? { ...acc } : {};
    const createIfMissing = !!payload.__createIfMissing;
    delete payload.__createIfMissing;
    const data = normalizeAccountsData(loadAccounts());
    let touchedAccountId = '';
    if (payload.id) {
        const accIdStr = String(payload.id).trim();
        const idx = data.accounts.findIndex(a => String(a.id).trim() === accIdStr);
        if (idx >= 0 && createIfMissing) {
            const maxId = data.accounts.reduce((max, account) => {
                const numericId = Number.parseInt(account && account.id, 10);
                return Number.isFinite(numericId) ? Math.max(max, numericId) : max;
            }, 0);
            let nextCreateId = Number.parseInt(data.nextId, 10);
            if (!Number.isFinite(nextCreateId) || nextCreateId <= maxId) {
                nextCreateId = maxId + 1;
            }
            touchedAccountId = String(Math.max(nextCreateId, 1));
            data.accounts.push(createAccountRecord(payload, touchedAccountId));
            const numericTouchedId = Number.parseInt(touchedAccountId, 10);
            if (Number.isFinite(numericTouchedId) && data.nextId <= numericTouchedId) {
                data.nextId = numericTouchedId + 1;
            }
        } else if (idx >= 0) {
            const existing = data.accounts[idx];
            const merged = {
                ...existing,
                ...payload,
                name: payload.name !== undefined ? payload.name : existing.name,
            };
            const normalizedWsError = Object.prototype.hasOwnProperty.call(payload, 'wsError')
                ? normalizeAccountWsError(payload.wsError)
                : normalizeAccountWsError(existing.wsError);
            const explicitUpdatedAt = normalizeOptionalTimestamp(payload.updatedAt);
            const nextUpdatedAt = explicitUpdatedAt
                || (shouldBumpAccountUpdatedAt(existing, payload)
                    ? Date.now()
                    : (normalizeOptionalTimestamp(existing.updatedAt) || Date.now()));
            data.accounts[idx] = {
                ...merged,
                ...normalizeAccountIdentityFields(merged),
                wsError: normalizedWsError,
                lastLoginAt: payload.lastLoginAt !== undefined
                    ? normalizeOptionalTimestamp(payload.lastLoginAt)
                    : normalizeOptionalTimestamp(merged.lastLoginAt),
                updatedAt: nextUpdatedAt,
            };
            touchedAccountId = String(data.accounts[idx].id || '');
        } else if (createIfMissing) {
            touchedAccountId = accIdStr;
            data.accounts.push(createAccountRecord(payload, accIdStr));
            const numericId = Number.parseInt(accIdStr, 10);
            if (Number.isFinite(numericId) && data.nextId <= numericId) {
                data.nextId = numericId + 1;
            }
        }
    } else {
        touchedAccountId = String(data.nextId++);
        data.accounts.push(createAccountRecord(payload, touchedAccountId));
    }
    saveAccounts(data, touchedAccountId);
    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId);
    }
    return {
        ...data,
        touchedAccountId,
    };
}

async function markAccountLoginSuccess(accountId, options = {}) {
    const resolvedId = resolveAccountId(accountId);
    if (!resolvedId) return null;

    const loginAt = normalizeOptionalTimestamp(options && options.timestamp) || Date.now();
    const payload = {
        id: resolvedId,
        lastLoginAt: loginAt,
        updatedAt: loginAt,
    };
    if (options && options.running !== undefined) {
        payload.running = !!options.running;
    }
    if (options && options.connected !== undefined) {
        payload.connected = !!options.connected;
    }

    const data = addOrUpdateAccount(payload);
    try {
        await persistAccountsNow(resolvedId);
    } catch (e) {
        logStoreError('记录账号最近登录时间失败', e, { accountId: resolvedId });
    }

    const accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
    return accounts.find(item => String(item && item.id || '') === resolvedId) || null;
}

function deleteAccount(id) {
    const data = normalizeAccountsData(loadAccounts());
    const removedAccount = data.accounts.find(a => String(a.id) === String(id)) || null;
    if (removedAccount && globalConfig.accountConfigs[String(id || '')]) {
        captureAccountConfigIdentitySnapshot(id, globalConfig.accountConfigs[String(id || '')], removedAccount);
    }
    data.accounts = data.accounts.filter(a => String(a.id) !== String(id));
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data, String(id || ''));
    removeAccountConfig(id);

    // 修复 bug：仅 saveAccounts(data) 会触发 UPSERT（更新或插入），但不会对被 filter 剔除的数据做 DELETE，必须单独在 DB 中删除该行
    const pool = getPool();
    if (pool) {
        pool.query('DELETE FROM accounts WHERE id = ?', [String(id)]).catch(e => logStoreError('删除账号数据库记录失败', e, { accountId: String(id) }));
        // 同时清理可能关联的 config 数据
        pool.query('DELETE FROM account_configs WHERE account_id = ?', [String(id)]).catch(e => logStoreError('删除账号配置数据库记录失败', e, { accountId: String(id) }));
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
    rateLimitIntervalMs: 600,       // 两次 WS 请求之间的最小间隔（毫秒）
    // 邀请码处理延迟
    inviteRequestDelay: 2000,       // 邀请码逐条处理间隔（毫秒）
    // 调度器引擎
    schedulerEngine: 'hybrid',      // default | optimized | hybrid
    optimizedSchedulerNamespaces: 'system-jobs,account-report-service,worker_manager',
    optimizedSchedulerTickMs: 100,
    optimizedSchedulerWheelSize: 600,
};

function normalizeTimingConfig(cfg, fallback = DEFAULT_TIMING_CONFIG) {
    const current = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_TIMING_CONFIG;
    const input = (cfg && typeof cfg === 'object') ? cfg : {};
    const next = {};

    for (const key of Object.keys(DEFAULT_TIMING_CONFIG)) {
        if (input[key] !== undefined) {
            if (typeof DEFAULT_TIMING_CONFIG[key] === 'number') {
                next[key] = Number(input[key]);
                if (!Number.isFinite(next[key])) next[key] = current[key];
            } else {
                next[key] = String(input[key] ?? current[key] ?? DEFAULT_TIMING_CONFIG[key]).trim();
                if (!next[key]) next[key] = DEFAULT_TIMING_CONFIG[key];
            }
        } else {
            next[key] = current[key];
        }
    }

    return next;
}

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

function normalizeTrialCardConfig(cfg, fallback = DEFAULT_TRIAL_CARD_CONFIG) {
    const current = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_TRIAL_CARD_CONFIG;
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

    return next;
}

function normalizeClusterConfig(cfg, fallback = DEFAULT_CLUSTER_CONFIG) {
    const current = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_CLUSTER_CONFIG;
    const input = (cfg && typeof cfg === 'object') ? cfg : {};
    const rawStrategy = String(
        input.dispatcherStrategy !== undefined
            ? input.dispatcherStrategy
            : (current.dispatcherStrategy || DEFAULT_CLUSTER_CONFIG.dispatcherStrategy),
    ).trim().toLowerCase();

    return {
        dispatcherStrategy: rawStrategy === 'least_load' ? 'least_load' : 'round_robin',
    };
}

/**
 * 获取系统级时间参数配置（合并默认值）
 */
function getTimingConfig() {
    ensureStoreFallbackLoaded();
    return normalizeTimingConfig(globalConfig.timingConfig, DEFAULT_TIMING_CONFIG);
}

/**
 * 保存系统级时间参数配置（局部更新）
 */
function setTimingConfig(cfg) {
    const current = getTimingConfig();
    globalConfig.timingConfig = normalizeTimingConfig(cfg, current);
    saveGlobalConfig();
    return getTimingConfig();
}

/**
 * 获取体验卡配置（合并默认值）
 */
function getTrialCardConfig() {
    ensureStoreFallbackLoaded();
    return normalizeTrialCardConfig(globalConfig.trialCardConfig, DEFAULT_TRIAL_CARD_CONFIG);
}

/**
 * 保存体验卡配置（局部更新）
 */
function setTrialCardConfig(cfg) {
    const current = getTrialCardConfig();
    globalConfig.trialCardConfig = normalizeTrialCardConfig(cfg, current);
    saveGlobalConfig();
    return getTrialCardConfig();
}

// ============ 风控休眠持久化 ============
/**
 * 记录账号休眠到期时间戳（持久化到 store.json）
 */
function recordSuspendUntil(accountId, timestamp) {
    ensureStoreFallbackLoaded();
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
    ensureStoreFallbackLoaded();
    const id = resolveAccountId(accountId);
    if (!id) return 0;
    if (!globalConfig.suspendUntilMap) return 0;
    return Number(globalConfig.suspendUntilMap[id]) || 0;
}

async function loadAllFromDB(options = {}) {
    await initStoreRuntime({ refreshFromDb: false });
    await loadAccountsFromDB();
    if (options.refreshGlobalConfig !== false) {
        await initStoreRuntime();
        repairAccountConfigsFromIdentityArchive();
    }
}


module.exports = {
    initStoreRuntime,
    loadAllFromDB,
    DEFAULT_ACCOUNT_CONFIG,
    DEFAULT_TIMING_CONFIG,
    DEFAULT_TRADE_CONFIG,
    DEFAULT_INVENTORY_PLANTING,
    ACCOUNT_MODE_PRESETS,
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
    getInventoryPlanting,
    getIntervals,
    getFriendQuietHours,
    getTradeConfig,
    setTradeConfig,
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
    getReportConfig,
    setReportConfig,
    getReportState,
    setReportState,
    consumeQqHighRiskAutoDisableNotice,
    getUI,
    setUITheme,
    getOfflineReminder,
    setOfflineReminder,
    getBugReportConfig,
    setBugReportConfig,
    getTimingConfig,
    setTimingConfig,
    getSuspendUntil,
    recordSuspendUntil,
    ensureAccountConfig,
    applyAccountMode,
    ensureMainAccountUnique,
    resolveAccountZone,
    addOrUpdateAccount,
    markAccountLoginSuccess,
    deleteAccount,
    getAdminPasswordHash,
    setAdminPasswordHash,
    flushGlobalConfigSave,
    getAccounts,
    getAccountsFresh,
    getAccountFull,
    persistAccountsNow,
    getThirdPartyApiConfig,
    setThirdPartyApiConfig,
    getTrialCardConfig,
    setTrialCardConfig,

    getClusterConfig: () => {
        ensureStoreFallbackLoaded();
        globalConfig.clusterConfig = normalizeClusterConfig(globalConfig.clusterConfig, DEFAULT_CLUSTER_CONFIG);
        return { ...globalConfig.clusterConfig };
    },
    setClusterConfig: (cfg) => {
        ensureStoreFallbackLoaded();
        globalConfig.clusterConfig = normalizeClusterConfig({ ...globalConfig.clusterConfig, ...(cfg || {}) }, DEFAULT_CLUSTER_CONFIG);
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
    ensureStoreFallbackLoaded();
    return { ...(globalConfig.thirdPartyApi || {}) };
}

function setThirdPartyApiConfig(cfg) {
    ensureStoreFallbackLoaded();
    const current = getThirdPartyApiConfig();
    globalConfig.thirdPartyApi = { ...current, ...(cfg || {}) };
    saveGlobalConfig();
    return getThirdPartyApiConfig();
}

module.exports.getAccountsFullPaged = getAccountsFullPaged;
module.exports.getThirdPartyApiConfig = getThirdPartyApiConfig;
module.exports.setThirdPartyApiConfig = setThirdPartyApiConfig;

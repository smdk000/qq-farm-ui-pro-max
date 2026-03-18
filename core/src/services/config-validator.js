/**
 * 配置 Schema 校验框架
 *
 * Schema 驱动的配置校验器：
 *   - 类型检查、范围检查、枚举检查、正则检查
 *   - 支持嵌套对象和数组
 *   - 校验失败返回详细错误信息
 *   - 支持自定义校验规则链
 */

const { createModuleLogger } = require('./logger');
const validatorLogger = createModuleLogger('config-validator');

// ============ 内置校验规则 ============

const RULES = {
    type(value, expected) {
        if (expected === 'array') return Array.isArray(value);
        if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
        if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
        switch (expected) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number';
        case 'boolean':
            return typeof value === 'boolean';
        case 'function':
            return typeof value === 'function';
        case 'undefined':
            return typeof value === 'undefined';
        case 'symbol':
            return typeof value === 'symbol';
        case 'bigint':
            return typeof value === 'bigint';
        default:
            return false;
        }
    },

    required(value) {
        return value !== undefined && value !== null && value !== '';
    },

    min(value, min) {
        if (typeof value === 'number') return value >= min;
        if (typeof value === 'string') return value.length >= min;
        if (Array.isArray(value)) return value.length >= min;
        return true;
    },

    max(value, max) {
        if (typeof value === 'number') return value <= max;
        if (typeof value === 'string') return value.length <= max;
        if (Array.isArray(value)) return value.length <= max;
        return true;
    },

    enum(value, allowed) {
        return Array.isArray(allowed) && allowed.includes(value);
    },

    pattern(value, regex) {
        if (typeof value !== 'string') return false;
        const re = typeof regex === 'string' ? new RegExp(regex) : regex;
        return re.test(value);
    },

    custom(value, fn) {
        if (typeof fn !== 'function') return true;
        return fn(value);
    },
};

// ============ Schema 定义 ============

/**
 * 定义项 Schema
 *
 * @example
 * {
 *   type: 'number',
 *   required: true,
 *   min: 1,
 *   max: 86400,
 *   default: 300,
 *   label: '农场巡查间隔(秒)',
 * }
 *
 * @example
 * {
 *   type: 'string',
 *   enum: ['blacklist', 'whitelist'],
 *   default: 'blacklist',
 *   label: '过滤模式',
 * }
 */

// ============ 校验器核心 ============

class ConfigValidator {
    /**
     * @param {object} schema - 配置项 Schema 定义
     * @param {object} options
     * @param {boolean} options.strict - 严格模式(拒绝 schema 中未定义的字段)
     * @param {boolean} options.coerce - 自动类型转换
     */
    constructor(schema = {}, options = {}) {
        this.schema = schema;
        this.strict = !!options.strict;
        this.coerce = options.coerce !== false;
    }

    /**
     * 校验配置对象
     * @param {object} config - 待校验的配置
     * @returns {{ valid: boolean, errors: string[], coerced: object }}
     */
    validate(config) {
        const errors = [];
        const coerced = {};
        const input = config && typeof config === 'object' ? config : {};

        for (const [key, rule] of Object.entries(this.schema)) {
            const rawValue = input[key];
            const label = rule.label || key;

            if (rule.required && (rawValue === undefined || rawValue === null)) {
                errors.push(`${label}: 必填项缺失`);
                continue;
            }

            if (rawValue === undefined || rawValue === null) {
                coerced[key] = rule.default !== undefined ? rule.default : rawValue;
                continue;
            }

            let value = rawValue;

            if (this.coerce && rule.type) {
                value = this._coerce(rawValue, rule.type);
            }

            if (rule.type && !RULES.type(value, rule.type)) {
                errors.push(`${label}: 类型错误，期望 ${rule.type}，实际 ${typeof value}`);
                coerced[key] = rule.default !== undefined ? rule.default : value;
                continue;
            }

            if (rule.min !== undefined && !RULES.min(value, rule.min)) {
                errors.push(`${label}: 值 ${value} 小于最小值 ${rule.min}`);
                if (this.coerce && typeof value === 'number') value = rule.min;
            }

            if (rule.max !== undefined && !RULES.max(value, rule.max)) {
                errors.push(`${label}: 值 ${value} 超过最大值 ${rule.max}`);
                if (this.coerce && typeof value === 'number') value = rule.max;
            }

            if (rule.enum && !RULES.enum(value, rule.enum)) {
                errors.push(`${label}: 值 "${value}" 不在允许范围 [${rule.enum.join(', ')}]`);
                coerced[key] = rule.default !== undefined ? rule.default : value;
                continue;
            }

            if (rule.pattern && !RULES.pattern(value, rule.pattern)) {
                errors.push(`${label}: 格式不合法`);
                coerced[key] = rule.default !== undefined ? rule.default : value;
                continue;
            }

            if (rule.custom && !RULES.custom(value, rule.custom)) {
                errors.push(`${label}: 自定义校验失败`);
                coerced[key] = rule.default !== undefined ? rule.default : value;
                continue;
            }

            if (rule.properties && typeof value === 'object' && !Array.isArray(value)) {
                const nested = new ConfigValidator(rule.properties, { strict: this.strict, coerce: this.coerce });
                const result = nested.validate(value);
                if (!result.valid) {
                    errors.push(...result.errors.map(e => `${label}.${e}`));
                }
                value = result.coerced;
            }

            coerced[key] = value;
        }

        if (this.strict) {
            for (const key of Object.keys(input)) {
                if (!this.schema[key]) {
                    errors.push(`未知配置项: ${key}`);
                }
            }
        }

        for (const key of Object.keys(input)) {
            if (coerced[key] === undefined) {
                coerced[key] = input[key];
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            coerced,
        };
    }

    _coerce(value, type) {
        if (type === 'number' || type === 'integer') {
            const n = Number(value);
            if (Number.isFinite(n)) return type === 'integer' ? Math.round(n) : n;
        }
        if (type === 'boolean') {
            if (typeof value === 'string') {
                if (value === 'true' || value === '1') return true;
                if (value === 'false' || value === '0') return false;
            }
            return !!value;
        }
        if (type === 'string') {
            return String(value);
        }
        return value;
    }
}

// ============ 预定义 Schema ============

const AUTOMATION_SCHEMA = {
    farm: { type: 'boolean', default: true, label: '自动种地' },
    farm_push: { type: 'boolean', default: true, label: '推送触发巡田' },
    land_upgrade: { type: 'boolean', default: true, label: '自动升级土地' },
    friend: { type: 'boolean', default: true, label: '好友互动总开关' },
    friend_help_exp_limit: { type: 'boolean', default: true, label: '帮忙经验上限停止' },
    friend_steal: { type: 'boolean', default: true, label: '偷菜' },
    friend_help: { type: 'boolean', default: true, label: '帮忙' },
    friend_bad: { type: 'boolean', default: false, label: '捣乱' },
    task: { type: 'boolean', default: true, label: '任务领奖' },
    email: { type: 'boolean', default: true, label: '邮箱' },
    fertilizer_gift: { type: 'boolean', default: false, label: '肥料礼包' },
    fertilizer_buy: { type: 'boolean', default: false, label: '自动购肥' },
    fertilizer_buy_type: { type: 'string', enum: ['organic', 'normal', 'both'], default: 'organic', label: '购肥类型' },
    fertilizer_buy_mode: { type: 'string', enum: ['threshold', 'unlimited'], default: 'unlimited', label: '购肥模式' },
    fertilizer_buy_threshold_normal: { type: 'integer', min: 0, max: 9999, default: 24, label: '普通肥触发阈值(小时)' },
    fertilizer_buy_threshold_organic: { type: 'integer', min: 0, max: 9999, default: 24, label: '有机肥触发阈值(小时)' },
    free_gifts: { type: 'boolean', default: true, label: '免费礼包' },
    share_reward: { type: 'boolean', default: true, label: '分享奖励' },
    vip_gift: { type: 'boolean', default: true, label: 'VIP 礼包' },
    month_card: { type: 'boolean', default: true, label: '月卡' },
    open_server_gift: { type: 'boolean', default: true, label: '开服礼包' },
    sell: { type: 'boolean', default: false, label: '自动出售' },
    friend_auto_accept: { type: 'boolean', default: false, label: '自动同意好友' },
    friend_three_phase: { type: 'boolean', default: false, label: '三阶段巡查模式' },
    auto_blacklist_banned: { type: 'boolean', default: true, label: '被封禁好友自动加黑' },
    qqFriendFetchMultiChain: { type: 'boolean', default: false, label: 'QQ 多链路好友拉取' },
    fertilizer_buy_limit: { type: 'integer', min: 1, max: 9999, default: 100, label: '单日化肥购买上限' },
    fertilizer_60s_anti_steal: { type: 'boolean', default: false, label: '60秒防偷' },
    fertilizer_smart_phase: { type: 'boolean', default: false, label: '智能二季施肥' },
    fastHarvest: { type: 'boolean', default: false, label: '秒收取' },
    landUpgradeTarget: { type: 'integer', min: 0, max: 6, default: 6, label: '土地升级目标等级' },
    fertilizer: { type: 'string', enum: ['both', 'normal', 'organic', 'none'], default: 'none', label: '施肥策略' },
};

const INTERVALS_SCHEMA = {
    farm: { type: 'integer', min: 1, max: 86400, default: 30, label: '农场巡查间隔(秒)' },
    friend: { type: 'integer', min: 1, max: 86400, default: 60, label: '好友巡查间隔(秒)' },
    farmMin: { type: 'integer', min: 1, max: 86400, default: 30, label: '农场最小间隔(秒)' },
    farmMax: { type: 'integer', min: 1, max: 86400, default: 200, label: '农场最大间隔(秒)' },
    friendMin: { type: 'integer', min: 1, max: 86400, default: 60, label: '好友最小间隔(秒)' },
    friendMax: { type: 'integer', min: 1, max: 86400, default: 180, label: '好友最大间隔(秒)' },
    helpMin: { type: 'integer', min: 1, max: 86400, default: 60, label: '帮忙最小间隔(秒)' },
    helpMax: { type: 'integer', min: 1, max: 86400, default: 180, label: '帮忙最大间隔(秒)' },
    stealMin: { type: 'integer', min: 1, max: 86400, default: 60, label: '偷菜最小间隔(秒)' },
    stealMax: { type: 'integer', min: 1, max: 86400, default: 180, label: '偷菜最大间隔(秒)' },
};

const FRIEND_QUIET_HOURS_SCHEMA = {
    enabled: { type: 'boolean', default: true, label: '静默时段开关' },
    start: { type: 'string', pattern: /^\d{1,2}:\d{2}$/, default: '23:00', label: '静默开始时间' },
    end: { type: 'string', pattern: /^\d{1,2}:\d{2}$/, default: '07:00', label: '静默结束时间' },
};

const STEAL_FILTER_SCHEMA = {
    enabled: { type: 'boolean', default: false, label: '偷菜过滤开关' },
    mode: { type: 'string', enum: ['blacklist', 'whitelist'], default: 'blacklist', label: '过滤模式' },
    plantIds: { type: 'array', default: [], label: '植物ID列表' },
};

const STAKEOUT_STEAL_SCHEMA = {
    enabled: { type: 'boolean', default: false, label: '蹲守偷菜开关' },
    delaySec: { type: 'integer', min: 0, max: 60, default: 3, label: '蹲守延迟(秒)' },
};

const QQ_HIGH_RISK_WINDOW_SCHEMA = {
    durationMinutes: { type: 'integer', min: 5, max: 180, default: 30, label: 'QQ 高风险自动回退时长(分钟)' },
    expiresAt: { type: 'integer', min: 0, default: 0, label: 'QQ 高风险窗口到期时间' },
    lastIssuedAt: { type: 'integer', min: 0, default: 0, label: 'QQ 高风险窗口签发时间' },
    lastAutoDisabledAt: { type: 'integer', min: 0, default: 0, label: 'QQ 高风险窗口自动回退时间' },
};

const STEAL_FRIEND_FILTER_SCHEMA = {
    enabled: { type: 'boolean', default: false, label: '好友过滤开关' },
    mode: { type: 'string', enum: ['blacklist', 'whitelist'], default: 'blacklist', label: '好友过滤模式' },
    friendIds: { type: 'array', default: [], label: '好友ID列表' },
};

const WORKFLOW_SCOPE_SCHEMA = {
    enabled: { type: 'boolean', default: false, label: '工作流开关' },
    minInterval: { type: 'integer', min: 1, max: 86400, default: 30, label: '最小间隔(秒)' },
    maxInterval: { type: 'integer', min: 1, max: 86400, default: 120, label: '最大间隔(秒)' },
    nodes: { type: 'array', default: [], label: '节点列表' },
};

const WORKFLOW_CONFIG_SCHEMA = {
    farm: {
        type: 'object',
        label: '农场工作流',
        properties: WORKFLOW_SCOPE_SCHEMA,
    },
    friend: {
        type: 'object',
        label: '好友工作流',
        properties: WORKFLOW_SCOPE_SCHEMA,
    },
};

const TRADE_CONFIG_SCHEMA = {
    sell: {
        type: 'object',
        label: '出售配置',
        properties: {
            scope: {
                type: 'string',
                enum: ['fruit_only'],
                default: 'fruit_only',
                label: '出售范围',
            },
            keepMinEachFruit: {
                type: 'integer',
                min: 0,
                max: 999999,
                default: 0,
                label: '每种果实最少保留数量',
            },
            keepFruitIds: {
                type: 'array',
                default: [],
                label: '强制保留果实ID',
            },
            rareKeep: {
                type: 'object',
                label: '稀有保留',
                properties: {
                    enabled: { type: 'boolean', default: false, label: '稀有保留开关' },
                    judgeBy: {
                        type: 'string',
                        enum: ['plant_level', 'unit_price', 'either'],
                        default: 'either',
                        label: '稀有判定方式',
                    },
                    minPlantLevel: { type: 'integer', min: 0, max: 999, default: 40, label: '最低作物等级' },
                    minUnitPrice: { type: 'integer', min: 0, max: 999999999, default: 2000, label: '最低单价' },
                },
            },
            batchSize: {
                type: 'integer',
                min: 1,
                max: 50,
                default: 15,
                label: '出售批大小',
            },
            previewBeforeManualSell: {
                type: 'boolean',
                default: false,
                label: '手动出售前先预览',
            },
        },
    },
};

const REPORT_CONFIG_SCHEMA = {
    enabled: { type: 'boolean', default: false, label: '经营汇报开关' },
    channel: {
        type: 'string',
        enum: [
            'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
            'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
            'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
            'discord', 'wxpusher', 'email',
        ],
        default: 'webhook',
        label: '经营汇报渠道',
    },
    endpoint: { type: 'string', max: 1000, default: '', label: '经营汇报接口地址' },
    token: { type: 'string', max: 1000, default: '', label: '经营汇报Token' },
    smtpHost: { type: 'string', max: 255, default: '', label: 'SMTP 服务器' },
    smtpPort: { type: 'integer', min: 1, max: 65535, default: 465, label: 'SMTP 端口' },
    smtpSecure: { type: 'boolean', default: true, label: 'SMTP TLS' },
    smtpUser: { type: 'string', max: 255, default: '', label: 'SMTP 用户名' },
    smtpPass: { type: 'string', max: 1000, default: '', label: 'SMTP 密码' },
    emailFrom: { type: 'string', max: 255, default: '', label: '发件邮箱' },
    emailTo: { type: 'string', max: 1000, default: '', label: '收件邮箱' },
    title: { type: 'string', max: 100, default: '经营汇报', label: '经营汇报标题' },
    hourlyEnabled: { type: 'boolean', default: false, label: '小时汇报' },
    hourlyMinute: { type: 'integer', min: 0, max: 59, default: 5, label: '小时汇报分钟' },
    dailyEnabled: { type: 'boolean', default: true, label: '日报开关' },
    dailyHour: { type: 'integer', min: 0, max: 23, default: 21, label: '日报小时' },
    dailyMinute: { type: 'integer', min: 0, max: 59, default: 0, label: '日报分钟' },
    retentionDays: { type: 'integer', min: 0, max: 365, default: 30, label: '汇报历史保留天数' },
};

const BUG_REPORT_CONFIG_SCHEMA = {
    enabled: { type: 'boolean', default: true, label: '问题反馈开关' },
    smtpHost: { type: 'string', max: 255, default: '', label: '问题反馈 SMTP 服务器' },
    smtpPort: { type: 'integer', min: 1, max: 65535, default: 465, label: '问题反馈 SMTP 端口' },
    smtpSecure: { type: 'boolean', default: true, label: '问题反馈 SMTP TLS' },
    smtpUser: { type: 'string', max: 255, default: '', label: '问题反馈 SMTP 用户名' },
    smtpPass: { type: 'string', max: 1000, default: '', label: '问题反馈 SMTP 密码' },
    emailFrom: { type: 'string', max: 255, default: '', label: '问题反馈发件邮箱' },
    emailTo: { type: 'string', max: 1000, default: '', label: '问题反馈收件邮箱' },
    subjectPrefix: { type: 'string', max: 40, default: '[BUG反馈]', label: '问题反馈邮件前缀' },
    includeFrontendErrors: { type: 'boolean', default: true, label: '附带前端错误' },
    includeSystemLogs: { type: 'boolean', default: true, label: '附带系统日志' },
    includeRuntimeLogs: { type: 'boolean', default: true, label: '附带运行日志' },
    includeAccountLogs: { type: 'boolean', default: true, label: '附带账号日志' },
    systemLogLimit: { type: 'integer', min: 1, max: 100, default: 50, label: '系统日志条数' },
    runtimeLogLimit: { type: 'integer', min: 1, max: 100, default: 40, label: '运行日志条数' },
    accountLogLimit: { type: 'integer', min: 1, max: 100, default: 20, label: '账号日志条数' },
    frontendErrorLimit: { type: 'integer', min: 1, max: 50, default: 10, label: '前端错误条数' },
    maxBodyLength: { type: 'integer', min: 5000, max: 100000, default: 50000, label: '邮件正文长度上限' },
    cooldownSeconds: { type: 'integer', min: 10, max: 3600, default: 180, label: '提交冷却时间' },
    saveToDatabase: { type: 'boolean', default: true, label: '入库留档' },
    allowNonAdminSubmit: { type: 'boolean', default: true, label: '允许普通用户提交' },
};

const SETTINGS_SCHEMA = {
    accountMode: {
        type: 'string',
        enum: ['main', 'alt', 'safe'],
        default: 'main',
        label: '账号模式',
    },
    harvestDelay: {
        type: 'object',
        label: '随机延迟',
        properties: {
            min: { type: 'integer', min: 0, max: 86400, default: 0, label: '随机延迟下限' },
            max: { type: 'integer', min: 0, max: 86400, default: 0, label: '随机延迟上限' },
        },
    },
    riskPromptEnabled: {
        type: 'boolean',
        default: true,
        label: '风控提示',
    },
    modeScope: {
        type: 'object',
        label: '模式作用域',
        properties: {
            zoneScope: { type: 'string', enum: ['same_zone_only', 'all_zones'], default: 'same_zone_only', label: '区服范围' },
            requiresGameFriend: { type: 'boolean', default: true, label: '要求游戏好友' },
            fallbackBehavior: { type: 'string', enum: ['standalone', 'strict_block'], default: 'standalone', label: '回退行为' },
        },
    },
    automation: {
        type: 'object',
        label: '自动化配置',
        properties: AUTOMATION_SCHEMA,
    },
    intervals: {
        type: 'object',
        label: '间隔配置',
        properties: INTERVALS_SCHEMA,
    },
    friendQuietHours: {
        type: 'object',
        label: '静默时段',
        properties: FRIEND_QUIET_HOURS_SCHEMA,
    },
    stealFilter: {
        type: 'object',
        label: '偷菜过滤',
        properties: STEAL_FILTER_SCHEMA,
    },
    stealFriendFilter: {
        type: 'object',
        label: '好友偷菜过滤',
        properties: STEAL_FRIEND_FILTER_SCHEMA,
    },
    stakeoutSteal: {
        type: 'object',
        label: '蹲守偷菜',
        properties: STAKEOUT_STEAL_SCHEMA,
    },
    qqHighRiskWindow: {
        type: 'object',
        label: 'QQ 高风险窗口',
        properties: QQ_HIGH_RISK_WINDOW_SCHEMA,
    },
    plantingStrategy: {
        type: 'string',
        enum: ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit', 'bag_priority'],
        default: 'preferred',
        label: '种植策略',
    },
    plantingFallbackStrategy: {
        type: 'string',
        enum: ['pause', 'preferred', 'level', 'cheapest'],
        default: 'level',
        label: '失配回退策略',
    },
    preferredSeedId: {
        type: 'integer',
        min: 0,
        default: 0,
        label: '偏好种子ID',
    },
    bagSeedPriority: {
        type: 'array',
        default: [],
        label: '背包种子优先顺序',
    },
    bagSeedFallbackStrategy: {
        type: 'string',
        enum: ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit'],
        default: 'level',
        label: '背包种子第二优先策略',
    },
    inventoryPlanting: {
        type: 'object',
        label: '库存种植',
        properties: {
            mode: {
                type: 'string',
                enum: ['disabled', 'prefer_inventory', 'inventory_only'],
                default: 'disabled',
                label: '库存种植模式',
            },
            globalKeepCount: {
                type: 'integer',
                min: 0,
                max: 999999,
                default: 0,
                label: '全局保留数量',
            },
            reserveRules: {
                type: 'array',
                default: [],
                label: '库存保留规则',
            },
        },
    },
    workflowConfig: {
        type: 'object',
        label: '工作流编排',
        properties: WORKFLOW_CONFIG_SCHEMA,
    },
    tradeConfig: {
        type: 'object',
        label: '交易配置',
        properties: TRADE_CONFIG_SCHEMA,
    },
    reportConfig: {
        type: 'object',
        label: '经营汇报',
        properties: REPORT_CONFIG_SCHEMA,
    },
};

/**
 * 校验设置保存请求
 * @param {object} settings - 前端提交的设置
 * @returns {{ valid: boolean, errors: string[], coerced: object }}
 */
function validateSettings(settings) {
    const input = (settings && typeof settings === 'object') ? { ...settings } : {};
    if (input.plantingStrategy === undefined && input.strategy !== undefined) {
        input.plantingStrategy = input.strategy;
    }
    if (input.preferredSeedId === undefined) {
        if (input.preferredSeed !== undefined) {
            input.preferredSeedId = input.preferredSeed;
        } else if (input.seedId !== undefined) {
            input.preferredSeedId = input.seedId;
        }
    }
    const validator = new ConfigValidator(SETTINGS_SCHEMA, { coerce: true });
    const result = validator.validate(input);

    if (!result.valid) {
        validatorLogger.warn('配置校验失败', { errors: result.errors });
    }

    return result;
}

function validateBugReportConfig(config) {
    const validator = new ConfigValidator(BUG_REPORT_CONFIG_SCHEMA, { coerce: true });
    const result = validator.validate(config && typeof config === 'object' ? config : {});

    const next = result.coerced || {};
    if (next.enabled) {
        const hasMailer = String(next.smtpHost || '').trim()
            && String(next.emailTo || '').trim()
            && String(next.emailFrom || next.smtpUser || '').trim();
        if (!hasMailer) {
            result.valid = false;
            result.errors.push('问题反馈配置: 开启后必须完整填写 SMTP 服务器、发件邮箱和收件邮箱');
        }
    }

    return result;
}

module.exports = {
    ConfigValidator,
    validateSettings,
    validateBugReportConfig,
    SETTINGS_SCHEMA,
    AUTOMATION_SCHEMA,
    INTERVALS_SCHEMA,
    TRADE_CONFIG_SCHEMA,
    STEAL_FRIEND_FILTER_SCHEMA,
    WORKFLOW_CONFIG_SCHEMA,
    BUG_REPORT_CONFIG_SCHEMA,
};

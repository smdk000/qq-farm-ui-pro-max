/**
 * 卡密类型枚举定义
 * 统一的卡密类型常量，避免硬编码
 */

const CARD_TYPES = {
    // 天卡
    DAY: 'D',
    // 周卡
    WEEK: 'W',
    // 月卡
    MONTH: 'M',
    // 永久卡
    FOREVER: 'F',
    // 体验卡
    TRIAL: 'T',
};

const CARD_TYPE_LABELS = {
    [CARD_TYPES.DAY]: '天卡',
    [CARD_TYPES.WEEK]: '周卡',
    [CARD_TYPES.MONTH]: '月卡',
    [CARD_TYPES.FOREVER]: '永久卡',
    [CARD_TYPES.TRIAL]: '体验卡',
};

const CARD_TYPE_DAYS = {
    [CARD_TYPES.DAY]: 1,
    [CARD_TYPES.WEEK]: 7,
    [CARD_TYPES.MONTH]: 30,
    [CARD_TYPES.FOREVER]: null, // 永久卡无天数限制
    [CARD_TYPES.TRIAL]: 1, // 体验卡默认1天（可由管理员配置覆盖）
};

/**
 * 验证卡密类型是否有效
 * @param {string} type - 卡密类型
 * @returns {boolean} - 是否有效
 */
function isValidCardType(type) {
    return Object.values(CARD_TYPES).includes(type);
}

/**
 * 获取卡密类型的默认天数
 * @param {string} type - 卡密类型
 * @returns {number|null} - 天数，永久卡返回 null
 */
function getDefaultDaysForType(type) {
    return CARD_TYPE_DAYS[type] || 30;
}

module.exports = {
    CARD_TYPES,
    CARD_TYPE_LABELS,
    CARD_TYPE_DAYS,
    isValidCardType,
    getDefaultDaysForType,
};

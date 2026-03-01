/**
 * 数据验证工具函数
 * 为注册、续费等功能提供统一的输入验证
 */

/**
 * 验证用户名格式
 * @param {string} username - 用户名
 * @returns {{valid: boolean, error?: string}} - 验证结果
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: '用户名不能为空' };
    }

    if (username.length < 4 || username.length > 20) {
        return { valid: false, error: '用户名长度应为 4-20 个字符' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { valid: false, error: '用户名只能包含字母、数字和下划线' };
    }

    return { valid: true };
}

/**
 * 验证密码强度
 * @param {string} password - 密码
 * @returns {{valid: boolean, error?: string}} - 验证结果
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: '密码不能为空' };
    }

    if (password.length < 6) {
        return { valid: false, error: '密码长度至少为 6 位' };
    }

    if (password.length > 50) {
        return { valid: false, error: '密码长度不能超过 50 位' };
    }

    // 字符复杂度：至少包含字母和数字
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    if (!hasLetter || !hasDigit) {
        return { valid: false, error: '密码须同时包含字母和数字' };
    }

    return { valid: true };
}

/**
 * 验证卡密格式
 * @param {string} cardCode - 卡密
 * @returns {{valid: boolean, error?: string}} - 验证结果
 */
function validateCardCode(cardCode) {
    if (!cardCode || typeof cardCode !== 'string') {
        return { valid: false, error: '卡密不能为空' };
    }

    if (cardCode.length < 8) {
        return { valid: false, error: '卡密格式不正确' };
    }

    return { valid: true };
}

module.exports = {
    validateUsername,
    validatePassword,
    validateCardCode,
};

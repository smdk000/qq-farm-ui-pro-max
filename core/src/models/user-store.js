const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { CARD_TYPES, isValidCardType, getDefaultDaysForType } = require('../config/card-types');
const { logUserAction } = require('../utils/logger');

const USERS_FILE = getDataFile('users.json');
const CARDS_FILE = getDataFile('cards.json');
const TRIAL_IP_FILE = getDataFile('trial-ip-history.json');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

const generateCardCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

/**
 * 生成体验卡专用卡密（TRIAL-XXXXXXXXXXXX 格式）
 * @returns {string} 体验卡密码
 */
function generateTrialCardCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 12; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TRIAL-${suffix}`;
}

// ============ 体验卡 IP 限流 ============
// 内存缓存：{ ip: { lastCreatedAt, todayCount, todayDate } }
const trialCardIPMap = new Map();
let trialCardDailyTotal = 0;
let trialCardDailyDate = '';

/**
 * 获取今天的日期字符串（用于日计数器重置）
 */
function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * 重置日计数器（如果跨天）
 */
function resetDailyCounterIfNeeded() {
    const today = getTodayStr();
    if (trialCardDailyDate !== today) {
        trialCardDailyTotal = 0;
        trialCardDailyDate = today;
        // 清理过期的 IP 缓存记录（超过 24h）
        const now = Date.now();
        let changed = false;
        for (const [ip, info] of trialCardIPMap.entries()) {
            if (now - info.lastCreatedAt > 24 * 60 * 60 * 1000) {
                trialCardIPMap.delete(ip);
                changed = true;
            }
        }
        if (changed) saveIPHistory();
    }
}

function loadIPHistory() {
    ensureDataDir();
    try {
        if (fs.existsSync(TRIAL_IP_FILE)) {
            const data = JSON.parse(fs.readFileSync(TRIAL_IP_FILE, 'utf8'));
            trialCardDailyTotal = data.dailyTotal || 0;
            trialCardDailyDate = data.dailyDate || '';

            if (data.ipMap) {
                const now = Date.now();
                for (const [ip, info] of Object.entries(data.ipMap)) {
                    // 只加载 24 小时内的记录
                    if (now - info.lastCreatedAt < 24 * 60 * 60 * 1000) {
                        trialCardIPMap.set(ip, info);
                    }
                }
            }
            resetDailyCounterIfNeeded();
        }
    } catch (e) {
        console.error('加载体验卡 IP 记录失败:', e.message);
    }
}

function saveIPHistory() {
    ensureDataDir();
    try {
        const ipData = Object.fromEntries(trialCardIPMap);
        const data = {
            dailyTotal: trialCardDailyTotal,
            dailyDate: trialCardDailyDate,
            ipMap: ipData
        };
        fs.writeFileSync(TRIAL_IP_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('保存体验卡 IP 记录失败:', e.message);
    }
}

/**
 * 公开生成体验卡（注册页调用，无需登录）
 * @param {string} clientIP - 客户端 IP
 * @returns {{ ok: boolean, code?: string, error?: string, retryAfterMs?: number }}
 */
function createTrialCard(clientIP) {
    const store = require('./store');
    const config = store.getTrialCardConfig();

    // 检查总开关
    if (!config.enabled) {
        return { ok: false, error: '体验卡生成功能已关闭' };
    }

    // 重置日计数器
    resetDailyCounterIfNeeded();

    // 检查每日全局上限
    if (trialCardDailyTotal >= config.dailyLimit) {
        return { ok: false, error: '今日体验卡已发放完毕，请明天再试' };
    }

    // 检查 IP 冷却
    const now = Date.now();
    const ipInfo = trialCardIPMap.get(clientIP);
    if (ipInfo && (now - ipInfo.lastCreatedAt) < config.cooldownMs) {
        const retryAfterMs = config.cooldownMs - (now - ipInfo.lastCreatedAt);
        return { ok: false, error: '请求过于频繁，请稍后再试', retryAfterMs };
    }

    // 生成体验卡
    const days = config.days || 1;
    const card = createCard('体验卡（自动生成）', CARD_TYPES.TRIAL, days);
    // 覆盖卡密为 TRIAL- 前缀
    loadCards();
    const idx = cards.findIndex(c => c.code === card.code);
    if (idx >= 0) {
        const trialCode = generateTrialCardCode();
        cards[idx].code = trialCode;
        card.code = trialCode;
        saveCards();
    }

    // 更新 IP 缓存和日计数
    trialCardIPMap.set(clientIP, { lastCreatedAt: now });
    trialCardDailyTotal++;
    saveIPHistory();

    return { ok: true, code: card.code, days };
}

/**
 * 一键续费体验卡（管理员 或 用户自助）
 * @param {string} username - 目标用户名
 * @param {'admin'|'user'} callerRole - 调用者角色
 * @returns {{ ok: boolean, card?: object, error?: string }}
 */
function renewTrialUser(username, callerRole) {
    const store = require('./store');
    const config = store.getTrialCardConfig();

    // 权限校验
    if (callerRole === 'admin' && !config.adminRenewEnabled) {
        return { ok: false, error: '管理员续费功能已关闭' };
    }
    if (callerRole === 'user' && !config.userRenewEnabled) {
        return { ok: false, error: '用户自助续费功能已关闭' };
    }

    // 校验目标用户是否为体验卡用户
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user || user.card?.type !== CARD_TYPES.TRIAL) {
        return { ok: false, error: '仅体验卡用户可使用此功能' };
    }

    // 自动生成体验卡 → 续费
    const days = config.days || 1;
    const newCard = createCard('体验卡续费（自动）', CARD_TYPES.TRIAL, days);
    return renewUser(username, newCard.code);
}

let users = [];
let cards = [];

function loadUsers() {
    ensureDataDir();
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users = Array.isArray(data.users) ? data.users : [];
        } else {
            users = [];
            saveUsers();
        }
    } catch (e) {
        console.error('加载用户数据失败:', e.message);
        users = [];
    }
}

function saveUsers() {
    ensureDataDir();
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
    } catch (e) {
        console.error('保存用户数据失败:', e.message);
    }
}

function loadCards() {
    ensureDataDir();
    try {
        if (fs.existsSync(CARDS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
            cards = Array.isArray(data.cards) ? data.cards : [];
        } else {
            cards = [];
            saveCards();
        }
    } catch (e) {
        console.error('加载卡密数据失败:', e.message);
        cards = [];
    }
}

function saveCards() {
    ensureDataDir();
    try {
        fs.writeFileSync(CARDS_FILE, JSON.stringify({ cards }, null, 2), 'utf8');
    } catch (e) {
        console.error('保存卡密数据失败:', e.message);
    }
}

function initDefaultAdmin() {
    loadUsers();
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        const defaultPassword = 'admin';
        users.push({
            username: 'admin',
            password: hashPassword(defaultPassword),
            role: 'admin',
            card: null,
            createdAt: Date.now()
        });
        saveUsers();
        console.log('[用户系统] 已创建默认管理员账号：admin / admin');
    }
}

function validateUser(username, password) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;
    if (user.password !== hashPassword(password)) return null;

    console.log('[验证用户]', username, '- Card 状态:', user.card ? JSON.stringify(user.card) : '无卡密');

    // 管理员不受卡密限制
    if (user.role === 'admin') {
        return {
            username: user.username,
            role: user.role,
            card: null
        };
    }

    // 检查用户状态
    if (user.card) {
        if (user.card.enabled === false) {
            return { ...user, error: '账号已被封禁' };
        }
        if (user.card.expiresAt && user.card.expiresAt < Date.now()) {
            return { ...user, error: '账号已过期' };
        }
    }

    return {
        username: user.username,
        role: user.role,
        card: user.card || null
    };
}

function registerUser(username, password, cardCode) {
    loadUsers();
    loadCards();

    // 检查用户名是否已存在
    if (users.find(u => u.username === username)) {
        return { ok: false, error: '用户名已存在' };
    }

    // 查找卡密
    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }

    // 验证卡密状态
    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }

    if (card.usedBy) {
        return { ok: false, error: '卡密已被使用' };
    }

    // 验证卡密类型
    if (!isValidCardType(card.type)) {
        return { ok: false, error: '卡密类型无效' };
    }

    const now = Date.now();

    // 计算过期时间
    let expiresAt = null;
    if (card.type !== CARD_TYPES.FOREVER) {
        const days = card.days || getDefaultDaysForType(card.type);
        if (days <= 0) {
            return { ok: false, error: '卡密天数无效' };
        }
        expiresAt = now + days * 24 * 60 * 60 * 1000;
    }

    // 体验卡用户：从配置读取绑定账号数上限
    let maxAccounts = 0; // 0 = 不限制
    if (card.type === CARD_TYPES.TRIAL) {
        const store = require('./store');
        const trialConfig = store.getTrialCardConfig();
        maxAccounts = trialConfig.maxAccounts || 1;
    }

    // 创建新用户
    const newUser = {
        username,
        password: hashPassword(password),
        plainPassword: password,
        role: 'user',
        cardCode,
        card: {
            code: card.code,
            description: card.description,
            type: card.type,
            typeChar: card.typeChar,
            days: card.days || getDefaultDaysForType(card.type),
            expiresAt,
            enabled: true
        },
        maxAccounts,
        createdAt: now
    };

    users.push(newUser);
    card.usedBy = username;
    card.usedAt = now;
    card.enabled = false; // 卡密使用后自动禁用

    saveUsers();
    saveCards();

    // 记录操作日志
    logUserAction('register', username, {
        cardCode,
        cardType: card.type,
        cardDays: card.days,
        expiresAt: newUser.card.expiresAt,
    });

    return { ok: true, user: { username: newUser.username, role: newUser.role, card: newUser.card } };
}

function renewUser(username, cardCode) {
    loadUsers();
    loadCards();

    // 查找用户
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    // 查找卡密
    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }

    // 验证卡密状态
    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }

    if (card.usedBy && card.usedBy !== username) {
        return { ok: false, error: '卡密已被其他用户使用' };
    }

    // 验证卡密类型
    if (!isValidCardType(card.type)) {
        return { ok: false, error: '卡密类型无效' };
    }

    const now = Date.now();

    // 初始化用户卡密记录（如果不存在）
    if (!user.card) {
        user.card = {};
    }

    // 计算新的过期时间
    let newExpiresAt = null;
    const currentExpires = user.card.expiresAt || 0;

    if (card.type === CARD_TYPES.FOREVER) {
        // 永久卡
        newExpiresAt = null;
    } else {
        // 计算续费天数
        const days = card.days || getDefaultDaysForType(card.type);
        if (days <= 0) {
            return { ok: false, error: '卡密天数无效' };
        }

        // 续费时间计算逻辑：未过期则累加，已过期则从现在开始
        if (currentExpires && currentExpires > now) {
            newExpiresAt = currentExpires + days * 24 * 60 * 60 * 1000;
        } else {
            newExpiresAt = now + days * 24 * 60 * 60 * 1000;
        }
    }

    // 更新用户卡密信息
    user.card.code = card.code;
    user.card.description = card.description;
    user.card.type = card.type;
    user.card.typeChar = card.typeChar;
    user.card.days = card.days || getDefaultDaysForType(card.type);
    user.card.expiresAt = newExpiresAt;
    user.card.enabled = true;

    // 更新卡密使用记录
    card.usedBy = username;
    card.usedAt = now;
    card.enabled = false; // 卡密使用后自动禁用

    saveUsers();
    saveCards();

    // 记录操作日志
    logUserAction('renew', username, {
        cardCode,
        cardType: card.type,
        cardDays: card.days,
        newExpiresAt: user.card.expiresAt,
    });

    return { ok: true, card: user.card };
}

function getAllUsers() {
    loadUsers();
    return users.map(u => ({
        username: u.username,
        role: u.role,
        card: u.card
    }));
}

function getAllUsersWithPassword() {
    loadUsers();
    return users.map(u => ({
        username: u.username,
        password: u.plainPassword || '',
        role: u.role,
        card: u.card
    }));
}

function updateUser(username, updates) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;

    console.log('[更新用户] 用户名:', username, '更新内容:', updates);
    console.log('[更新前] 用户状态:', JSON.stringify(user.card));

    if (updates.expiresAt !== undefined) {
        if (!user.card) user.card = {};
        user.card.expiresAt = updates.expiresAt;
    }

    if (updates.enabled !== undefined) {
        if (!user.card) user.card = {};
        user.card.enabled = updates.enabled;
    }

    console.log('[更新后] 用户状态:', JSON.stringify(user.card));

    saveUsers();
    console.log('[保存完成] 用户状态已保存到文件');

    return { username: user.username, role: user.role, card: user.card };
}

function deleteUser(username) {
    loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { ok: false, error: '用户不存在' };

    // 不允许删除管理员账号
    if (users[idx].role === 'admin') {
        return { ok: false, error: '不能删除管理员账号' };
    }

    users.splice(idx, 1);
    saveUsers();
    return { ok: true };
}

function changePassword(username, oldPassword, newPassword) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    // 验证旧密码
    if (user.password !== hashPassword(oldPassword)) {
        return { ok: false, error: '旧密码错误' };
    }

    // 更新密码
    user.password = hashPassword(newPassword);
    user.plainPassword = newPassword;
    saveUsers();

    return { ok: true };
}

function getAllCards() {
    loadCards();
    return cards;
}

function createCard(description, type, days) {
    loadCards();

    // 验证卡密类型，使用统一枚举
    if (!isValidCardType(type)) {
        type = CARD_TYPES.MONTH; // 默认月卡
    }

    const parsedDays = parseInt(days, 10) || getDefaultDaysForType(type);

    const newCard = {
        code: generateCardCode(),
        description,
        type,
        typeChar: type,
        days: parsedDays,
        enabled: true,
        usedBy: null,
        usedAt: null,
        createdAt: Date.now()
    };

    cards.push(newCard);
    saveCards();

    return newCard;
}

function updateCard(code, updates) {
    loadCards();
    const card = cards.find(c => c.code === code);
    if (!card) return null;

    if (updates.description !== undefined) {
        card.description = updates.description;
    }

    if (updates.enabled !== undefined) {
        card.enabled = updates.enabled;
    }

    saveCards();
    return card;
}

function deleteCard(code) {
    loadCards();
    const idx = cards.findIndex(c => c.code === code);
    if (idx === -1) return false;

    cards.splice(idx, 1);
    saveCards();
    return true;
}

// 初始化
initDefaultAdmin();
loadIPHistory();

module.exports = {
    validateUser,
    registerUser,
    renewUser,
    getAllUsers,
    getAllUsersWithPassword,
    updateUser,
    deleteUser,
    changePassword,
    getAllCards,
    createCard,
    updateCard,
    deleteCard,
    hashPassword,
    createTrialCard,
    renewTrialUser,
};

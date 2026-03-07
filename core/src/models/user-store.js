const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { CARD_TYPES, isValidCardType, getDefaultDaysForType } = require('../config/card-types');
const { logUserAction } = require('../utils/logger');

const { getPool, transaction } = require('../services/mysql-db');

const TRIAL_IP_FILE = getDataFile('trial-ip-history.json');

const security = require('../services/security');

const hashPassword = (password) => {
    return security.hashPassword(password);
};

const generateCardCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const limit = 256 - (256 % chars.length);
    let result = '';
    while (result.length < 16) {
        const bytes = crypto.randomBytes(16);
        for (const b of bytes) {
            if (b < limit && result.length < 16) {
                result += chars[b % chars.length];
            }
        }
    }
    return result;
};

/**
 * 生成体验卡专用卡密（TRIAL-XXXXXXXXXXXX 格式）
 * @returns {string} 体验卡密码
 */
function generateTrialCardCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const limit = 256 - (256 % chars.length);
    let suffix = '';
    while (suffix.length < 12) {
        const bytes = crypto.randomBytes(12);
        for (const b of bytes) {
            if (b < limit && suffix.length < 12) {
                suffix += chars[b % chars.length];
            }
        }
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
async function createTrialCard(clientIP) {
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
    const trialCode = generateTrialCardCode();
    const card = await createCard('体验卡（自动生成）', CARD_TYPES.TRIAL, days, trialCode);

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
async function renewTrialUser(username, callerRole) {
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
    await loadUsers();
    const user = users.find(u => u.username === username);
    if (!user || user.card?.type !== CARD_TYPES.TRIAL) {
        return { ok: false, error: '仅体验卡用户可使用此功能' };
    }

    // 自动生成体验卡 → 续费
    const days = config.days || 1;
    const trialCode = generateTrialCardCode();
    const newCard = await createCard('体验卡续费（自动）', CARD_TYPES.TRIAL, days, trialCode);
    return await renewUser(username, newCard.code);
}

let users = [];
let cards = [];

async function loadUsers() {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM users');
        users = rows.map(r => ({
            id: r.id,
            username: r.username,
            password: r.password_hash,
            role: r.role,
            createdAt: new Date(r.created_at).getTime()
        }));

        // Populate card info for users by joining cards table if needed, however since users table doesn't have card_code we look at cards table usedBy
        const [cardRows] = await pool.query('SELECT cards.*, users.username as usedBy FROM cards LEFT JOIN users ON cards.used_by = users.id WHERE cards.used_by IS NOT NULL');
        cardRows.forEach(c => {
            let u = users.find(u => u.username === c.usedBy);
            if (u) {
                u.cardCode = c.code;
                u.card = {
                    code: c.code,
                    description: c.description,
                    type: c.type,
                    typeChar: c.type,
                    days: c.days,
                    expiresAt: c.expires_at ? new Date(c.expires_at).getTime() : null,
                    enabled: c.enabled === 1
                };
            }
        });
    } catch (e) { console.error('加载用户数据失败:', e.message); }
}

async function saveUsers() {
    const pool = getPool();
    try {
        await transaction(async (conn) => {
            for (const u of users) {
                await conn.query(
                    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash=?, role=?",
                    [u.username, u.password, u.role || 'user', u.password, u.role || 'user']
                );
            }
        });
    } catch (e) {
        console.error('保存用户数据失败:', e.message);
    }
}

async function loadCards() {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT cards.*, users.username as usedBy FROM cards LEFT JOIN users ON cards.used_by = users.id');
        cards = rows.map(r => ({
            id: r.id,
            code: r.code,
            type: r.type,
            typeChar: r.type,
            description: r.description,
            enabled: r.enabled === 1,
            usedBy: r.usedBy,
            usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
            createdAt: new Date(r.created_at).getTime(),
            expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null
        }));
    } catch (e) { console.error('加载卡密数据失败:', e.message); }
}

async function saveCards() {
    const pool = getPool();
    try {
        await transaction(async (conn) => {
            for (const c of cards) {
                if (c.code) {
                    await conn.query(
                        "INSERT INTO cards (code, type, description, enabled, used_by, used_at, expires_at) VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE username = ?), ?, ?) ON DUPLICATE KEY UPDATE description=?, enabled=?, used_by=(SELECT id FROM users WHERE username = ?), used_at=?, expires_at=?",
                        [
                            c.code, c.type, c.description || '', c.enabled ? 1 : 0, c.usedBy || null,
                            c.usedAt ? new Date(c.usedAt) : null, c.expiresAt ? new Date(c.expiresAt) : null,
                            c.description || '', c.enabled ? 1 : 0, c.usedBy || null,
                            c.usedAt ? new Date(c.usedAt) : null, c.expiresAt ? new Date(c.expiresAt) : null
                        ]
                    );
                }
            }
        });
    } catch (e) {
        console.error('保存卡密数据失败:', e.message);
    }
}

async function initDefaultAdmin() {
    await loadUsers();
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        // 从环境变量读取管理员初始密码，若未设置则回退到 'admin'
        const { CONFIG } = require('../config/config');
        const defaultPassword = CONFIG.adminPassword || 'admin';
        users.push({
            username: 'admin',
            password: hashPassword(defaultPassword),
            role: 'admin',
            card: null,
            createdAt: Date.now()
        });
        await saveUsers();
        const maskedPwd = defaultPassword.length > 2
            ? defaultPassword[0] + '*'.repeat(defaultPassword.length - 2) + defaultPassword.slice(-1)
            : '***';
        console.log(`[用户系统] 已创建默认管理员账号：admin / ${maskedPwd}（来源：${CONFIG.adminPassword ? '.env ADMIN_PASSWORD' : '内置默认值'}）`);
    }
}

async function validateUser(username, password) {
    await loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;

    const verify = security.verifyPassword(password, user.password);
    if (!verify.valid) return null;

    if (verify.needsMigration) {
        user.password = security.hashPassword(password);
        await saveUsers();
        console.log('[验证用户] 密码已自动迁移为 PBKDF2 格式:', username);
    }

    console.log('[验证用户]', username, '- Card 类型:', user.card?.type || '无卡密', ', 启用:', user.card?.enabled ?? 'N/A');

    if (user.role === 'admin') {
        return {
            username: user.username,
            role: user.role,
            card: null
        };
    }

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

async function registerUser(username, password, cardCode) {
    await loadUsers();
    await loadCards();

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

    await transaction(async (conn) => {
        await conn.query(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [newUser.username, newUser.password, newUser.role || 'user']
        );
        await conn.query(
            "UPDATE cards SET enabled=?, used_by=(SELECT id FROM users WHERE username = ?), used_at=?, expires_at=? WHERE code=?",
            [0, username, new Date(now), expiresAt ? new Date(expiresAt) : null, card.code]
        );
    });

    users.push(newUser);
    card.usedBy = username;
    card.usedAt = now;
    card.enabled = false;

    // 记录操作日志
    logUserAction('register', username, {
        cardCode,
        cardType: card.type,
        cardDays: card.days,
        expiresAt: newUser.card.expiresAt,
    });

    return { ok: true, user: { username: newUser.username, role: newUser.role, card: newUser.card } };
}

async function renewUser(username, cardCode) {
    await loadUsers();
    await loadCards();

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

    const renewDays = card.days || getDefaultDaysForType(card.type);

    await transaction(async (conn) => {
        await conn.query(
            "UPDATE cards SET enabled=?, used_by=(SELECT id FROM users WHERE username = ?), used_at=? WHERE code=?",
            [0, username, new Date(now), card.code]
        );
    });

    user.card.code = card.code;
    user.card.description = card.description;
    user.card.type = card.type;
    user.card.typeChar = card.typeChar;
    user.card.days = renewDays;
    user.card.expiresAt = newExpiresAt;
    user.card.enabled = true;

    card.usedBy = username;
    card.usedAt = now;
    card.enabled = false;

    // 记录操作日志
    logUserAction('renew', username, {
        cardCode,
        cardType: card.type,
        cardDays: card.days,
        newExpiresAt: user.card.expiresAt,
    });

    return { ok: true, card: user.card };
}

async function getAllUsers() {
    await loadUsers();
    return users.map(u => ({
        username: u.username,
        role: u.role,
        card: u.card
    }));
}

async function getAllUsersWithPassword() {
    await loadUsers();
    return users.map(u => ({
        username: u.username,
        password: u.plainPassword || '',
        role: u.role,
        card: u.card
    }));
}

async function updateUser(username, updates) {
    await loadUsers();
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

    const pool = getPool();
    if (pool) {
        // cards 结构更新
        await pool.query(
            "UPDATE cards SET expires_at=?, enabled=? WHERE used_by=(SELECT id FROM users WHERE username = ?)",
            [user.card.expiresAt ? new Date(user.card.expiresAt) : null, user.card.enabled ? 1 : 0, username]
        ).catch(e => console.error("Update User Card Data Error:", e.message));
    } else {
        await saveUsers();
    }
    console.log('[保存完成] 用户状态已保存到数据库');

    return { username: user.username, role: user.role, card: user.card };
}

async function deleteUser(username) {
    await loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { ok: false, error: '用户不存在' };

    // 不允许删除管理员账号
    if (users[idx].role === 'admin') {
        return { ok: false, error: '不能删除管理员账号' };
    }

    await getPool().query("DELETE FROM users WHERE username=?", [username]);

    users.splice(idx, 1);
    return { ok: true };
}

async function changePassword(username, oldPassword, newPassword) {
    await loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    const verify = security.verifyPassword(oldPassword, user.password);
    if (!verify.valid) {
        return { ok: false, error: '旧密码错误' };
    }

    const strength = security.checkPasswordStrength(newPassword);
    if (!strength.strong) {
        return { ok: false, error: strength.errors.join('；') };
    }

    user.password = security.hashPassword(newPassword);
    user.plainPassword = newPassword;

    const pool = getPool();
    if (pool) {
        await pool.query("UPDATE users SET password_hash=? WHERE username=?", [user.password, username]).catch(e => console.error("Change Password DB Error:", e.message));
    } else {
        await saveUsers();
    }

    return { ok: true };
}

/**
 * 管理员密码修改（跳过强密码校验，仅由路由层校验最低长度）
 * @param {string} username - 用户名
 * @param {string} oldPassword - 旧密码
 * @param {string} newPassword - 新密码
 * @returns {{ ok: boolean, error?: string }}
 */
async function changeAdminPassword(username, oldPassword, newPassword) {
    await loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    const verify = security.verifyPassword(oldPassword, user.password);
    if (!verify.valid) {
        return { ok: false, error: '旧密码错误' };
    }

    // 管理员走简化校验，不执行 checkPasswordStrength
    user.password = security.hashPassword(newPassword);
    user.plainPassword = newPassword;

    const pool = getPool();
    if (pool) {
        await pool.query("UPDATE users SET password_hash=? WHERE username=?", [user.password, username]).catch(e => console.error("Change Admin Password DB Error:", e.message));
    } else {
        await saveUsers();
    }

    return { ok: true };
}

async function getAllCards() {
    await loadCards();
    return cards;
}

async function createCard(description, type, days, forcedCode) {
    await loadCards();

    // 验证卡密类型，使用统一枚举
    if (!isValidCardType(type)) {
        type = CARD_TYPES.MONTH; // 默认月卡
    }

    const parsedDays = Number.parseInt(days, 10) || getDefaultDaysForType(type);

    const newCard = {
        code: forcedCode || generateCardCode(),
        description,
        type,
        typeChar: type,
        days: parsedDays,
        enabled: true,
        usedBy: null,
        usedAt: null, // 修正为 usedAt
        createdAt: Date.now()
    };

    cards.push(newCard);
    const pool = getPool();
    if (pool) {
        await pool.query(
            "INSERT INTO cards (code, type, description, enabled) VALUES (?, ?, ?, ?)",
            [newCard.code, newCard.type, newCard.description || '', 1]
        ).catch(e => console.error("Insert New Card Error:", e.message));
    } else {
        await saveCards();
    }

    return newCard;
}

async function updateCard(code, updates) {
    await loadCards();
    const card = cards.find(c => c.code === code);
    if (!card) return null;

    if (updates.description !== undefined) {
        card.description = updates.description;
    }

    if (updates.enabled !== undefined) {
        card.enabled = updates.enabled;
    }

    const pool = getPool();
    if (pool) {
        await pool.query(
            "UPDATE cards SET description=?, enabled=? WHERE code=?",
            [card.description || '', card.enabled ? 1 : 0, card.code]
        ).catch(e => console.error("Update Card Data Error:", e.message));
    } else {
        await saveCards();
    }
    return card;
}

async function deleteCard(code) {
    await loadCards();
    const idx = cards.findIndex(c => c.code === code);
    if (idx === -1) return false;

    cards.splice(idx, 1);

    const pool = getPool();
    if (pool) {
        await pool.query("DELETE FROM cards WHERE code=?", [code]).catch(e => console.error("Delete Card Error:", e.message));
    } else {
        await saveCards();
    }
    return true;
}

// 初始化
async function loadAllFromDB() {
    await loadUsers();
    await loadCards();
    await initDefaultAdmin();
}

// initDefaultAdmin();
loadIPHistory();

/**
 * 按 username 查找用户完整信息（含卡密、角色、过期状态）
 * 用于 JWT 中间件实时校验用户当前状态
 */
async function getUserInfo(username) {
    await loadUsers();
    const u = users.find(item => item.username === username);
    if (!u) return null;
    const isExpired = u.card?.expiresAt ? u.card.expiresAt < Date.now() : false;
    return {
        username: u.username,
        role: u.role || 'user',
        cardCode: u.cardCode || null,
        card: u.card || null,
        isExpired,
    };
}

module.exports = {
    loadAllFromDB,
    loadUsers,
    loadCards,
    validateUser,
    registerUser,
    renewUser,
    getAllUsers,
    getAllUsersWithPassword,
    updateUser,
    deleteUser,
    changePassword,
    changeAdminPassword,
    getAllCards,
    createCard,
    updateCard,
    deleteCard,
    hashPassword,
    createTrialCard,
    renewTrialUser,
    getUserInfo,
};

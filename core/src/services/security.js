/**
 * PBKDF2 密码安全模块
 *
 *   hashPassword(plain)               - PBKDF2 哈希
 *   verifyPassword(plain, stored)     - 校验(自动识别旧 SHA256 格式)
 *   checkPasswordStrength(plain)      - 密码强度检查
 *   LoginLockManager                  - 登录锁定管理
 */

const crypto = require('node:crypto');
const { createModuleLogger } = require('./logger');

const securityLogger = createModuleLogger('security');

const PBKDF2_ITERATIONS = 10000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const SALT_LENGTH = 32;
const HASH_PREFIX = 'pbkdf2$';

// ============ 密码哈希 ============

/**
 * 使用 PBKDF2 + 随机盐 生成密码哈希
 * 格式: "pbkdf2$<iterations>$<salt_hex>$<hash_hex>"
 * @param {string} plain - 明文密码
 * @returns {string} 哈希字符串
 */
function hashPassword(plain) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = crypto.pbkdf2Sync(
        String(plain || ''),
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST,
    );
    return `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * 旧版 SHA256 哈希（兼容）
 * @param {string} plain
 * @returns {string}
 */
function hashPasswordLegacy(plain) {
    return crypto.createHash('sha256').update(String(plain || '')).digest('hex');
}

/**
 * 判断哈希是否为 PBKDF2 格式
 * @param {string} stored
 * @returns {boolean}
 */
function isPBKDF2Hash(stored) {
    return typeof stored === 'string' && stored.startsWith(HASH_PREFIX);
}

/**
 * 校验密码
 * 自动识别哈希格式：PBKDF2 或旧版 SHA256
 *
 * @param {string} plain  - 用户输入的明文密码
 * @param {string} stored - 数据库中存储的哈希
 * @returns {{ valid: boolean, needsMigration: boolean }}
 */
function verifyPassword(plain, stored) {
    if (!stored) return { valid: false, needsMigration: false };

    if (isPBKDF2Hash(stored)) {
        try {
            const parts = stored.split('$');
            if (parts.length !== 4) return { valid: false, needsMigration: false };

            const iterations = Number.parseInt(parts[1], 10);
            if (!Number.isFinite(iterations) || iterations < 1) {
                return { valid: false, needsMigration: false };
            }

            const saltHex = parts[2];
            const storedHashHex = parts[3];
            if (!saltHex || !storedHashHex) return { valid: false, needsMigration: false };

            const salt = Buffer.from(saltHex, 'hex');
            const storedHashBuf = Buffer.from(storedHashHex, 'hex');

            if (storedHashBuf.length !== PBKDF2_KEYLEN) {
                return { valid: false, needsMigration: false };
            }

            const hash = crypto.pbkdf2Sync(
                String(plain || ''),
                salt,
                iterations,
                PBKDF2_KEYLEN,
                PBKDF2_DIGEST,
            );

            const valid = crypto.timingSafeEqual(storedHashBuf, hash);
            return { valid, needsMigration: false };
        } catch {
            return { valid: false, needsMigration: false };
        }
    }

    // 旧版 SHA256 格式
    const legacyHash = hashPasswordLegacy(plain);
    const valid = legacyHash === stored;
    return { valid, needsMigration: valid };
}

// ============ 密码强度检查 ============

/**
 * 检查密码强度
 * @param {string} plain - 明文密码
 * @returns {{ strong: boolean, errors: string[], score: number }}
 */
function checkPasswordStrength(plain) {
    const pwd = String(plain || '');
    const errors = [];
    let score = 0;

    if (pwd.length < 8) {
        errors.push('密码长度至少 8 位');
    } else {
        score += 1;
    }

    if (!/[a-z]/.test(pwd)) {
        errors.push('需包含小写字母');
    } else {
        score += 1;
    }

    if (!/[A-Z]/.test(pwd)) {
        errors.push('需包含大写字母');
    } else {
        score += 1;
    }

    if (!/\d/.test(pwd)) {
        errors.push('需包含数字');
    } else {
        score += 1;
    }

    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) {
        score += 1;
    }

    return {
        strong: errors.length === 0,
        errors,
        score,
    };
}

// ============ 登录锁定管理 ============

class LoginLockManager {
    /**
     * @param {object} opts
     * @param {number} opts.maxAttempts  - 最大尝试次数
     * @param {number} opts.lockDurationMs - 锁定时长(ms)
     */
    constructor({ maxAttempts = 5, lockDurationMs = 5 * 60 * 1000 } = {}) {
        this.maxAttempts = maxAttempts;
        this.lockDurationMs = lockDurationMs;
        this._attempts = new Map();
    }

    /**
     * 检查是否被锁定
     * @param {string} key - 锁定键(用户名或IP)
     * @returns {{ locked: boolean, remainingMs: number, attempts: number }}
     */
    checkLock(key) {
        const record = this._attempts.get(key);
        if (!record) return { locked: false, remainingMs: 0, attempts: 0 };

        if (record.lockedUntil && Date.now() < record.lockedUntil) {
            const remainingMs = record.lockedUntil - Date.now();
            return { locked: true, remainingMs, attempts: record.count };
        }

        if (record.lockedUntil && Date.now() >= record.lockedUntil) {
            this._attempts.delete(key);
            return { locked: false, remainingMs: 0, attempts: 0 };
        }

        return { locked: false, remainingMs: 0, attempts: record.count };
    }

    /**
     * 记录一次失败尝试
     * @param {string} key
     * @returns {{ locked: boolean, remainingMs: number, attempts: number }}
     */
    recordFailure(key) {
        let record = this._attempts.get(key);
        if (!record) {
            record = { count: 0, firstAttempt: Date.now(), lockedUntil: null };
            this._attempts.set(key, record);
        }

        if (record.lockedUntil && Date.now() >= record.lockedUntil) {
            record = { count: 0, firstAttempt: Date.now(), lockedUntil: null };
            this._attempts.set(key, record);
        }

        record.count++;

        if (record.count >= this.maxAttempts) {
            record.lockedUntil = Date.now() + this.lockDurationMs;
            securityLogger.warn(`登录锁定: ${key}`, {
                attempts: record.count,
                lockMinutes: Math.round(this.lockDurationMs / 60000),
            });
            return {
                locked: true,
                remainingMs: this.lockDurationMs,
                attempts: record.count,
            };
        }

        return {
            locked: false,
            remainingMs: 0,
            attempts: record.count,
        };
    }

    /**
     * 登录成功后清除记录
     * @param {string} key
     */
    recordSuccess(key) {
        this._attempts.delete(key);
    }

    /**
     * 定期清理过期记录
     */
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this._attempts) {
            if (record.lockedUntil && now >= record.lockedUntil) {
                this._attempts.delete(key);
            } else if (!record.lockedUntil && now - record.firstAttempt > this.lockDurationMs * 2) {
                this._attempts.delete(key);
            }
        }
    }
}

// 全局登录锁定实例
const loginLock = new LoginLockManager();

// 每 10 分钟清理过期记录（可清理，便于测试/热重载）
// 注意：热重载时会加载新模块实例，旧实例的 setInterval 无法被新实例清除。
// 测试或热重载前请显式调用 stopLoginLockCleanup()，避免多定时器重复注册。
let _cleanupIntervalHandle = null;

function startLoginLockCleanup() {
    if (_cleanupIntervalHandle) return;
    _cleanupIntervalHandle = setInterval(() => loginLock.cleanup(), 10 * 60 * 1000);
    securityLogger.debug('登录锁定清理定时器已启动');
}

function stopLoginLockCleanup() {
    if (_cleanupIntervalHandle) {
        clearInterval(_cleanupIntervalHandle);
        _cleanupIntervalHandle = null;
        securityLogger.debug('登录锁定清理定时器已停止');
    }
}

startLoginLockCleanup();

module.exports = {
    hashPassword,
    hashPasswordLegacy,
    verifyPassword,
    isPBKDF2Hash,
    checkPasswordStrength,
    LoginLockManager,
    loginLock,
    startLoginLockCleanup,
    stopLoginLockCleanup,
};

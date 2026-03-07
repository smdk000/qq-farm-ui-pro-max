const crypto = require('node:crypto');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { ensureDataDir, getDataFile } = require('../config/runtime-paths');
const { createModuleLogger } = require('./logger');
const { getPool } = require('./mysql-db');

const logger = createModuleLogger('jwt');

const TOKEN_CONFIG = {
    admin: { accessExpiresIn: '24h', refreshExpiresInMs: 365 * 24 * 3600 * 1000 },
    user:  { accessExpiresIn: '600m', refreshExpiresInMs: 7 * 24 * 3600 * 1000 },
};

let _jwtSecret = null;

function getJwtSecret() {
    if (_jwtSecret) return _jwtSecret;

    if (process.env.JWT_SECRET) {
        _jwtSecret = process.env.JWT_SECRET;
        return _jwtSecret;
    }

    ensureDataDir();
    const secretFile = getDataFile('.jwt-secret');
    try {
        if (fs.existsSync(secretFile)) {
            const stored = fs.readFileSync(secretFile, 'utf8').trim();
            if (stored.length >= 32) {
                _jwtSecret = stored;
                try { fs.chmodSync(secretFile, 0o600); } catch { /* non-critical */ }
                return _jwtSecret;
            }
        }
    } catch { /* regenerate below */ }

    const newSecret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, newSecret, { encoding: 'utf8', mode: 0o600 });
    _jwtSecret = newSecret;
    logger.info('JWT secret generated and persisted');
    return _jwtSecret;
}

function signAccessToken(payload) {
    const role = payload.role || 'user';
    const cfg = TOKEN_CONFIG[role] || TOKEN_CONFIG.user;
    return jwt.sign(
        { username: payload.username, role },
        getJwtSecret(),
        { expiresIn: cfg.accessExpiresIn, issuer: 'qq-farm-bot' },
    );
}

function verifyAccessToken(token) {
    try {
        return jwt.verify(token, getJwtSecret(), { issuer: 'qq-farm-bot' });
    } catch {
        return null;
    }
}

function generateRefreshToken() {
    return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function storeRefreshToken(username, refreshToken, role, req) {
    const pool = getPool();
    const cfg = TOKEN_CONFIG[role] || TOKEN_CONFIG.user;
    const expiresAt = new Date(Date.now() + cfg.refreshExpiresInMs);
    const tokenHash = hashToken(refreshToken);
    const ua = (req?.headers?.['user-agent'] || '').substring(0, 512);
    const ip = req?.ip || req?.connection?.remoteAddress || '';
    await pool.execute(
        'INSERT INTO refresh_tokens (username, token_hash, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)',
        [username, tokenHash, expiresAt, ua, ip],
    );
}

async function verifyRefreshToken(refreshToken) {
    const pool = getPool();
    const tokenHash = hashToken(refreshToken);
    const [rows] = await pool.execute(
        'SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW()',
        [tokenHash],
    );
    return rows.length > 0 ? rows[0] : null;
}

async function revokeRefreshToken(refreshToken) {
    const pool = getPool();
    await pool.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashToken(refreshToken)]);
}

async function atomicConsumeRefreshToken(refreshToken) {
    const pool = getPool();
    const tokenHash = hashToken(refreshToken);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
            'SELECT username FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW() FOR UPDATE',
            [tokenHash],
        );
        if (rows.length === 0) {
            await conn.rollback();
            return null;
        }
        await conn.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
        await conn.commit();
        return { username: rows[0].username };
    } catch (err) {
        try { await conn.rollback(); } catch { /* ignore */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function revokeAllUserTokens(username) {
    const pool = getPool();
    await pool.execute('DELETE FROM refresh_tokens WHERE username = ?', [username]);
}

async function cleanExpiredTokens() {
    const pool = getPool();
    try {
        const [result] = await pool.execute('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
        if (result.affectedRows > 0) {
            logger.info(`Cleaned ${result.affectedRows} expired refresh tokens`);
        }
    } catch (e) {
        logger.error('Failed to clean expired tokens:', e.message);
    }
}

const COOKIE_SECURE_MODE = String(process.env.COOKIE_SECURE || 'auto').trim().toLowerCase();

function getMaxAgeMs(role) {
    const cfg = TOKEN_CONFIG[role] || TOKEN_CONFIG.user;
    const str = cfg.accessExpiresIn;
    if (str.endsWith('h')) return Number.parseInt(str) * 3600000;
    if (str.endsWith('m')) return Number.parseInt(str) * 60000;
    return 36000000;
}

function getForwardedProto(req) {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    if (forwardedProto) return forwardedProto;

    const forwarded = String(req?.headers?.forwarded || '').toLowerCase();
    const match = forwarded.match(/proto=(https?)/);
    return match ? match[1] : '';
}

function shouldUseSecureCookies(req) {
    if (COOKIE_SECURE_MODE === 'true' || COOKIE_SECURE_MODE === '1' || COOKIE_SECURE_MODE === 'always')
        return true;

    if (COOKIE_SECURE_MODE === 'false' || COOKIE_SECURE_MODE === '0' || COOKIE_SECURE_MODE === 'never')
        return false;

    return Boolean(req?.secure || getForwardedProto(req) === 'https');
}

function getBaseCookieOptions(req) {
    return {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'lax',
    };
}

function setTokenCookies(req, res, accessToken, refreshToken, role) {
    const baseOpts = getBaseCookieOptions(req);
    res.cookie('access_token', accessToken, {
        ...baseOpts,
        path: '/',
        maxAge: getMaxAgeMs(role),
    });
    res.cookie('refresh_token', refreshToken, {
        ...baseOpts,
        path: '/api/auth',
        maxAge: (TOKEN_CONFIG[role] || TOKEN_CONFIG.user).refreshExpiresInMs,
    });
}

function clearTokenCookies(req, res) {
    const baseOpts = getBaseCookieOptions(req);
    res.clearCookie('access_token', { ...baseOpts, path: '/' });
    res.clearCookie('refresh_token', { ...baseOpts, path: '/api/auth' });
}

module.exports = {
    signAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    storeRefreshToken,
    verifyRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    atomicConsumeRefreshToken,
    cleanExpiredTokens,
    shouldUseSecureCookies,
    setTokenCookies,
    clearTokenCookies,
    TOKEN_CONFIG,
};

const crypto = require('node:crypto');
const farmCalculator = require('../services/farm-calculator');
/**
 * 管理面板 HTTP 服务
 * 改写为接收 DataProvider 模式，并集成多用户系统
 */

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const express = require('express');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const { Server: SocketIOServer } = require('socket.io');
const { version } = require('../../package.json');
const { CONFIG } = require('../config/config');
const { getLevelExpProgress } = require('../config/gameConfig');
const { getResourcePath } = require('../config/runtime-paths');
const store = require('../models/store');
const { addOrUpdateAccount, deleteAccount } = store;
const { findAccountByRef, normalizeAccountRef, resolveAccountId } = require('../services/account-resolver');
const { createModuleLogger } = require('../services/logger');
const { getPool } = require('../services/mysql-db');
const { getAnnouncements, saveAnnouncement, deleteAnnouncement } = require('../services/database');
const { MiniProgramLoginSession } = require('../services/qrlogin');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');
const { validateSettings } = require('../services/config-validator');
const security = require('../services/security');
const userStore = require('../models/user-store');
const usersController = require('./users');
const cardsController = require('./cards');
const { validateUsername, validatePassword, validateCardCode } = require('../utils/validators');
const accountRepository = require('../repositories/account-repository');
const jwtService = require('../services/jwt-service');

const adminLogger = createModuleLogger('admin');

let app = null;
let server = null;
let provider = null; // DataProvider
let io = null;

function emitRealtimeStatus(accountId, status) {
    if (!io) return;
    const id = String(accountId || '').trim();
    if (!id) return;
    io.to(`account:${id}`).emit('status:update', { accountId: id, status });
    io.to('account:all').emit('status:update', { accountId: id, status });
}

function emitRealtimeLog(entry) {
    if (!io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    if (id) io.to(`account:${id}`).emit('log:new', payload);
    io.to('account:all').emit('log:new', payload);
}

function emitRealtimeAccountLog(entry) {
    if (!io) return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    if (id) io.to(`account:${id}`).emit('account-log:new', payload);
    io.to('account:all').emit('account-log:new', payload);
}

/**
 * 鲁棒提取客户端 IP
 */
function getClientIP(req) {
    const forward = req.headers['x-forwarded-for'];
    if (forward) {
        // 取第一个非内网 IP
        const ips = forward.split(',').map(s => s.trim());
        for (const ip of ips) {
            if (ip && !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.')) {
                return ip;
            }
        }
    }
    return req.ip || req.connection.remoteAddress || '0.0.0.0';
}

function startAdminServer(dataProvider) {
    if (app) return;
    provider = dataProvider;

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    const authRequired = async (req, res, next) => {
        try {
            const accessToken = req.cookies?.access_token || req.headers['x-admin-token'] || '';
            if (!accessToken) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }
            const decoded = jwtService.verifyAccessToken(accessToken);
            if (!decoded) {
                return res.status(401).json({ ok: false, error: 'Token expired or invalid' });
            }
            const userInfo = await userStore.getUserInfo(decoded.username);
            if (!userInfo) {
                return res.status(401).json({ ok: false, error: 'User not found' });
            }
            req.currentUser = userInfo;
            next();
        } catch (err) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
    };

    // 避免 Dirty Write（如 NTP 失步导致短时间内多次运行导致双倍或多倍累加，仅通过日期字符串锁来拦截同一天的多次并发写库）
    let lastCronSyncDate = '';

    // 在系统启动时挂载全局清算 CRON (每天 23:59:50 触发)
    cron.schedule('50 59 23 * * *', async () => {
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            if (lastCronSyncDate === todayStr) {
                adminLogger.warn(`【CRON】清算拦截: 今日 (${todayStr}) 的账单已聚合写库，防止 Dirty Write 双倍数据`);
                return;
            }
            lastCronSyncDate = todayStr;

            adminLogger.info("触发每日系统产出清算，正在聚合所有运行中账号收益并落表...");

            if (!provider || typeof provider.getAccounts !== 'function') return;
            const data = await provider.getAccounts();
            if (!data || !Array.isArray(data.accounts)) return;

            let tExp = 0; let tGold = 0; let tSteal = 0; let tHelp = 0;
            for (const acc of data.accounts) {
                if (acc.stats) {
                    tExp += (acc.stats.sessionExpGained || 0);
                    tGold += (acc.stats.sessionGoldGained || 0);
                    tSteal += (acc.stats.operations?.steal || 0);
                    tHelp += (acc.stats.operations?.helpWater || 0) + (acc.stats.operations?.helpWeed || 0) + (acc.stats.operations?.helpBug || 0);

                    // 清理内存会话的数据增量（否则如果应用不主动重启将不断累加到明天）
                    acc.stats.sessionExpGained = 0;
                    acc.stats.sessionGoldGained = 0;
                    if (acc.stats.operations) {
                        acc.stats.operations.steal = 0;
                        acc.stats.operations.helpWater = 0;
                        acc.stats.operations.helpWeed = 0;
                        acc.stats.operations.helpBug = 0;
                    }
                }
            }

            const pool = getPool();
            if (pool) {
                const today = new Date();
                const yyyyMMdd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                await pool.query(
                    `INSERT INTO stats_daily (record_date, total_exp, total_gold, total_steal, total_help) 
                     VALUES (?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     total_exp = total_exp + VALUES(total_exp), 
                     total_gold = total_gold + VALUES(total_gold), 
                     total_steal = total_steal + VALUES(total_steal), 
                     total_help = total_help + VALUES(total_help)`,
                    [yyyyMMdd, tExp, tGold, tSteal, tHelp]
                );
                adminLogger.info(`【CRON】清算完成: 经验+${tExp}, 金币+${tGold}, 偷取+${tSteal}`);
            }
        } catch (e) {
            adminLogger.error("CRON 清算产生异常:", e.message);
        }
    });

    const EXPIRED_WHITELIST = new Set(['/auth/renew', '/auth/trial-renew', '/trial-card-config', '/auth/validate', '/auth/change-password', '/ping', '/announcement']);
    const BANNED_WHITELIST = new Set(['/auth/validate', '/ping']);

    const userRequired = (req, res, next) => {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

        if (req.currentUser.role === 'admin') {
            return next();
        }

        const currentPath = req.path.replace(/^\/api/, '');

        if (req.currentUser.card?.enabled === false) {
            if (BANNED_WHITELIST.has(currentPath)) return next();
            return res.status(403).json({ ok: false, error: '账号已被封禁' });
        }

        if (req.currentUser.isExpired) {
            if (EXPIRED_WHITELIST.has(currentPath)) return next();
            return res.status(403).json({ ok: false, error: '账号已过期，请续费后操作' });
        }

        next();
    };

    // 账号所有权验证中间件
    const accountOwnershipRequired = async (req, res, next) => {
        const accountId = req.headers['x-account-id'] || req.params.id;
        if (!accountId) {
            return res.status(400).json({ ok: false, error: 'Missing account ID' });
        }

        // 管理员可以访问所有账号
        if (req.currentUser?.role === 'admin') {
            return next();
        }

        const allAccounts = await store.getAccounts();
        const account = allAccounts.accounts.find(a => String(a.id) === String(accountId));

        if (!account) {
            return res.status(404).json({ ok: false, error: '账号不存在' });
        }

        // 没有 username 的属于管理员公共财产，或者必须与当前用户名一致
        if (!account.username || account.username !== req.currentUser.username) {
            return res.status(403).json({ ok: false, error: '无权操作此账号' });
        }

        next();
    };

    const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    app.use((req, res, next) => {
        const origin = req.headers.origin || '';
        const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
        const isAllowed = isLocalDev || allowedOrigins.includes(origin);

        if (origin && isAllowed) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        } else if (!origin) {
            res.header('Access-Control-Allow-Origin', '*');
        }

        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-account-id, x-admin-token');
        res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.header('Pragma', 'no-cache');
        res.header('Expires', '0');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    const webDist = path.join(__dirname, '../../../web/dist');
    if (fs.existsSync(webDist)) {
        app.use(express.static(webDist));
    } else {
        adminLogger.warn('web build not found', { webDist });
        app.get('/', (req, res) => res.send('web build not found. Please build the web project.'));
    }
    app.use('/game-config', express.static(getResourcePath('gameConfig')));

    // 登录与鉴权 - 支持多用户 + PBKDF2 + 登录锁定
    app.post('/api/login', async (req, res) => {
        try {
            const { username, password } = req.body || {};
            const clientIP = getClientIP(req);
            const lockKey = username ? `user:${username}` : `ip:${clientIP}`;

            const lockStatus = security.loginLock.checkLock(lockKey);
            if (lockStatus.locked) {
                const remainMin = Math.ceil(lockStatus.remainingMs / 60000);
                return res.status(429).json({
                    ok: false,
                    error: `登录尝试过多，请 ${remainMin} 分钟后再试`,
                });
            }

            let validatedUser;

            if (!username) {
                const input = String(password || '');
                const adminUser = await userStore.validateUser('admin', input);
                const ok = adminUser && !adminUser.error;
                if (!ok) {
                    security.loginLock.recordFailure(lockKey);
                    return res.status(401).json({ ok: false, error: 'Invalid password' });
                }
                validatedUser = { username: 'admin', role: 'admin', card: null };
            } else {
                const user = await userStore.validateUser(username, password);
                if (!user) {
                    security.loginLock.recordFailure(lockKey);
                    return res.status(401).json({ ok: false, error: '用户名或密码错误' });
                }
                if (user.error) {
                    return res.status(403).json({ ok: false, error: user.error });
                }
                validatedUser = { username: user.username, role: user.role, card: user.card };
            }

            security.loginLock.recordSuccess(lockKey);

            const accessToken = jwtService.signAccessToken(validatedUser);
            const refreshToken = jwtService.generateRefreshToken();
            await jwtService.storeRefreshToken(validatedUser.username, refreshToken, validatedUser.role, req);
            jwtService.setTokenCookies(req, res, accessToken, refreshToken, validatedUser.role);

            const defaultPwd = CONFIG.adminPassword || 'admin';
            const isDefaultPassword = (password === defaultPwd);

            res.json({
                ok: true,
                data: {
                    user: {
                        username: validatedUser.username,
                        role: validatedUser.role,
                        card: validatedUser.card,
                    },
                    ...(isDefaultPassword && { passwordWarning: '您正在使用默认密码，建议尽快修改以保障账户安全' }),
                },
            });
        } catch (err) {
            logger.error('Login error:', err.message);
            return res.status(500).json({ ok: false, error: 'Server error' });
        }
    });

    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const oldRefresh = req.cookies?.refresh_token;
            if (!oldRefresh) return res.status(401).json({ ok: false, error: 'No refresh token' });

            const consumed = await jwtService.atomicConsumeRefreshToken(oldRefresh);
            if (!consumed) return res.status(401).json({ ok: false, error: 'Invalid or expired refresh token' });

            const userInfo = await userStore.getUserInfo(consumed.username);
            if (!userInfo) return res.status(401).json({ ok: false, error: 'User not found' });

            const newAccess = jwtService.signAccessToken(userInfo);
            const newRefresh = jwtService.generateRefreshToken();
            await jwtService.storeRefreshToken(userInfo.username, newRefresh, userInfo.role, req);
            jwtService.setTokenCookies(req, res, newAccess, newRefresh, userInfo.role);

            res.json({ ok: true });
        } catch (err) {
            logger.error('Token refresh error:', err.message);
            return res.status(500).json({ ok: false, error: 'Server error' });
        }
    });

    app.post('/api/auth/logout', async (req, res) => {
        try {
            const refreshToken = req.cookies?.refresh_token;
            if (refreshToken) await jwtService.revokeRefreshToken(refreshToken);
        } catch (err) {
            logger.error('Logout error:', err.message);
        }
        jwtService.clearTokenCookies(req, res);
        res.json({ ok: true });
    });

    // Farm Tools API 微服务接管
    app.use('/api', require('./farm-tools-routing'));

    const PUBLIC_PATHS = new Set(['/login', '/auth/register', '/auth/refresh', '/auth/logout', '/qr/create', '/qr/check', '/notifications', '/trial-card', '/ui-config']);
    app.use('/api', (req, res, next) => {
        if (PUBLIC_PATHS.has(req.path)) return next();
        authRequired(req, res, (err) => {
            if (err) return next(err);
            userRequired(req, res, next);
        });
    });

    app.get('/api/system-logs', async (req, res) => {
        try {
            const pool = getPool();

            const page = Math.max(1, Number.parseInt(req.query.page) || 1);
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            const { level, accountId, keyword } = req.query;

            let querySql = "SELECT * FROM system_logs WHERE 1=1";
            let countSql = "SELECT COUNT(*) as total FROM system_logs WHERE 1=1";
            const params = [];

            // 数据隔离：非管理员只能查看自己账号的系统日志
            if (req.currentUser && req.currentUser.role !== 'admin') {
                const allAccounts = await store.getAccounts();
                const userAccountIds = allAccounts.accounts
                    .filter(a => a.username === req.currentUser.username)
                    .map(a => String(a.id));
                if (userAccountIds.length === 0) {
                    return res.json({ ok: true, data: { total: 0, page, limit, items: [] } });
                }
                const placeholders = userAccountIds.map(() => '?').join(',');
                querySql += ` AND account_id IN (${placeholders})`;
                countSql += ` AND account_id IN (${placeholders})`;
                params.push(...userAccountIds);
            }

            if (level) {
                querySql += " AND level = ?";
                countSql += " AND level = ?";
                params.push(level);
            }
            if (accountId) {
                querySql += " AND account_id = ?";
                countSql += " AND account_id = ?";
                params.push(accountId);
            }
            if (keyword) {
                querySql += " AND text LIKE ?";
                countSql += " AND text LIKE ?";
                params.push(`%${keyword}%`);
            }

            querySql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
            const queryParams = [...params, limit, offset];

            const [countRows] = await pool.query(countSql, params);
            const [rows] = await pool.query(querySql, queryParams);

            res.json({
                ok: true,
                data: {
                    total: countRows[0].total,
                    page,
                    limit,
                    items: rows
                }
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Phase 4/5: Echarts 数据走势聚合真实下发
    app.get('/api/stats/trend', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '全局统计趋势仅限管理员查看' });
            }
            const pool = getPool();

            const [rows] = await pool.query(
                `SELECT DATE_FORMAT(record_date, '%m-%d') as short_date, total_exp, total_gold, total_steal
                 FROM stats_daily
                 ORDER BY record_date DESC LIMIT 7`
            );

            // 倒序以便图表从左到右显示时间线
            rows.reverse();

            const dates = [];
            const exp = [];
            const gold = [];
            const steal = [];

            // 防止空库导致的完全空图表，至少返回一天空数据
            if (rows.length === 0) {
                const d = new Date();
                dates.push(`${d.getMonth() + 1}-${d.getDate()}`);
                exp.push(0);
                gold.push(0);
                steal.push(0);
            } else {
                for (const row of rows) {
                    dates.push(row.short_date);
                    exp.push(row.total_exp || 0);
                    gold.push(row.total_gold || 0);
                    steal.push(row.total_steal || 0);
                }
            }

            res.json({
                ok: true,
                data: { dates, series: { exp, gold, steal } }
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 密码修改已统一迁移至 /api/auth/change-password（基于 token 识别当前用户，见 users.js）
    // 该路由已于 v4.5 移除，所有用户（含管理员）通过同一端点修改自己的密码

    app.get('/api/ping', async (req, res) => {
        res.json({ ok: true, data: { ok: true, uptime: process.uptime(), version } });
    });

    app.get('/api/auth/validate', async (req, res) => {
        res.json({
            ok: true,
            data: {
                valid: true,
                user: {
                    username: req.currentUser?.username,
                    role: req.currentUser?.role,
                    card: req.currentUser?.card,
                },
            },
        });
    });

    // 公开 API: 获取 UI 配置 (用于登录页背景等)
    app.get('/api/ui-config', async (req, res) => {
        const ui = store.getUI();
        res.json({ ok: true, data: ui });
    });

    // API: 调度任务快照（用于调度收敛排查）
    app.get('/api/scheduler', async (req, res) => {
        try {
            const id = await getAccId(req);
            if (provider && typeof provider.getSchedulerStatus === 'function') {
                const data = await provider.getSchedulerStatus(id);
                return res.json({ ok: true, data });
            }
            return res.json({ ok: true, data: { runtime: getSchedulerRegistrySnapshot(), worker: null, workerError: 'DataProvider does not support scheduler status' } });
        } catch (e) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/logout', async (req, res) => {
        try {
            const refreshToken = req.cookies?.refresh_token;
            if (refreshToken) await jwtService.revokeRefreshToken(refreshToken);
        } catch (err) {
            logger.error('Legacy logout error:', err.message);
        }
        jwtService.clearTokenCookies(req, res);
        res.json({ ok: true });
    });

    const getAccountList = async () => {
        try {
            if (provider && typeof provider.getAccounts === 'function') {
                const data = await provider.getAccounts();
                if (data && Array.isArray(data.accounts)) return data.accounts;
            }
        } catch {
            // ignore provider failures
        }
        const data = store.getAccounts ? await store.getAccounts() : { accounts: [] };
        return Array.isArray(data.accounts) ? data.accounts : [];
    };

    const isSoftRuntimeError = (err) => {
        const msg = String((err && err.message) || '');
        return msg === '账号未运行' || msg === 'API Timeout';
    };

    function handleApiError(res, err) {
        if (isSoftRuntimeError(err)) {
            return res.json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: err.message });
    }

    const resolveAccId = async (rawRef) => {
        const input = normalizeAccountRef(rawRef);
        if (!input) return '';

        if (provider && typeof provider.resolveAccountId === 'function') {
            const resolvedByProvider = normalizeAccountRef(await provider.resolveAccountId(input));
            if (resolvedByProvider) return resolvedByProvider;
        }

        const resolved = resolveAccountId(await getAccountList(), input);
        return resolved || input;
    };

    // Helper to get account ID from header
    async function getAccId(req) {
        return await resolveAccId(req.headers['x-account-id']);
    }

    // API: 完整状态
    app.get('/api/status', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.json({ ok: false, error: 'Missing x-account-id' });

        try {
            const data = await provider.getStatus(id);
            if (data && data.status) {
                const { level, exp } = data.status;
                const progress = getLevelExpProgress(level, exp);
                data.levelProgress = progress;
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.json({ ok: false, error: e.message });
        }
    });

    app.post('/api/automation', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            const body = req.body || {};
            // 偷采过滤配置使用独立存储方法
            const stealFilterKeys = ['stealFilterEnabled', 'stealFilterMode', 'stealFilterPlantIds'];
            const stealFriendFilterKeys = ['stealFriendFilterEnabled', 'stealFriendFilterMode', 'stealFriendFilterIds'];
            const skipStealRadishKeys = ['skipStealRadishEnabled'];
            const forceGetAllKeys = ['forceGetAllEnabled'];
            if (store.setSkipStealRadishConfig && skipStealRadishKeys.some(k => body[k] !== undefined)) {
                const cur = store.getSkipStealRadishConfig ? store.getSkipStealRadishConfig(id) : { enabled: false };
                store.setSkipStealRadishConfig(id, {
                    enabled: body.skipStealRadishEnabled !== undefined ? !!body.skipStealRadishEnabled : cur.enabled,
                });
            }
            if (store.setForceGetAllConfig && forceGetAllKeys.some(k => body[k] !== undefined)) {
                const cur = store.getForceGetAllConfig ? store.getForceGetAllConfig(id) : { enabled: false };
                store.setForceGetAllConfig(id, {
                    enabled: body.forceGetAllEnabled !== undefined ? !!body.forceGetAllEnabled : cur.enabled,
                });
            }
            if (store.setStealFilterConfig && stealFilterKeys.some(k => body[k] !== undefined)) {
                const cur = store.getStealFilterConfig ? store.getStealFilterConfig(id) : { enabled: false, mode: 'blacklist', plantIds: [] };
                store.setStealFilterConfig(id, {
                    enabled: body.stealFilterEnabled !== undefined ? !!body.stealFilterEnabled : cur.enabled,
                    mode: body.stealFilterMode !== undefined ? (body.stealFilterMode === 'whitelist' ? 'whitelist' : 'blacklist') : cur.mode,
                    plantIds: Array.isArray(body.stealFilterPlantIds) ? body.stealFilterPlantIds.map(String) : (cur.plantIds || []),
                });
            }
            if (store.setStealFriendFilterConfig && stealFriendFilterKeys.some(k => body[k] !== undefined)) {
                const cur = store.getStealFriendFilterConfig ? store.getStealFriendFilterConfig(id) : { enabled: false, mode: 'blacklist', friendIds: [] };
                store.setStealFriendFilterConfig(id, {
                    enabled: body.stealFriendFilterEnabled !== undefined ? !!body.stealFriendFilterEnabled : cur.enabled,
                    mode: body.stealFriendFilterMode !== undefined ? (body.stealFriendFilterMode === 'whitelist' ? 'whitelist' : 'blacklist') : cur.mode,
                    friendIds: Array.isArray(body.stealFriendFilterIds) ? body.stealFriendFilterIds.map(String) : (cur.friendIds || []),
                });
            }
            let lastData = null;
            for (const [k, v] of Object.entries(body)) {
                if (stealFilterKeys.includes(k) || stealFriendFilterKeys.includes(k) || skipStealRadishKeys.includes(k) || forceGetAllKeys.includes(k)) continue;
                lastData = await provider.setAutomation(id, k, v);
            }
            res.json({ ok: true, data: lastData || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农田详情
    app.get('/api/lands', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getLands(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友列表
    app.get('/api/friends', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriends(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友缓存列表 (专供配置页面读取，无风控请求)
    app.get('/api/friends/cache', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { getCachedFriends, updateFriendsCache } = require('../services/database');
            let data = [];
            if (getCachedFriends) {
                data = await getCachedFriends(id);
            }
            // 缓存为空时回退到实时拉取（兼容 Worker 尚未同步或 Redis 未就绪）
            if (Array.isArray(data) && data.length === 0 && provider && provider.getFriends) {
                try {
                    data = await provider.getFriends(id);
                    if (Array.isArray(data) && data.length > 0 && updateFriendsCache) {
                        updateFriendsCache(id, data).catch(() => { });
                    }
                } catch {
                    // 忽略回退失败（如 Worker 未运行）
                }
            }
            res.json({ ok: true, data: Array.isArray(data) ? data : [] });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友农田详情
    app.get('/api/friend/:gid/lands', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriendLands(id, req.params.gid);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 对指定好友执行单次操作（偷菜/浇水/除草/捣乱）
    app.post('/api/friend/:gid/op', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        try {
            const opType = String((req.body || {}).opType || '');
            const data = await provider.doFriendOp(id, req.params.gid, opType);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友黑名单
    app.get('/api/friend-blacklist', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const list = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        res.json({ ok: true, data: list });
    });

    app.post('/api/friend-blacklist/toggle', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const gid = Number((req.body || {}).gid);
        if (!gid) return res.status(400).json({ ok: false, error: 'Missing gid' });
        const current = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        let next;
        if (current.includes(gid)) {
            next = current.filter(g => g !== gid);
        } else {
            next = [...current, gid];
        }
        const saved = store.setFriendBlacklist ? store.setFriendBlacklist(id, next) : next;
        // 同步配置到 worker 进程
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        res.json({ ok: true, data: saved });
    });

    // API: 种子列表
    app.get('/api/seeds', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getSeeds(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 背包物品
    app.get('/api/bag', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getBag(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 每日礼包状态总览
    app.get('/api/daily-gifts', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getDailyGifts(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 启动账号
    app.post('/api/accounts/:id/start', accountOwnershipRequired, async (req, res) => {
        try {
            const ok = await provider.startAccount(req.params.id);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 停止账号
    app.post('/api/accounts/:id/stop', accountOwnershipRequired, async (req, res) => {
        try {
            const ok = await provider.stopAccount(req.params.id);
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 切换账号模式 (大号/小号/风险规避)
    app.post('/api/accounts/:id/mode', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const mode = String((req.body || {}).mode || '');

            if (!store.ACCOUNT_MODE_PRESETS || !store.ACCOUNT_MODE_PRESETS[mode]) {
                return res.status(400).json({ ok: false, error: 'Invalid account mode' });
            }

            // 大号唯一性约束：如果设置为大号，需降级同用户的其他大号
            let downgraded = [];
            if (mode === 'main') {
                const accounts = await getAccountList();
                const targetAcc = accounts.find(a => String(a.id) === resolvedId);
                // 使用原用户名或者从请求上下文获取用户名
                const ownerUsername = targetAcc ? targetAcc.username : (req.currentUser ? req.currentUser.username : 'admin');

                if (ownerUsername && store.ensureMainAccountUnique) {
                    downgraded = await store.ensureMainAccountUnique(resolvedId, ownerUsername);
                }
            }

            // 应用模式
            const updatedConfig = store.applyAccountMode(resolvedId, mode);

            // 更新数据库持久化
            const dbPayload = { account_mode: mode };
            if (updatedConfig.harvestDelay) {
                dbPayload.harvest_delay_min = updatedConfig.harvestDelay.min;
                dbPayload.harvest_delay_max = updatedConfig.harvestDelay.max;
            }
            await accountRepository.updateConfig(resolvedId, dbPayload);

            // 同步配置到 worker 进程
            if (provider && typeof provider.broadcastConfig === 'function') {
                provider.broadcastConfig(resolvedId);
                // 同步降级的大号
                for (const acc of downgraded) {
                    const altConfig = store.getAccountConfigSnapshot(acc.id);
                    const altPayload = { account_mode: 'alt' };
                    if (altConfig.harvestDelay) {
                        altPayload.harvest_delay_min = altConfig.harvestDelay.min;
                        altPayload.harvest_delay_max = altConfig.harvestDelay.max;
                    }
                    await accountRepository.updateConfig(acc.id, altPayload);
                    provider.broadcastConfig(acc.id);
                }
            }

            adminLogger.info(`账号 ${resolvedId} 模式切换为 ${mode}`, { downgraded });

            res.json({ ok: true, data: { config: updatedConfig, downgraded } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 风险规避模式 - 基于历史封禁数据应用黑名单
    app.post('/api/accounts/:id/safe-mode/apply-blacklist', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            // 该服务函数即将在 friend.js 中实现并挂载到 provider，或者从 friend 服务引出
            // 为避免循环依赖等问题，直接调用 provider 的包装方法 (我们稍后将在 worker 层暴露它)
            // 简单起见，这里先 require ../services/friend
            const { generateSafeModeBlacklist } = require('../services/friend');

            if (typeof generateSafeModeBlacklist !== 'function') {
                return res.status(400).json({ ok: false, error: '安全巡查黑名单服务未就绪' });
            }

            const addedUins = await generateSafeModeBlacklist(resolvedId);

            // 同步配置到 worker 进程
            if (provider && typeof provider.broadcastConfig === 'function') {
                provider.broadcastConfig(resolvedId);
            }

            res.json({ ok: true, data: { addedCount: addedUins.length, addedUins } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农场一键操作
    app.post('/api/farm/operate', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType } = req.body; // 'harvest', 'clear', 'plant', 'all'
            await provider.doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 种植效率排行（数据分析）
    app.get('/api/analytics', async (req, res) => {
        try {
            const ANALYTICS_SORT_WHITELIST = new Set(['exp', 'fert', 'gold', 'profit', 'fert_profit', 'level']);
            const rawSort = String(req.query.sort || 'exp');
            const sortBy = ANALYTICS_SORT_WHITELIST.has(rawSort) ? rawSort : 'exp';
            const levelRaw = req.query.level;
            const levelMax = (levelRaw !== undefined && levelRaw !== '' && Number.isFinite(Number(levelRaw)))
                ? Number(levelRaw) : null;
            const { getPlantRankings } = require('../services/analytics');
            const data = getPlantRankings(sortBy, levelMax);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置页统一保存（单次写入+单次广播 + Schema 校验）
    app.post('/api/settings/save', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            const inputSettings = req.body || {};

            // Phase 1 优化：对非 Admin 角色执行严格的休眠基线限制，防止封禁风控
            if (req.currentUser?.role !== 'admin') {
                const ints = inputSettings.intervals || {};
                const checkBlock = (val, threshold) => {
                    return val !== undefined && Number.parseInt(val, 10) < threshold;
                };
                if (checkBlock(ints.farm, 15) || checkBlock(ints.farmMin, 15) ||
                    checkBlock(ints.friend, 60) || checkBlock(ints.friendMin, 60)) {
                    return res.status(400).json({
                        ok: false,
                        error: '系统保护拦截：此配置设定的轮询时间过度短频，将导致腾讯 1002003 风控锁定。根据系统防线，普通用户农田循环下限为 15秒、好友巡查下限为 60秒。请上调参数后再保存！'
                    });
                }

                const wfc = inputSettings.workflowConfig || {};
                if (wfc.farm && checkBlock(wfc.farm.minInterval, 15)) {
                    return res.status(400).json({ ok: false, error: '系统保护拦截：工作流 - 农场最低运行周期被限制为 15 秒' });
                }
                if (wfc.friend && checkBlock(wfc.friend.minInterval, 60)) {
                    return res.status(400).json({ ok: false, error: '系统保护拦截：工作流 - 好友巡查最低运行周期被限制为 60 秒' });
                }
            }

            const { strictValidation, ...settingsToValidate } = inputSettings;

            const validation = validateSettings(settingsToValidate);
            if (!validation.valid) {
                adminLogger.warn('配置校验警告', { accountId: id, errors: validation.errors });
                if (strictValidation === true) {
                    return res.status(400).json({
                        ok: false,
                        error: '配置校验失败',
                        errors: validation.errors,
                    });
                }
            }

            const data = await provider.saveSettings(id, validation.coerced || settingsToValidate);
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置面板主题
    app.post('/api/settings/theme', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                // 普通用户不参与全局 UI 覆写，静默成功，保障前端逻辑依旧可以跑自身本地 localStorage
                return res.json({ ok: true, data: store.getUI() });
            }

            await provider.setUITheme((req.body || {}).theme);

            const uiUpdates = {};
            if (req.body.loginBackground !== undefined) uiUpdates.loginBackground = req.body.loginBackground;
            if (req.body.colorTheme !== undefined) uiUpdates.colorTheme = req.body.colorTheme;
            if (req.body.performanceMode !== undefined) uiUpdates.performanceMode = req.body.performanceMode;
            if (req.body.timestamp !== undefined) uiUpdates.timestamp = req.body.timestamp;

            if (Object.keys(uiUpdates).length > 0) {
                store.applyConfigSnapshot({ ui: uiUpdates });
            }

            res.json({ ok: true, data: store.getUI() });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 保存下线提醒配置 (全局推送设定)
    app.post('/api/settings/offline-reminder', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.json({ ok: true, data: {} });
            }
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setOfflineReminder ? store.setOfflineReminder(body) : {};
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 获取系统级时间参数配置（仅管理员）
    app.get('/api/settings/timing-config', authRequired, async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: 'Forbidden' });
            }
            const config = store.getTimingConfig();
            const defaults = store.DEFAULT_TIMING_CONFIG;
            // 第三层只读参数（操作级微延迟），仅展示不可修改
            const readonlyParams = [
                { key: 'friendOpSleep', label: '好友操作间延迟', value: '500-700ms + 随机', group: 'operations' },
                { key: 'friendBatchSleep', label: '好友批次间延迟', value: '1000-4000ms + 随机', group: 'operations' },
                { key: 'farmOpSleep', label: '农场操作间延迟', value: '400-700ms + 随机', group: 'operations' },
                { key: 'warehouseOpSleep', label: '仓库操作间延迟', value: '200-300ms + 随机', group: 'operations' },
                { key: 'sellBatchSleep', label: '批量出售间隔', value: '300ms', group: 'operations' },
                { key: 'taskClaimSleep', label: '任务领取间隔', value: '300ms', group: 'operations' },
                { key: 'mallClaimSleep', label: '商城领取间隔', value: '300ms', group: 'operations' },
            ];
            res.json({ ok: true, data: { config, defaults, readonlyParams } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 保存系统级时间参数配置（仅管理员）
    app.post('/api/settings/timing-config', authRequired, async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: 'Forbidden' });
            }
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setTimingConfig(body);
            adminLogger.info('时间参数配置已更新', { config: data });
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 获取配置
    app.get('/api/settings', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            // 直接从主进程的 store 读取，确保即使账号未运行也能获取配置
            const intervals = store.getIntervals(id);
            const strategy = store.getPlantingStrategy(id);
            const preferredSeed = store.getPreferredSeed(id);
            const friendQuietHours = store.getFriendQuietHours(id);
            const automationRaw = store.getAutomation(id);
            const stealFilter = store.getStealFilterConfig ? store.getStealFilterConfig(id) : { enabled: false, mode: 'blacklist', plantIds: [] };
            const stealFriendFilter = store.getStealFriendFilterConfig ? store.getStealFriendFilterConfig(id) : { enabled: false, mode: 'blacklist', friendIds: [] };
            const stakeoutSteal = store.getStakeoutStealConfig ? store.getStakeoutStealConfig(id) : { enabled: false, delaySec: 3 };
            const skipStealRadish = store.getSkipStealRadishConfig ? store.getSkipStealRadishConfig(id) : { enabled: false };
            const forceGetAll = store.getForceGetAllConfig ? store.getForceGetAllConfig(id) : { enabled: false };
            // 前端期望 automation 内包含偷菜/偷好友过滤字段，合并后返回
            const automation = {
                ...automationRaw,
                stealFilterEnabled: stealFilter.enabled,
                stealFilterMode: stealFilter.mode,
                stealFilterPlantIds: stealFilter.plantIds || [],
                stealFriendFilterEnabled: stealFriendFilter.enabled,
                stealFriendFilterMode: stealFriendFilter.mode,
                stealFriendFilterIds: stealFriendFilter.friendIds || [],
                skipStealRadishEnabled: skipStealRadish.enabled,
                forceGetAllEnabled: forceGetAll.enabled,
            };
            const ui = store.getUI();
            const offlineReminder = store.getOfflineReminder
                ? store.getOfflineReminder()
                : { channel: 'webhook', reloginUrlMode: 'none', endpoint: '', token: '', title: '账号下线提醒', msg: '账号下线', offlineDeleteSec: 120 };
            // 从完整配置快照中提取工作流编排配置
            const fullSnapshot = store.getConfigSnapshot(id);
            const workflowConfig = fullSnapshot.workflowConfig || { farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] }, friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] } };
            res.json({ ok: true, data: { intervals, strategy, preferredSeed, friendQuietHours, automation, stakeoutSteal, workflowConfig, ui, offlineReminder } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号管理
    app.get('/api/accounts', async (req, res) => {
        try {
            const data = await provider.getAccounts();
            let accountList = [...(data.accounts || [])];

            // 对非 admin 用户进行数据隔离过滤
            if (req.currentUser && req.currentUser.role !== 'admin') {
                accountList = accountList.filter(a => a.username === req.currentUser.username);
            }

            // 优化：将在线运行中的账号排在前面，离线的排在后面，同状态按等级排序
            accountList.sort((a, b) => {
                if (a.running && !b.running) return -1;
                if (!a.running && b.running) return 1;
                return (b.level || 0) - (a.level || 0);
            });

            // Console log to trace running status issue reported by user
            let runningMap = {};
            accountList.forEach(a => runningMap[a.id] = a.running);

            res.json({ ok: true, data: { ...data, accounts: accountList } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 排行榜分页数据接口 (前端重排解耦)
    app.get('/api/leaderboard', async (req, res) => {
        try {
            const SORT_WHITELIST = new Set(['level', 'gold', 'coupon', 'uptime', 'exp']);
            const rawSort = String(req.query.sort_by || 'level');
            const sortBy = SORT_WHITELIST.has(rawSort) ? rawSort : 'level';
            const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10) || 50, 1), 200);

            const data = await provider.getAccounts();
            let accountList = [...(data.accounts || [])];

            accountList = accountList.map(acc => {
                const safeAcc = { ...acc, level: acc.level || 0, gold: acc.gold || 0, coupon: acc.coupon || 0, uptime: acc.uptime || 0 };
                delete safeAcc.password;
                return safeAcc;
            });

            const isAdmin = req.currentUser?.role === 'admin';
            if (!isAdmin) {
                const currentUsername = req.currentUser?.username;
                accountList = accountList.filter(acc => acc.username === currentUsername);
            }

            accountList.sort((a, b) => {
                if (a.running && !b.running) return -1;
                if (!a.running && b.running) return 1;
                return (b[sortBy] || 0) - (a[sortBy] || 0);
            });

            accountList = accountList.map((acc, index) => ({ ...acc, ranking: index + 1 }));
            const pagedList = accountList.slice(0, limit);

            res.json({ ok: true, data: { accounts: pagedList, total: accountList.length } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 更新账号备注（兼容旧接口）
    app.post('/api/account/remark', accountOwnershipRequired, async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const rawRef = body.id || body.accountId || body.uin || req.headers['x-account-id'];
            const accountList = await getAccountList();
            const target = findAccountByRef(accountList, rawRef);
            if (!target || !target.id) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }

            const remark = String(body.remark !== undefined ? body.remark : body.name || '').trim();
            if (!remark) {
                return res.status(400).json({ ok: false, error: 'Missing remark' });
            }

            const accountId = String(target.id);
            const data = await addOrUpdateAccount({ id: accountId, name: remark });
            if (provider && typeof provider.setRuntimeAccountName === 'function') {
                await provider.setRuntimeAccountName(accountId, remark);
            }
            if (provider && provider.addAccountLog) {
                provider.addAccountLog('update', `更新账号备注: ${remark}`, accountId, remark);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};

            // 如果是新增请求，拦截并检查是否已存在相同 UIN 和 platform 的账号，如果是，则转为更新操作以避免重复创建
            if (!body.id && body.uin && body.platform) {
                const existingAccounts = await store.getAccounts();
                const duplicateEntry = (existingAccounts.accounts || []).find(
                    a => String(a.uin) === String(body.uin) && a.platform === body.platform
                );
                if (duplicateEntry) {
                    console.log(`[API /api/accounts] 拦截重复创建: UIN ${body.uin} 已存在，转为更新 (ID: ${duplicateEntry.id})`);
                    body.id = duplicateEntry.id;
                    // 保留原本的名字，除非用户这次明确输入了名字
                    if (!body.name || body.name === '扫码账号' || body.name === body.uin) {
                        body.name = duplicateEntry.name;
                    }
                }
            }

            const isUpdate = !!body.id;
            const resolvedUpdateId = isUpdate ? await resolveAccId(body.id) : '';
            const payload = isUpdate ? { ...body, id: resolvedUpdateId || String(body.id) } : body;
            let wasRunning = false;
            if (isUpdate && provider.isAccountRunning) {
                wasRunning = provider.isAccountRunning(payload.id);
            }

            // 体验卡用户账号数限制校验（仅新增时）
            if (!isUpdate && req.currentUser && req.currentUser.maxAccounts > 0) {
                const allAccounts = await store.getAccounts();
                const userAccounts = (allAccounts.accounts || []).filter(a => a.username === req.currentUser.username);
                if (userAccounts.length >= req.currentUser.maxAccounts) {
                    return res.status(400).json({ ok: false, error: `体验卡用户最多绑定 ${req.currentUser.maxAccounts} 个账号` });
                }
            }

            // 更新时的所有权校验及防篡改防御
            if (isUpdate && req.currentUser && req.currentUser.role !== 'admin') {
                const allAccounts = await store.getAccounts();
                const existingAccount = (allAccounts.accounts || []).find(a => String(a.id) === payload.id);
                if (!existingAccount || existingAccount.username !== req.currentUser.username) {
                    return res.status(403).json({ ok: false, error: '无权修改此账号' });
                }
                // 强制锁定，防止抓包用户在更新时提交 username 字段进行提权或转让
                payload.username = req.currentUser.username;
            }

            // 强制将数据与操作者绑定 (admin可以选择不绑定留作公用，但这里简化直接记录创建者)
            if (!isUpdate && req.currentUser) {
                payload.username = req.currentUser.username;
            }

            const data = await addOrUpdateAccount(payload);
            if (provider.addAccountLog) {
                const accountId = isUpdate ? String(payload.id) : String((data.accounts[data.accounts.length - 1] || {}).id || '');
                const accountName = payload.name || '';
                provider.addAccountLog(
                    isUpdate ? 'update' : 'add',
                    isUpdate ? `更新账号: ${accountName || accountId}` : `添加账号: ${accountName || accountId}`,
                    accountId,
                    accountName
                );
            }
            // 如果是新增，自动启动
            if (!isUpdate) {
                const newAcc = data.accounts[data.accounts.length - 1];
                if (newAcc) await provider.startAccount(newAcc.id);
            } else if (wasRunning) {
                // 如果是更新，且之前在运行，则重启
                await provider.restartAccount(payload.id);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/accounts/:id', accountOwnershipRequired, async (req, res) => {
        try {
            const resolvedId = await resolveAccId(req.params.id) || String(req.params.id || '');
            const before = await provider.getAccounts();
            const target = findAccountByRef(before.accounts || [], req.params.id);
            await provider.stopAccount(resolvedId);
            const data = deleteAccount(resolvedId);
            if (provider.addAccountLog) {
                provider.addAccountLog('delete', `删除账号: ${(target && target.name) || req.params.id}`, resolvedId, target ? target.name : '');
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ 用户管理路由 ============

    // 用户注册
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password, cardCode } = req.body || {};

            // 参数完整性检查
            if (!username || !password || !cardCode) {
                return res.status(400).json({
                    ok: false,
                    error: '缺少必要参数',
                    details: {
                        username: username ? '已提供' : '必填',
                        password: password ? '已提供' : '必填',
                        cardCode: cardCode ? '已提供' : '必填'
                    }
                });
            }

            // 格式验证
            const usernameValidation = validateUsername(username);
            if (!usernameValidation.valid) {
                return res.status(400).json({ ok: false, error: usernameValidation.error });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ ok: false, error: passwordValidation.error });
            }

            const cardCodeValidation = validateCardCode(cardCode);
            if (!cardCodeValidation.valid) {
                return res.status(400).json({ ok: false, error: cardCodeValidation.error });
            }

            const result = await userStore.registerUser(username, password, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            const accessToken = jwtService.signAccessToken(result.user);
            const refreshToken = jwtService.generateRefreshToken();
            await jwtService.storeRefreshToken(result.user.username, refreshToken, result.user.role, req);
            jwtService.setTokenCookies(req, res, accessToken, refreshToken, result.user.role);

            res.json({ ok: true, data: { user: result.user } });
        } catch (error) {
            console.error('用户注册失败:', error.message);
            res.status(500).json({ ok: false, error: '注册失败，请稍后重试' });
        }
    });

    // 用户续费
    app.post('/api/auth/renew', authRequired, async (req, res) => {
        try {
            const { cardCode } = req.body || {};
            if (!cardCode) {
                return res.status(400).json({ ok: false, error: '缺少卡密' });
            }

            // 卡密格式验证
            const cardCodeValidation = validateCardCode(cardCode);
            if (!cardCodeValidation.valid) {
                return res.status(400).json({ ok: false, error: cardCodeValidation.error });
            }

            const result = await userStore.renewUser(req.currentUser.username, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            req.currentUser.card = result.card;

            res.json({ ok: true, data: { card: result.card } });
        } catch (error) {
            console.error('用户续费失败:', error.message);
            res.status(500).json({ ok: false, error: '续费失败，请稍后重试' });
        }
    });

    // 获取用户列表（仅管理员）
    app.get('/api/users', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.getAllUsers(req, res);
    });

    // 更新用户（仅管理员）
    app.put('/api/users/:username', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.updateUser(req, res);
    });

    // 删除用户（仅管理员）
    app.delete('/api/users/:username', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.deleteUser(req, res);
    });

    // 修改密码
    app.post('/api/auth/change-password', authRequired, async (req, res) => {
        usersController.changePassword(req, res);
    });

    // ============ 卡密管理路由 ============

    // 获取卡密列表（仅管理员）
    app.get('/api/cards', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.getAllCards(req, res);
    });

    // 生成卡密（仅管理员）
    app.post('/api/cards', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.createCard(req, res);
    });

    // 更新卡密（仅管理员）
    app.put('/api/cards/:code', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.updateCard(req, res);
    });

    // 删除卡密（仅管理员）
    app.delete('/api/cards/:code', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.deleteCard(req, res);
    });

    // 批量删除卡密（仅管理员）
    app.post('/api/cards/batch-delete', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.batchDeleteCards(req, res);
    });

    // ============ 体验卡全局及独立网关 防刷限频 ============

    const trialRateLimitMap = new Map();
    const TRIAL_WINDOW_MS = 60 * 60 * 1000; // 1小时限制 3 次请求
    const TRIAL_MAX_CALLS = 3;

    function trialRateLimiter(req, res, next) {
        const ip = getClientIP(req);
        const now = Date.now();
        const record = trialRateLimitMap.get(ip) || { count: 0, resetTime: now + TRIAL_WINDOW_MS };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + TRIAL_WINDOW_MS;
        } else {
            record.count++;
            if (record.count > TRIAL_MAX_CALLS) {
                return res.status(429).json({ ok: false, error: '您的公网 IP 体验卡申请频率过高，请 1 小时后再试 (429)' });
            }
        }
        trialRateLimitMap.set(ip, record);
        next();
    }

    // 清理试用次数缓存间隔防爆内存
    setInterval(() => {
        const now = Date.now();
        for (const [ip, record] of trialRateLimitMap.entries()) {
            if (now > record.resetTime) {
                trialRateLimitMap.delete(ip);
            }
        }
    }, 60 * 60 * 1000);

    // 定时清理过期 refresh token（每小时执行一次）
    setInterval(() => { jwtService.cleanExpiredTokens(); }, 60 * 60 * 1000);
    jwtService.cleanExpiredTokens();

    // ============ 体验卡 API ============

    // 公开 API：自助生成体验卡（无需登录）[带防刷限制]
    app.post('/api/trial-card', trialRateLimiter, async (req, res) => {
        try {
            const clientIP = getClientIP(req);
            const result = await userStore.createTrialCard(clientIP);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { code: result.code, days: result.days } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 获取体验卡配置（登录用户可读，管理员看全部，普通用户仅看 userRenewEnabled）
    app.get('/api/trial-card-config', authRequired, async (req, res) => {
        try {
            const config = store.getTrialCardConfig();
            if (req.currentUser && req.currentUser.role === 'admin') {
                return res.json({ ok: true, data: config });
            }
            // 普通用户只返回与其相关的字段
            res.json({ ok: true, data: { userRenewEnabled: config.userRenewEnabled, days: config.days } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 保存体验卡配置（仅管理员）
    app.post('/api/trial-card-config', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setTrialCardConfig(body);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 管理员为用户续费体验卡
    app.post('/api/users/:username/trial-renew', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const result = await userStore.renewTrialUser(req.params.username, 'admin');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 用户自助续费体验卡
    app.post('/api/auth/trial-renew', authRequired, async (req, res) => {
        try {
            const result = await userStore.renewTrialUser(req.currentUser.username, 'user');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            req.currentUser.card = result.card;
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ 公告管理 API ============

    // 获取所有公告日志（无需认证，公开接口，前台手风琴弹窗直接渲染）
    app.get('/api/announcement', async (req, res) => {
        try {
            const data = await getAnnouncements();
            res.json({ ok: true, data: data || [] });
        } catch (e) {
            adminLogger.error('getAnnouncements failed:', e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 发布/更新公告（仅管理员）
    app.put('/api/announcement', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const { id, title = '', version = '', publish_date = '', content = '', enabled = true } = body;
            await saveAnnouncement({
                id: id ? Number(id) : null,
                title: String(title),
                version: String(version),
                publish_date: String(publish_date),
                content: String(content),
                enabled: !!enabled,
                createdBy: req.currentUser.username || null,
            });
            if (io) io.emit('announcement:update', { ok: true });
            res.json({ ok: true });
        } catch (e) {
            adminLogger.error('saveAnnouncement failed:', e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 删除公告（仅管理员）
    app.delete('/api/announcement', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const id = req.query.id ? Number(req.query.id) : null;
            await deleteAnnouncement(id);
            if (io) io.emit('announcement:update', { ok: true });
            res.json({ ok: true });
        } catch (e) {
            adminLogger.error('deleteAnnouncement failed:', e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 从 Update.log 同步系统日记为公告（仅管理员）
    app.post('/api/announcement/sync', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const entries = parseUpdateLog().reverse(); // 反转，使旧日志排在前面插入，这样最新的ID就最大，查询时 ORDER BY id DESC 会在前面 
            const existing = await getAnnouncements() || [];
            let addedCount = 0;
            for (const entry of entries) {
                // 根据时间+标题查重，若没有则推入数据库
                const ex = existing.find(a => (a.version === entry.version && a.title === entry.title) || (a.publish_date === entry.date && a.title === entry.title));
                if (!ex) {
                    await saveAnnouncement({
                        title: entry.title,
                        version: entry.version || '',
                        publish_date: entry.date || '',
                        content: entry.content || '',
                        enabled: true,
                        createdBy: 'system_sync'
                    });
                    addedCount++;
                }
            }
            if (addedCount > 0 && io) io.emit('announcement:update', { ok: true });
            // 更新一下缓存引用
            await getAnnouncements();
            res.json({ ok: true, added: addedCount, totalParsed: entries.length });
        } catch (e) {
            adminLogger.error('sync announcements failed:', e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ 第三方 API 配置管理 ============

    // API: 获取第三方API配置（仅管理员）
    app.get('/api/admin/third-party-api', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const config = store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
            res.json({ ok: true, data: config });
        } catch (error) {
            adminLogger.error('获取第三方API配置失败', error);
            res.status(500).json({ ok: false, error: '获取第三方API配置失败' });
        }
    });

    app.post('/api/admin/third-party-api', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setThirdPartyApiConfig(body);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ Cluster Config API管理 ============
    app.get('/api/admin/cluster-config', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const config = store.getClusterConfig ? store.getClusterConfig() : { dispatcherStrategy: 'round_robin' };
            res.json({ ok: true, data: config });
        } catch (error) {
            adminLogger.error('获取集群调度配置失败', error);
            res.status(500).json({ ok: false, error: '获取集群调度配置失败' });
        }
    });

    app.post('/api/admin/cluster-config', authRequired, userRequired, async (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setClusterConfig ? store.setClusterConfig(body) : body;
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号日志
    app.get('/api/account-logs', async (req, res) => {
        try {
            const limit = Number.parseInt(req.query.limit) || 100;
            let list = provider.getAccountLogs ? provider.getAccountLogs(limit) : [];

            // 数据隔离：如果不是 admin，且日志没有明确的 accountId (无法过滤)，或者 accountId 不在允许的列表中，则过滤
            if (req.currentUser && req.currentUser.role !== 'admin') {
                const allAccounts = await store.getAccounts();
                const userOwnedAccountIds = allAccounts.accounts
                    .filter(a => a.username === req.currentUser.username)
                    .map(a => String(a.id));
                list = list.filter(l => l.accountId && userOwnedAccountIds.includes(String(l.accountId)));
            }

            // 与当前 web 前端保持一致：直接返回数组
            res.json(Array.isArray(list) ? list : []);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 日志
    app.get('/api/logs', async (req, res) => {
        const queryAccountIdRaw = (req.query.accountId || '').toString().trim();
        const id = queryAccountIdRaw ? (queryAccountIdRaw === 'all' ? '' : await resolveAccId(queryAccountIdRaw)) : await getAccId(req);

        let targetId = id;

        // 数据隔离校验
        if (req.currentUser && req.currentUser.role !== 'admin') {
            const allAccounts = await store.getAccounts();
            const userAccountIds = allAccounts.accounts
                .filter(a => a.username === req.currentUser.username)
                .map(a => String(a.id));

            if (targetId) {
                // 如果查询特定号，检查权限
                if (!userAccountIds.includes(String(targetId))) {
                    return res.status(403).json({ ok: false, error: '无权查看此账号日志' });
                }
            } else {
                // 不支持普通用户在一堆混杂中查询所有，如果要查询all，后端底层 provider.getLogs 不太好弄过滤，
                // 退而求其次，普通用户必须强制带 accountId 或者只能拿到空 (或者我们等会儿从返回的 list 里过滤)
            }
        }

        const options = {
            limit: Number.parseInt(req.query.limit) || 100,
            tag: req.query.tag || '',
            module: req.query.module || '',
            event: req.query.event || '',
            keyword: req.query.keyword || '',
            isWarn: req.query.isWarn,
            timeFrom: req.query.timeFrom || '',
            timeTo: req.query.timeTo || '',
        };
        let list = await provider.getLogs(targetId, options);

        // 兜底过滤: 如果 targetId 为空 (用户查询所有，但其实普通用户应该受限)
        if (!targetId && req.currentUser && req.currentUser.role !== 'admin') {
            const allAccounts = await store.getAccounts();
            const userAccountIds = allAccounts.accounts
                .filter(a => a.username === req.currentUser.username)
                .map(a => String(a.id));
            list = list.filter(l => l.accountId && userAccountIds.includes(String(l.accountId)));
        }

        res.json({ ok: true, data: list });
    });

    // ============ 通知公告 API（无需认证） ============
    // 解析 Update.log 缓存
    let _notificationsCache = null;
    let _notificationsCacheTime = 0;
    const NOTIFICATIONS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

    /**
     * 解析 Update.log 文件为结构化通知条目
     * 按双空行分割，提取日期、标题、版本号
     */
    function parseUpdateLog() {
        const now = Date.now();
        if (_notificationsCache && (now - _notificationsCacheTime) < NOTIFICATIONS_CACHE_TTL) {
            return _notificationsCache;
        }
        const logPath = path.join(__dirname, '../../../logs/development/Update.log');
        if (!fs.existsSync(logPath)) return [];
        const raw = fs.readFileSync(logPath, 'utf-8');
        // 按连续空行（1个以上空行即可）分割条目
        const blocks = raw.split(/\n\s*\n/).filter(b => b.trim());
        const entries = [];
        const dateRe = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/;
        const versionRe = /前端[：:]\s*(v[\d.]+)/;
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (!lines.length) continue;
            const firstLine = lines[0].trim();
            const dm = firstLine.match(dateRe);
            if (!dm) continue;
            const date = dm[1];
            const title = dm[2].trim();
            const vm = firstLine.match(versionRe) || block.match(versionRe);
            const version = vm ? vm[1] : '';
            const content = lines.slice(1).join('\n').trim();
            entries.push({ date, title, version, content });
        }
        _notificationsCache = entries;
        _notificationsCacheTime = now;
        return entries;
    }

    app.get('/api/notifications', async (req, res) => {
        try {
            const limit = Number.parseInt(req.query.limit) || 10;
            const entries = parseUpdateLog();
            res.json({ ok: true, data: entries.slice(0, limit) });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ QR Code Login APIs (无需账号选择) ============
    // 这些接口不需要 authRequired 也能调用（用于登录流程）
    app.post('/api/qr/create', async (req, res) => {
        const { platform = 'qq', uin = '' } = req.body || {};
        try {
            // ========== Ipad860 iPad/车机 微信协议直连 ==========
            if (platform === 'wx_ipad' || platform === 'wx_car') {
                const thirdPartyCfg = store.getThirdPartyApiConfig();
                const ipad860Url = thirdPartyCfg.ipad860Url
                    || process.env.IPAD860_URL
                    || 'http://127.0.0.1:8058';
                const endpoint = platform === 'wx_car'
                    ? '/api/Login/LoginGetQRCar'
                    : '/api/Login/LoginGetQR';

                const ipadCtrl = new AbortController();
                const ipadTimer = setTimeout(() => ipadCtrl.abort(), 15000);
                const qrRes = await fetch(`${ipad860Url}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                    signal: ipadCtrl.signal,
                }).then(r => r.json()).finally(() => clearTimeout(ipadTimer));

                if (qrRes.Code === 1 && qrRes.Data) {
                    let qrcodeData = qrRes.Data.QrBase64 || '';
                    if (qrcodeData) {
                        qrcodeData = qrcodeData.replace(/^data:image\/(png|jpg|jpeg);base64,/i, '');
                        qrcodeData = `data:image/png;base64,${qrcodeData}`;
                    }
                    res.json({
                        ok: true,
                        data: {
                            qrcode: qrcodeData,
                            code: qrRes.Data.Uuid || '',
                            platform,
                        }
                    });
                } else {
                    res.json({ ok: false, error: qrRes.Message || '获取二维码失败' });
                }
                return;
            }
            // ========== 原有微信小程序（第三方 API）==========
            if (platform === 'wx') {
                const wxCtrl = new AbortController();
                const wxTimer = setTimeout(() => wxCtrl.abort(), 15000);
                const thirdPartyCfg = store.getThirdPartyApiConfig();
                const wxApiKey = thirdPartyCfg.wxApiKey || CONFIG.wxApiKey;
                const wxApiUrl = thirdPartyCfg.wxApiUrl || CONFIG.wxApiUrl;

                const wxRes = await fetch(`${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=getqr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                    signal: wxCtrl.signal,
                }).then(r => r.json()).finally(() => clearTimeout(wxTimer));

                if (wxRes.code === 0 && wxRes.data) {
                    let qrcodeData = wxRes.data.QrBase64 || '';
                    if (qrcodeData) {
                        // 清理可能由于第三方接口格式改变带来的残缺或错误的 MIME 头部 (如把 png 头部错误拼成了 jpg)
                        // 真正的 png base64 数据通常都以 iVBORw0KGg 开头
                        qrcodeData = qrcodeData.replace(/^data:image\/(png|jpg|jpeg);base64,/i, '');
                        qrcodeData = `data:image/png;base64,${qrcodeData}`;
                    }
                    res.json({ ok: true, data: { qrcode: qrcodeData, code: wxRes.data.Uuid || wxRes.data.uuid, platform: 'wx' } });
                } else {
                    res.json({ ok: false, error: wxRes.msg || '获取微信二维码失败' });
                }
            } else {
                const result = await MiniProgramLoginSession.requestLoginCode(uin);
                res.json({ ok: true, data: result });
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code, platform = 'qq', uin = '' } = req.body || {};
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            // ========== Ipad860 iPad/车机 微信协议检测 ==========
            if (platform === 'wx_ipad' || platform === 'wx_car') {
                const thirdPartyCfg = store.getThirdPartyApiConfig();
                const ipad860Url = thirdPartyCfg.ipad860Url
                    || process.env.IPAD860_URL
                    || 'http://127.0.0.1:8058';
                const wxAppId = thirdPartyCfg.wxAppId || CONFIG.wxAppId;

                // 步骤1: 检测扫码状态
                const checkCtrl = new AbortController();
                const checkTimer = setTimeout(() => checkCtrl.abort(), 10000);
                const checkRes = await fetch(
                    `${ipad860Url}/api/Login/LoginCheckQR?uuid=${encodeURIComponent(code)}`,
                    { method: 'POST', signal: checkCtrl.signal }
                ).then(r => r.json()).finally(() => clearTimeout(checkTimer));

                console.log(`[Ipad860 CheckQR] 完整响应:`, JSON.stringify(checkRes));

                if (checkRes.Code === 0 && checkRes.Success) {
                    const data = checkRes.Data || {};
                    // status == 0 待扫码, status == 1 已扫码待确认, status == 2 或包含 acctSectResp 时是登录成功
                    const status = data.status;

                    if (status === 0) {
                        res.json({ ok: true, data: { status: 'Wait' } });
                        return;
                    } else if (status === 1) {
                        // 正在手机上确认
                        const NickName = data.nickName || '';
                        const HeadImgUrl = data.headImgUrl || '';
                        res.json({ ok: true, data: { status: 'Check', nickname: NickName, avatar: HeadImgUrl } });
                        return;
                    }

                    // ====== 到了这里就是登录确认成功 ======
                    const wxid = data?.acctSectResp?.userName || data?.WxId || data?.UserName || '';
                    const nickname = data?.acctSectResp?.nickName || data?.NickName || '';
                    const headUrl = data?.HeadUrl || '';

                    if (!wxid) {
                        console.error(`[Ipad860] 登录成功但未能解析出 wxid:`, JSON.stringify(data));
                        res.json({ ok: true, data: { status: 'Error', error: '解析微信ID失败' } });
                        return;
                    }

                    // 步骤2: 获取小程序授权 code（最多重试 3 次）
                    let jsRes = null;
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            const jsCtrl = new AbortController();
                            const jsTimer = setTimeout(() => jsCtrl.abort(), 10000);
                            jsRes = await fetch(`${ipad860Url}/api/Wxapp/JSLogin`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ Wxid: wxid, Appid: wxAppId }),
                                signal: jsCtrl.signal,
                            }).then(r => r.json()).finally(() => clearTimeout(jsTimer));

                            console.log(`[Ipad860 JSLogin] 第 ${attempt} 次响应:`, JSON.stringify(jsRes));

                            if (jsRes && jsRes.Code === 0 && jsRes.Success) {
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                            console.error(`[Ipad860 JSLogin] 第 ${attempt} 次失败: ${err.message}`);
                        }
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }

                    if (jsRes && jsRes.Code === 0 && jsRes.Success && jsRes.Data) {
                        const authCode = jsRes.Data.code || jsRes.Data.Code || '';
                        console.log(`[Ipad860 JSLogin] 登录成功! wxid=${wxid}, code=${authCode}, nickname=${nickname}`);
                        res.json({
                            ok: true,
                            data: { status: 'OK', code: authCode, uin: wxid, avatar: headUrl, nickname }
                        });
                    } else {
                        const errMsg = (jsRes && jsRes.Message) || (lastError ? lastError.message : 'JSLogin 失败');
                        console.error(`[Ipad860 JSLogin] 最终失败: ${errMsg}`);
                        res.json({ ok: true, data: { status: 'Error', error: errMsg } });
                    }
                } else if (checkRes.Code === -8) {
                    // 解析具体的微信服务器错误（如风控、环境异常）
                    let errMsg = '';
                    try {
                        const wxErrXml = checkRes.Data?.baseResponse?.errMsg?.string || '';
                        if (wxErrXml.includes('CDATA[')) {
                            const match = wxErrXml.match(/<!\[CDATA\[(.*?)\]\]>/);
                            if (match && match[1]) errMsg = match[1];
                        }
                    } catch (e) { }

                    if (errMsg) {
                        console.error(`[Ipad860] 微信服务器拦截: ${errMsg}`);
                        res.json({ ok: true, data: { status: 'Error', error: `微信拦截: ${errMsg}` } });
                    } else {
                        // 真的只是过期或无法解析的其他异常
                        res.json({ ok: true, data: { status: 'Used' } });
                    }
                } else {
                    // 等待扫码
                    res.json({ ok: true, data: { status: 'Wait' } });
                }
                return;
            }
            // ========== 原有微信小程序（第三方 API）==========
            if (platform === 'wx') {
                const checkCtrl = new AbortController();
                const checkTimer = setTimeout(() => checkCtrl.abort(), 10000);

                const thirdPartyCfg = store.getThirdPartyApiConfig();
                const wxApiKey = thirdPartyCfg.wxApiKey || CONFIG.wxApiKey;
                const wxApiUrl = thirdPartyCfg.wxApiUrl || CONFIG.wxApiUrl;
                const wxAppId = thirdPartyCfg.wxAppId || CONFIG.wxAppId;

                const wxCheckRes = await fetch(`${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=checkqr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uuid: code }),
                    signal: checkCtrl.signal,
                }).then(r => r.json()).finally(() => clearTimeout(checkTimer));

                console.log(`[WX checkqr] 完整响应:`, JSON.stringify(wxCheckRes));

                if (wxCheckRes.code === 0) {
                    // 从多个可能的位置提取 wxid（兼容不同 API 版本）
                    const wxid = (wxCheckRes.data && wxCheckRes.data.wxid)
                        || (wxCheckRes.raw && wxCheckRes.raw.Data && wxCheckRes.raw.Data.wxid)
                        || wxCheckRes.wxid
                        || '';
                    const nickname = (wxCheckRes.data && wxCheckRes.data.nickname)
                        || (wxCheckRes.raw && wxCheckRes.raw.Data && wxCheckRes.raw.Data.nickname)
                        || wxCheckRes.nickname
                        || '';

                    console.log(`[WX checkqr] 提取到 wxid=${wxid}, nickname=${nickname}`);

                    if (!wxid) {
                        // checkqr 返回 code=0 但无 wxid，可能 API 结构变化，返回原始数据帮助调试
                        console.error('[WX checkqr] code=0 但 wxid 为空! 完整 data:', JSON.stringify(wxCheckRes.data), '完整 raw:', JSON.stringify(wxCheckRes.raw));
                        res.json({ ok: true, data: { status: 'Wait' } });
                        return;
                    }

                    // 第二步：用 wxid 调用 jslogin 获取小程序 code（最多重试 3 次）
                    let wxLoginRes = null;
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            const loginCtrl = new AbortController();
                            const loginTimer = setTimeout(() => loginCtrl.abort(), 10000);
                            wxLoginRes = await fetch(`${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=jslogin`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ wxid, appid: wxAppId }),
                                signal: loginCtrl.signal,
                            }).then(r => r.json()).finally(() => clearTimeout(loginTimer));

                            console.log(`[WX jslogin] 第 ${attempt} 次响应:`, JSON.stringify(wxLoginRes));

                            if (wxLoginRes && wxLoginRes.code === 0) {
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                            console.error(`[WX jslogin] 第 ${attempt} 次失败: ${err.message}`);
                        }
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }

                    if (wxLoginRes && wxLoginRes.code === 0 && wxLoginRes.data) {
                        const authCode = String(
                            wxLoginRes.data.code
                            || (wxLoginRes.data.raw ? (wxLoginRes.data.raw.code || wxLoginRes.data.raw.Code) : '')
                            || ''
                        );
                        const loginNickname = wxLoginRes.data.nickname || nickname;
                        const loginWxid = wxLoginRes.data.wxid || wxid;
                        console.log(`[WX jslogin] 登录成功! wxid=${loginWxid}, code=${authCode}, nickname=${loginNickname}`);
                        res.json({ ok: true, data: { status: 'OK', code: authCode, uin: loginWxid, avatar: '', nickname: loginNickname } });
                    } else {
                        const errMsg = (wxLoginRes && wxLoginRes.msg) || (lastError ? lastError.message : '获取微信授权失败');
                        console.error(`[WX jslogin] 最终失败: ${errMsg}`);
                        res.json({ ok: true, data: { status: 'Error', error: errMsg } });
                    }
                } else if (wxCheckRes.code === 1 || wxCheckRes.code === -1) {
                    // 等待扫码
                    res.json({ ok: true, data: { status: 'Wait' } });
                } else if (wxCheckRes.code === 2) {
                    // 二维码失效
                    res.json({ ok: true, data: { status: 'Used' } });
                } else {
                    res.json({ ok: true, data: { status: 'Error', error: wxCheckRes.msg || '异常状态' } });
                }
            } else {
                const result = await MiniProgramLoginSession.queryStatus(code);

                if (result.status === 'OK') {
                    const ticket = result.ticket;
                    const uin = result.uin || '';
                    const nickname = result.nickname || '';
                    const appid = '1112386029';

                    const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid);
                    console.log(`[QR登录] 代理登录成功, authCode=${authCode ? `${authCode.substring(0, 20)}...` : '空'}`);

                    let avatar = '';
                    if (uin) {
                        avatar = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
                    }

                    res.json({ ok: true, data: { status: 'OK', code: authCode, uin, avatar, nickname } });
                } else if (result.status === 'Used') {
                    res.json({ ok: true, data: { status: 'Used' } });
                } else if (result.status === 'Wait') {
                    res.json({ ok: true, data: { status: 'Wait' } });
                } else {
                    res.json({ ok: true, data: { status: 'Error', error: result.msg } });
                }
            }
        } catch (e) {
            console.error('[API /api/qr/check] Error:', e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('*', async (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/game-config')) {
            return res.status(404).json({ ok: false, error: 'Not Found' });
        }
        if (fs.existsSync(webDist)) {
            res.sendFile(path.join(webDist, 'index.html'));
        } else {
            res.status(404).send('web build not found. Please build the web project.');
        }
    });

    const applySocketSubscription = async (socket, accountRef = '') => {
        for (const room of socket.rooms) {
            if (room.startsWith('account:')) socket.leave(room);
        }

        const currentUser = socket.data.currentUser;

        // 分页订阅模式（Room Pagination）
        if (Array.isArray(accountRef)) {
            socket.data.accountId = ''; // 标记为非单账号模式
            socket.data.accountIds = accountRef;
            const targetIds = [];

            for (const ref of accountRef) {
                const incoming = String(ref || '').trim();
                const resolved = incoming && incoming !== 'all' ? (await resolveAccId(incoming)) : '';
                if (resolved) {
                    let allow = true;
                    if (currentUser && currentUser.role !== 'admin') {
                        const allAccounts = await store.getAccounts();
                        const account = allAccounts.accounts.find(a => String(a.id) === String(resolved));
                        if (!account || account.username !== currentUser.username) {
                            allow = false;
                        }
                    }
                    if (allow) targetIds.push(resolved);
                }
            }

            for (const uid of targetIds) {
                socket.join(`account:${uid}`);
            }
            socket.emit('subscribed', { accountId: 'multi', count: targetIds.length });

            // 下发这批账号的状态快照
            try {
                if (provider && typeof provider.getStatus === 'function') {
                    for (const targetId of targetIds) {
                        const currentStatus = await provider.getStatus(targetId);
                        socket.emit('status:update', { accountId: targetId, status: currentStatus });
                    }
                }
                // 多账号模式暂不下发全量日志快照，避免 Array size limit 爆内存
            } catch { }

            return;
        }

        const incoming = String(accountRef || '').trim();
        const resolved = incoming && incoming !== 'all' ? await resolveAccId(incoming) : '';

        if (resolved) {
            // 请求订阅特定账号，检查权限
            let allow = true;
            if (currentUser && currentUser.role !== 'admin') {
                const allAccounts = await store.getAccounts();
                const account = allAccounts.accounts.find(a => String(a.id) === String(resolved));
                if (!account || account.username !== currentUser.username) {
                    allow = false; // 无权订阅别人的
                }
            }
            if (allow) {
                socket.join(`account:${resolved}`);
                socket.data.accountId = resolved;
                socket.emit('subscribed', { accountId: resolved });
            } else {
                // 如果无权，就不给它加入任何具体的账号房间或者返回一个出错信号
                socket.data.accountId = '';
                socket.emit('subscribed', { accountId: '' });
                return; // 直接退出，不推送状态和日志快照
            }
        } else {
            // 请求订阅全量账号
            socket.data.accountId = '';
            if (!currentUser || currentUser.role === 'admin') {
                socket.join('account:all');
                socket.emit('subscribed', { accountId: 'all' });
            } else {
                // 普通用户订阅 "all"，实际上只能订阅他名下的所有号
                const allAccounts = await store.getAccounts();
                const userOwnedAccountIds = allAccounts.accounts
                    .filter(a => a.username === currentUser.username)
                    .map(a => String(a.id));
                for (const uid of userOwnedAccountIds) {
                    socket.join(`account:${uid}`);
                }
                socket.emit('subscribed', { accountId: 'user_all' });
            }
        }

        try {
            const targetId = socket.data.accountId || '';
            if (targetId && provider && typeof provider.getStatus === 'function') {
                const currentStatus = await provider.getStatus(targetId);
                socket.emit('status:update', { accountId: targetId, status: currentStatus });
            }
            if (provider && typeof provider.getLogs === 'function') {
                // 这里针对 websocket 连接建立时的初始全量快照也需要削减，防止 Vue 渲染时因为数千 DOM 产生卡顿
                let currentLogs = await provider.getLogs(targetId, { limit: 40 });
                if (!targetId && currentUser && currentUser.role !== 'admin') {
                    const allAccounts = await store.getAccounts();
                    const userAccountIds = allAccounts.accounts
                        .filter(a => a.username === currentUser.username)
                        .map(a => String(a.id));
                    currentLogs = currentLogs.filter(l => l.accountId && userAccountIds.includes(String(l.accountId)));
                }
                socket.emit('logs:snapshot', {
                    accountId: targetId || (currentUser && currentUser.role !== 'admin' ? 'user_all' : 'all'),
                    logs: Array.isArray(currentLogs) ? currentLogs : [],
                });
            }
            if (provider && typeof provider.getAccountLogs === 'function') {
                // 用于账号管理界面的初始日志，同样降低获取数
                let currentAccountLogs = provider.getAccountLogs(40);
                if (!targetId && currentUser && currentUser.role !== 'admin') {
                    const allAccounts = await store.getAccounts();
                    const userAccountIds = allAccounts.accounts
                        .filter(a => a.username === currentUser.username)
                        .map(a => String(a.id));
                    currentAccountLogs = currentAccountLogs.filter(l => l.accountId && userAccountIds.includes(String(l.accountId)));
                }
                socket.emit('account-logs:snapshot', {
                    logs: Array.isArray(currentAccountLogs) ? currentAccountLogs : [],
                });
            }
        } catch {
            // ignore snapshot push errors
        }
    };

    const port = process.env.FARM_PORT || CONFIG.adminPort || 3000;
    server = app.listen(port, '0.0.0.0', () => {
        adminLogger.info('admin panel started', { url: `http://localhost:${port}`, port });
    });

    io = new SocketIOServer(server, {
        path: '/socket.io',
        pingTimeout: 5000,
        pingInterval: 10000,
        cors: {
            origin: allowedOrigins.length > 0
                ? (origin, cb) => {
                    if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
                        cb(null, true);
                    } else {
                        cb(null, false);
                    }
                }
                : '*',
            methods: ['GET', 'POST'],
            credentials: allowedOrigins.length > 0,
        },
    });

    io.use(async (socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers?.cookie || '';
            const cookies = {};
            for (const part of cookieHeader.split(';')) {
                const [k, ...v] = part.trim().split('=');
                if (k) {
                    try { cookies[k.trim()] = decodeURIComponent(v.join('=').trim()); }
                    catch { cookies[k.trim()] = v.join('=').trim(); }
                }
            }
            const accessToken = cookies.access_token || socket.handshake.auth?.token || socket.handshake.headers?.['x-admin-token'] || '';
            if (!accessToken) return next(new Error('Unauthorized'));

            const decoded = jwtService.verifyAccessToken(accessToken);
            if (!decoded) return next(new Error('Unauthorized'));

            const userInfo = await userStore.getUserInfo(decoded.username);
            if (!userInfo) return next(new Error('Unauthorized'));

            socket.data.currentUser = userInfo;
            return next();
        } catch {
            return next(new Error('Unauthorized'));
        }
    });

    io.on('connection', async (socket) => {
        const initialAccountRef = (socket.handshake.auth && socket.handshake.auth.accountId)
            || (socket.handshake.query && socket.handshake.query.accountId)
            || '';
        await applySocketSubscription(socket, initialAccountRef);
        socket.emit('ready', { ok: true, ts: Date.now() });

        socket.on('subscribe', async (payload) => {
            const body = (payload && typeof payload === 'object') ? payload : {};
            if (Array.isArray(body.accountIds)) {
                await applySocketSubscription(socket, body.accountIds);
            } else {
                await applySocketSubscription(socket, body.accountId || '');
            }
        });
    });
}

function getIO() {
    return io;
}

module.exports = {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
    getIO
};

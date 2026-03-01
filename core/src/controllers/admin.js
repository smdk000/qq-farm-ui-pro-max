const crypto = require('node:crypto');
/**
 * 管理面板 HTTP 服务
 * 改写为接收 DataProvider 模式，并集成多用户系统
 */

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const { version } = require('../../package.json');
const { CONFIG } = require('../config/config');
const { getLevelExpProgress } = require('../config/gameConfig');
const { getResourcePath } = require('../config/runtime-paths');
const store = require('../models/store');
const { addOrUpdateAccount, deleteAccount } = store;
const { findAccountByRef, normalizeAccountRef, resolveAccountId } = require('../services/account-resolver');
const { createModuleLogger } = require('../services/logger');
const { MiniProgramLoginSession } = require('../services/qrlogin');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');
const userStore = require('../models/user-store');
const usersController = require('./users');
const cardsController = require('./cards');
const { validateUsername, validatePassword, validateCardCode } = require('../utils/validators');

const hashPassword = (pwd) => crypto.createHash('sha256').update(String(pwd || '')).digest('hex');
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

    const tokens = new Set();
    const tokenUserMap = new Map(); // token -> user info

    const issueToken = () => crypto.randomBytes(24).toString('hex');
    const authRequired = (req, res, next) => {
        const token = req.headers['x-admin-token'];
        if (!token || !tokens.has(token)) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        req.adminToken = token;
        req.currentUser = tokenUserMap.get(token);
        next();
    };

    // 用户状态检查中间件
    const userRequired = (req, res, next) => {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

        // 管理员不受限制
        if (req.currentUser.role === 'admin') {
            return next();
        }

        // 检查封禁状态
        if (req.currentUser.card?.enabled === false) {
            tokens.delete(req.adminToken);
            tokenUserMap.delete(req.adminToken);
            return res.status(403).json({ ok: false, error: '账号已被封禁' });
        }

        // 检查过期状态
        if (req.currentUser.card?.expiresAt && req.currentUser.card.expiresAt < Date.now()) {
            // 安全优化：允许过期用户访问续费接口，而不是直接踢下线
            const RENEW_WHITELIST = ['/auth/renew', '/auth/trial-renew', '/trial-card-config'];
            const currentPath = req.path.replace(/^\/api/, '');
            if (RENEW_WHITELIST.includes(currentPath)) {
                return next();
            }

            tokens.delete(req.adminToken);
            tokenUserMap.delete(req.adminToken);
            return res.status(403).json({ ok: false, error: '账号已过期，请续费后操作' });
        }

        next();
    };

    // 账号所有权验证中间件
    const accountOwnershipRequired = (req, res, next) => {
        const accountId = req.headers['x-account-id'] || req.params.id;
        if (!accountId) {
            return res.status(400).json({ ok: false, error: 'Missing account ID' });
        }

        // 管理员可以访问所有账号
        if (req.currentUser?.role === 'admin') {
            return next();
        }

        const allAccounts = store.getAccounts();
        const account = allAccounts.accounts.find(a => String(a.id) === String(accountId));

        if (!account) {
            return res.status(404).json({ ok: false, error: '账号不存在' });
        }

        // 验证所有权
        if (account.username && account.username !== req.currentUser.username) {
            return res.status(403).json({ ok: false, error: '无权操作此账号' });
        }

        next();
    };

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-account-id, x-admin-token');
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

    // 登录与鉴权 - 支持多用户
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body || {};

        // 兼容旧版：如果没有用户名，使用单管理员模式
        if (!username) {
            const input = String(password || '');
            const storedHash = store.getAdminPasswordHash ? store.getAdminPasswordHash() : '';
            let ok = false;
            if (storedHash) {
                ok = hashPassword(input) === storedHash;
            } else {
                ok = input === String(CONFIG.adminPassword || '');
            }
            if (!ok) {
                return res.status(401).json({ ok: false, error: 'Invalid password' });
            }
            const token = issueToken();
            tokens.add(token);
            tokenUserMap.set(token, { username: 'admin', role: 'admin', card: null });
            return res.json({ ok: true, data: { token, user: { username: 'admin', role: 'admin', card: null } } });
        }

        // 多用户登录
        const user = userStore.validateUser(username, password);
        if (!user) {
            return res.status(401).json({ ok: false, error: '用户名或密码错误' });
        }

        if (user.error) {
            return res.status(403).json({ ok: false, error: user.error });
        }

        const token = issueToken();
        tokens.add(token);
        tokenUserMap.set(token, user);

        res.json({
            ok: true,
            data: {
                token,
                user: {
                    username: user.username,
                    role: user.role,
                    card: user.card
                }
            }
        });
    });

    app.use('/api', (req, res, next) => {
        if (req.path === '/login' || req.path === '/auth/register' || req.path === '/qr/create' || req.path === '/qr/check' || req.path === '/notifications' || req.path === '/trial-card' || req.path === '/ui-config') return next();
        return authRequired(req, res, next);
    });

    app.post('/api/admin/change-password', (req, res) => {
        const body = req.body || {};
        const oldPassword = String(body.oldPassword || '');
        const newPassword = String(body.newPassword || '');
        if (newPassword.length < 4) {
            return res.status(400).json({ ok: false, error: '新密码长度至少为 4 位' });
        }
        const storedHash = store.getAdminPasswordHash ? store.getAdminPasswordHash() : '';
        const ok = storedHash
            ? hashPassword(oldPassword) === storedHash
            : oldPassword === String(CONFIG.adminPassword || '');
        if (!ok) {
            return res.status(400).json({ ok: false, error: '原密码错误' });
        }
        const nextHash = hashPassword(newPassword);
        if (store.setAdminPasswordHash) {
            store.setAdminPasswordHash(nextHash);
        }
        res.json({ ok: true });
    });

    app.get('/api/ping', (req, res) => {
        res.json({ ok: true, data: { ok: true, uptime: process.uptime(), version } });
    });

    app.get('/api/auth/validate', (req, res) => {
        res.json({ ok: true, data: { valid: true } });
    });

    // 公开 API: 获取 UI 配置 (用于登录页背景等)
    app.get('/api/ui-config', (req, res) => {
        const ui = store.getUI();
        res.json({ ok: true, data: ui });
    });

    // API: 调度任务快照（用于调度收敛排查）
    app.get('/api/scheduler', async (req, res) => {
        try {
            const id = getAccId(req);
            if (provider && typeof provider.getSchedulerStatus === 'function') {
                const data = await provider.getSchedulerStatus(id);
                return res.json({ ok: true, data });
            }
            return res.json({ ok: true, data: { runtime: getSchedulerRegistrySnapshot(), worker: null, workerError: 'DataProvider does not support scheduler status' } });
        } catch (e) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/logout', (req, res) => {
        const token = req.adminToken;
        if (token) {
            tokens.delete(token);
            if (io) {
                for (const socket of io.sockets.sockets.values()) {
                    if (String(socket.data.adminToken || '') === String(token)) {
                        socket.disconnect(true);
                    }
                }
            }
        }
        res.json({ ok: true });
    });

    const getAccountList = () => {
        try {
            if (provider && typeof provider.getAccounts === 'function') {
                const data = provider.getAccounts();
                if (data && Array.isArray(data.accounts)) return data.accounts;
            }
        } catch {
            // ignore provider failures
        }
        const data = store.getAccounts ? store.getAccounts() : { accounts: [] };
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

    const resolveAccId = (rawRef) => {
        const input = normalizeAccountRef(rawRef);
        if (!input) return '';

        if (provider && typeof provider.resolveAccountId === 'function') {
            const resolvedByProvider = normalizeAccountRef(provider.resolveAccountId(input));
            if (resolvedByProvider) return resolvedByProvider;
        }

        const resolved = resolveAccountId(getAccountList(), input);
        return resolved || input;
    };

    // Helper to get account ID from header
    function getAccId(req) {
        return resolveAccId(req.headers['x-account-id']);
    }

    // API: 完整状态
    app.get('/api/status', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.json({ ok: false, error: 'Missing x-account-id' });

        try {
            const data = provider.getStatus(id);
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

    app.post('/api/automation', async (req, res) => {
        const id = getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            const body = req.body || {};
            // 偷采过滤配置使用独立存储方法
            const stealFilterKeys = ['stealFilterEnabled', 'stealFilterMode', 'stealFilterPlantIds'];
            const stealFriendFilterKeys = ['stealFriendFilterEnabled', 'stealFriendFilterMode', 'stealFriendFilterIds'];
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
                if (stealFilterKeys.includes(k) || stealFriendFilterKeys.includes(k)) continue;
                lastData = await provider.setAutomation(id, k, v);
            }
            res.json({ ok: true, data: lastData || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农田详情
    app.get('/api/lands', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getLands(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友列表
    app.get('/api/friends', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriends(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友缓存列表 (专供配置页面读取，无风控请求)
    app.get('/api/friends/cache', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { getCachedFriends } = require('../services/database');
            let data = [];
            if (getCachedFriends) {
                data = getCachedFriends(id);
            }
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 好友农田详情
    app.get('/api/friend/:gid/lands', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriendLands(id, req.params.gid);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 对指定好友执行单次操作（偷菜/浇水/除草/捣乱）
    app.post('/api/friend/:gid/op', async (req, res) => {
        const id = getAccId(req);
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
    app.get('/api/friend-blacklist', (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        const list = store.getFriendBlacklist ? store.getFriendBlacklist(id) : [];
        res.json({ ok: true, data: list });
    });

    app.post('/api/friend-blacklist/toggle', (req, res) => {
        const id = getAccId(req);
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
    app.get('/api/seeds', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getSeeds(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 背包物品
    app.get('/api/bag', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getBag(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 每日礼包状态总览
    app.get('/api/daily-gifts', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getDailyGifts(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 启动账号
    app.post('/api/accounts/:id/start', (req, res) => {
        try {
            const ok = provider.startAccount(resolveAccId(req.params.id));
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 停止账号
    app.post('/api/accounts/:id/stop', (req, res) => {
        try {
            const ok = provider.stopAccount(resolveAccId(req.params.id));
            if (!ok) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农场一键操作
    app.post('/api/farm/operate', async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType } = req.body; // 'harvest', 'clear', 'plant', 'all'
            await provider.doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    // API: 数据分析
    app.get('/api/analytics', async (req, res) => {
        try {
            const sortBy = req.query.sort || 'exp';
            const { getPlantRankings } = require('../services/analytics');
            const data = getPlantRankings(sortBy);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置页统一保存（单次写入+单次广播）
    app.post('/api/settings/save', async (req, res) => {
        const id = getAccId(req);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        }
        try {
            const data = await provider.saveSettings(id, req.body || {});
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置面板主题
    app.post('/api/settings/theme', async (req, res) => {
        try {
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

    // API: 保存下线提醒配置
    app.post('/api/settings/offline-reminder', async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setOfflineReminder ? store.setOfflineReminder(body) : {};
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 获取配置
    app.get('/api/settings', async (req, res) => {
        try {
            const id = getAccId(req);
            // 直接从主进程的 store 读取，确保即使账号未运行也能获取配置
            const intervals = store.getIntervals(id);
            const strategy = store.getPlantingStrategy(id);
            const preferredSeed = store.getPreferredSeed(id);
            const friendQuietHours = store.getFriendQuietHours(id);
            const automationRaw = store.getAutomation(id);
            const stealFilter = store.getStealFilterConfig ? store.getStealFilterConfig(id) : { enabled: false, mode: 'blacklist', plantIds: [] };
            const stealFriendFilter = store.getStealFriendFilterConfig ? store.getStealFriendFilterConfig(id) : { enabled: false, mode: 'blacklist', friendIds: [] };
            // 前端期望 automation 内包含偷菜/偷好友过滤字段，合并后返回
            const automation = {
                ...automationRaw,
                stealFilterEnabled: stealFilter.enabled,
                stealFilterMode: stealFilter.mode,
                stealFilterPlantIds: stealFilter.plantIds || [],
                stealFriendFilterEnabled: stealFriendFilter.enabled,
                stealFriendFilterMode: stealFriendFilter.mode,
                stealFriendFilterIds: stealFriendFilter.friendIds || [],
            };
            const ui = store.getUI();
            const offlineReminder = store.getOfflineReminder
                ? store.getOfflineReminder()
                : { channel: 'webhook', reloginUrlMode: 'none', endpoint: '', token: '', title: '账号下线提醒', msg: '账号下线', offlineDeleteSec: 120 };
            res.json({ ok: true, data: { intervals, strategy, preferredSeed, friendQuietHours, automation, ui, offlineReminder } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号管理
    app.get('/api/accounts', (req, res) => {
        try {
            const data = provider.getAccounts();
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 更新账号备注（兼容旧接口）
    app.post('/api/account/remark', (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const rawRef = body.id || body.accountId || body.uin || req.headers['x-account-id'];
            const accountList = getAccountList();
            const target = findAccountByRef(accountList, rawRef);
            if (!target || !target.id) {
                return res.status(404).json({ ok: false, error: 'Account not found' });
            }

            const remark = String(body.remark !== undefined ? body.remark : body.name || '').trim();
            if (!remark) {
                return res.status(400).json({ ok: false, error: 'Missing remark' });
            }

            const accountId = String(target.id);
            const data = addOrUpdateAccount({ id: accountId, name: remark });
            if (provider && typeof provider.setRuntimeAccountName === 'function') {
                provider.setRuntimeAccountName(accountId, remark);
            }
            if (provider && provider.addAccountLog) {
                provider.addAccountLog('update', `更新账号备注: ${remark}`, accountId, remark);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts', (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};

            // 如果是新增请求，拦截并检查是否已存在相同 UIN 和 platform 的账号，如果是，则转为更新操作以避免重复创建
            if (!body.id && body.uin && body.platform) {
                const existingAccounts = store.getAccounts();
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
            const resolvedUpdateId = isUpdate ? resolveAccId(body.id) : '';
            const payload = isUpdate ? { ...body, id: resolvedUpdateId || String(body.id) } : body;
            let wasRunning = false;
            if (isUpdate && provider.isAccountRunning) {
                wasRunning = provider.isAccountRunning(payload.id);
            }

            // 体验卡用户账号数限制校验（仅新增时）
            if (!isUpdate && req.currentUser && req.currentUser.maxAccounts > 0) {
                const allAccounts = store.getAccounts();
                const userAccounts = (allAccounts.accounts || []).filter(a => a.username === req.currentUser.username);
                if (userAccounts.length >= req.currentUser.maxAccounts) {
                    return res.status(400).json({ ok: false, error: `体验卡用户最多绑定 ${req.currentUser.maxAccounts} 个账号` });
                }
            }

            const data = addOrUpdateAccount(payload);
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
                if (newAcc) provider.startAccount(newAcc.id);
            } else if (wasRunning) {
                // 如果是更新，且之前在运行，则重启
                provider.restartAccount(payload.id);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/accounts/:id', (req, res) => {
        try {
            const resolvedId = resolveAccId(req.params.id) || String(req.params.id || '');
            const before = provider.getAccounts();
            const target = findAccountByRef(before.accounts || [], req.params.id);
            provider.stopAccount(resolvedId);
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
    app.post('/api/auth/register', (req, res) => {
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

            const result = userStore.registerUser(username, password, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            // 注册成功后自动登录
            const token = issueToken();
            tokens.add(token);
            tokenUserMap.set(token, result.user);

            res.json({ ok: true, data: { token, user: result.user } });
        } catch (error) {
            console.error('用户注册失败:', error.message);
            res.status(500).json({ ok: false, error: '注册失败，请稍后重试' });
        }
    });

    // 用户续费
    app.post('/api/auth/renew', authRequired, (req, res) => {
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

            const result = userStore.renewUser(req.currentUser.username, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            // 更新 token 中的用户信息
            req.currentUser.card = result.card;
            tokenUserMap.set(req.adminToken, req.currentUser);

            res.json({ ok: true, data: { card: result.card } });
        } catch (error) {
            console.error('用户续费失败:', error.message);
            res.status(500).json({ ok: false, error: '续费失败，请稍后重试' });
        }
    });

    // 获取用户列表（仅管理员）
    app.get('/api/users', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.getAllUsers(req, res);
    });

    // 更新用户（仅管理员）
    app.put('/api/users/:username', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.updateUser(req, res);
    });

    // 删除用户（仅管理员）
    app.delete('/api/users/:username', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        usersController.deleteUser(req, res);
    });

    // 修改密码
    app.post('/api/auth/change-password', authRequired, (req, res) => {
        usersController.changePassword(req, res);
    });

    // ============ 卡密管理路由 ============

    // 获取卡密列表（仅管理员）
    app.get('/api/cards', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.getAllCards(req, res);
    });

    // 生成卡密（仅管理员）
    app.post('/api/cards', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.createCard(req, res);
    });

    // 更新卡密（仅管理员）
    app.put('/api/cards/:code', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.updateCard(req, res);
    });

    // 删除卡密（仅管理员）
    app.delete('/api/cards/:code', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        cardsController.deleteCard(req, res);
    });

    // 批量删除卡密（仅管理员）
    app.post('/api/cards/batch-delete', authRequired, userRequired, (req, res) => {
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

    // ============ 体验卡 API ============

    // 公开 API：自助生成体验卡（无需登录）[带防刷限制]
    app.post('/api/trial-card', trialRateLimiter, (req, res) => {
        try {
            const clientIP = getClientIP(req);
            const result = userStore.createTrialCard(clientIP);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { code: result.code, days: result.days } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 获取体验卡配置（登录用户可读，管理员看全部，普通用户仅看 userRenewEnabled）
    app.get('/api/trial-card-config', authRequired, (req, res) => {
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
    app.post('/api/trial-card-config', authRequired, userRequired, (req, res) => {
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
    app.post('/api/users/:username/trial-renew', authRequired, userRequired, (req, res) => {
        if (req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        try {
            const result = userStore.renewTrialUser(req.params.username, 'admin');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 用户自助续费体验卡
    app.post('/api/auth/trial-renew', authRequired, (req, res) => {
        try {
            const result = userStore.renewTrialUser(req.currentUser.username, 'user');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            // 更新 token 中的用户信息
            req.currentUser.card = result.card;
            tokenUserMap.set(req.adminToken, req.currentUser);
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号日志
    app.get('/api/account-logs', (req, res) => {
        try {
            const limit = Number.parseInt(req.query.limit) || 100;
            const list = provider.getAccountLogs ? provider.getAccountLogs(limit) : [];
            // 与当前 web 前端保持一致：直接返回数组
            res.json(Array.isArray(list) ? list : []);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 日志
    app.get('/api/logs', (req, res) => {
        const queryAccountIdRaw = (req.query.accountId || '').toString().trim();
        const id = queryAccountIdRaw ? (queryAccountIdRaw === 'all' ? '' : resolveAccId(queryAccountIdRaw)) : getAccId(req);
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
        const list = provider.getLogs(id, options);
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
        const logPath = path.join(__dirname, '../../../Update.log');
        if (!fs.existsSync(logPath)) return [];
        const raw = fs.readFileSync(logPath, 'utf-8');
        // 按连续空行（2个以上换行）分割条目
        const blocks = raw.split(/\n\s*\n\s*\n/).filter(b => b.trim());
        const entries = [];
        const dateRe = /^(\d{4}-\d{2}-\d{2})\s+(.+?)$/;
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

    app.get('/api/notifications', (req, res) => {
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
        const { platform = 'qq' } = req.body || {};
        try {
            if (platform === 'wx') {
                const wxCtrl = new AbortController();
                const wxTimer = setTimeout(() => wxCtrl.abort(), 15000);
                const wxRes = await fetch(`${CONFIG.wxApiUrl}?api_key=${encodeURIComponent(CONFIG.wxApiKey)}&action=getqr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                    signal: wxCtrl.signal,
                }).then(r => r.json()).finally(() => clearTimeout(wxTimer));

                if (wxRes.code === 0 && wxRes.data) {
                    let qrcodeData = wxRes.data.QrBase64;
                    if (qrcodeData && !qrcodeData.startsWith('data:')) {
                        qrcodeData = `data:image/png;base64,${qrcodeData}`;
                    }
                    res.json({ ok: true, data: { qrcode: qrcodeData, code: wxRes.data.Uuid || wxRes.data.uuid, platform: 'wx' } });
                } else {
                    res.json({ ok: false, error: wxRes.msg || '获取微信二维码失败' });
                }
            } else {
                const result = await MiniProgramLoginSession.requestLoginCode();
                res.json({ ok: true, data: result });
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code, platform = 'qq' } = req.body || {};
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            if (platform === 'wx') {
                const checkCtrl = new AbortController();
                const checkTimer = setTimeout(() => checkCtrl.abort(), 10000);
                const wxCheckRes = await fetch(`${CONFIG.wxApiUrl}?api_key=${encodeURIComponent(CONFIG.wxApiKey)}&action=checkqr`, {
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
                            wxLoginRes = await fetch(`${CONFIG.wxApiUrl}?api_key=${encodeURIComponent(CONFIG.wxApiKey)}&action=jslogin`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ wxid, appid: CONFIG.wxAppId }),
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
                    const nickname = result.nickname || ''; // 获取昵称
                    const appid = '1112386029'; // Farm appid

                    const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid);

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

    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/game-config')) {
            return res.status(404).json({ ok: false, error: 'Not Found' });
        }
        if (fs.existsSync(webDist)) {
            res.sendFile(path.join(webDist, 'index.html'));
        } else {
            res.status(404).send('web build not found. Please build the web project.');
        }
    });

    const applySocketSubscription = (socket, accountRef = '') => {
        const incoming = String(accountRef || '').trim();
        const resolved = incoming && incoming !== 'all' ? resolveAccId(incoming) : '';
        for (const room of socket.rooms) {
            if (room.startsWith('account:')) socket.leave(room);
        }
        if (resolved) {
            socket.join(`account:${resolved}`);
            socket.data.accountId = resolved;
        } else {
            socket.join('account:all');
            socket.data.accountId = '';
        }
        socket.emit('subscribed', { accountId: socket.data.accountId || 'all' });

        try {
            const targetId = socket.data.accountId || '';
            if (targetId && provider && typeof provider.getStatus === 'function') {
                const currentStatus = provider.getStatus(targetId);
                socket.emit('status:update', { accountId: targetId, status: currentStatus });
            }
            if (provider && typeof provider.getLogs === 'function') {
                const currentLogs = provider.getLogs(targetId, { limit: 100 });
                socket.emit('logs:snapshot', {
                    accountId: targetId || 'all',
                    logs: Array.isArray(currentLogs) ? currentLogs : [],
                });
            }
            if (provider && typeof provider.getAccountLogs === 'function') {
                const currentAccountLogs = provider.getAccountLogs(100);
                socket.emit('account-logs:snapshot', {
                    logs: Array.isArray(currentAccountLogs) ? currentAccountLogs : [],
                });
            }
        } catch {
            // ignore snapshot push errors
        }
    };

    const port = CONFIG.adminPort || 3000;
    server = app.listen(port, '0.0.0.0', () => {
        adminLogger.info('admin panel started', { url: `http://localhost:${port}`, port });
    });

    io = new SocketIOServer(server, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['x-admin-token', 'x-account-id'],
        },
    });

    io.use((socket, next) => {
        const authToken = socket.handshake.auth && socket.handshake.auth.token
            ? String(socket.handshake.auth.token)
            : '';
        const headerToken = socket.handshake.headers && socket.handshake.headers['x-admin-token']
            ? String(socket.handshake.headers['x-admin-token'])
            : '';
        const token = authToken || headerToken;
        if (!token || !tokens.has(token)) {
            return next(new Error('Unauthorized'));
        }
        socket.data.adminToken = token;
        return next();
    });

    io.on('connection', (socket) => {
        const initialAccountRef = (socket.handshake.auth && socket.handshake.auth.accountId)
            || (socket.handshake.query && socket.handshake.query.accountId)
            || '';
        applySocketSubscription(socket, initialAccountRef);
        socket.emit('ready', { ok: true, ts: Date.now() });

        socket.on('subscribe', (payload) => {
            const body = (payload && typeof payload === 'object') ? payload : {};
            applySocketSubscription(socket, body.accountId || '');
        });
    });
}

module.exports = {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
};

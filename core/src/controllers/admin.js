const crypto = require('node:crypto');
/**
 * 管理面板 HTTP 服务
 * 改写为接收 DataProvider 模式，并集成多用户系统
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const process = require('node:process');
const express = require('express');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const { Server: SocketIOServer } = require('socket.io');
const { version } = require('../../package.json');
const { CONFIG } = require('../config/config');
const { getAllSeeds, getItemById, getItemImageById, getLevelExpProgress } = require('../config/gameConfig');
const { ensureDataDir, ensureAssetCacheDir, getResourcePath } = require('../config/runtime-paths');
const store = require('../models/store');
const { addOrUpdateAccount, deleteAccount } = store;
const { findAccountByRef, normalizeAccountRef, resolveAccountId } = require('../services/account-resolver');
const { createModuleLogger } = require('../services/logger');
const { getPool } = require('../services/mysql-db');
const { getAnnouncements, saveAnnouncement, deleteAnnouncement, getReportLogs, getReportLogStats, exportReportLogs, deleteReportLogsByIds, clearReportLogs } = require('../services/database');
const { MiniProgramLoginSession } = require('../services/qrlogin');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');
const { cleanupUiBackgrounds } = require('../services/ui-assets');
const { validateSettings } = require('../services/config-validator');
const { inspectSystemSettingsHealth } = require('../services/system-settings');
const { inspectWebDistState } = require('../utils/web-dist');
const security = require('../services/security');
const userStore = require('../models/user-store');
const usersController = require('./users');
const cardsController = require('./cards');
const aiStatusRouter = require('./aiStatus');
const { validateUsername, validatePassword, validateCardCode } = require('../utils/validators');
const { resolveWebDistDir } = require('../utils/web-dist');
const { buildUserUiBody, getUserUiConfig, mergeUiConfig, saveUserUiConfig } = require('../services/user-ui-settings');
const { getUserPreferences, saveUserPreferences } = require('../services/user-preferences');
const { getAccountBagPreferences, saveAccountBagPreferences } = require('../services/account-bag-preferences');
const accountRepository = require('../repositories/account-repository');
const jwtService = require('../services/jwt-service');
const { createOfflineCommerceHelpers } = require('./admin/offline-commerce');
const { buildReportHistoryCsv, compareLeaderboardAccounts, buildAdminListenError, toLeaderboardMetricNumber } = require('./admin/shared-utils');
const { registerCommerceRoutes } = require('./admin/commerce-routes');
const { registerSettingsReportRoutes } = require('./admin/settings-report-routes');
const { registerBugReportRoutes } = require('./admin/bug-report-routes');
const { registerAccountReadRoutes, registerLogReadRoutes } = require('./admin/account-read-routes');
const { registerFriendBlacklistRoutes, registerAccountControlRoutes } = require('./admin/account-control-routes');
const { registerAnnouncementAdminRoutes } = require('./admin/announcement-admin-routes');
const { registerSystemUpdateAdminRoutes } = require('./admin/system-update-admin-routes');
const { getDispatcher } = require('../cluster/master-dispatcher');
const { registerSystemPublicRoutes, registerNotificationsRoute } = require('./admin/system-public-routes');
const { registerAccountStateRoutes } = require('./admin/account-state-routes');
const { registerAutomationRoutes, registerFriendOperationRoutes } = require('./admin/account-automation-routes');
const { registerAccountManagementRoutes } = require('./admin/account-management-routes');
const { registerAccountSettingsRoutes } = require('./admin/account-settings-routes');
const { createAdminAuthMiddlewares } = require('./admin/auth-middleware');
const { registerAuthRoutes, registerLegacyLogoutRoute } = require('./admin/auth-routes');
const { registerQrRoutes } = require('./admin/qr-routes');
const { createSocketAuthMiddleware, createSocketSubscriptionHandler, createSocketConnectionHandler } = require('./admin/socket-runtime');
const { registerAdminOperationLogRoutes } = require('./admin/admin-operation-log-routes');
const { registerUserCardRoutes, registerTrialCardRoutes } = require('./admin/user-card-routes');
const { registerAdminMaintenanceTasks } = require('./admin/maintenance-tasks');
const { ensureAdminMaintenanceTasks, stopAdminMaintenanceTasks } = require('./admin/maintenance-runtime');
const { createAdminApiGuard, createAdminAppShell } = require('./admin/app-shell');
const { createAccountRuntimeHelpers, createTrialRateLimiter, createUpdateLogParser } = require('./admin/runtime-helpers');
const { registerAdminFeatureRoutes } = require('./admin/feature-wiring');
const { createAdminRealtimeServer, createAdminListenPromise, closeAdminRealtimeServer } = require('./admin/server-runtime');
const adminOperationLogService = require('../services/admin-operation-logs');

const adminLogger = createModuleLogger('admin');
const { buildOfflineSeeds, buildOfflineShopCatalog, findShopGoodsById, buildOfflineMallGoods, buildOfflineMallCatalog } = createOfflineCommerceHelpers({
    getAllSeeds,
    getItemById,
    getItemImageById,
});

let app = null;
let server = null;
let provider = null; // DataProvider
let io = null;
let serverStartPromise = null;
let applySocketSubscription = async () => { };
let maintenanceContext = null;
let maintenanceTasks = null;

function ensureUiBackgroundDir() {
    const dir = path.join(ensureDataDir(), 'ui-backgrounds');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function runUiBackgroundCleanup(extraUrls = []) {
    try {
        const ui = typeof store.getUI === 'function' ? store.getUI() : {};
        const result = cleanupUiBackgrounds({
            dirPath: ensureUiBackgroundDir(),
            activeBackgroundUrl: ui.loginBackground || '',
            pendingBackgroundUrls: Array.isArray(extraUrls) ? extraUrls : [],
        });
        if (result.deleted.length > 0) {
            adminLogger.info(`已清理未引用背景文件 ${result.deleted.length} 个`);
        }
    } catch (e) {
        adminLogger.warn(`清理背景文件失败: ${e.message}`);
    }
}

async function getAccountsSnapshot(options = {}) {
    if (typeof store.getAccountsFresh === 'function') {
        return await store.getAccountsFresh(options);
    }
    if (typeof store.getAccounts === 'function') {
        return await store.getAccounts();
    }
    return { accounts: [] };
}

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

function cleanupFailedAdminStart() {
    maintenanceTasks = stopAdminMaintenanceTasks(maintenanceTasks);

    if (io) {
        try {
            io.close();
        } catch {
            // ignore close errors on failed bootstrap
        }
        io = null;
    }

    if (server) {
        try {
            server.removeAllListeners('error');
            server.removeAllListeners('listening');
            if (server.listening) {
                server.close();
            }
        } catch {
            // ignore close errors on failed bootstrap
        }
        server = null;
    }

    serverStartPromise = null;
}

async function stopAdminServer() {
    const pendingStart = serverStartPromise;
    if (pendingStart) {
        try {
            await pendingStart;
        } catch {
            // bootstrap failure cleanup already happened in start path
        }
    }

    maintenanceTasks = stopAdminMaintenanceTasks(maintenanceTasks);
    await closeAdminRealtimeServer({
        server,
        io,
    });

    io = null;
    server = null;
    provider = null;
    serverStartPromise = null;
}

function startAdminServer(dataProvider) {
    provider = dataProvider;
    if (server && server.listening) return Promise.resolve(server);
    if (serverStartPromise) return serverStartPromise;
    const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    if (!app) {
        const {
            resolveRequestUser,
            authRequired,
            userRequired,
            accountOwnershipRequired,
            publicPaths,
        } = createAdminAuthMiddlewares({
            jwtService,
            userStore,
            getAccountsSnapshot,
        });

        const shell = createAdminAppShell({
            createApp: () => express(),
            jsonMiddleware: express.json({ limit: '10mb' }),
            cookieParserMiddleware: cookieParser(),
            aiStatusRouter,
            authRequired,
            userRequired,
            allowedOrigins,
            adminLogger,
            resolveWebDistDir,
            fsRef: fs,
            expressStatic: express.static,
            ensureUiBackgroundDir,
            getResourcePath,
            ensureAssetCacheDir,
            runUiBackgroundCleanup,
        });
        app = shell.app;
        const { webDist } = shell;

        const featureRuntime = registerAdminFeatureRoutes({
            app,
            webDist,
            fsRef: fs,
            pathRef: path,
            baseDir: __dirname,
            createAdminApiGuard,
            createAccountRuntimeHelpers,
            createTrialRateLimiter,
            createUpdateLogParser,
            farmToolsRouter: require('./farm-tools-routing'),
            publicPaths,
            authRequired,
            userRequired,
            accountOwnershipRequired,
            resolveRequestUser,
            getProvider: () => provider,
            getPool,
            getAccountsSnapshot,
            inspectSystemSettingsHealth,
            inspectWebDistState,
            version,
            processRef: process,
            store,
            getUserUiConfig,
            mergeUiConfig,
            getUserPreferences,
            getSchedulerRegistrySnapshot,
            getClientIP,
            security,
            userStore,
            jwtService,
            adminLogger,
            configRef: CONFIG,
            normalizeAccountRef,
            resolveAccountId,
            getLevelExpProgress,
            buildOfflineSeeds,
            buildOfflineShopCatalog,
            findShopGoodsById,
            buildOfflineMallCatalog,
            buildOfflineMallGoods,
            getAccountBagPreferences,
            saveAccountBagPreferences,
            accountRepository,
            validateSettings,
            buildUserUiBody,
            saveUserUiConfig,
            saveUserPreferences,
            runUiBackgroundCleanup,
            ensureUiBackgroundDir,
            buildReportHistoryCsv,
            getReportLogs,
            getReportLogStats,
            exportReportLogs,
            deleteReportLogsByIds,
            clearReportLogs,
            getAnnouncements,
            saveAnnouncement,
            deleteAnnouncement,
            adminOperationLogService,
            cryptoRef: crypto,
            findAccountByRef,
            addOrUpdateAccount,
            deleteAccount,
            compareLeaderboardAccounts,
            toLeaderboardMetricNumber,
            usersController,
            cardsController,
            validateUsername,
            validatePassword,
            validateCardCode,
            miniProgramLoginSession: MiniProgramLoginSession,
            fetchRef: fetch,
            AbortControllerRef: AbortController,
            setTimeoutRef: setTimeout,
            clearTimeoutRef: clearTimeout,
            consoleRef: console,
            getIo: () => io,
            getDispatcher: () => getDispatcher(),
            registerAuthRoutes,
            registerLegacyLogoutRoute,
            registerSystemPublicRoutes,
            registerAccountStateRoutes,
            registerAutomationRoutes,
            registerFriendOperationRoutes,
            registerFriendBlacklistRoutes,
            registerCommerceRoutes,
            registerAccountControlRoutes,
            registerAccountSettingsRoutes,
            registerSettingsReportRoutes,
            registerBugReportRoutes,
            registerAccountReadRoutes,
            registerAccountManagementRoutes,
            registerUserCardRoutes,
            registerAdminOperationLogRoutes,
            registerTrialCardRoutes,
            registerAnnouncementAdminRoutes,
            registerSystemUpdateAdminRoutes,
            registerLogReadRoutes,
            registerNotificationsRoute,
            registerQrRoutes,
        });
        const routeRuntime = featureRuntime.routeRuntime;
        maintenanceContext = featureRuntime.maintenanceContext;

        applySocketSubscription = createSocketSubscriptionHandler({
            getAccountsSnapshot,
            resolveAccId: routeRuntime.resolveAccId,
            getProvider: () => provider,
        });

    }

    maintenanceTasks = ensureAdminMaintenanceTasks({
        currentTasks: maintenanceTasks,
        maintenanceContext,
        registerAdminMaintenanceTasks,
        cronRef: cron,
        getProvider: () => provider,
        getPool,
        adminLogger,
        jwtService,
    });

    const port = Number(process.env.FARM_PORT || CONFIG.adminPort || 3000);
    const realtime = createAdminRealtimeServer({
        httpRef: http,
        socketServerFactory: (httpServer, options) => new SocketIOServer(httpServer, options),
        app,
        allowedOrigins,
        createSocketAuthMiddleware,
        createSocketConnectionHandler,
        jwtService,
        userStore,
        applySocketSubscription,
    });
    server = realtime.server;
    io = realtime.io;

    serverStartPromise = createAdminListenPromise({
        server,
        port,
        adminLogger,
        buildAdminListenError,
        cleanupFailedAdminStart,
        clearServerStartPromise: () => {
            serverStartPromise = null;
        },
    });

    return serverStartPromise;
}

function getIO() {
    return io;
}

module.exports = {
    startAdminServer,
    stopAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
    getIO
};

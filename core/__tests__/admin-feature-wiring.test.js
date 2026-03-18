const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAdminFeatureRoutes } = require('../src/controllers/admin/feature-wiring');

function createFakeApp(calls) {
    const uses = [];
    const gets = [];
    return {
        uses,
        gets,
        use(...args) {
            uses.push(args);
            const marker = args[0] === '/api' ? `app.use:${args[0]}` : 'app.use';
            calls.push(marker);
        },
        get(...args) {
            gets.push(args);
            calls.push(`app.get:${args[0]}`);
        },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        sentFile: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        },
        sendFile(filePath) {
            this.sentFile = filePath;
            return this;
        },
    };
}

function createFeatureDeps(overrides = {}) {
    const fixture = {
        calls: [],
        guardFn: () => {},
        trialRateLimiterFn: () => {},
        parseUpdateLogFn: () => [],
        routeRuntime: {
            getAccountList: async () => [],
            getAccountSnapshotById: async () => ({}),
            isSoftRuntimeError: () => false,
            handleApiError: () => {},
            resolveAccId: async () => 'acc-1',
            getAccId: async () => 'acc-1',
        },
        createAdminApiGuard: (args) => {
            fixture.calls.push('createAdminApiGuard');
            fixture.lastApiGuardArgs = args;
            return fixture.guardFn;
        },
        createAccountRuntimeHelpers: (args) => {
            fixture.calls.push('createAccountRuntimeHelpers');
            fixture.lastRuntimeHelperArgs = args;
            return fixture.routeRuntime;
        },
        createTrialRateLimiter: (args) => {
            fixture.calls.push('createTrialRateLimiter');
            fixture.lastTrialRateLimiterArgs = args;
            return fixture.trialRateLimiterFn;
        },
        createUpdateLogParser: (args) => {
            fixture.calls.push('createUpdateLogParser');
            fixture.lastUpdateLogParserArgs = args;
            return fixture.parseUpdateLogFn;
        },
    };

    const app = createFakeApp(fixture.calls);

    const makeRegistrar = (name) => (args) => {
        fixture.calls.push(name);
        fixture[`${name}Args`] = args;
    };

    fixture.deps = {
            app,
            webDist: '/tmp/web',
            fsRef: { existsSync: (target) => target === '/tmp/web' },
            pathRef: { join: (...parts) => parts.join('/') },
            baseDir: '/workspace/core/src/controllers',
            createAdminApiGuard: fixture.createAdminApiGuard,
            createAccountRuntimeHelpers: fixture.createAccountRuntimeHelpers,
            createTrialRateLimiter: fixture.createTrialRateLimiter,
            createUpdateLogParser: fixture.createUpdateLogParser,
            farmToolsRouter: { name: 'farm-tools' },
            publicPaths: new Set(['/ping']),
            authRequired: () => {},
            userRequired: () => {},
            accountOwnershipRequired: () => {},
            resolveRequestUser: async () => null,
            getProvider: () => null,
            getPool: () => null,
            getAccountsSnapshot: async () => ({ accounts: [] }),
            inspectSystemSettingsHealth: async () => ({}),
            inspectWebDistState: () => ({}),
            version: '4.5.18',
            processRef: process,
            store: {},
            getUserUiConfig: async () => ({}),
            mergeUiConfig: (a, b) => ({ ...a, ...b }),
            getUserPreferences: async () => ({}),
            getSchedulerRegistrySnapshot: () => ({}),
            getClientIP: () => '1.2.3.4',
            security: {},
            userStore: {},
            jwtService: {},
            adminLogger: {},
            configRef: {},
            normalizeAccountRef: (value) => String(value || '').trim(),
            resolveAccountId: () => '',
            getLevelExpProgress: () => ({}),
            buildOfflineSeeds: () => [],
            buildOfflineShopCatalog: () => [],
            findShopGoodsById: () => null,
            buildOfflineMallCatalog: () => [],
            buildOfflineMallGoods: () => [],
            getAccountBagPreferences: async () => ({}),
            saveAccountBagPreferences: async () => ({}),
            accountRepository: {},
            validateSettings: () => ({ valid: true }),
            buildUserUiBody: (body) => body,
            saveUserUiConfig: async () => ({}),
            saveUserPreferences: async () => ({}),
            runUiBackgroundCleanup: () => {},
            ensureUiBackgroundDir: () => '/tmp/bg',
            buildReportHistoryCsv: () => '',
            getReportLogs: async () => ({ items: [], total: 0 }),
            getReportLogStats: async () => ({ total: 0 }),
            exportReportLogs: async () => ({ items: [], total: 0, truncated: false }),
            deleteReportLogsByIds: async () => ({ deleted: 0 }),
            clearReportLogs: async () => ({ deleted: 0 }),
            getAnnouncements: async () => [],
            saveAnnouncement: async () => ({}),
            deleteAnnouncement: async () => ({}),
            cryptoRef: {},
            findAccountByRef: () => null,
            addOrUpdateAccount: async () => ({}),
            deleteAccount: async () => ({}),
            compareLeaderboardAccounts: () => 0,
            toLeaderboardMetricNumber: () => 0,
            usersController: {},
            cardsController: {},
            validateUsername: () => true,
            validatePassword: () => true,
            validateCardCode: () => true,
            cronRef: {},
            miniProgramLoginSession: {},
            fetchRef: async () => ({}),
            AbortControllerRef: AbortController,
            setTimeoutRef: setTimeout,
            clearTimeoutRef: clearTimeout,
            consoleRef: console,
            getIo: () => ({ emit: () => {} }),
            registerAuthRoutes: makeRegistrar('registerAuthRoutes'),
            registerLegacyLogoutRoute: makeRegistrar('registerLegacyLogoutRoute'),
            registerSystemPublicRoutes: makeRegistrar('registerSystemPublicRoutes'),
            registerAccountStateRoutes: makeRegistrar('registerAccountStateRoutes'),
            registerAutomationRoutes: makeRegistrar('registerAutomationRoutes'),
            registerFriendOperationRoutes: makeRegistrar('registerFriendOperationRoutes'),
            registerFriendBlacklistRoutes: makeRegistrar('registerFriendBlacklistRoutes'),
            registerCommerceRoutes: makeRegistrar('registerCommerceRoutes'),
            registerAccountControlRoutes: makeRegistrar('registerAccountControlRoutes'),
            registerAccountSettingsRoutes: makeRegistrar('registerAccountSettingsRoutes'),
            registerSettingsReportRoutes: makeRegistrar('registerSettingsReportRoutes'),
            registerBugReportRoutes: makeRegistrar('registerBugReportRoutes'),
            registerAccountReadRoutes: makeRegistrar('registerAccountReadRoutes'),
            registerAccountManagementRoutes: makeRegistrar('registerAccountManagementRoutes'),
            registerUserCardRoutes: makeRegistrar('registerUserCardRoutes'),
            registerAdminOperationLogRoutes: makeRegistrar('registerAdminOperationLogRoutes'),
            registerTrialCardRoutes: makeRegistrar('registerTrialCardRoutes'),
            registerAnnouncementAdminRoutes: makeRegistrar('registerAnnouncementAdminRoutes'),
            registerSystemUpdateAdminRoutes: makeRegistrar('registerSystemUpdateAdminRoutes'),
            registerLogReadRoutes: makeRegistrar('registerLogReadRoutes'),
            registerNotificationsRoute: makeRegistrar('registerNotificationsRoute'),
            registerQrRoutes: makeRegistrar('registerQrRoutes'),
            ...overrides,
        };

    return fixture;
}

test('registerAdminFeatureRoutes keeps feature registration order and shared helper wiring', () => {
    const fixture = createFeatureDeps();
    const { deps, calls, routeRuntime, parseUpdateLogFn, trialRateLimiterFn } = fixture;

    const result = registerAdminFeatureRoutes(deps);

    assert.equal(result.routeRuntime, routeRuntime);
    assert.deepEqual(calls, [
        'createAccountRuntimeHelpers',
        'createUpdateLogParser',
        'registerAuthRoutes',
        'app.use:/api',
        'createAdminApiGuard',
        'app.use:/api',
        'registerSystemPublicRoutes',
        'registerLegacyLogoutRoute',
        'registerAccountStateRoutes',
        'registerAutomationRoutes',
        'registerFriendOperationRoutes',
        'registerFriendBlacklistRoutes',
        'registerCommerceRoutes',
        'registerAccountControlRoutes',
        'registerAccountSettingsRoutes',
        'registerSettingsReportRoutes',
        'registerBugReportRoutes',
        'registerAccountReadRoutes',
        'registerAccountManagementRoutes',
        'registerUserCardRoutes',
        'registerAdminOperationLogRoutes',
        'createTrialRateLimiter',
        'registerTrialCardRoutes',
        'registerAnnouncementAdminRoutes',
        'registerSystemUpdateAdminRoutes',
        'registerLogReadRoutes',
        'registerNotificationsRoute',
        'registerQrRoutes',
        'app.get:*',
    ]);
    assert.equal(fixture.registerSystemPublicRoutesArgs.handleApiError, routeRuntime.handleApiError);
    assert.equal(fixture.registerSystemPublicRoutesArgs.getAccId, routeRuntime.getAccId);
    assert.equal(fixture.registerBugReportRoutesArgs.getAccId, routeRuntime.getAccId);
    assert.equal(fixture.registerAnnouncementAdminRoutesArgs.parseUpdateLog, parseUpdateLogFn);
    assert.equal(fixture.registerNotificationsRouteArgs.parseUpdateLog, parseUpdateLogFn);
    assert.equal(fixture.registerTrialCardRoutesArgs.trialRateLimiter, trialRateLimiterFn);
    assert.equal(typeof fixture.registerAccountControlRoutesArgs.loadGenerateSafeModeBlacklist(), 'function');
    assert.equal(
        result.maintenanceContext.trialRateLimitMap,
        fixture.lastTrialRateLimiterArgs.trialRateLimitMap,
    );
    assert.equal(deps.app.uses[0][1], deps.farmToolsRouter);
    assert.equal(deps.app.uses[1][1], fixture.guardFn);
});

test('registerAdminFeatureRoutes lazy runtime loaders resolve service modules from admin routes', () => {
    const fixture = createFeatureDeps();

    registerAdminFeatureRoutes(fixture.deps);

    const friendsCacheApi = fixture.registerAccountStateRoutesArgs.loadFriendsCacheApi();
    assert.equal(typeof friendsCacheApi.getCachedFriends, 'function');
    assert.equal(typeof friendsCacheApi.mergeFriendsCache, 'function');

    assert.equal(typeof fixture.registerAccountControlRoutesArgs.loadGetPlantRankings(), 'function');
    assert.doesNotThrow(() => fixture.registerCommerceRoutesArgs.formatUseResult({}, {}));
});

test('registerAdminFeatureRoutes catch-all route keeps api prefixes at 404 and serves index for web paths', async () => {
    const { deps } = createFeatureDeps();

    registerAdminFeatureRoutes(deps);

    const wildcardHandler = deps.app.gets.find(([path]) => path === '*')[1];
    assert.equal(typeof wildcardHandler, 'function');

    const apiRes = createResponse();
    await wildcardHandler({ path: '/api/accounts' }, apiRes);
    assert.equal(apiRes.statusCode, 404);
    assert.deepEqual(apiRes.body, { ok: false, error: 'Not Found' });

    const pageRes = createResponse();
    await wildcardHandler({ path: '/dashboard' }, pageRes);
    assert.equal(pageRes.sentFile, '/tmp/web/index.html');

    const { deps: missingDeps } = createFeatureDeps({
        webDist: '/tmp/missing-web',
        fsRef: { existsSync: () => false },
    });
    registerAdminFeatureRoutes(missingDeps);
    const missingHandler = missingDeps.app.gets.find(([path]) => path === '*')[1];
    const missingRes = createResponse();
    await missingHandler({ path: '/dashboard' }, missingRes);
    assert.equal(missingRes.statusCode, 404);
    assert.equal(missingRes.body, 'web build not found. Please build the web project.');
});

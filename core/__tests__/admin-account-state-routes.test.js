const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAccountStateRoutes } = require('../src/controllers/admin/account-state-routes');

function createFakeApp() {
    const routes = { get: new Map(), post: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
        },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function getRouteParts(routes, method, path) {
    const map = routes[String(method || 'get').toLowerCase()];
    const handlers = map && map.get(path);
    assert.ok(handlers, `missing route: ${String(method || 'GET').toUpperCase()} ${path}`);
    assert.equal(typeof handlers[0], 'function');
    assert.equal(typeof handlers[1], 'function');
    return { middleware: handlers[0], handler: handlers[1] };
}

function createDeps(overrides = {}) {
    const accountOwnershipRequired = (_req, _res, next) => next && next();
    return {
        app: null,
        accountOwnershipRequired,
        getAccId: async () => 'acc-1',
        getAccountSnapshotById: async () => ({
            id: 'acc-1',
            platform: 'qq',
            uin: '10001',
            qq: '10001',
            openId: '',
        }),
        getProvider: () => ({
            getStatus: async () => ({ status: { level: 11, exp: 88 } }),
            getLands: async () => [],
            getFriends: async () => [],
            getFriendLands: async () => [],
            getInteractRecords: async () => [],
        }),
        handleApiError: (res, err) => res.status(500).json({ ok: false, error: err.message }),
        getLevelExpProgress: (level, exp) => ({ level, exp, percent: 42 }),
        loadFriendsCacheApi: () => ({
            getCachedFriends: async () => [],
            updateFriendsCache: async () => {},
        }),
        ...overrides,
    };
}

test('status route keeps middleware and appends level progress', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerAccountStateRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'get', '/api/status');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            status: { level: 11, exp: 88 },
            levelProgress: { level: 11, exp: 88, percent: 42 },
        },
    });
});

test('friends cache route falls back to realtime list and updates cache asynchronously', async () => {
    const { app, routes } = createFakeApp();
    const cacheWrites = [];
    const deps = createDeps({
        app,
        getProvider: () => ({
            getFriends: async () => [{ gid: 1001 }],
        }),
        loadFriendsCacheApi: () => ({
            getCachedFriends: async () => [],
            updateFriendsCache: (accountId, data) => {
                cacheWrites.push({ accountId, data });
                return Promise.resolve();
            },
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/friends/cache');
    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(cacheWrites, [{ accountId: 'acc-1', data: [{ gid: 1001 }] }]);
    assert.deepEqual(res.body, { ok: true, data: [{ gid: 1001 }] });
});

test('friends route falls back to cached friends when worker is offline', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getProvider: () => ({
            getFriends: async () => {
                throw new Error('账号未运行');
            },
        }),
        loadFriendsCacheApi: () => ({
            getCachedFriends: async () => [{ gid: 1005, name: 'cached-friend' }],
            updateFriendsCache: async () => {},
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/friends');
    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: [{ gid: 1005, name: 'cached-friend' }],
        meta: {
            source: 'cache',
            reason: 'worker_error',
        },
    });
});

test('friends route exposes runtime friend meta when available', async () => {
    const { app, routes } = createFakeApp();
    const friends = [{ gid: 1007, name: 'wx-cache-friend' }];
    friends._meta = {
        source: 'cache',
        reason: 'self_only',
        platform: 'wx_car',
        conservative: true,
        realtimeAvailable: false,
    };
    const deps = createDeps({
        app,
        getProvider: () => ({
            getFriends: async () => friends,
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/friends');
    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: [{ gid: 1007, name: 'wx-cache-friend' }],
        meta: {
            source: 'cache',
            reason: 'self_only',
            platform: 'wx_car',
            conservative: true,
            realtimeAvailable: false,
        },
    });
});

test('friends route forwards manual refresh flag to provider', async () => {
    const { app, routes } = createFakeApp();
    const providerCalls = [];
    const deps = createDeps({
        app,
        getProvider: () => ({
            getFriends: async (_accountId, options) => {
                providerCalls.push(options);
                return [];
            },
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/friends');
    const res = createResponse();
    await handler({ query: { refresh: '1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(providerCalls, [{ manualRefresh: true }]);
    assert.deepEqual(res.body, {
        ok: true,
        data: [],
    });
});

test('lands route delegates runtime failures to handleApiError', async () => {
    const { app, routes } = createFakeApp();
    const handled = [];
    const err = new Error('账号未运行');
    const deps = createDeps({
        app,
        getProvider: () => ({
            getLands: async () => { throw err; },
        }),
        handleApiError: (res, error) => {
            handled.push(error);
            return res.status(418).json({ ok: false, error: error.message });
        },
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/lands');
    const res = createResponse();
    await handler({}, res);

    assert.deepEqual(handled, [err]);
    assert.equal(res.statusCode, 418);
    assert.deepEqual(res.body, { ok: false, error: '账号未运行' });
});

test('friend lands route keeps ownership middleware', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerAccountStateRoutes(deps);
    const { middleware } = getRouteParts(routes, 'get', '/api/friend/:gid/lands');

    assert.equal(middleware, deps.accountOwnershipRequired);
});

test('interact records route returns business error for INTERACT-prefixed code', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getProvider: () => ({
            getInteractRecords: async () => {
                const error = new Error('访客接口维护中');
                error.code = 'INTERACT_TEMP';
                throw error;
            },
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'get', '/api/interact-records');
    const res = createResponse();
    await handler({ query: { limit: '20' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: false,
        error: '访客接口维护中',
        errorCode: 'INTERACT_TEMP',
    });
});

test('friends cache clear route clears scoped cache and can trigger manual rebuild', async () => {
    const { app, routes } = createFakeApp();
    const clearCalls = [];
    const syncCalls = [];
    const deps = createDeps({
        app,
        getProvider: () => ({
            getFriends: async (_accountId, options) => {
                assert.deepEqual(options, {
                    manualRefresh: true,
                    cacheOptions: {
                        account: {
                            id: 'acc-1',
                            platform: 'qq',
                            uin: '10001',
                            qq: '10001',
                            openId: '',
                        },
                        platform: 'qq',
                        uin: '10001',
                        qq: '10001',
                        openId: '',
                    },
                });
                return [{ gid: 2001, name: '重建好友' }];
            },
        }),
        loadFriendsCacheApi: () => ({
            getCachedFriends: async () => [],
            mergeFriendsCache: async (accountId, data, options) => {
                syncCalls.push({ accountId, data, options });
            },
            clearFriendsCache: async (accountId, options) => {
                clearCalls.push({ accountId, options });
                return {
                    ok: true,
                    deletedCount: 2,
                    keys: [
                        'friends_scope:qq:qq:10001:friends_cache',
                        'account:acc-1:friends_cache',
                    ],
                    scopeKey: 'friends_scope:qq:qq:10001:friends_cache',
                    legacyKey: 'account:acc-1:friends_cache',
                };
            },
        }),
    });

    registerAccountStateRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'post', '/api/friends/cache/clear');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler({ body: { refresh: true } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(clearCalls, [{
        accountId: 'acc-1',
        options: {
            account: {
                id: 'acc-1',
                platform: 'qq',
                uin: '10001',
                qq: '10001',
                openId: '',
            },
            platform: 'qq',
            uin: '10001',
            qq: '10001',
            openId: '',
        },
    }]);
    assert.deepEqual(syncCalls, [{
        accountId: 'acc-1',
        data: [{ gid: 2001, name: '重建好友' }],
        options: {
            account: {
                id: 'acc-1',
                platform: 'qq',
                uin: '10001',
                qq: '10001',
                openId: '',
            },
            platform: 'qq',
            uin: '10001',
            qq: '10001',
            openId: '',
        },
    }]);
    assert.deepEqual(res.body, {
        ok: true,
        cleared: {
            ok: true,
            deletedCount: 2,
            keys: [
                'friends_scope:qq:qq:10001:friends_cache',
                'account:acc-1:friends_cache',
            ],
            scopeKey: 'friends_scope:qq:qq:10001:friends_cache',
            legacyKey: 'account:acc-1:friends_cache',
        },
        refreshed: {
            data: [{ gid: 2001, name: '重建好友' }],
            count: 1,
            meta: null,
        },
    });
});

test('friends cache clear route surfaces clear failure instead of reporting success', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        loadFriendsCacheApi: () => ({
            clearFriendsCache: async () => ({
                ok: false,
                reason: 'redis_unavailable',
            }),
        }),
    });

    registerAccountStateRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/friends/cache/clear');
    const res = createResponse();
    await handler({ body: { refresh: true } }, res);

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
        ok: false,
        error: 'redis_unavailable',
        cleared: {
            ok: false,
            reason: 'redis_unavailable',
        },
    });
});

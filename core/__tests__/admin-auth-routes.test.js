const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAuthRoutes, registerLegacyLogoutRoute } = require('../src/controllers/admin/auth-routes');

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

function getHandler(routes, path) {
    const handlers = routes.post.get(path);
    assert.ok(handlers, `missing route: POST ${path}`);
    assert.equal(handlers.length, 1);
    assert.equal(typeof handlers[0], 'function');
    return handlers[0];
}

function createAuthDeps(overrides = {}) {
    return {
        app: null,
        getClientIP: () => '1.2.3.4',
        security: {
            loginLock: {
                checkLock: () => ({ locked: false, remainingMs: 0 }),
                recordFailure: () => {},
                recordSuccess: () => {},
            },
        },
        userStore: {
            validateUser: async () => ({ username: 'admin', role: 'admin', card: { type: '永久' } }),
            getUserInfo: async () => ({ username: 'admin', role: 'admin', card: { type: '永久' } }),
        },
        jwtService: {
            signAccessToken: () => 'access-token',
            generateRefreshToken: () => 'refresh-token',
            storeRefreshToken: async () => {},
            setTokenCookies: () => {},
            buildSessionStatus: async ({ user }) => ({ username: user.username, role: user.role }),
            atomicConsumeRefreshToken: async () => ({ username: 'admin' }),
            revokeRefreshToken: async () => {},
            clearTokenCookies: () => {},
        },
        adminLogger: { error: () => {} },
        configRef: { adminPassword: 'admin' },
        ...overrides,
    };
}

test('login route records success, sets cookies and returns default password warning when using default admin password', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createAuthDeps({
        app,
        getClientIP: () => '8.8.8.8',
        security: {
            loginLock: {
                checkLock: (key) => {
                    calls.push(['checkLock', key]);
                    return { locked: false, remainingMs: 0 };
                },
                recordFailure: (key) => calls.push(['recordFailure', key]),
                recordSuccess: (key) => calls.push(['recordSuccess', key]),
            },
        },
        userStore: {
            validateUser: async (...args) => {
                calls.push(['validateUser', ...args]);
                return { username: 'admin', role: 'admin', card: { type: '永久' } };
            },
            getUserInfo: async () => ({ username: 'admin', role: 'admin', card: { type: '永久' } }),
        },
        jwtService: {
            signAccessToken: (user) => {
                calls.push(['signAccessToken', user.username, user.role]);
                return 'access-token';
            },
            generateRefreshToken: () => {
                calls.push(['generateRefreshToken']);
                return 'refresh-token';
            },
            storeRefreshToken: async (...args) => calls.push(['storeRefreshToken', ...args]),
            setTokenCookies: (...args) => calls.push(['setTokenCookies', args[2], args[3], args[4]]),
            buildSessionStatus: async ({ user }) => {
                calls.push(['buildSessionStatus', user.username, user.role]);
                return { username: user.username, role: user.role };
            },
            atomicConsumeRefreshToken: async () => ({ username: 'admin' }),
            revokeRefreshToken: async () => {},
            clearTokenCookies: () => {},
        },
    });

    registerAuthRoutes(deps);
    const handler = getHandler(routes, '/api/login');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = createResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['checkLock', 'user:admin'],
        ['validateUser', 'admin', 'admin'],
        ['recordSuccess', 'user:admin'],
        ['signAccessToken', 'admin', 'admin'],
        ['generateRefreshToken'],
        ['storeRefreshToken', 'admin', 'refresh-token', 'admin', req],
        ['setTokenCookies', 'access-token', 'refresh-token', 'admin'],
        ['buildSessionStatus', 'admin', 'admin'],
    ]);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            user: { username: 'admin', role: 'admin', card: { type: '永久' } },
            session: { username: 'admin', role: 'admin' },
            passwordWarning: '您正在使用默认密码，建议尽快修改以保障账户安全',
        },
    });
});

test('login route rejects locked accounts before validating credentials', async () => {
    const { app, routes } = createFakeApp();
    let validateCalled = false;
    const deps = createAuthDeps({
        app,
        security: {
            loginLock: {
                checkLock: () => ({ locked: true, remainingMs: 120000 }),
                recordFailure: () => {},
                recordSuccess: () => {},
            },
        },
        userStore: {
            validateUser: async () => {
                validateCalled = true;
                return null;
            },
            getUserInfo: async () => null,
        },
    });

    registerAuthRoutes(deps);
    const handler = getHandler(routes, '/api/login');
    const res = createResponse();
    await handler({ body: { username: 'admin', password: 'bad' } }, res);

    assert.equal(res.statusCode, 429);
    assert.equal(validateCalled, false);
    assert.deepEqual(res.body, { ok: false, error: '登录尝试过多，请 2 分钟后再试' });
});

test('auth refresh route rotates tokens and rejects missing refresh cookie', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createAuthDeps({
        app,
        userStore: {
            validateUser: async () => ({ username: 'admin', role: 'admin' }),
            getUserInfo: async (...args) => {
                calls.push(['getUserInfo', ...args]);
                return { username: 'alice', role: 'user', card: { code: 'VIP-1' } };
            },
        },
        jwtService: {
            signAccessToken: (user) => {
                calls.push(['signAccessToken', user.username, user.role]);
                return 'new-access';
            },
            generateRefreshToken: () => {
                calls.push(['generateRefreshToken']);
                return 'new-refresh';
            },
            storeRefreshToken: async (...args) => calls.push(['storeRefreshToken', ...args]),
            setTokenCookies: (...args) => calls.push(['setTokenCookies', args[2], args[3], args[4]]),
            buildSessionStatus: async ({ user }) => {
                calls.push(['buildSessionStatus', user.username, user.role]);
                return { username: user.username, role: user.role };
            },
            atomicConsumeRefreshToken: async (...args) => {
                calls.push(['atomicConsumeRefreshToken', ...args]);
                return { username: 'alice' };
            },
            revokeRefreshToken: async () => {},
            clearTokenCookies: () => {},
        },
    });

    registerAuthRoutes(deps);
    const handler = getHandler(routes, '/api/auth/refresh');

    const missingRes = createResponse();
    await handler({ cookies: {} }, missingRes);
    assert.equal(missingRes.statusCode, 401);
    assert.deepEqual(missingRes.body, { ok: false, error: '缺少刷新令牌' });

    const req = { cookies: { refresh_token: 'old-refresh' } };
    const res = createResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['atomicConsumeRefreshToken', 'old-refresh'],
        ['getUserInfo', 'alice'],
        ['signAccessToken', 'alice', 'user'],
        ['generateRefreshToken'],
        ['storeRefreshToken', 'alice', 'new-refresh', 'user', req],
        ['setTokenCookies', 'new-access', 'new-refresh', 'user'],
        ['buildSessionStatus', 'alice', 'user'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { session: { username: 'alice', role: 'user' } } });
});

test('auth logout route revokes refresh token when present and always clears cookies', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createAuthDeps({
        app,
        jwtService: {
            signAccessToken: () => 'access-token',
            generateRefreshToken: () => 'refresh-token',
            storeRefreshToken: async () => {},
            setTokenCookies: () => {},
            atomicConsumeRefreshToken: async () => null,
            revokeRefreshToken: async (...args) => calls.push(['revokeRefreshToken', ...args]),
            clearTokenCookies: (...args) => calls.push(['clearTokenCookies', args[0].cookies?.refresh_token || 'none']),
        },
    });

    registerAuthRoutes(deps);
    const handler = getHandler(routes, '/api/auth/logout');
    const res = createResponse();
    await handler({ cookies: { refresh_token: 'token-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['revokeRefreshToken', 'token-1'],
        ['clearTokenCookies', 'token-1'],
    ]);
    assert.deepEqual(res.body, { ok: true });
});

test('legacy logout route preserves old endpoint behavior and swallows revoke errors', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createAuthDeps({
        app,
        jwtService: {
            revokeRefreshToken: async () => {
                throw new Error('db down');
            },
            clearTokenCookies: (...args) => calls.push(['clearTokenCookies', args[0].cookies?.refresh_token]),
        },
        adminLogger: {
            error: (...args) => calls.push(['error', ...args]),
        },
    });

    registerLegacyLogoutRoute(deps);
    const handler = getHandler(routes, '/api/logout');
    const res = createResponse();
    await handler({ cookies: { refresh_token: 'legacy-token' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['error', 'Legacy logout error: db down'],
        ['clearTokenCookies', 'legacy-token'],
    ]);
    assert.deepEqual(res.body, { ok: true });
});

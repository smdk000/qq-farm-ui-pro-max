const test = require('node:test');
const assert = require('node:assert/strict');

const { registerUserCardRoutes, registerTrialCardRoutes } = require('../src/controllers/admin/user-card-routes');

function createFakeApp() {
    const routes = {
        get: new Map(),
        post: new Map(),
        put: new Map(),
        delete: new Map(),
    };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
            put(path, ...handlers) {
                routes.put.set(path, handlers);
            },
            delete(path, ...handlers) {
                routes.delete.set(path, handlers);
            },
        },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(name, value) {
            this.headers[String(name)] = value;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function getRouteParts(routes, method, path) {
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route: ${method.toUpperCase()} ${path}`);
    assert.ok(handlers.length >= 1);
    handlers.forEach(fn => assert.equal(typeof fn, 'function'));
    return {
        middlewares: handlers.slice(0, -1),
        handler: handlers[handlers.length - 1],
    };
}

function createUserCardDeps(overrides = {}) {
    const authRequired = (_req, _res, next) => next && next();
    const userRequired = (_req, _res, next) => next && next();
    return {
        app: null,
        authRequired,
        userRequired,
        userStore: {
            registerUser: async () => ({ ok: true, user: { username: 'alice', role: 'user' } }),
            renewUser: async () => ({ ok: true, card: { code: 'VIP-1', expiresAt: '2099-01-01' } }),
        },
        usersController: {
            getAllUsers: () => {},
            createUser: () => {},
            updateUser: () => {},
            renewUserCard: () => {},
            deleteUser: () => {},
            changePassword: () => {},
        },
        cardsController: {
            getAllCards: () => {},
            getCardDetail: () => {},
            createCard: () => {},
            updateCard: () => {},
            deleteCard: () => {},
            batchDeleteCards: () => {},
            batchUpdateCards: () => {},
        },
        validateUsername: () => ({ valid: true }),
        validatePassword: () => ({ valid: true }),
        validateCardCode: () => ({ valid: true }),
        jwtService: {
            signAccessToken: () => 'access-token',
            generateRefreshToken: () => 'refresh-token',
            storeRefreshToken: async () => {},
            setTokenCookies: () => {},
        },
        store: {
            getCardFeatureConfig: () => ({
                enabled: true,
                registerEnabled: true,
                renewEnabled: true,
                trialEnabled: true,
                adminIssueEnabled: true,
            }),
        },
        ...overrides,
    };
}

function createTrialDeps(overrides = {}) {
    const authRequired = (_req, _res, next) => next && next();
    const userRequired = (_req, _res, next) => next && next();
    const trialRateLimiter = (_req, _res, next) => next && next();
    return {
        app: null,
        authRequired,
        userRequired,
        trialRateLimiter,
        getClientIP: () => '1.2.3.4',
        userStore: {
            createTrialCard: async () => ({ ok: true, code: 'TRY-1', days: 3 }),
            renewTrialUser: async () => ({ ok: true, card: { code: 'TRY-1', expiresAt: '2099-01-01' } }),
        },
        store: {
            getTrialCardConfig: () => ({ userRenewEnabled: true, days: 3, adminOnly: true }),
            setTrialCardConfig: (body) => body,
            getCardFeatureConfig: () => ({
                enabled: true,
                registerEnabled: true,
                renewEnabled: true,
                trialEnabled: true,
                adminIssueEnabled: true,
            }),
            setCardFeatureConfig: (body) => body,
            flushGlobalConfigSave: async () => {},
        },
        ...overrides,
    };
}

test('auth register route stores refresh token, sets cookies and returns created user', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createUserCardDeps({
        app,
        userStore: {
            registerUser: async (...args) => {
                calls.push(['registerUser', ...args]);
                return { ok: true, user: { username: 'alice', role: 'user' } };
            },
            renewUser: async () => ({ ok: true, card: { code: 'VIP-1' } }),
        },
        jwtService: {
            signAccessToken: (user) => {
                calls.push(['signAccessToken', user.username]);
                return 'access-token';
            },
            generateRefreshToken: () => {
                calls.push(['generateRefreshToken']);
                return 'refresh-token';
            },
            storeRefreshToken: async (...args) => calls.push(['storeRefreshToken', ...args]),
            setTokenCookies: (...args) => calls.push(['setTokenCookies', args[2], args[3], args[4]]),
        },
    });

    registerUserCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'post', '/api/auth/register');
    assert.deepEqual(middlewares, []);

    const req = { body: { username: 'alice', password: 'abc123', cardCode: 'CARD-1' } };
    const res = createResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['registerUser', 'alice', 'abc123', 'CARD-1'],
        ['signAccessToken', 'alice'],
        ['generateRefreshToken'],
        ['storeRefreshToken', 'alice', 'refresh-token', 'user', req],
        ['setTokenCookies', 'access-token', 'refresh-token', 'user'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { user: { username: 'alice', role: 'user' } } });
});

test('user list route keeps auth middlewares and rejects non-admin users', async () => {
    const { app, routes } = createFakeApp();
    let controllerCalled = false;
    const deps = createUserCardDeps({
        app,
        usersController: {
            getAllUsers: () => { controllerCalled = true; },
            createUser: () => {},
            updateUser: () => {},
            renewUserCard: () => {},
            deleteUser: () => {},
            changePassword: () => {},
        },
    });

    registerUserCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'get', '/api/users');
    assert.deepEqual(middlewares, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({ currentUser: { role: 'user' } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { ok: false, error: 'Forbidden' });
    assert.equal(controllerCalled, false);
});

test('card batch update route keeps admin middlewares and delegates controller for admins', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createUserCardDeps({
        app,
        cardsController: {
            getAllCards: () => {},
            getCardDetail: () => {},
            createCard: () => {},
            updateCard: () => {},
            deleteCard: () => {},
            batchDeleteCards: () => {},
            batchUpdateCards: (...args) => calls.push(args),
        },
    });

    registerUserCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'post', '/api/cards/batch-update');
    assert.deepEqual(middlewares, [deps.authRequired, deps.userRequired]);

    const req = { currentUser: { role: 'admin' }, body: { codes: ['A'], updates: { enabled: false } } };
    const res = createResponse();
    await handler(req, res);

    assert.deepEqual(calls, [[req, res]]);
});

test('auth renew route validates card code and writes renewed card back to current user', async () => {
    const { app, routes } = createFakeApp();
    let renewCalled = false;
    const deps = createUserCardDeps({
        app,
        validateCardCode: (code) => {
            assert.equal(code, 'CARD-9');
            return { valid: true };
        },
        userStore: {
            registerUser: async () => ({ ok: true, user: { username: 'alice', role: 'user' } }),
            renewUser: async (...args) => {
                renewCalled = true;
                assert.deepEqual(args, ['alice', 'CARD-9']);
                return { ok: true, card: { code: 'CARD-9', expiresAt: '2099-09-09' } };
            },
        },
    });

    registerUserCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'post', '/api/auth/renew');
    assert.deepEqual(middlewares, [deps.authRequired]);

    const req = { body: { cardCode: 'CARD-9' }, currentUser: { username: 'alice' } };
    const res = createResponse();
    await handler(req, res);

    assert.equal(renewCalled, true);
    assert.deepEqual(req.currentUser.card, { code: 'CARD-9', expiresAt: '2099-09-09' });
    assert.deepEqual(res.body, { ok: true, data: { card: { code: 'CARD-9', expiresAt: '2099-09-09' } } });
});

test('card feature control allows open registration without card while still blocking renew and admin card issue when disabled', async () => {
    const { app, routes } = createFakeApp();
    let registerCalls = 0;
    const deps = createUserCardDeps({
        app,
        store: {
            getCardFeatureConfig: () => ({
                enabled: false,
                registerEnabled: false,
                renewEnabled: false,
                trialEnabled: false,
                adminIssueEnabled: false,
            }),
        },
        userStore: {
            registerUser: async (...args) => {
                registerCalls += 1;
                assert.deepEqual(args, ['alice', 'abc123', undefined]);
                return { ok: true, user: { username: 'alice', role: 'user', card: null } };
            },
            renewUser: async () => {
                throw new Error('should not reach renewUser');
            },
        },
        cardsController: {
            getAllCards: () => {},
            getCardDetail: () => {},
            createCard: () => {
                throw new Error('should not reach createCard');
            },
            updateCard: () => {},
            deleteCard: () => {},
            batchDeleteCards: () => {},
            batchUpdateCards: () => {},
        },
    });

    registerUserCardRoutes(deps);

    const registerRes = createResponse();
    await getRouteParts(routes, 'post', '/api/auth/register').handler({ body: { username: 'alice', password: 'abc123' } }, registerRes);
    assert.equal(registerCalls, 1);
    assert.equal(registerRes.statusCode, 200);
    assert.deepEqual(registerRes.body, { ok: true, data: { user: { username: 'alice', role: 'user', card: null } } });

    const renewRes = createResponse();
    await getRouteParts(routes, 'post', '/api/auth/renew').handler({ currentUser: { username: 'alice' }, body: { cardCode: 'CARD-2' } }, renewRes);
    assert.equal(renewRes.statusCode, 400);
    assert.deepEqual(renewRes.body, { ok: false, error: '当前系统已暂停卡密续费' });

    const createRes = createResponse();
    await getRouteParts(routes, 'post', '/api/cards').handler({ currentUser: { role: 'admin' }, body: {} }, createRes);
    assert.equal(createRes.statusCode, 400);
    assert.deepEqual(createRes.body, { ok: false, error: '当前系统已关闭卡密发码功能' });
});

test('register route keeps card code required when card registration is enabled', async () => {
    const { app, routes } = createFakeApp();
    const deps = createUserCardDeps({ app });

    registerUserCardRoutes(deps);

    const res = createResponse();
    await getRouteParts(routes, 'post', '/api/auth/register').handler({ body: { username: 'alice', password: 'abc123' } }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
        ok: false,
        error: '缺少必要参数',
        details: {
            username: '已提供',
            password: '已提供',
            cardCode: '必填',
        },
    });
});

test('change password route keeps authRequired and delegates controller directly', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createUserCardDeps({
        app,
        usersController: {
            getAllUsers: () => {},
            createUser: () => {},
            updateUser: () => {},
            renewUserCard: () => {},
            deleteUser: () => {},
            changePassword: (...args) => calls.push(args),
        },
    });

    registerUserCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'post', '/api/auth/change-password');
    assert.deepEqual(middlewares, [deps.authRequired]);

    const req = { currentUser: { username: 'alice' }, body: { oldPassword: '1', newPassword: '2' } };
    const res = createResponse();
    await handler(req, res);

    assert.deepEqual(calls, [[req, res]]);
});

test('trial card creation route keeps limiter middleware and uses resolved client ip', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createTrialDeps({
        app,
        userStore: {
            createTrialCard: async (...args) => {
                calls.push(args);
                return { ok: true, code: 'TRY-9', days: 5 };
            },
            renewTrialUser: async () => ({ ok: true, card: { code: 'TRY-9' } }),
        },
        getClientIP: (req) => {
            assert.equal(req.headers['x-forwarded-for'], '8.8.8.8');
            return '8.8.8.8';
        },
    });

    registerTrialCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'post', '/api/trial-card');
    assert.deepEqual(middlewares, [deps.trialRateLimiter]);

    const res = createResponse();
    await handler({ headers: { 'x-forwarded-for': '8.8.8.8' } }, res);

    assert.deepEqual(calls, [['8.8.8.8']]);
    assert.deepEqual(res.body, { ok: true, data: { code: 'TRY-9', days: 5 } });
});

test('trial card config read hides admin-only fields from normal users and shows full config to admin', async () => {
    const { app, routes } = createFakeApp();
    const config = { userRenewEnabled: true, days: 7, adminOnly: true, secretNote: 'x' };
    const deps = createTrialDeps({
        app,
        store: {
            getTrialCardConfig: () => config,
            setTrialCardConfig: () => config,
            flushGlobalConfigSave: async () => {},
        },
    });

    registerTrialCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'get', '/api/trial-card-config');
    assert.deepEqual(middlewares, [deps.authRequired]);

    const userRes = createResponse();
    await handler({ currentUser: { role: 'user' } }, userRes);
    assert.deepEqual(userRes.body, { ok: true, data: { userRenewEnabled: true, days: 7 } });

    const adminRes = createResponse();
    await handler({ currentUser: { role: 'admin' } }, adminRes);
    assert.deepEqual(adminRes.body, { ok: true, data: config });
});

test('public card feature config read exposes register and trial availability without auth', async () => {
    const { app, routes } = createFakeApp();
    const deps = createTrialDeps({
        app,
        store: {
            getTrialCardConfig: () => ({ userRenewEnabled: true, days: 7 }),
            setTrialCardConfig: () => ({}),
            getCardFeatureConfig: () => ({ enabled: false, registerEnabled: false, trialEnabled: false, renewEnabled: false, adminIssueEnabled: false }),
            setCardFeatureConfig: () => ({}),
            flushGlobalConfigSave: async () => {},
        },
    });

    registerTrialCardRoutes(deps);
    const { middlewares, handler } = getRouteParts(routes, 'get', '/api/public-card-feature-config');
    assert.deepEqual(middlewares, []);

    const res = createResponse();
    await handler({}, res);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body, {
        ok: true,
        data: { enabled: false, registerEnabled: false, trialEnabled: false },
    });
});

test('trial card config save flushes global config and trial renew routes preserve admin vs user flow', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createTrialDeps({
        app,
        userStore: {
            createTrialCard: async () => ({ ok: true, code: 'TRY-1', days: 3 }),
            renewTrialUser: async (...args) => {
                calls.push(['renewTrialUser', ...args]);
                return { ok: true, card: { code: 'TRY-2', expiresAt: '2099-02-02' } };
            },
        },
        store: {
            getTrialCardConfig: () => ({ userRenewEnabled: true, days: 3 }),
            setTrialCardConfig: (body) => {
                calls.push(['setTrialCardConfig', body]);
                return { saved: true, ...body };
            },
            flushGlobalConfigSave: async () => {
                calls.push(['flushGlobalConfigSave']);
            },
        },
    });

    registerTrialCardRoutes(deps);

    const saveRoute = getRouteParts(routes, 'post', '/api/trial-card-config');
    assert.deepEqual(saveRoute.middlewares, [deps.authRequired, deps.userRequired]);
    const saveRes = createResponse();
    await saveRoute.handler({ currentUser: { role: 'admin' }, body: { days: 14, userRenewEnabled: false } }, saveRes);
    assert.equal(saveRes.statusCode, 200);
    assert.deepEqual(saveRes.body, { ok: true, data: { saved: true, days: 14, userRenewEnabled: false } });

    const adminRenewRoute = getRouteParts(routes, 'post', '/api/users/:username/trial-renew');
    assert.deepEqual(adminRenewRoute.middlewares, [deps.authRequired, deps.userRequired]);
    const adminRenewRes = createResponse();
    await adminRenewRoute.handler({ currentUser: { role: 'admin' }, params: { username: 'bob' } }, adminRenewRes);
    assert.deepEqual(adminRenewRes.body, { ok: true, data: { card: { code: 'TRY-2', expiresAt: '2099-02-02' } } });

    const selfRenewRoute = getRouteParts(routes, 'post', '/api/auth/trial-renew');
    assert.deepEqual(selfRenewRoute.middlewares, [deps.authRequired]);
    const req = { currentUser: { username: 'alice', role: 'user' } };
    const selfRenewRes = createResponse();
    await selfRenewRoute.handler(req, selfRenewRes);
    assert.deepEqual(req.currentUser.card, { code: 'TRY-2', expiresAt: '2099-02-02' });
    assert.deepEqual(selfRenewRes.body, { ok: true, data: { card: { code: 'TRY-2', expiresAt: '2099-02-02' } } });

    assert.deepEqual(calls, [
        ['setTrialCardConfig', { days: 14, userRenewEnabled: false }],
        ['flushGlobalConfigSave'],
        ['renewTrialUser', 'bob', 'admin'],
        ['renewTrialUser', 'alice', 'user'],
    ]);
});

test('card feature config save flushes global config for admins and trial issue is blocked when disabled', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createTrialDeps({
        app,
        userStore: {
            createTrialCard: async () => {
                throw new Error('should not reach createTrialCard');
            },
            renewTrialUser: async () => ({ ok: true, card: { code: 'TRY-1' } }),
        },
        store: {
            getTrialCardConfig: () => ({ userRenewEnabled: true, days: 3 }),
            setTrialCardConfig: (body) => body,
            getCardFeatureConfig: () => ({ enabled: false, registerEnabled: false, renewEnabled: false, trialEnabled: false, adminIssueEnabled: false }),
            setCardFeatureConfig: (body, meta) => {
                calls.push(['setCardFeatureConfig', body, meta]);
                return { enabled: false, registerEnabled: false, renewEnabled: false, trialEnabled: false, adminIssueEnabled: false, updatedBy: meta.updatedBy };
            },
            flushGlobalConfigSave: async () => {
                calls.push(['flushGlobalConfigSave']);
            },
        },
    });

    registerTrialCardRoutes(deps);

    const createRes = createResponse();
    await getRouteParts(routes, 'post', '/api/trial-card').handler({}, createRes);
    assert.equal(createRes.statusCode, 400);
    assert.deepEqual(createRes.body, { ok: false, error: '当前系统已暂停体验卡发放' });

    const saveRoute = getRouteParts(routes, 'post', '/api/card-feature-config');
    assert.deepEqual(saveRoute.middlewares, [deps.authRequired, deps.userRequired]);
    const saveRes = createResponse();
    await saveRoute.handler({ currentUser: { role: 'admin', username: 'admin' }, body: { enabled: false } }, saveRes);
    assert.equal(saveRes.statusCode, 200);
    assert.deepEqual(saveRes.body, {
        ok: true,
        data: { enabled: false, registerEnabled: false, renewEnabled: false, trialEnabled: false, adminIssueEnabled: false, updatedBy: 'admin' },
    });

    assert.deepEqual(calls, [
        ['setCardFeatureConfig', { enabled: false }, { updatedBy: 'admin' }],
        ['flushGlobalConfigSave'],
    ]);
});

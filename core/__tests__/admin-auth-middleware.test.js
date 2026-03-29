const test = require('node:test');
const assert = require('node:assert/strict');

const { PUBLIC_API_PATHS, createAdminAuthMiddlewares } = require('../src/controllers/admin/auth-middleware');

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

function createDeps(overrides = {}) {
    return {
        jwtService: {
            verifyAccessToken: () => ({ username: 'alice' }),
        },
        userStore: {
            getUserInfo: async () => ({ username: 'alice', role: 'user' }),
        },
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-1', username: 'alice' }, { id: 'acc-2', username: 'bob' }],
        }),
        ...overrides,
    };
}

test('public api whitelist keeps expected unauthenticated endpoints', () => {
    assert.deepEqual(PUBLIC_API_PATHS, [
        '/login',
        '/auth/register',
        '/auth/bootstrap-status',
        '/auth/init-password',
        '/auth/refresh',
        '/auth/logout',
        '/qr/create',
        '/qr/check',
        '/notifications',
        '/announcement',
        '/trial-card',
        '/public-card-feature-config',
        '/ui-config',
        '/ping',
        '/health/basic',
        '/system/service-profile',
    ]);
});

test('resolveRequestUser reads access token from cookie, hydrates req.currentUser and returns user info', async () => {
    const deps = createDeps();
    const { resolveRequestUser } = createAdminAuthMiddlewares(deps);
    const req = { cookies: { access_token: 'cookie-token' }, headers: {} };

    const result = await resolveRequestUser(req);

    assert.deepEqual(result, { username: 'alice', role: 'user' });
    assert.deepEqual(req.currentUser, { username: 'alice', role: 'user' });
});

test('authRequired falls back to x-admin-token header and returns 401 on invalid token', async () => {
    const invalidDeps = createDeps({
        jwtService: {
            verifyAccessToken: () => null,
        },
    });
    const invalidMw = createAdminAuthMiddlewares(invalidDeps).authRequired;
    const invalidRes = createResponse();
    let nextCalled = false;
    await invalidMw({ cookies: {}, headers: { 'x-admin-token': 'bad' } }, invalidRes, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(invalidRes.statusCode, 401);
    assert.deepEqual(invalidRes.body, { ok: false, error: 'Unauthorized' });

    const okDeps = createDeps({
        jwtService: {
            verifyAccessToken: (token) => {
                assert.equal(token, 'header-token');
                return { username: 'alice' };
            },
        },
    });
    const okMw = createAdminAuthMiddlewares(okDeps).authRequired;
    const okRes = createResponse();
    let okNext = false;
    await okMw({ cookies: {}, headers: { 'x-admin-token': 'header-token' } }, okRes, () => {
        okNext = true;
    });
    assert.equal(okNext, true);
    assert.equal(okRes.body, null);
});

test('userRequired preserves admin bypass and enforces banned and expired whitelists', () => {
    const { userRequired } = createAdminAuthMiddlewares(createDeps());

    let nextCount = 0;
    userRequired({ currentUser: { username: 'admin', role: 'admin' }, path: '/api/accounts' }, createResponse(), () => {
        nextCount += 1;
    });
    assert.equal(nextCount, 1);

    const bannedRes = createResponse();
    userRequired({ currentUser: { username: 'alice', role: 'user', status: 'banned' }, path: '/api/accounts' }, bannedRes, () => {
        nextCount += 1;
    });
    assert.equal(bannedRes.statusCode, 403);
    assert.deepEqual(bannedRes.body, { ok: false, error: '账号已被封禁' });

    const bannedWhitelistRes = createResponse();
    userRequired({ currentUser: { username: 'alice', role: 'user', status: 'banned' }, path: '/api/ping' }, bannedWhitelistRes, () => {
        nextCount += 1;
    });
    assert.equal(bannedWhitelistRes.body, null);

    const expiredRes = createResponse();
    userRequired({ currentUser: { username: 'alice', role: 'user', isExpired: true }, path: '/api/accounts' }, expiredRes, () => {
        nextCount += 1;
    });
    assert.equal(expiredRes.statusCode, 403);
    assert.deepEqual(expiredRes.body, { ok: false, error: '账号已过期，请续费后操作' });

    const expiredWhitelistRes = createResponse();
    userRequired({ currentUser: { username: 'alice', role: 'user', isExpired: true }, path: '/api/trial-card-config' }, expiredWhitelistRes, () => {
        nextCount += 1;
    });
    assert.equal(expiredWhitelistRes.body, null);
});

test('accountOwnershipRequired validates account id presence, ownership and admin bypass', async () => {
    const { accountOwnershipRequired } = createAdminAuthMiddlewares(createDeps());

    const missingRes = createResponse();
    await accountOwnershipRequired({ headers: {}, params: {}, currentUser: { username: 'alice', role: 'user' } }, missingRes, () => {});
    assert.equal(missingRes.statusCode, 400);
    assert.deepEqual(missingRes.body, { ok: false, error: 'Missing account ID' });

    const forbiddenRes = createResponse();
    let nextCalled = false;
    await accountOwnershipRequired(
        { headers: { 'x-account-id': 'acc-2' }, params: {}, currentUser: { username: 'alice', role: 'user' } },
        forbiddenRes,
        () => {
            nextCalled = true;
        },
    );
    assert.equal(nextCalled, false);
    assert.equal(forbiddenRes.statusCode, 403);
    assert.deepEqual(forbiddenRes.body, { ok: false, error: '无权操作此账号' });

    const adminRes = createResponse();
    let adminNext = false;
    await accountOwnershipRequired(
        { headers: { 'x-account-id': 'acc-2' }, params: {}, currentUser: { username: 'admin', role: 'admin' } },
        adminRes,
        () => {
            adminNext = true;
        },
    );
    assert.equal(adminNext, true);
    assert.equal(adminRes.body, null);
});

test('accountOwnershipRequired prefers route params over x-account-id for per-account routes', async () => {
    const { accountOwnershipRequired } = createAdminAuthMiddlewares(createDeps({
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-2', username: 'alice' }],
        }),
    }));

    const okRes = createResponse();
    let okNext = false;
    await accountOwnershipRequired(
        {
            headers: { 'x-account-id': 'deleted-current-account' },
            params: { id: 'acc-2' },
            currentUser: { username: 'alice', role: 'user' },
        },
        okRes,
        () => {
            okNext = true;
        },
    );
    assert.equal(okNext, true);
    assert.equal(okRes.body, null);

    const forbiddenRes = createResponse();
    let forbiddenNext = false;
    await accountOwnershipRequired(
        {
            headers: { 'x-account-id': 'acc-2' },
            params: { id: 'acc-3' },
            currentUser: { username: 'alice', role: 'user' },
        },
        forbiddenRes,
        () => {
            forbiddenNext = true;
        },
    );
    assert.equal(forbiddenNext, false);
    assert.equal(forbiddenRes.statusCode, 404);
    assert.deepEqual(forbiddenRes.body, { ok: false, error: '账号不存在' });
});

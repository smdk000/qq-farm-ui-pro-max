const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAccountManagementRoutes } = require('../src/controllers/admin/account-management-routes');

function createFakeApp() {
    const routes = { post: new Map(), delete: new Map() };
    return {
        routes,
        app: {
            post(path, ...handlers) {
                routes.post.set(path, handlers);
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
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route: ${method.toUpperCase()} ${path}`);
    const middleware = handlers.length > 1 ? handlers[0] : null;
    const handler = handlers[handlers.length - 1];
    if (middleware) {
        assert.equal(typeof middleware, 'function');
    }
    assert.equal(typeof handler, 'function');
    return { middleware, handler };
}

function createDeps(overrides = {}) {
    const accountOwnershipRequired = (_req, _res, next) => next && next();
    return {
        app: null,
        accountOwnershipRequired,
        getAccountsSnapshot: async () => ({ accounts: [] }),
        getAccountList: async () => [],
        resolveAccId: async (value) => String(value || ''),
        findAccountByRef: (accounts, ref) => accounts.find(item => String(item.id) === String(ref)) || null,
        addOrUpdateAccount: async (payload) => ({ accounts: [payload] }),
        deleteAccount: (id) => ({ deleted: id }),
        getProvider: () => ({
            setRuntimeAccountName: async () => {},
            addAccountLog: () => {},
            isAccountRunning: async () => false,
            startAccount: async () => {},
            restartAccount: async () => {},
            stopAccount: async () => {},
            getAccounts: async () => ({ accounts: [] }),
        }),
        store: {
            persistAccountsNow: async () => {},
            getAccountsFresh: async () => ({ accounts: [] }),
        },
        consoleRef: { log: () => {} },
        ...overrides,
    };
}

test('remark route keeps ownership middleware and updates runtime name/log', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountList: async () => [{ id: 'acc-1', name: '旧名' }],
        addOrUpdateAccount: async (payload) => {
            calls.push(['save', payload]);
            return { accounts: [payload] };
        },
        getProvider: () => ({
            setRuntimeAccountName: async (...args) => calls.push(['runtime', ...args]),
            addAccountLog: (...args) => calls.push(['log', ...args]),
        }),
    });

    registerAccountManagementRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'post', '/api/account/remark');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler({ body: { id: 'acc-1', remark: '新备注' }, headers: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['save', { id: 'acc-1', name: '新备注' }],
        ['runtime', 'acc-1', '新备注'],
        ['log', 'update', '更新账号备注: 新备注', 'acc-1', '新备注'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { accounts: [{ id: 'acc-1', name: '新备注' }] } });
});

test('accounts route turns duplicate create into update and preserves existing name', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-9', uin: '10001', qq: '10001', platform: 'qq', name: '原名字', username: 'alice' }],
        }),
        resolveAccId: async () => 'acc-9',
        addOrUpdateAccount: async (payload) => {
            calls.push(['save', payload]);
            return { accounts: [{ id: 'acc-9', name: payload.name }] };
        },
        getProvider: () => ({
            isAccountRunning: async () => true,
            addAccountLog: (...args) => calls.push(['log', ...args]),
            restartAccount: async (...args) => calls.push(['restart', ...args]),
        }),
        store: {
            persistAccountsNow: async (...args) => calls.push(['persist', ...args]),
        },
        consoleRef: {
            log: (...args) => calls.push(['console', ...args]),
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '10001', platform: 'qq', name: '扫码账号' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 3 },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['console', '[API /api/accounts] 拦截重复创建: 标识 10001 已存在，转为更新 (ID: acc-9)'],
        ['save', { uin: '10001', platform: 'qq', name: '原名字', id: 'acc-9', username: 'alice', qq: '10001' }],
        ['persist', 'acc-9', { strict: true }],
        ['log', 'update', '更新账号: 原名字', 'acc-9', '原名字'],
        ['restart', 'acc-9'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { accounts: [{ id: 'acc-9', name: '原名字' }] } });
});

test('accounts route starts an existing offline account when duplicate create carries fresh login credentials', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-9', uin: '10001', qq: '10001', platform: 'qq', name: '原名字', username: 'alice' }],
        }),
        resolveAccId: async () => 'acc-9',
        addOrUpdateAccount: async (payload) => {
            calls.push(['save', payload]);
            return { touchedAccountId: 'acc-9', accounts: [{ id: 'acc-9', name: '原名字' }] };
        },
        getProvider: () => ({
            isAccountRunning: async () => false,
            addAccountLog: (...args) => calls.push(['log', ...args]),
            startAccount: async (...args) => calls.push(['start', ...args]),
        }),
        store: {
            persistAccountsNow: async (...args) => calls.push(['persist', ...args]),
        },
        consoleRef: {
            log: (...args) => calls.push(['console', ...args]),
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '10001', platform: 'qq', name: '扫码账号', code: 'fresh-code', loginType: 'qr' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 3 },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 5);
    assert.deepEqual(calls[0], ['console', '[API /api/accounts] 拦截重复创建: 标识 10001 已存在，转为更新 (ID: acc-9)']);
    assert.equal(calls[1][0], 'save');
    assert.deepEqual({
        uin: calls[1][1].uin,
        platform: calls[1][1].platform,
        name: calls[1][1].name,
        code: calls[1][1].code,
        loginType: calls[1][1].loginType,
        id: calls[1][1].id,
        username: calls[1][1].username,
        qq: calls[1][1].qq,
        wsError: calls[1][1].wsError,
        lastCodeSource: calls[1][1].lastCodeSource,
        lastCodeCaptureBy: calls[1][1].lastCodeCaptureBy,
    }, {
        uin: '10001',
        platform: 'qq',
        name: '原名字',
        code: 'fresh-code',
        loginType: 'qr',
        id: 'acc-9',
        username: 'alice',
        qq: '10001',
        wsError: null,
        lastCodeSource: 'qr_login',
        lastCodeCaptureBy: 'alice',
    });
    assert.equal(typeof calls[1][1].lastValidCodeAt, 'number');
    assert.equal(typeof calls[1][1].lastCodeCaptureAt, 'number');
    assert.deepEqual(calls.slice(2), [
        ['persist', 'acc-9', { strict: true }],
        ['log', 'update', '更新账号: 原名字', 'acc-9', '原名字'],
        ['start', 'acc-9'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { touchedAccountId: 'acc-9', accounts: [{ id: 'acc-9', name: '原名字' }] } });
});

test('accounts route forces fresh snapshot and allocates a new id for create requests', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const snapshotCalls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async (options = {}) => {
            snapshotCalls.push(options);
            return {
                nextId: 1009,
                accounts: [{ id: '1008', username: 'alice', uin: '20002', platform: 'qq' }],
            };
        },
        addOrUpdateAccount: async (payload) => {
            calls.push(['save', payload]);
            return {
                accounts: [
                    { id: '1008', name: '旧账号' },
                    { id: '1009', name: payload.name, username: payload.username },
                ],
            };
        },
        getProvider: () => ({
            startAccount: async (...args) => calls.push(['start', ...args]),
            addAccountLog: (...args) => calls.push(['log', ...args]),
        }),
        store: {
            persistAccountsNow: async (...args) => calls.push(['persist', ...args]),
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '30003', platform: 'qq', name: '新号' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 3 },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(snapshotCalls, [{ force: true }]);
    assert.deepEqual(calls, [
        ['save', {
            uin: '30003',
            platform: 'qq',
            name: '新号',
            username: 'alice',
            qq: '30003',
            id: '1009',
            __createIfMissing: true,
        }],
        ['persist', '1009', { strict: true }],
        ['log', 'add', '添加账号: 新号', '1009', '新号'],
        ['start', '1009'],
    ]);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            accounts: [
                { id: '1008', name: '旧账号' },
                { id: '1009', name: '新号', username: 'alice' },
            ],
        },
    });
});

test('accounts route uses the touched account id when create collisions are resolved in store', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            nextId: 1008,
            accounts: [{ id: '1007', username: 'alice', uin: '20002', platform: 'qq' }],
        }),
        addOrUpdateAccount: async (payload) => {
            calls.push(['save', payload]);
            return {
                touchedAccountId: '1009',
                accounts: [
                    { id: '1008', name: '旧账号1008' },
                    { id: '1009', name: payload.name, username: payload.username },
                ],
            };
        },
        getProvider: () => ({
            startAccount: async (...args) => calls.push(['start', ...args]),
            addAccountLog: (...args) => calls.push(['log', ...args]),
        }),
        store: {
            persistAccountsNow: async (...args) => calls.push(['persist', ...args]),
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '30003', platform: 'qq', name: '碰撞后新号' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 3 },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['save', {
            uin: '30003',
            platform: 'qq',
            name: '碰撞后新号',
            username: 'alice',
            qq: '30003',
            id: '1008',
            __createIfMissing: true,
        }],
        ['persist', '1009', { strict: true }],
        ['log', 'add', '添加账号: 碰撞后新号', '1009', '碰撞后新号'],
        ['start', '1009'],
    ]);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            touchedAccountId: '1009',
            accounts: [
                { id: '1008', name: '旧账号1008' },
                { id: '1009', name: '碰撞后新号', username: 'alice' },
            ],
        },
    });
});

test('accounts route locks username and fills qq identifiers during non-admin update', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-2', username: 'alice', uin: '20002', qq: '20002' }],
        }),
        resolveAccId: async () => 'acc-2',
        addOrUpdateAccount: async (payload) => {
            calls.push(payload);
            return { accounts: [{ id: 'acc-2' }] };
        },
        store: {
            persistAccountsNow: async () => {},
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { id: 'acc-2', platform: 'qq', username: 'hacker', name: '更新名' },
        currentUser: { username: 'alice', role: 'user' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [{
        id: 'acc-2',
        platform: 'qq',
        username: 'alice',
        name: '更新名',
        uin: '20002',
        qq: '20002',
    }]);
});

test('accounts route clears stale authTicket for manual updates and drops qq residue on wechat slots', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            accounts: [{ id: 'acc-3', username: 'alice', platform: 'wx_car', uin: 'wxid_old', qq: 'legacy-qq' }],
        }),
        resolveAccId: async () => 'acc-3',
        addOrUpdateAccount: async (payload) => {
            calls.push(payload);
            return { accounts: [{ id: 'acc-3' }] };
        },
        store: {
            persistAccountsNow: async () => {},
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: {
            id: 'acc-3',
            platform: 'wx_car',
            username: 'hacker',
            name: '更新名',
            code: 'fresh-code',
            uin: 'wxid_new',
            loginType: 'manual',
        },
        currentUser: { username: 'alice', role: 'user' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual({
        id: calls[0].id,
        platform: calls[0].platform,
        username: calls[0].username,
        name: calls[0].name,
        code: calls[0].code,
        uin: calls[0].uin,
        loginType: calls[0].loginType,
        qq: calls[0].qq,
        authTicket: calls[0].authTicket,
        wsError: calls[0].wsError,
        lastCodeSource: calls[0].lastCodeSource,
        lastCodeCaptureBy: calls[0].lastCodeCaptureBy,
    }, {
        id: 'acc-3',
        platform: 'wx_car',
        username: 'alice',
        name: '更新名',
        code: 'fresh-code',
        uin: 'wxid_new',
        loginType: 'manual',
        qq: '',
        authTicket: '',
        wsError: null,
        lastCodeSource: 'manual_capture',
        lastCodeCaptureBy: 'alice',
    });
    assert.equal(typeof calls[0].lastValidCodeAt, 'number');
    assert.equal(typeof calls[0].lastCodeCaptureAt, 'number');
});

test('accounts route rejects new account when user exceeds maxAccounts', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getAccountsSnapshot: async () => ({
            accounts: [{ id: '1', username: 'alice' }, { id: '2', username: 'alice' }],
        }),
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '30003', platform: 'qq', name: '新号' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 2 },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: '体验卡用户最多绑定 2 个账号' });
});

test('accounts delete route stops runtime, deletes account and writes delete log', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountList: async () => [{ id: 'acc-5', name: '要删除的号' }],
        resolveAccId: async () => 'acc-5',
        getProvider: () => ({
            stopAccount: async (...args) => calls.push(['stop', ...args]),
            addAccountLog: (...args) => calls.push(['log', ...args]),
        }),
        deleteAccount: (id) => {
            calls.push(['delete', id]);
            return { deleted: id };
        },
    });

    registerAccountManagementRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'delete', '/api/accounts/:id');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler({ params: { id: 'acc-5' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['stop', 'acc-5'],
        ['delete', 'acc-5'],
        ['log', 'delete', '删除账号: 要删除的号', 'acc-5', '要删除的号'],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { deleted: 'acc-5' } });
});

test('accounts delete route returns 404 when the target account does not exist', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getAccountList: async () => [],
        getProvider: () => ({
            stopAccount: async (...args) => calls.push(['stop', ...args]),
            addAccountLog: (...args) => calls.push(['log', ...args]),
        }),
        deleteAccount: (id) => {
            calls.push(['delete', id]);
            return { deleted: id };
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'delete', '/api/accounts/:id');
    const res = createResponse();

    await handler({ params: { id: 'missing' } }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { ok: false, error: 'Account not found' });
    assert.deepEqual(calls, []);
});

test('accounts route refreshes fresh snapshot when persist fails', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const persistError = new Error('persist failed');
    const deps = createDeps({
        app,
        addOrUpdateAccount: async (payload) => ({ accounts: [{ id: 'acc-new', name: payload.name }] }),
        getProvider: () => ({
            startAccount: async () => {},
        }),
        store: {
            persistAccountsNow: async () => { throw persistError; },
            getAccountsFresh: async (...args) => {
                calls.push(args);
                return { accounts: [] };
            },
        },
    });

    registerAccountManagementRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/accounts');
    const res = createResponse();
    await handler({
        body: { uin: '40004', platform: 'qq', name: '新号' },
        currentUser: { username: 'alice', role: 'user', maxAccounts: 3 },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(calls, [[{ force: true }]]);
    assert.deepEqual(res.body, { ok: false, error: 'persist failed' });
});

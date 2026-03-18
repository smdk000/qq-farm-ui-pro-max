const test = require('node:test');
const assert = require('node:assert/strict');

const routeModulePath = require.resolve('../src/controllers/admin/bug-report-routes');
const serviceModulePath = require.resolve('../src/services/bug-report-service');
const validatorModulePath = require.resolve('../src/services/config-validator');

function mockModule(modulePath, exports) {
    const previous = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };
    return () => {
        if (previous) require.cache[modulePath] = previous;
        else delete require.cache[modulePath];
    };
}

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
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route: ${method.toUpperCase()} ${path}`);
    const middleware = handlers.length > 1 ? handlers[0] : null;
    const handler = handlers[handlers.length - 1];
    return { middleware, handler };
}

function loadRoutes({ serviceOverrides = {}, validatorResult } = {}) {
    const calls = {
        getPublicConfig: [],
        getFullConfig: 0,
        saveConfig: [],
        submitBugReport: [],
        flushes: 0,
    };

    const restoreService = mockModule(serviceModulePath, {
        createBugReportService: () => ({
            getPublicConfig: (user) => {
                calls.getPublicConfig.push(user);
                return { enabled: true, canSubmit: true };
            },
            getFullConfig: () => {
                calls.getFullConfig += 1;
                return { enabled: true, emailTo: 'ops@example.com', smtpPass: '', smtpPassConfigured: true };
            },
            saveConfig: (config) => {
                calls.saveConfig.push(config);
                return { ...config, enabled: !!config.enabled, smtpPass: '', smtpPassConfigured: true };
            },
            submitBugReport: async (payload) => {
                calls.submitBugReport.push(payload);
                return { reportId: 'BR20260318-0001', mailSent: true, mailMessage: 'queued' };
            },
            sendTestEmail: async () => ({ mailSent: true, mailMessage: 'queued' }),
            ...serviceOverrides,
        }),
    });

    const restoreValidator = mockModule(validatorModulePath, {
        validateBugReportConfig: () => validatorResult || {
            valid: true,
            errors: [],
            coerced: { enabled: true, emailTo: 'ops@example.com' },
        },
    });

    delete require.cache[routeModulePath];
    const { registerBugReportRoutes } = require(routeModulePath);

    const { app, routes } = createFakeApp();
    const authRequired = (_req, _res, next) => next && next();
    const store = {
        flushGlobalConfigSave: async () => {
            calls.flushes += 1;
        },
    };

    registerBugReportRoutes({
        app,
        authRequired,
        store,
        getPool: () => null,
        getProvider: () => null,
        getAccountsSnapshot: async () => ({ accounts: [] }),
        getAccId: async () => 'acc-1',
        adminLogger: {},
    });

    const restore = () => {
        delete require.cache[routeModulePath];
        restoreService();
        restoreValidator();
    };

    return { routes, authRequired, calls, restore };
}

test('bug report routes keep auth middleware and pass submit context to service', async () => {
    const { routes, authRequired, calls, restore } = loadRoutes();

    try {
        const configRoute = getRouteParts(routes, 'get', '/api/bug-report/config');
        assert.equal(configRoute.middleware, authRequired);

        const configRes = createResponse();
        await configRoute.handler({ currentUser: { username: 'tester', role: 'user' } }, configRes);
        assert.equal(configRes.statusCode, 200);
        assert.deepEqual(configRes.body, { ok: true, data: { enabled: true, canSubmit: true } });
        assert.deepEqual(calls.getPublicConfig, [{ username: 'tester', role: 'user' }]);

        const submitRoute = getRouteParts(routes, 'post', '/api/bug-report/submit');
        assert.equal(submitRoute.middleware, authRequired);

        const submitRes = createResponse();
        await submitRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            body: { title: '好友页异常', description: '一直转圈' },
        }, submitRes);
        assert.equal(submitRes.statusCode, 200);
        assert.equal(calls.submitBugReport.length, 1);
        assert.equal(calls.submitBugReport[0].accountId, 'acc-1');
        assert.deepEqual(submitRes.body, {
            ok: true,
            data: { reportId: 'BR20260318-0001', mailSent: true, mailMessage: 'queued' },
        });
    } finally {
        restore();
    }
});

test('bug report admin settings route validates config and flushes persistence', async () => {
    const { routes, authRequired, calls, restore } = loadRoutes();

    try {
        const getRoute = getRouteParts(routes, 'get', '/api/settings/bug-report');
        assert.equal(getRoute.middleware, authRequired);
        const getRes = createResponse();
        await getRoute.handler({ currentUser: { username: 'admin', role: 'admin' } }, getRes);
        assert.equal(getRes.statusCode, 200);
        assert.equal(calls.getFullConfig, 1);
        assert.deepEqual(getRes.body, {
            ok: true,
            data: { enabled: true, emailTo: 'ops@example.com', smtpPass: '', smtpPassConfigured: true },
        });

        const saveRoute = getRouteParts(routes, 'post', '/api/settings/bug-report');
        assert.equal(saveRoute.middleware, authRequired);
        const saveRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            body: { enabled: true, emailTo: 'ops@example.com' },
        }, saveRes);
        assert.equal(saveRes.statusCode, 200);
        assert.equal(calls.saveConfig.length, 1);
        assert.equal(calls.flushes, 1);
        assert.deepEqual(saveRes.body, {
            ok: true,
            data: { enabled: true, emailTo: 'ops@example.com', smtpPass: '', smtpPassConfigured: true },
        });
    } finally {
        restore();
    }
});

test('bug report admin settings route rejects invalid config and non-admin access', async () => {
    const { routes, restore } = loadRoutes({
        validatorResult: {
            valid: false,
            errors: ['问题反馈配置: 开启后必须完整填写 SMTP 服务器、发件邮箱和收件邮箱'],
            coerced: {},
        },
    });

    try {
        const saveRoute = getRouteParts(routes, 'post', '/api/settings/bug-report');

        const forbiddenRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'tester', role: 'user' },
            body: {},
        }, forbiddenRes);
        assert.equal(forbiddenRes.statusCode, 403);
        assert.deepEqual(forbiddenRes.body, { ok: false, error: '仅管理员可修改问题反馈设置' });

        const invalidRes = createResponse();
        await saveRoute.handler({
            currentUser: { username: 'admin', role: 'admin' },
            body: { enabled: true },
        }, invalidRes);
        assert.equal(invalidRes.statusCode, 400);
        assert.equal(invalidRes.body.ok, false);
        assert.match(invalidRes.body.error, /配置校验失败/);
        assert.deepEqual(invalidRes.body.errors, ['问题反馈配置: 开启后必须完整填写 SMTP 服务器、发件邮箱和收件邮箱']);
    } finally {
        restore();
    }
});

test('bug report test route is admin only and returns test send result', async () => {
    const { routes, authRequired, restore } = loadRoutes({
        serviceOverrides: {
            sendTestEmail: async ({ currentUser }) => ({
                mailSent: currentUser.username === 'admin',
                mailMessage: 'queued',
            }),
        },
    });

    try {
        const testRoute = getRouteParts(routes, 'post', '/api/settings/bug-report/test');
        assert.equal(testRoute.middleware, authRequired);

        const forbiddenRes = createResponse();
        await testRoute.handler({ currentUser: { username: 'tester', role: 'user' } }, forbiddenRes);
        assert.equal(forbiddenRes.statusCode, 403);
        assert.deepEqual(forbiddenRes.body, { ok: false, error: '仅管理员可发送测试反馈邮件' });

        const okRes = createResponse();
        await testRoute.handler({ currentUser: { username: 'admin', role: 'admin' } }, okRes);
        assert.equal(okRes.statusCode, 200);
        assert.deepEqual(okRes.body, {
            ok: true,
            data: { mailSent: true, mailMessage: 'queued' },
        });
    } finally {
        restore();
    }
});

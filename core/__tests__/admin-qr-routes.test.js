const test = require('node:test');
const assert = require('node:assert/strict');

const { registerQrRoutes } = require('../src/controllers/admin/qr-routes');

function createFakeApp() {
    const routes = { post: new Map() };
    return {
        routes,
        app: {
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

function createFetchQueue(responses, calls) {
    return async (url, options) => {
        calls.push([url, options]);
        assert.ok(responses.length > 0, `unexpected fetch: ${url}`);
        const next = responses.shift();
        if (next instanceof Error) {
            throw next;
        }
        return {
            async json() {
                return typeof next === 'function' ? next(url, options) : next;
            },
        };
    };
}

function createDeps(overrides = {}) {
    class AbortControllerStub {
        constructor() {
            this.signal = {};
        }

        abort() {
            this.aborted = true;
        }
    }

    return {
        app: null,
        store: {
            getThirdPartyApiConfig: () => ({
                ipad860Url: 'http://ipad860.local',
                wxApiKey: 'wx-key',
                wxApiUrl: 'http://wx.local/api',
                wxAppId: 'wx-app-id',
            }),
        },
        configRef: {
            wxApiKey: 'cfg-key',
            wxApiUrl: 'http://cfg.wx/api',
            wxAppId: 'cfg-app-id',
        },
        processRef: { env: {} },
        fetchRef: async () => ({ json: async () => ({}) }),
        AbortControllerRef: AbortControllerStub,
        setTimeoutRef: () => ({ token: true }),
        clearTimeoutRef: () => {},
        sleepRef: async () => {},
        miniProgramLoginSession: {
            requestLoginCode: async () => ({ code: 'qq-code', image: 'img' }),
            queryStatus: async () => ({ status: 'Wait' }),
            getAuthCode: async () => '',
        },
        consoleRef: {
            log: () => {},
            error: () => {},
        },
        ...overrides,
    };
}

test('qr create route uses Ipad860 car endpoint and normalizes base64 header', async () => {
    const { app, routes } = createFakeApp();
    const fetchCalls = [];
    const deps = createDeps({
        app,
        fetchRef: createFetchQueue([
            { Code: 1, Data: { QrBase64: 'data:image/jpeg;base64,ABC123', Uuid: 'uuid-car' } },
        ], fetchCalls),
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/create');
    const res = createResponse();
    await handler({ body: { platform: 'wx_car' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(fetchCalls[0][0], 'http://ipad860.local/api/Login/LoginGetQRCar');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.qrcode, 'data:image/png;base64,ABC123');
    assert.equal(res.body.data.code, 'uuid-car');
    assert.equal(res.body.data.platform, 'wx_car');
    assert.equal(res.body.data.status, 'Wait');
    assert.equal(res.body.data.retryable, true);
});

test('qr create route delegates qq login code request with trimmed uin', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        miniProgramLoginSession: {
            requestLoginCode: async (...args) => {
                calls.push(args);
                return { code: 'qq-code', image: 'img-data' };
            },
            queryStatus: async () => ({ status: 'Wait' }),
            getAuthCode: async () => '',
        },
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/create');
    const res = createResponse();
    await handler({ body: { platform: 'qq', uin: ' 10001 ' } }, res);

    assert.deepEqual(calls, [['10001']]);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.code, 'qq-code');
    assert.equal(res.body.data.image, 'img-data');
    assert.equal(res.body.data.status, 'Wait');
    assert.equal(res.body.data.retryable, true);
});

test('qr check route rejects empty code before any upstream call', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'qq' } }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: 'Missing code' });
});

test('qr check route keeps original code for Ipad860 wait status', async () => {
    const { app, routes } = createFakeApp();
    const fetchCalls = [];
    const deps = createDeps({
        app,
        fetchRef: createFetchQueue([
            {
                Code: 0,
                Success: true,
                Data: {
                    status: 0,
                    expiredTime: 238,
                },
            },
        ], fetchCalls),
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'wx_car', code: 'qr-wait-uuid' } }, res);

    assert.equal(fetchCalls[0][0], 'http://ipad860.local/api/Login/LoginCheckQR?uuid=qr-wait-uuid');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'Wait');
    assert.equal(res.body.data.code, 'qr-wait-uuid');
    assert.equal(typeof res.body.data.expiresAt, 'number');
    assert.equal(res.body.data.retryable, true);
});

test('qr check route treats transient Ipad860 interaction-key miss as wait', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        fetchRef: createFetchQueue([
            {
                Code: -8,
                Success: false,
                Message: '异常：扫码状态返回的交互key不存在',
                Data: null,
            },
        ], []),
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'wx_ipad', code: 'qr-transient-uuid' } }, res);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'Wait');
    assert.equal(res.body.data.code, 'qr-transient-uuid');
    assert.equal(res.body.data.message, '等待扫码');
});

test('qr check route returns OK for Ipad860 success path after JSLogin', async () => {
    const { app, routes } = createFakeApp();
    const fetchCalls = [];
    const deps = createDeps({
        app,
        fetchRef: createFetchQueue([
            {
                Code: 0,
                Success: true,
                Data: {
                    status: 2,
                    acctSectResp: { userName: 'wxid_123', nickName: '微信昵称' },
                    HeadUrl: 'https://wx.example/avatar.png',
                },
            },
            {
                Code: 0,
                Success: true,
                Data: { code: 'auth-code-123' },
            },
        ], fetchCalls),
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'wx_ipad', code: 'qr-uuid' } }, res);

    assert.equal(fetchCalls[0][0], 'http://ipad860.local/api/Login/LoginCheckQR?uuid=qr-uuid');
    assert.equal(fetchCalls[1][0], 'http://ipad860.local/api/Wxapp/JSLogin');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'OK');
    assert.equal(res.body.data.code, 'auth-code-123');
    assert.equal(res.body.data.uin, 'wxid_123');
    assert.equal(res.body.data.avatar, 'https://wx.example/avatar.png');
    assert.equal(res.body.data.nickname, '微信昵称');
    assert.equal(res.body.data.retryable, false);
});

test('qr check route returns OK for wx third-party login and extracts raw auth code', async () => {
    const { app, routes } = createFakeApp();
    const fetchCalls = [];
    const deps = createDeps({
        app,
        fetchRef: createFetchQueue([
            {
                code: 0,
                data: { wxid: 'wxid_third', nickname: '三方昵称' },
            },
            {
                code: 0,
                data: { raw: { Code: 'raw-auth-code' } },
            },
        ], fetchCalls),
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'wx', code: 'wx-uuid' } }, res);

    assert.equal(fetchCalls[0][0], 'http://wx.local/api?api_key=wx-key&action=checkqr');
    assert.equal(fetchCalls[1][0], 'http://wx.local/api?api_key=wx-key&action=jslogin');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'OK');
    assert.equal(res.body.data.code, 'raw-auth-code');
    assert.equal(res.body.data.uin, 'wxid_third');
    assert.equal(res.body.data.avatar, '');
    assert.equal(res.body.data.nickname, '三方昵称');
    assert.equal(res.body.data.retryable, false);
});

test('qr check route returns QQ authCode fallback result and avatar url', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        miniProgramLoginSession: {
            requestLoginCode: async () => ({ code: 'qq-code' }),
            queryStatus: async (...args) => {
                calls.push(['queryStatus', ...args]);
                return { status: 'OK', ticket: 'ticket-1', uin: '12345', nickname: 'QQ昵称' };
            },
            getAuthCode: async (...args) => {
                calls.push(['getAuthCode', ...args]);
                return 'qq-auth-code';
            },
        },
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'qq', code: 'qq-uuid', uin: ' 12345 ' } }, res);

    assert.deepEqual(calls, [
        ['queryStatus', 'qq-uuid', '12345'],
        ['getAuthCode', 'ticket-1', '1112386029'],
    ]);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'OK');
    assert.equal(res.body.data.code, 'qq-auth-code');
    assert.equal(res.body.data.ticket, 'ticket-1');
    assert.equal(res.body.data.uin, '12345');
    assert.equal(res.body.data.avatar, 'https://q1.qlogo.cn/g?b=qq&nk=12345&s=640');
    assert.equal(res.body.data.nickname, 'QQ昵称');
    assert.equal(res.body.data.retryable, false);
});

test('qr check route falls back to openId avatar when qq uin is unavailable', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        miniProgramLoginSession: {
            requestLoginCode: async () => ({ code: 'qq-code' }),
            queryStatus: async (...args) => {
                calls.push(['queryStatus', ...args]);
                return {
                    status: 'OK',
                    ticket: 'ticket-openid',
                    uin: '',
                    openId: '68AF60B1D1B712B9F41693B3FA378DE1',
                    nickname: 'QQ开放平台昵称',
                };
            },
            getAuthCode: async (...args) => {
                calls.push(['getAuthCode', ...args]);
                return 'qq-auth-openid';
            },
        },
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'qq', code: 'qq-openid' } }, res);

    assert.deepEqual(calls, [
        ['queryStatus', 'qq-openid', ''],
        ['getAuthCode', 'ticket-openid', '1112386029'],
    ]);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'OK');
    assert.equal(res.body.data.code, 'qq-auth-openid');
    assert.equal(res.body.data.ticket, 'ticket-openid');
    assert.equal(res.body.data.uin, '');
    assert.equal(res.body.data.openId, '68AF60B1D1B712B9F41693B3FA378DE1');
    assert.equal(res.body.data.avatar, 'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100');
    assert.equal(res.body.data.nickname, 'QQ开放平台昵称');
    assert.equal(res.body.data.retryable, false);
});

test('qr check route keeps original code for qq wait status', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        miniProgramLoginSession: {
            requestLoginCode: async () => ({ code: 'qq-code' }),
            queryStatus: async () => ({ status: 'Wait' }),
            getAuthCode: async () => '',
        },
    });

    registerQrRoutes(deps);
    const handler = getHandler(routes, '/api/qr/check');
    const res = createResponse();
    await handler({ body: { platform: 'qq', code: 'qq-wait-uuid' } }, res);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.status, 'Wait');
    assert.equal(res.body.data.code, 'qq-wait-uuid');
    assert.equal(res.body.data.retryable, true);
});
